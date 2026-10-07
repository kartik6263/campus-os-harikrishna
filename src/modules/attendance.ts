import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth, requireRole, resolveFacultyId, resolveStudentId } from '../auth/middleware.js';
import { isLocked, istToday, ownedSession } from './faculty/shared.js';
import { recordFor } from './itconsole/audit.js';

/** A dispute's proof is a file the student uploaded, kept as `campusos-file:<id>`. */
const FILE_REF = 'campusos-file:';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

/** How long a QR token stays valid. Short, so a screenshot is useless. */
const QR_TTL_SECONDS = 30;

// ─── GET /api/attendance/session/active ───────────────────────────────────────

/**
 * The class a student can currently mark attendance for.
 *
 * Returns the open session for today among the student's subjects — the
 * client shows this above the scanner so the student knows what they are
 * marking before they scan.
 */
attendanceRouter.get(
  '/session/active',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);

    const enrolments = await prisma.enrolment.findMany({
      where: { studentId },
      select: { subjectId: true },
    });

    const now = new Date();
    const session = await prisma.classSession.findFirst({
      where: {
        subjectId: { in: enrolments.map((e) => e.subjectId) },
        // A scanning window belongs to a class held today, never an old one left open.
        date: istToday(),
        qrToken: { not: null },
        qrExpiresAt: { gt: now },
      },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: { date: 'desc' },
    });

    if (!session) {
      res.json(null);
      return;
    }

    const already = await prisma.attendanceRecord.findUnique({
      where: { studentId_sessionId: { studentId, sessionId: session.id } },
      select: { status: true, markedAt: true },
    });

    res.json({
      sessionId: session.id,
      code: session.subject.code,
      subject: session.subject.name,
      faculty: session.faculty,
      room: session.room,
      slot: `${session.startTime}–${session.endTime}`,
      date: session.date,
      expiresAt: session.qrExpiresAt,
      alreadyMarked: already !== null,
      markedAt: already?.markedAt ?? null,
    });
  }),
);

// ─── POST /api/attendance/mark ────────────────────────────────────────────────

/**
 * Marks the caller present from a scanned QR token.
 *
 * The token — not a session id — is the credential, so a student cannot mark
 * themselves present for a class they are not sitting in. Enrolment and expiry
 * are both checked server-side.
 */
attendanceRouter.post(
  '/mark',
  validate('body', z.object({ token: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const { token } = req.body as { token: string };

    const session = await prisma.classSession.findUnique({
      where: { qrToken: token },
      include: { subject: { select: { code: true, name: true } } },
    });

    if (!session) throw ApiError.badRequest('That code is not valid');
    if (!session.qrExpiresAt || session.qrExpiresAt.getTime() < Date.now() || session.date.getTime() !== istToday().getTime()) {
      throw ApiError.badRequest('That code has expired. Ask for the current one.');
    }

    const enrolled = await prisma.enrolment.findFirst({
      where: { studentId, subjectId: session.subjectId },
      select: { id: true },
    });
    if (!enrolled) throw ApiError.forbidden('You are not enrolled in this subject');
    if (isLocked(session.markedAt)) throw ApiError.conflict('This class register is already closed');

    const existing = await prisma.attendanceRecord.findUnique({
      where: { studentId_sessionId: { studentId, sessionId: session.id } },
    });
    if (existing) throw ApiError.conflict('Attendance is already marked for this class');

    const record = await prisma.attendanceRecord.create({
      data: { studentId, sessionId: session.id, status: 'PRESENT', source: 'QR' },
    });

    res.status(201).json({
      id: record.id,
      status: record.status,
      markedAt: record.markedAt,
      code: session.subject.code,
      subject: session.subject.name,
      room: session.room,
      slot: `${session.startTime}–${session.endTime}`,
    });
  }),
);

// ─── POST /api/attendance/session/:id/qr ──────────────────────────────────────

/** Faculty rotates the code projected in class. */
attendanceRouter.post(
  '/session/:id/qr',
  requireRole('FACULTY', 'ADMIN'),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    // Only the lecturer who teaches the subject may open its scanning window.
    const owned = req.auth!.role === 'ADMIN'
      ? await prisma.classSession.findUnique({ where: { id } })
      : await ownedSession(id, await resolveFacultyId(req));
    if (!owned) throw ApiError.notFound('No such class');
    if (isLocked(owned.markedAt)) throw ApiError.conflict('This register is locked; QR attendance is closed');

    const token = `ATT-${crypto.randomBytes(12).toString('base64url')}`;
    const qrExpiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);

    const session = await prisma.classSession.update({
      where: { id },
      data: { qrToken: token, qrExpiresAt },
    });

    res.json({ sessionId: session.id, token, expiresAt: qrExpiresAt, ttlSeconds: QR_TTL_SECONDS });
  }),
);

