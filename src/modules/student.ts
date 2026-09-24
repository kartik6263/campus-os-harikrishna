import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate, validQuery } from '../lib/http.js';
import { requireAuth, resolveStudentId } from '../auth/middleware.js';

export const studentRouter = Router();
studentRouter.use(requireAuth);

/** Attendance below this clears a student to sit the end-semester exam. */
export const ATTENDANCE_THRESHOLD = 75;

// ─── GET /api/student/profile ─────────────────────────────────────────────────

studentRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        college: { select: { code: true, name: true } },
        programme: { select: { code: true, name: true, shortName: true } },
        user: { select: { email: true } },
      },
    });

    if (!student) throw ApiError.notFound('Student record not found');

    res.json({
      id: student.id,
      enrolmentNo: student.enrolmentNo,
      rollNo: student.rollNo,
      name: student.name,
      nameHi: student.nameHi,
      dob: student.dob,
      gender: student.gender,
      category: student.category,
      semester: student.semester,
      year: student.year,
      batch: student.batch,
      mobile: student.mobile,
      email: student.user.email,
      address: student.address,
      apaarId: student.apaarId,
      abcId: student.abcId,
      abcCredits: student.abcCredits,
      abcTarget: student.abcTarget,
      digilockerLinked: student.digilockerLinked,
      validUpto: student.validUpto,
      college: student.college,
      programme: student.programme,
    });
  }),
);

// ─── GET /api/student/attendance ──────────────────────────────────────────────

/** Classes still to attend consecutively before a subject clears the bar. */
function classesNeeded(present: number, total: number, threshold = ATTENDANCE_THRESHOLD) {
  if (total > 0 && (present / total) * 100 >= threshold) return 0;
  const frac = threshold / 100;
  return Math.max(0, Math.ceil((frac * total - present) / (1 - frac)));
}

studentRouter.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);

    const enrolments = await prisma.enrolment.findMany({
      where: { studentId: id },
      include: { subject: true },
      orderBy: { subject: { code: 'asc' } },
    });

    const subjectIds = enrolments.map((e) => e.subjectId);

    // Two round trips regardless of how many subjects the student takes:
    // every session held, and this student's attended session ids.
    const [sessions, attended] = await Promise.all([
      prisma.classSession.findMany({
        where: { subjectId: { in: subjectIds } },
        select: { id: true, subjectId: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { studentId: id, status: { in: ['PRESENT', 'LATE', 'EXCUSED'] } },
        select: { sessionId: true },
      }),
    ]);

    const attendedSessionIds = new Set(attended.map((a) => a.sessionId));
    const heldBySubject = new Map<string, number>();
    const presentBySubject = new Map<string, number>();

    for (const s of sessions) {
      heldBySubject.set(s.subjectId, (heldBySubject.get(s.subjectId) ?? 0) + 1);
      if (attendedSessionIds.has(s.id)) {
        presentBySubject.set(s.subjectId, (presentBySubject.get(s.subjectId) ?? 0) + 1);
      }
    }

    const subjects = enrolments.map((e) => {
      const total = heldBySubject.get(e.subjectId) ?? 0;
      const present = presentBySubject.get(e.subjectId) ?? 0;
      const percent = total === 0 ? 0 : (present / total) * 100;
      return {
        code: e.subject.code,
        name: e.subject.name,
        credits: e.subject.credits,
        faculty: e.faculty,
        room: e.room,
        total,
        present,
        percent: Number(percent.toFixed(1)),
        meetsThreshold: percent >= ATTENDANCE_THRESHOLD,
        classesNeeded: classesNeeded(present, total),
      };
    });

    const totalHeld = subjects.reduce((a, s) => a + s.total, 0);
    const totalPresent = subjects.reduce((a, s) => a + s.present, 0);

    res.json({
      threshold: ATTENDANCE_THRESHOLD,
      overall: {
        present: totalPresent,
        total: totalHeld,
        percent: totalHeld === 0 ? 0 : Number(((totalPresent / totalHeld) * 100).toFixed(1)),
      },
      subjects,
    });
  }),
);

// ─── GET /api/student/timetable ───────────────────────────────────────────────

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

