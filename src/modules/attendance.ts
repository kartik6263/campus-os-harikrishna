import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../auth/middleware.js';

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
    if (!session.qrExpiresAt || session.qrExpiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('That code has expired. Ask for the current one.');
    }

    const enrolled = await prisma.enrolment.findFirst({
      where: { studentId, subjectId: session.subjectId },
      select: { id: true },
    });
    if (!enrolled) throw ApiError.forbidden('You are not enrolled in this subject');

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
    const token = `JU-ATT-${crypto.randomBytes(12).toString('base64url')}`;
    const qrExpiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);

    const session = await prisma.classSession.update({
      where: { id: (req.params as { id: string }).id },
      data: { qrToken: token, qrExpiresAt },
    });

    res.json({ sessionId: session.id, token, expiresAt: qrExpiresAt, ttlSeconds: QR_TTL_SECONDS });
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
        attachment: c.attachment,
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

    const correction = await prisma.attendanceCorrection.create({
      data: {
        studentId,
        sessionId,
        markedAs,
        requestedStatus,
        reason,
        attachment: attachment ?? null,
      },
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
