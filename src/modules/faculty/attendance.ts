import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveFacultyId } from '../../auth/middleware.js';
import {
  ATTENDANCE_LOCK_HOURS,
  isLocked,
  lockedAt,
  ownedAssignment,
  ownedSession,
} from './shared.js';

export const facultyAttendanceRouter = Router();

const STATUS = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

// ─── GET /api/faculty/sessions/:id/attendance ─────────────────────────────────

/**
 * The roll call sheet: everyone enrolled, plus whatever is already recorded.
 *
 * Students who scanned the QR themselves come back already marked, which is
 * the point — the lecturer confirms a sheet rather than typing it twice.
 */
facultyAttendanceRouter.get(
  '/sessions/:id/attendance',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const session = await ownedSession((req.params as { id: string }).id, facultyId);

    const [enrolments, records] = await Promise.all([
      prisma.enrolment.findMany({
        where: { subjectId: session.subjectId },
        include: {
          student: { select: { id: true, rollNo: true, name: true, nameHi: true } },
        },
        orderBy: { student: { rollNo: 'asc' } },
      }),
      prisma.attendanceRecord.findMany({
        where: { sessionId: session.id },
        select: { studentId: true, status: true, source: true, markedAt: true },
      }),
    ]);

    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    res.json({
      sessionId: session.id,
      code: session.subject.code,
      subject: session.subject.name,
      date: session.date,
      time: `${session.startTime}–${session.endTime}`,
      room: session.room,
      markedAt: session.markedAt,
      locked: isLocked(session.markedAt),
      lockedAt: lockedAt(session.markedAt),
      lockHours: ATTENDANCE_LOCK_HOURS,
      students: enrolments.map((e) => {
        const record = byStudent.get(e.studentId);
        return {
          id: e.student.id,
          rollNo: e.student.rollNo,
          name: e.student.name,
          nameHi: e.student.nameHi,
          status: record?.status ?? null,
          source: record?.source ?? null,
          markedAt: record?.markedAt ?? null,
        };
      }),
    });
  }),
);

// ─── POST /api/faculty/sessions/:id/attendance ────────────────────────────────

/**
 * Saves the roll call.
 *
 * The whole sheet goes in one transaction, so a rejected row never leaves half
 * a class marked. A student not enrolled in the subject is rejected outright
 * rather than silently skipped — that means the client sent the wrong sheet.
 */
facultyAttendanceRouter.post(
  '/sessions/:id/attendance',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      records: z
        .array(z.object({ studentId: z.string().min(1), status: STATUS }))
        .min(1, 'Mark at least one student'),
      /// Leaves the sheet editable; the lock clock starts only on a final save.
      draft: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const session = await ownedSession((req.params as { id: string }).id, facultyId);
    const { records, draft } = req.body as {
      records: Array<{ studentId: string; status: z.infer<typeof STATUS> }>;
      draft: boolean;
    };

    if (isLocked(session.markedAt)) {
      throw ApiError.conflict(
        `This sheet locked ${ATTENDANCE_LOCK_HOURS} hours after it was marked. Raise a correction instead.`,
      );
    }

    const duplicates = records.length - new Set(records.map((r) => r.studentId)).size;
    if (duplicates > 0) throw ApiError.badRequest('The same student appears twice in this sheet');

    const enrolled = await prisma.enrolment.findMany({
      where: { subjectId: session.subjectId, studentId: { in: records.map((r) => r.studentId) } },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    const strangers = records.filter((r) => !enrolledIds.has(r.studentId));

    if (strangers.length > 0) {
      throw ApiError.badRequest('Some students are not enrolled in this subject', {
        studentIds: strangers.map((s) => s.studentId),
      });
    }

    const now = new Date();

    await prisma.$transaction([
      ...records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: { studentId_sessionId: { studentId: r.studentId, sessionId: session.id } },
          create: {
            studentId: r.studentId,
            sessionId: session.id,
            status: r.status,
            source: 'MANUAL',
            markedAt: now,
          },
          update: { status: r.status, source: 'MANUAL', markedAt: now },
        }),
      ),
      prisma.classSession.update({
        where: { id: session.id },
        data: draft ? { markedById: facultyId } : { markedAt: now, markedById: facultyId },
      }),
    ]);

    const present = records.filter((r) => r.status !== 'ABSENT').length;

    res.status(201).json({
      sessionId: session.id,
      saved: records.length,
      present,
      absent: records.length - present,
      draft,
      markedAt: draft ? null : now,
      locked: false,
      lockedAt: draft ? null : lockedAt(now),
    });
  }),
);