studentRouter.get(
  '/timetable',
  validate('query', z.object({ day: z.enum(DAYS).optional() })),
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const { day } = validQuery<{ day?: (typeof DAYS)[number] }>(req);

    const enrolments = await prisma.enrolment.findMany({
      where: { studentId: id },
      select: { subjectId: true },
    });

    const slots = await prisma.timetableSlot.findMany({
      where: {
        subjectId: { in: enrolments.map((e) => e.subjectId) },
        ...(day ? { day } : {}),
      },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });

    const shaped = slots.map((s) => ({
      id: s.id,
      day: s.day,
      time: `${s.startTime}–${s.endTime}`,
      startTime: s.startTime,
      endTime: s.endTime,
      subject: s.subject.name,
      code: s.subject.code,
      faculty: s.faculty,
      room: s.room,
      cancelled: s.cancelled,
      cancelReason: s.cancelReason,
      cancelledAt: s.cancelledAt,
    }));

    if (day) {
      res.json({ day, slots: shaped });
      return;
    }

    // Grouped by weekday, which is how both clients render it.
    const byDay = Object.fromEntries(
      DAYS.map((d) => [d, shaped.filter((s) => s.day === d)]),
    );
    res.json({ days: DAYS, byDay });
  }),
);

// ─── GET /api/student/notifications ───────────────────────────────────────────

studentRouter.get(
  '/notifications',
  validate('query', z.object({
    unreadOnly: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
  })),
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const { unreadOnly, limit } = validQuery<{ unreadOnly?: string; limit: number }>(req);

    const where = {
      studentId: id,
      ...(unreadOnly === 'true' ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.notification.count({ where: { studentId: id, readAt: null } }),
    ]);

    res.json({ unreadCount, items });
  }),
);

studentRouter.post(
  '/notifications/:id/read',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    // Scoped by studentId so one student cannot mark another's rows.
    const result = await prisma.notification.updateMany({
      where: { id: (req.params as { id: string }).id, studentId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw ApiError.notFound('Notification not found or already read');
    res.status(204).end();
  }),
);

studentRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const result = await prisma.notification.updateMany({
      where: { studentId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ marked: result.count });
  }),
);

// ─── GET /api/student/results ─────────────────────────────────────────────────

studentRouter.get(
  '/results',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);

    const results = await prisma.semesterResult.findMany({
      // Phase 4 writes results under embargo; a student sees a sitting only
      // once the examination wing publishes it.
      where: { studentId: id, published: true },
      include: {
        subjects: {
          include: { subject: { select: { code: true, name: true } } },
          orderBy: { subject: { code: 'asc' } },
        },
      },
      orderBy: { semester: 'asc' },
    });

    res.json(
      results.map((r) => ({
        semester: r.semester,
        declaredOn: r.declaredOn,
        sgpa: r.sgpa,
        cgpa: r.cgpa,
        totalCredits: r.totalCredits,
        outcome: r.outcome,
        division: r.division,
        graceMarks: r.graceMarks,
        subjects: r.subjects.map((s) => ({
          code: s.subject.code,
          name: s.subject.name,
          internal: s.internal,
          external: s.external,
          total: s.total,
          grade: s.grade,
          graceGiven: s.graceGiven,
          passed: s.passed,
        })),
      })),
    );
  }),
);

// ─── GET /api/student/transport ───────────────────────────────────────────────

studentRouter.get(
  '/transport',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);

    const pass = await prisma.busPass.findUnique({
      where: { studentId: id },
      include: { route: { include: { stops: { orderBy: { order: 'asc' } } } } },
    });

    if (!pass) {
      res.json(null);
      return;
    }

    res.json({
      routeNo: pass.route.routeNo,
      name: pass.route.name,
      busNo: pass.route.busNo,
      driver: pass.route.driver,
      driverPhone: pass.route.driverPhone,
      currentStop: pass.route.currentStop,
      lastUpdated: pass.route.updatedAt,
      passValid: pass.valid,
      passDue: pass.validTill,
      stops: pass.route.stops.map((s) => ({ name: s.name, time: s.time })),
    });
  }),
);
