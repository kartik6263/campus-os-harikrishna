import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate, validQuery } from '../lib/http.js';
import { requireAuth, resolveStudentId } from '../auth/middleware.js';
import { legacyTransport } from './transport/me.js';
import { addDays, istDate, nextDateOf, occurrences } from './timetable/calendar.js';
import { currentTerm } from './faculty/shared.js';
import { attendancePolicy, attendedStatuses, classesNeeded, classesToSpare, pct } from './attendance/policy.js';

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
      status: student.status,
      statusSince: student.statusSince,
      graduatedOn: student.graduatedOn,
      college: student.college,
      programme: student.programme,
    });
  }),
);

// ─── GET /api/student/attendance ──────────────────────────────────────────────

studentRouter.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const policy = await attendancePolicy();
    const counted = new Set<string>(attendedStatuses(policy));

    const [enrolments, records] = await Promise.all([
      prisma.enrolment.findMany({ where: { studentId: id }, include: { subject: true }, orderBy: { subject: { code: 'asc' } } }),
      // Only submitted roll calls count; a draft or an open QR window is not yet a class held.
      prisma.attendanceRecord.findMany({
        where: { studentId: id, session: { markedAt: { not: null } } },
        select: { status: true, source: true, session: { select: { id: true, subjectId: true, date: true, startTime: true, endTime: true } } },
        orderBy: [{ session: { date: 'desc' } }, { session: { startTime: 'desc' } }],
      }),
    ]);

    // One row per subject, even where a subject is enrolled in more than one term.
    const seen = new Set<string>();
    const subjects = enrolments.filter((e) => !seen.has(e.subjectId) && seen.add(e.subjectId)).map((e) => {
      const mine = records.filter((r) => r.session.subjectId === e.subjectId);
      const total = mine.length;
      const present = mine.filter((r) => counted.has(r.status)).length;
      const percent = pct(present, total);
      return {
        code: e.subject.code,
        name: e.subject.name,
        credits: e.subject.credits,
        faculty: e.faculty,
        room: e.room,
        total,
        present,
        late: mine.filter((r) => r.status === 'LATE').length,
        excused: mine.filter((r) => r.status === 'EXCUSED').length,
        percent,
        meetsThreshold: total === 0 || percent >= policy.threshold,
        warning: total > 0 && percent >= policy.threshold && percent < policy.warnBelow,
        classesNeeded: classesNeeded(present, total, policy.threshold),
        canMiss: classesToSpare(present, total, policy.threshold),
        // The last ten classes held, oldest first, with this student's mark.
        recent: mine.slice(0, 10).reverse().map((r) => ({ sessionId: r.session.id, date: r.session.date, status: r.status })),
        // Classes marked absent, newest first, so a wrong mark can be disputed against the exact class.
        missed: mine.filter((r) => r.status === 'ABSENT').slice(0, 30).map((r) => ({ sessionId: r.session.id, date: r.session.date, time: `${r.session.startTime}–${r.session.endTime}` })),
      };
    });

    const totalHeld = subjects.reduce((a, s) => a + s.total, 0);
    const totalPresent = subjects.reduce((a, s) => a + s.present, 0);

    res.json({
      threshold: policy.threshold,
      policy: { threshold: policy.threshold, condonationFloor: policy.condonationFloor, warnBelow: policy.warnBelow, lateCountsAsPresent: policy.lateCountsAsPresent },
      overall: { present: totalPresent, total: totalHeld, percent: pct(totalPresent, totalHeld) },
      subjects,
    });
  }),
);

// ─── GET /api/student/materials ───────────────────────────────────────────────

/** What the student's teachers have shared for the subjects they take, by unit. */
studentRouter.get(
  '/materials',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const enrolments = await prisma.enrolment.findMany({
      where: { studentId: id },
      include: { subject: { select: { id: true, code: true, name: true } } },
      orderBy: { subject: { code: 'asc' } },
    });
    const materials = await prisma.studyMaterial.findMany({
      where: { subjectId: { in: enrolments.map((e) => e.subjectId) }, visibleToStudents: true },
      include: { faculty: { select: { name: true } } },
      orderBy: [{ unit: 'asc' }, { uploadedAt: 'desc' }],
    });
    res.json(enrolments.map((e) => ({
      code: e.subject.code,
      name: e.subject.name,
      faculty: e.faculty,
      materials: materials.filter((m) => m.subjectId === e.subjectId).map((m) => ({
        id: m.id, unit: m.unit, unitTitle: m.unitTitle, filename: m.filename, url: m.url, type: m.type, size: m.sizeLabel, uploadedAt: m.uploadedAt, by: m.faculty.name,
      })),
    })));
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

    // This term's subjects only: last semester's classes are not this week's.
    const term = await currentTerm();
    const enrolments = await prisma.enrolment.findMany({
      where: { studentId: id, term },
      select: { subjectId: true },
    });

    const slots = await prisma.timetableSlot.findMany({
      where: {
        term,
        subjectId: { in: enrolments.map((e) => e.subjectId) },
        ...(day ? { day } : {}),
      },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });

    // Each weekly class as its next meeting stands: cancelled, moved, or taken by a substitute.
    const ahead = await occurrences({ from: istDate(), to: addDays(istDate(), 7), subjectIds: enrolments.map((e) => e.subjectId), term });
    const shaped = slots.map((s) => {
      const next = ahead.find((o) => o.slotId === s.id && o.date === nextDateOf(s.day, s.endTime));
      const off = s.cancelled || (next ? next.status !== 'SCHEDULED' : false);
      return {
        id: s.id,
        day: s.day,
        date: next?.date ?? null,
        time: `${s.startTime}–${s.endTime}`,
        startTime: s.startTime,
        endTime: s.endTime,
        subject: s.subject.name,
        code: s.subject.code,
        faculty: next?.faculty ?? s.faculty,
        room: next?.room ?? s.room,
        cancelled: off,
        cancelReason: s.cancelled ? s.cancelReason : off ? (next?.note ?? null) : null,
        cancelledAt: s.cancelledAt,
        substitute: !!next?.substitute,
        roomChanged: !!next?.roomChange,
      };
    });

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
    res.json(await legacyTransport(await resolveStudentId(req)));
  }),
);