// ─── DELETE /api/attendance/session/:id/qr ────────────────────────────────────

/** Closes the scanning window at once, rather than waiting for the code to lapse. */
attendanceRouter.delete(
  '/session/:id/qr',
  requireRole('FACULTY', 'ADMIN'),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    if (req.auth!.role !== 'ADMIN') await ownedSession(id, await resolveFacultyId(req));
    await prisma.classSession.update({ where: { id }, data: { qrToken: null, qrExpiresAt: null } });
    res.status(204).end();
  }),
);

// ─── GET /api/attendance/history/:code ────────────────────────────────────────

/**
 * Every class held in one of the student's subjects, newest first, with the
 * mark against each and how it was recorded — the full register, not a summary.
 */
attendanceRouter.get(
  '/history/:code',
  validate('params', z.object({ code: z.string().min(1).max(30) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const enrolment = await prisma.enrolment.findFirst({
      where: { studentId, subject: { code: (req.params as { code: string }).code } },
      include: { subject: { select: { id: true, code: true, name: true } } },
      orderBy: { term: 'desc' },
    });
    if (!enrolment) throw ApiError.notFound('You are not enrolled in that subject');

    const [sessions, records, corrections] = await Promise.all([
      prisma.classSession.findMany({
        where: { subjectId: enrolment.subjectId, date: { lte: istToday() } },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        select: { id: true, date: true, startTime: true, endTime: true, room: true, faculty: true, markedAt: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { studentId, session: { subjectId: enrolment.subjectId } },
        select: { sessionId: true, status: true, source: true },
      }),
      prisma.attendanceCorrection.findMany({
        where: { studentId, session: { subjectId: enrolment.subjectId } },
        select: { sessionId: true, status: true },
      }),
    ]);
    const bySession = new Map(records.map((r) => [r.sessionId, r]));
    const disputed = new Map(corrections.map((c) => [c.sessionId, c.status]));

    res.json({
      code: enrolment.subject.code,
      subject: enrolment.subject.name,
      faculty: enrolment.faculty,
      classes: sessions.map((x) => {
        const r = bySession.get(x.id);
        return {
          sessionId: x.id,
          date: x.date,
          time: `${x.startTime}–${x.endTime}`,
          room: x.room,
          faculty: x.faculty,
          // An unmarked student in a class that was held is absent.
          status: r?.status ?? 'ABSENT',
          source: r?.source ?? null,
          registerClosed: isLocked(x.markedAt),
          dispute: disputed.get(x.id) ?? null,
        };
      }),
    });
  }),
);

// ─── GET /api/attendance/corrections ──────────────────────────────────────────

/** The caller's own correction requests, newest first. */
attendanceRouter.get(
  '/corrections',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);

    const corrections = await prisma.attendanceCorrection.findMany({
      where: { studentId },
      include: { session: { include: { subject: { select: { code: true, name: true } } } } },
      orderBy: { raisedAt: 'desc' },
    });

    res.json(
      corrections.map((c) => ({
        id: c.id,
        code: c.session.subject.code,
        subject: c.session.subject.name,
        date: c.session.date,
        time: `${c.session.startTime}–${c.session.endTime}`,
        markedAs: c.markedAs,
        requestedStatus: c.requestedStatus,
        reason: c.reason,
        attachment: c.attachment?.startsWith(FILE_REF) ? c.attachment.slice(FILE_REF.length) : null,
        status: c.status,
        raisedAt: c.raisedAt,
        decidedAt: c.decidedAt,
        decisionNote: c.decisionNote,
      })),
    );
  }),
);