// ─── GET /api/faculty/subjects/:assignmentId/sessions ─────────────────────────

/**
 * Every class held for a subject, with its roll call summarised.
 *
 * This is the register view: which days were marked, by whom, how many turned
 * up, and which sheets have passed the point of being editable.
 */
facultyAttendanceRouter.get(
  '/subjects/:assignmentId/sessions',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const assignment = await ownedAssignment(
      (req.params as { assignmentId: string }).assignmentId,
      facultyId,
    );

    const sessions = await prisma.classSession.findMany({
      where: { subjectId: assignment.subjectId },
      orderBy: { date: 'desc' },
      include: { markedBy: { select: { name: true } } },
    });

    const present = await prisma.attendanceRecord.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: sessions.map((s) => s.id) },
        status: { in: ['PRESENT', 'LATE', 'EXCUSED'] },
      },
      _count: { _all: true },
    });
    const presentBySession = new Map(present.map((p) => [p.sessionId, p._count._all]));

    const total = await prisma.enrolment.count({
      where: { subjectId: assignment.subjectId, term: assignment.term },
    });

    res.json({
      assignmentId: assignment.id,
      code: assignment.subject.code,
      subject: assignment.subject.name,
      totalStudents: total,
      sessions: sessions.map((s) => ({
        sessionId: s.id,
        date: s.date,
        time: `${s.startTime}–${s.endTime}`,
        room: s.room,
        present: presentBySession.get(s.id) ?? 0,
        totalStudents: total,
        markedAt: s.markedAt,
        markedBy: s.markedBy?.name ?? null,
        locked: isLocked(s.markedAt),
        lockedAt: lockedAt(s.markedAt),
      })),
    });
  }),
);

// ─── The subject-and-date view of a roll call ─────────────────────────────────

/**
 * Resolves the timetable slot a subject runs in on a given date.
 *
 * The marking screen is organised by subject and day, not by slot, so this is
 * the bridge: it answers "which class is this, and has it been opened yet?"
 */
