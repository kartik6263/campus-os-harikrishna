import { Router } from 'express';
import { z } from 'zod';
import type { Weekday } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveFacultyId } from '../../auth/middleware.js';
import { attendanceFor, isLocked, lockedAt, requestedTerm } from './shared.js';

export const profileRouter = Router();

const DAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Length of a slot in hours.
 *
 * Timetable times are stored the way the printed timetable reads them —
 * "11:15" to "01:15" is a two-hour afternoon lab, not a negative one. An end
 * that sorts before its start is therefore past noon.
 */
function slotHours(start: string, end: string): number {
  const mins = (t: string) => {
    const [h = 0, m = 0] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let span = mins(end) - mins(start);
  if (span <= 0) span += 12 * 60;
  return span / 60;
}

/** Midnight UTC for a calendar date, matching how sessions are stored. */
export function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const weekdayOf = (date: Date): Weekday | null => {
  // getUTCDay: 0 = Sunday. There are no Sunday classes.
  const index = date.getUTCDay();
  return index === 0 ? null : (DAYS[index - 1] ?? null);
};

// ─── GET /api/faculty/profile ─────────────────────────────────────────────────

/**
 * The lecturer's own record, with the two numbers the dashboard leads on —
 * weekly teaching load and mentee count — derived rather than stored, so they
 * cannot drift from the timetable.
 */
profileRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const term = requestedTerm(req);

    const faculty = await prisma.faculty.findUnique({
      where: { id: facultyId },
      include: {
        user: { select: { email: true } },
        college: { select: { code: true, name: true, district: true } },
      },
    });

    if (!faculty) throw ApiError.notFound('Faculty record not found');

    const [slots, menteesCount, assignmentCount] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { facultyId, term, cancelled: false },
        select: { startTime: true, endTime: true },
      }),
      prisma.mentorship.count({ where: { facultyId } }),
      prisma.subjectAssignment.count({ where: { facultyId, term } }),
    ]);

    const currentLoad = slots.reduce((sum, s) => sum + slotHours(s.startTime, s.endTime), 0);

    res.json({
      id: faculty.id,
      employeeId: faculty.employeeId,
      teacherCode: faculty.teacherCode,
      name: faculty.name,
      nameHi: faculty.nameHi,
      designation: faculty.designation,
      department: faculty.department,
      email: faculty.user.email,
      mobile: faculty.mobile,
      joinDate: faculty.joinDate,
      specialization: faculty.specialization,
      isHod: faculty.isHod,
      college: faculty.college,
      maxWeeklyLoad: faculty.maxWeeklyLoad,
      currentLoad: Number(currentLoad.toFixed(1)),
      menteesCount,
      subjectsCount: assignmentCount,
      term,
    });
  }),
);

// ─── GET /api/faculty/subjects ────────────────────────────────────────────────

/** Everything this lecturer teaches this term, with roster sizes. */
profileRouter.get(
  '/subjects',
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const term = requestedTerm(req);

    const assignments = await prisma.subjectAssignment.findMany({
      where: { facultyId, term },
      include: {
        subject: { select: { id: true, code: true, name: true, credits: true, semester: true } },
        marksSheet: { select: { status: true } },
      },
      orderBy: [{ subject: { semester: 'desc' } }, { subject: { code: 'asc' } }],
    });

    const counts = await prisma.enrolment.groupBy({
      by: ['subjectId'],
      where: { subjectId: { in: assignments.map((a) => a.subjectId) }, term },
      _count: { _all: true },
    });
    const enrolled = new Map(counts.map((c) => [c.subjectId, c._count._all]));

    res.json(
      assignments.map((a) => ({
        assignmentId: a.id,
        code: a.subject.code,
        name: a.subject.name,
        credits: a.subject.credits,
        semester: a.subject.semester,
        classLabel: a.classLabel,
        section: a.section,
        room: a.room,
        kind: a.kind,
        totalStudents: enrolled.get(a.subjectId) ?? 0,
        marksStatus: a.marksSheet?.status ?? 'NOT_STARTED',
      })),
    );
  }),
);

// ─── GET /api/faculty/timetable ───────────────────────────────────────────────

/** The week, grouped by day, in the shape the timetable grid renders. */
profileRouter.get(
  '/timetable',
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const term = requestedTerm(req);

    const slots = await prisma.timetableSlot.findMany({
      where: { facultyId, term },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });

    const assignments = await prisma.subjectAssignment.findMany({
      where: { facultyId, term },
      select: { subjectId: true, classLabel: true, kind: true },
    });
    const meta = new Map(assignments.map((a) => [a.subjectId, a]));

    const byDay = Object.fromEntries(
      DAYS.map((day) => [
        day,
        slots
          .filter((s) => s.day === day)
          .map((s) => ({
            slotId: s.id,
            time: `${s.startTime}–${s.endTime}`,
            startTime: s.startTime,
            endTime: s.endTime,
            code: s.subject.code,
            subject: s.subject.name,
            classLabel: meta.get(s.subjectId)?.classLabel ?? null,
            kind: meta.get(s.subjectId)?.kind ?? 'THEORY',
            room: s.room,
            cancelled: s.cancelled,
            cancelReason: s.cancelReason,
            hours: slotHours(s.startTime, s.endTime),
          })),
      ]),
    );

    const totalHours = slots
      .filter((s) => !s.cancelled)
      .reduce((sum, s) => sum + slotHours(s.startTime, s.endTime), 0);

    res.json({ term, days: byDay, totalHours: Number(totalHours.toFixed(1)) });
  }),
);