// ─── POST /api/attendance/corrections ─────────────────────────────────────────

/**
 * Disputes one day's attendance.
 *
 * The student may only ask; nothing changes until a lecturer decides. Asking
 * for what the record already says is refused, as is a second request for a
 * class already under review.
 */
attendanceRouter.post(
  '/corrections',
  validate(
    'body',
    z.object({
      sessionId: z.string().min(1),
      requestedStatus: z.enum(['PRESENT', 'LATE', 'EXCUSED']),
      reason: z.string().min(10).max(1000),
      attachment: z.string().max(200).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const { sessionId, requestedStatus, reason, attachment } = req.body as {
      sessionId: string;
      requestedStatus: 'PRESENT' | 'LATE' | 'EXCUSED';
      reason: string;
      attachment?: string;
    };

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { subject: { select: { code: true, name: true } } },
    });
    if (!session) throw ApiError.notFound('No such class');

    const enrolled = await prisma.enrolment.findFirst({
      where: { studentId, subjectId: session.subjectId },
      select: { id: true },
    });
    if (!enrolled) throw ApiError.forbidden('You are not enrolled in this subject');

    const record = await prisma.attendanceRecord.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
      select: { status: true },
    });

    const markedAs = record?.status ?? 'ABSENT';
    if (markedAs === requestedStatus) {
      throw ApiError.badRequest(`You are already marked ${markedAs.toLowerCase()} for this class`);
    }

    const existing = await prisma.attendanceCorrection.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
      select: { id: true, status: true },
    });
    if (existing) {
      throw ApiError.conflict(
        existing.status === 'PENDING'
          ? 'You have already raised a request for this class'
          : `This class was already reviewed and ${existing.status.toLowerCase()}`,
        { correctionId: existing.id },
      );
    }

    // The proof must be a file this student uploaded.
    if (attachment) {
      const file = await prisma.storedFile.findUnique({ where: { id: attachment }, select: { uploadedById: true } });
      if (!file || file.uploadedById !== req.auth!.sub) throw ApiError.badRequest('Attach the proof again');
    }

    const correction = await prisma.attendanceCorrection.create({
      data: {
        studentId,
        sessionId,
        markedAs,
        requestedStatus,
        reason,
        attachment: attachment ? `${FILE_REF}${attachment}` : null,
      },
    });
    await recordFor(req, {
      module: 'Attendance',
      action: 'Dispute raised',
      target: `${session.subject.code} ${session.date.toISOString().slice(0, 10)}`,
      detail: `${markedAs} → ${requestedStatus}`,
    });

    res.status(201).json({
      id: correction.id,
      code: session.subject.code,
      subject: session.subject.name,
      date: session.date,
      markedAs: correction.markedAs,
      requestedStatus: correction.requestedStatus,
      status: correction.status,
      raisedAt: correction.raisedAt,
    });
  }),
);

// ─── DELETE /api/attendance/corrections/:id ───────────────────────────────────

/** Withdraws a dispute the lecturer has not yet decided. */
attendanceRouter.delete(
  '/corrections/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const c = await prisma.attendanceCorrection.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!c || c.studentId !== studentId) throw ApiError.notFound('No such request');
    if (c.status !== 'PENDING') throw ApiError.conflict('Your lecturer has already decided this request');
    await prisma.attendanceCorrection.delete({ where: { id: c.id } });
    res.status(204).end();
  }),
);