async function slotFor(assignmentId: string, facultyId: string, date: Date) {
  const assignment = await ownedAssignment(assignmentId, facultyId);

  const index = date.getUTCDay();
  const day = index === 0 ? null : (WEEKDAYS[index - 1] ?? null);

  const slot = day
    ? await prisma.timetableSlot.findFirst({
        where: { facultyId, subjectId: assignment.subjectId, day },
        orderBy: { startTime: 'asc' },
      })
    : null;

  const session = slot
    ? await prisma.classSession.findUnique({
        where: {
          subjectId_date_startTime: {
            subjectId: assignment.subjectId,
            date,
            startTime: slot.startTime,
          },
        },
      })
    : null;

  return { assignment, slot, session };
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

// ─── GET /api/faculty/subjects/:assignmentId/sheet ────────────────────────────

/**
 * The roll call for one subject on one day, opened or not.
 *
 * Read-only: looking at a day does not create a session for it, so browsing
 * back through the term leaves no trace.
 */
facultyAttendanceRouter.get(
  '/subjects/:assignmentId/sheet',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  validate('query', z.object({ date: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };
    const date = typeof req.query.date === 'string' ? dayStart(req.query.date) : todayUtc();

    const { assignment, slot, session } = await slotFor(assignmentId, facultyId, date);

    const [enrolments, records] = await Promise.all([
      prisma.enrolment.findMany({
        where: { subjectId: assignment.subjectId, term: assignment.term },
        include: { student: { select: { id: true, rollNo: true, name: true, nameHi: true } } },
        orderBy: { student: { rollNo: 'asc' } },
      }),
      session
        ? prisma.attendanceRecord.findMany({
            where: { sessionId: session.id },
            select: { studentId: true, status: true, source: true, markedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    res.json({
      assignmentId: assignment.id,
      code: assignment.subject.code,
      subject: assignment.subject.name,
      classLabel: assignment.classLabel,
      date,
      scheduled: slot !== null,
      slotId: slot?.id ?? null,
      time: slot ? `${slot.startTime}–${slot.endTime}` : null,
      room: slot?.room ?? assignment.room,
      cancelled: slot?.cancelled ?? false,
      sessionId: session?.id ?? null,
      markedAt: session?.markedAt ?? null,
      locked: isLocked(session?.markedAt ?? null),
      lockedAt: lockedAt(session?.markedAt ?? null),
      lockHours: ATTENDANCE_LOCK_HOURS,
      students: enrolments.map((e) => {
        const record = byStudent.get(e.studentId);
        return {
          id: e.student.id,
          rollNo: e.student.rollNo,
          name: e.student.name,
          nameHi: e.student.nameHi,
          status: record?.status ?? null,
          source: record?.source ?? null,
          markedAt: record?.markedAt ?? null,
        };
      }),
    });
  }),
);

// ─── POST /api/faculty/subjects/:assignmentId/sheet ───────────────────────────

/**
 * Saves the roll call for a subject on a day, opening the session if this is
 * the first save. One call from the marking screen, one transaction here.
 */
facultyAttendanceRouter.post(
  '/subjects/:assignmentId/sheet',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  validate(
    'body',
    z.object({
      date: z.string().date().optional(),
      records: z
        .array(z.object({ studentId: z.string().min(1), status: STATUS }))
        .min(1, 'Mark at least one student'),
      draft: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };
    const body = req.body as {
      date?: string;
      records: Array<{ studentId: string; status: z.infer<typeof STATUS> }>;
      draft: boolean;
    };

    const date = body.date ? dayStart(body.date) : todayUtc();
    const { assignment, slot, session } = await slotFor(assignmentId, facultyId, date);

    if (!slot) {
      throw ApiError.badRequest(
        `${assignment.subject.code} is not on your timetable for that day`,
      );
    }
    if (slot.cancelled) throw ApiError.badRequest('That class is cancelled');
    if (isLocked(session?.markedAt ?? null)) {
      throw ApiError.conflict(
        `This sheet locked ${ATTENDANCE_LOCK_HOURS} hours after it was marked. Raise a correction instead.`,
      );
    }

    const duplicates = body.records.length - new Set(body.records.map((r) => r.studentId)).size;
    if (duplicates > 0) throw ApiError.badRequest('The same student appears twice in this sheet');

    const enrolled = await prisma.enrolment.findMany({
      where: {
        subjectId: assignment.subjectId,
        studentId: { in: body.records.map((r) => r.studentId) },
      },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    const strangers = body.records.filter((r) => !enrolledIds.has(r.studentId));
    if (strangers.length > 0) {
      throw ApiError.badRequest('Some students are not enrolled in this subject', {
        studentIds: strangers.map((s) => s.studentId),
      });
    }

    const faculty = await prisma.faculty.findUniqueOrThrow({
      where: { id: facultyId },
      select: { name: true },
    });

    const open =
      session ??
      (await prisma.classSession.upsert({
        where: {
          subjectId_date_startTime: {
            subjectId: assignment.subjectId,
            date,
            startTime: slot.startTime,
          },
        },
        create: {
          subjectId: assignment.subjectId,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.room,
          faculty: faculty.name,
          facultyId,
        },
        update: {},
      }));

    const now = new Date();

    await prisma.$transaction([
      ...body.records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: { studentId_sessionId: { studentId: r.studentId, sessionId: open.id } },
          create: {
            studentId: r.studentId,
            sessionId: open.id,
            status: r.status,
            source: 'MANUAL',
            markedAt: now,
          },
          update: { status: r.status, source: 'MANUAL', markedAt: now },
        }),
      ),
      prisma.classSession.update({
        where: { id: open.id },
        data: body.draft ? { markedById: facultyId } : { markedAt: now, markedById: facultyId },
      }),
    ]);

    const present = body.records.filter((r) => r.status !== 'ABSENT').length;

    res.status(201).json({
      sessionId: open.id,
      date: open.date,
      saved: body.records.length,
      present,
      absent: body.records.length - present,
      draft: body.draft,
      markedAt: body.draft ? null : now,
      lockedAt: body.draft ? null : lockedAt(now),
    });
  }),
);

// ─── GET /api/faculty/corrections ─────────────────────────────────────────────

/** Correction requests raised against classes this lecturer teaches. */
facultyAttendanceRouter.get(
  '/corrections',
  validate(
    'query',
    z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING';

    const assignments = await prisma.subjectAssignment.findMany({
      where: { facultyId },
      select: { subjectId: true },
    });

    const corrections = await prisma.attendanceCorrection.findMany({
      where: {
        status: status as 'PENDING' | 'APPROVED' | 'REJECTED',
        session: { subjectId: { in: assignments.map((a) => a.subjectId) } },
      },
      include: {
        student: { select: { id: true, rollNo: true, enrolmentNo: true, name: true } },
        session: {
          include: { subject: { select: { code: true, name: true } } },
        },
      },
      orderBy: { raisedAt: 'desc' },
    });

    res.json(
      corrections.map((c) => ({
        id: c.id,
        studentId: c.student.id,
        rollNo: c.student.rollNo,
        enrolmentNo: c.student.enrolmentNo,
        studentName: c.student.name,
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

// ─── POST /api/faculty/corrections/:id/decide ─────────────────────────────────

/**
 * Approves or rejects a correction.
 *
 * Approval rewrites the attendance record in the same transaction that closes
 * the request, so the two can never disagree — and it is the only route that
 * may touch a locked sheet.
 */
facultyAttendanceRouter.post(
  '/corrections/:id/decide',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      decision: z.enum(['APPROVE', 'REJECT']),
      note: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };
    const { decision, note } = req.body as { decision: 'APPROVE' | 'REJECT'; note?: string };

    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id },
      include: { session: { select: { id: true, subjectId: true } } },
    });

    if (!correction) throw ApiError.notFound('No such correction request');
    if (correction.status !== 'PENDING') {
      throw ApiError.conflict(`This request was already ${correction.status.toLowerCase()}`);
    }

    const teaches = await prisma.subjectAssignment.findFirst({
      where: { facultyId, subjectId: correction.session.subjectId },
      select: { id: true },
    });
    if (!teaches) throw ApiError.forbidden('You do not teach this subject');

    const now = new Date();

    if (decision === 'REJECT') {
      const updated = await prisma.attendanceCorrection.update({
        where: { id },
        data: { status: 'REJECTED', decidedAt: now, decidedById: facultyId, decisionNote: note },
      });
      res.json({ id: updated.id, status: updated.status, decidedAt: updated.decidedAt });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.attendanceCorrection.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: now, decidedById: facultyId, decisionNote: note },
      }),
      prisma.attendanceRecord.upsert({
        where: {
          studentId_sessionId: {
            studentId: correction.studentId,
            sessionId: correction.sessionId,
          },
        },
        create: {
          studentId: correction.studentId,
          sessionId: correction.sessionId,
          status: correction.requestedStatus,
          source: 'CORRECTION',
          markedAt: now,
        },
        update: { status: correction.requestedStatus, source: 'CORRECTION', markedAt: now },
      }),
      prisma.notification.create({
        data: {
          studentId: correction.studentId,
          kind: 'ATTENDANCE',
          title: 'Attendance correction approved',
          titleHi: 'उपस्थिति सुधार स्वीकृत',
          body: `Your attendance was changed to ${correction.requestedStatus.toLowerCase()}.`,
          href: '/attendance',
        },
      }),
    ]);

    res.json({
      id: updated.id,
      status: updated.status,
      decidedAt: updated.decidedAt,
      appliedStatus: correction.requestedStatus,
    });
  }),
);