// ─── GET /api/faculty/classes/today ───────────────────────────────────────────

/**
 * Today's classes, each carrying whether the roll call has been taken.
 *
 * A slot only becomes a session once someone opens the sheet, so `sessionId`
 * is null until then and the client calls `POST /classes/:slotId/session`.
 */
profileRouter.get(
  '/classes/today',
  validate('query', z.object({ date: z.string().date().optional(), term: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const term = requestedTerm(req);

    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const date = dayStart(dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : new Date());
    const day = weekdayOf(date);

    if (!day) {
      res.json({ date, day: 'SUN', classes: [] });
      return;
    }

    const slots = await prisma.timetableSlot.findMany({
      where: { facultyId, term, day },
      include: { subject: { select: { id: true, code: true, name: true } } },
      orderBy: { startTime: 'asc' },
    });

    const [sessions, assignments] = await Promise.all([
      prisma.classSession.findMany({
        where: { subjectId: { in: slots.map((s) => s.subjectId) }, date },
        include: { _count: { select: { records: true } } },
      }),
      prisma.subjectAssignment.findMany({
        where: { facultyId, term },
        select: { subjectId: true, classLabel: true, kind: true },
      }),
    ]);

    const meta = new Map(assignments.map((a) => [a.subjectId, a]));
    const sessionAt = new Map(sessions.map((s) => [`${s.subjectId}:${s.startTime}`, s]));

    const enrolled = await prisma.enrolment.groupBy({
      by: ['subjectId'],
      where: { subjectId: { in: slots.map((s) => s.subjectId) }, term },
      _count: { _all: true },
    });
    const totals = new Map(enrolled.map((e) => [e.subjectId, e._count._all]));

    // Present counts need the statuses that count, not just any record.
    const presentBySession = new Map<string, number>();
    if (sessions.length > 0) {
      const grouped = await prisma.attendanceRecord.groupBy({
        by: ['sessionId'],
        where: {
          sessionId: { in: sessions.map((s) => s.id) },
          status: { in: ['PRESENT', 'LATE', 'EXCUSED'] },
        },
        _count: { _all: true },
      });
      for (const g of grouped) presentBySession.set(g.sessionId, g._count._all);
    }

    res.json({
      date,
      day,
      classes: slots.map((slot) => {
        const session = sessionAt.get(`${slot.subjectId}:${slot.startTime}`) ?? null;
        return {
          slotId: slot.id,
          sessionId: session?.id ?? null,
          time: `${slot.startTime}–${slot.endTime}`,
          startTime: slot.startTime,
          endTime: slot.endTime,
          code: slot.subject.code,
          subject: slot.subject.name,
          classLabel: meta.get(slot.subjectId)?.classLabel ?? null,
          kind: meta.get(slot.subjectId)?.kind ?? 'THEORY',
          room: slot.room,
          cancelled: slot.cancelled,
          cancelReason: slot.cancelReason,
          attendanceMarked: session?.markedAt != null,
          markedAt: session?.markedAt ?? null,
          locked: isLocked(session?.markedAt ?? null),
          lockedAt: lockedAt(session?.markedAt ?? null),
          studentsPresent: session ? (presentBySession.get(session.id) ?? 0) : null,
          totalStudents: totals.get(slot.subjectId) ?? 0,
        };
      }),
    });
  }),
);

// ─── POST /api/faculty/classes/:slotId/session ────────────────────────────────

/**
 * Opens the roll call for a timetable slot on a given day.
 *
 * Idempotent: calling it twice returns the same session, which matters because
 * the client calls it whenever the marking screen opens.
 */
profileRouter.post(
  '/classes/:slotId/session',
  validate('params', z.object({ slotId: z.string().min(1) })),
  // Default, not just optional: Express leaves req.body undefined when the
  // client sends no body at all, and for this route that is the normal case.
  validate('body', z.object({ date: z.string().date().optional() }).default({})),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { slotId } = req.params as { slotId: string };
    const { date: dateParam } = req.body as { date?: string };

    const slot = await prisma.timetableSlot.findUnique({
      where: { id: slotId },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });

    if (!slot || slot.facultyId !== facultyId) {
      throw ApiError.notFound('No such slot on your timetable');
    }
    if (slot.cancelled) throw ApiError.badRequest('That class is cancelled');

    const date = dayStart(dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : new Date());

    if (weekdayOf(date) !== slot.day) {
      throw ApiError.badRequest(`That slot runs on ${slot.day}, not the date supplied`);
    }

    const faculty = await prisma.faculty.findUniqueOrThrow({
      where: { id: facultyId },
      select: { name: true },
    });

    // The unique key is (subject, date, start), so a concurrent second call
    // updates the same row rather than opening a rival sheet.
    const session = await prisma.classSession.upsert({
      where: {
        subjectId_date_startTime: {
          subjectId: slot.subjectId,
          date,
          startTime: slot.startTime,
        },
      },
      create: {
        subjectId: slot.subjectId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
        faculty: faculty.name,
        facultyId,
      },
      update: {},
    });

    res.status(201).json({
      sessionId: session.id,
      subjectId: session.subjectId,
      code: slot.subject.code,
      subject: slot.subject.name,
      date: session.date,
      time: `${session.startTime}–${session.endTime}`,
      room: session.room,
      markedAt: session.markedAt,
      locked: isLocked(session.markedAt),
    });
  }),
);

// ─── POST /api/faculty/slots/:id/cancel ───────────────────────────────────────

/**
 * Cancels a class.
 *
 * The slot itself carries the flag, so the students' own timetable shows it
 * too — the lecturer and the class are looking at one row, not two. With
 * `notify`, every enrolled student also gets a notification.
 */
profileRouter.post(
  '/slots/:id/cancel',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      reason: z.string().min(10, 'Say why, in at least ten characters').max(300),
      notify: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };
    const { reason, notify } = req.body as { reason: string; notify: boolean };

    const slot = await prisma.timetableSlot.findUnique({
      where: { id },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });

    if (!slot || slot.facultyId !== facultyId) {
      throw ApiError.notFound('No such slot on your timetable');
    }
    if (slot.cancelled) throw ApiError.conflict('That class is already cancelled');

    const now = new Date();

    const students = notify
      ? await prisma.enrolment.findMany({
          where: { subjectId: slot.subjectId, term: slot.term },
          select: { studentId: true },
        })
      : [];

    await prisma.$transaction([
      prisma.timetableSlot.update({
        where: { id },
        data: { cancelled: true, cancelReason: reason, cancelledAt: now },
      }),
      ...(students.length > 0
        ? [
            prisma.notification.createMany({
              data: students.map((e) => ({
                studentId: e.studentId,
                kind: 'GENERAL' as const,
                title: `Class cancelled — ${slot.subject.code}`,
                titleHi: `कक्षा रद्द — ${slot.subject.code}`,
                body: `${slot.subject.name} (${slot.startTime}–${slot.endTime}) is cancelled. ${reason}`,
                href: '/timetable',
              })),
            }),
          ]
        : []),
    ]);

    res.json({
      slotId: slot.id,
      code: slot.subject.code,
      cancelled: true,
      cancelReason: reason,
      cancelledAt: now,
      notified: students.length,
    });
  }),
);

// ─── POST /api/faculty/slots/:id/restore ──────────────────────────────────────

/** Puts a cancelled class back on the timetable. */
profileRouter.post(
  '/slots/:id/restore',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { id } = req.params as { id: string };

    const slot = await prisma.timetableSlot.findUnique({ where: { id } });
    if (!slot || slot.facultyId !== facultyId) {
      throw ApiError.notFound('No such slot on your timetable');
    }
    if (!slot.cancelled) throw ApiError.conflict('That class is not cancelled');

    const updated = await prisma.timetableSlot.update({
      where: { id },
      data: { cancelled: false, cancelReason: null, cancelledAt: null },
    });

    res.json({ slotId: updated.id, cancelled: false });
  }),
);

// ─── GET /api/faculty/subjects/:assignmentId/roster ───────────────────────────

/** The class list, with each student's running attendance in that subject. */
profileRouter.get(
  '/subjects/:assignmentId/roster',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId } = req.params as { assignmentId: string };

    const assignment = await prisma.subjectAssignment.findUnique({
      where: { id: assignmentId },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });

    if (!assignment || assignment.facultyId !== facultyId) {
      throw ApiError.notFound('No such class on your teaching load');
    }

    const enrolments = await prisma.enrolment.findMany({
      where: { subjectId: assignment.subjectId, term: assignment.term },
      include: {
        student: {
          select: { id: true, rollNo: true, enrolmentNo: true, name: true, nameHi: true, mobile: true },
        },
      },
      orderBy: { student: { rollNo: 'asc' } },
    });

    const stats = await attendanceFor(
      enrolments.map((e) => e.studentId),
      [assignment.subjectId],
    );

    res.json({
      assignmentId: assignment.id,
      code: assignment.subject.code,
      subject: assignment.subject.name,
      classLabel: assignment.classLabel,
      room: assignment.room,
      kind: assignment.kind,
      students: enrolments.map((e) => {
        const cell = stats.get(`${e.studentId}:${assignment.subjectId}`);
        return {
          id: e.student.id,
          rollNo: e.student.rollNo,
          enrolmentNo: e.student.enrolmentNo,
          name: e.student.name,
          nameHi: e.student.nameHi,
          mobile: e.student.mobile,
          attendance: cell?.percent ?? 0,
          present: cell?.present ?? 0,
          held: cell?.total ?? 0,
        };
      }),
    });
  }),
);
