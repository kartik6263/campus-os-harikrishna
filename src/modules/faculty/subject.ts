import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveFacultyId } from '../../auth/middleware.js';
import { ATTENDANCE_THRESHOLD, attendanceFor, isLocked, istToday, overallAttendance, ownedAssignment, PRESENT_STATUSES } from './shared.js';

/**
 * One subject on a lecturer's load, opened up: its timetable, the registers
 * held, the study material shared, and every student in it with their
 * attendance and internal marks — then any one student in full.
 *
 * Everything is read from the registers the other modules write; nothing here
 * is stored, so it cannot disagree with them.
 */
export const subjectRouter = Router();

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ─── GET /api/faculty/subjects/:assignmentId/overview ─────────────────────────

subjectRouter.get(
  '/subjects/:assignmentId/overview',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const assignment = await ownedAssignment((req.params as { assignmentId: string }).assignmentId, facultyId);
    const subjectId = assignment.subjectId;

    const [slots, enrolments, sessions, sheet, materials, pendingDisputes] = await Promise.all([
      prisma.timetableSlot.findMany({ where: { subjectId, facultyId, term: assignment.term } }),
      prisma.enrolment.findMany({
        where: { subjectId, term: assignment.term },
        include: {
          student: {
            select: {
              id: true, rollNo: true, enrolmentNo: true, name: true, mobile: true, semester: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { student: { rollNo: 'asc' } },
      }),
      prisma.classSession.findMany({
        where: { subjectId, date: { lte: istToday() } },
        select: { id: true, date: true, startTime: true, markedAt: true },
        orderBy: { date: 'desc' },
      }),
      prisma.marksSheet.findUnique({
        where: { assignmentId: assignment.id },
        include: { entries: { select: { studentId: true, componentId: true, value: true } } },
      }),
      prisma.studyMaterial.findMany({
        where: { subjectId, facultyId },
        orderBy: [{ unit: 'asc' }, { uploadedAt: 'desc' }],
        select: { id: true, unit: true, unitTitle: true, filename: true, type: true, url: true, visibleToStudents: true, uploadedAt: true },
      }),
      prisma.attendanceCorrection.groupBy({
        by: ['studentId'],
        where: { status: 'PENDING', session: { subjectId } },
        _count: { _all: true },
      }),
    ]);

    const studentIds = enrolments.map((e) => e.studentId);
    const [inSubject, overall] = await Promise.all([attendanceFor(studentIds, [subjectId]), overallAttendance(studentIds)]);

    // Absences in the last five classes held, so a lecturer sees who has just stopped coming.
    // Only submitted registers: a sheet still being filled would show everyone as missing.
    const recentIds = sessions.filter((s) => s.markedAt).slice(0, 5).map((s) => s.id);
    const recentPresent = recentIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { sessionId: { in: recentIds }, studentId: { in: studentIds }, status: { in: [...PRESENT_STATUSES] } },
          select: { studentId: true },
        })
      : [];
    const recentPresentCount = new Map<string, number>();
    for (const r of recentPresent) recentPresentCount.set(r.studentId, (recentPresentCount.get(r.studentId) ?? 0) + 1);

    const components = assignment.components.map((c) => ({ id: c.id, key: c.key, label: c.label, maxMarks: c.maxMarks }));
    const maxTotal = components.reduce((a, c) => a + c.maxMarks, 0);
    const disputes = new Map(pendingDisputes.map((d) => [d.studentId, d._count._all]));

    const students = enrolments.map((e) => {
      const a = inSubject.get(`${e.studentId}:${subjectId}`);
      const marks: Record<string, number | null> = {};
      let scored = 0;
      let any = false;
      for (const c of components) {
        const v = sheet?.entries.find((x) => x.studentId === e.studentId && x.componentId === c.id)?.value ?? null;
        marks[c.key] = v;
        if (v !== null) { scored += v; any = true; }
      }
      return {
        id: e.student.id,
        rollNo: e.student.rollNo,
        enrolmentNo: e.student.enrolmentNo,
        name: e.student.name,
        mobile: e.student.mobile,
        email: e.student.user.email,
        attendance: { present: a?.present ?? 0, held: a?.total ?? 0, percent: a?.percent ?? 0 },
        overallAttendance: overall.get(e.studentId)?.percent ?? 0,
        missedRecently: recentIds.length - (recentPresentCount.get(e.studentId) ?? 0),
        marks,
        marksTotal: any ? scored : null,
        pendingDisputes: disputes.get(e.studentId) ?? 0,
      };
    });

    const held = sessions.length;
    const withAttendance = students.filter((s) => s.attendance.held > 0);
    const scoredStudents = students.filter((s) => s.marksTotal !== null);

    res.json({
      assignmentId: assignment.id,
      code: assignment.subject.code,
      name: assignment.subject.name,
      credits: assignment.subject.credits,
      semester: assignment.subject.semester,
      classLabel: assignment.classLabel,
      section: assignment.section,
      room: assignment.room,
      kind: assignment.kind,
      term: assignment.term,
      threshold: ATTENDANCE_THRESHOLD,
      schedule: slots
        .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
        .map((s) => ({ slotId: s.id, day: s.day, time: `${s.startTime}–${s.endTime}`, room: s.room, cancelled: s.cancelled })),
      registers: {
        held,
        submitted: sessions.filter((s) => s.markedAt).length,
        // Classes opened but never submitted: the lecturer's to finish.
        unsubmitted: sessions.filter((s) => !s.markedAt).map((s) => ({ sessionId: s.id, date: s.date, time: s.startTime })),
        locked: sessions.filter((s) => isLocked(s.markedAt)).length,
        lastHeld: sessions[0]?.date ?? null,
      },
      marks: { status: sheet?.status ?? 'NOT_STARTED', components, maxTotal },
      materials,
      summary: {
        students: students.length,
        averageAttendance: withAttendance.length
          ? Number((withAttendance.reduce((a, s) => a + s.attendance.percent, 0) / withAttendance.length).toFixed(1))
          : null,
        belowThreshold: withAttendance.filter((s) => s.attendance.percent < ATTENDANCE_THRESHOLD).length,
        averageMarks: scoredStudents.length && maxTotal
          ? Number(((scoredStudents.reduce((a, s) => a + (s.marksTotal ?? 0), 0) / scoredStudents.length / maxTotal) * 100).toFixed(1))
          : null,
        pendingDisputes: [...disputes.values()].reduce((a, b) => a + b, 0),
      },
      students,
    });
  }),
);

// ─── GET /api/faculty/subjects/:assignmentId/students/:studentId ──────────────

/** One student of this subject in full: every class, every mark, and how they do elsewhere. */
subjectRouter.get(
  '/subjects/:assignmentId/students/:studentId',
  validate('params', z.object({ assignmentId: z.string().min(1), studentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { assignmentId, studentId } = req.params as { assignmentId: string; studentId: string };
    const assignment = await ownedAssignment(assignmentId, facultyId);

    const enrolment = await prisma.enrolment.findFirst({
      where: { studentId, subjectId: assignment.subjectId, term: assignment.term },
      include: {
        student: {
          include: {
            programme: { select: { name: true } },
            user: { select: { email: true } },
            guardian: { select: { email: true } },
            results: { where: { published: true }, orderBy: { semester: 'asc' }, select: { semester: true, sgpa: true, cgpa: true, outcome: true } },
            enrolments: { where: { term: assignment.term }, include: { subject: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    });
    // Only a student in this class: a lecturer cannot browse the whole college from here.
    if (!enrolment) throw ApiError.notFound('That student is not in this class');
    const s = enrolment.student;

    const [sessions, records, sheet, disputes] = await Promise.all([
      prisma.classSession.findMany({
        where: { subjectId: assignment.subjectId, date: { lte: istToday() } },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        select: { id: true, date: true, startTime: true, endTime: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { studentId, session: { subjectId: assignment.subjectId } },
        select: { sessionId: true, status: true, source: true },
      }),
      prisma.marksSheet.findUnique({ where: { assignmentId }, include: { entries: { where: { studentId } } } }),
      prisma.attendanceCorrection.findMany({
        where: { studentId, session: { subjectId: assignment.subjectId } },
        include: { session: { select: { date: true, startTime: true } } },
        orderBy: { raisedAt: 'desc' },
      }),
    ]);
    const byId = new Map(records.map((r) => [r.sessionId, r]));
    const otherSubjects = s.enrolments.map((e) => e.subjectId);
    const elsewhere = await attendanceFor([studentId], otherSubjects);
    const mine = elsewhere.get(`${studentId}:${assignment.subjectId}`);

    res.json({
      student: {
        id: s.id,
        name: s.name,
        rollNo: s.rollNo,
        enrolmentNo: s.enrolmentNo,
        programme: s.programme.name,
        semester: s.semester,
        mobile: s.mobile,
        email: s.user.email,
        guardianEmail: s.guardian?.email ?? null,
      },
      attendance: {
        present: mine?.present ?? 0,
        held: mine?.total ?? 0,
        percent: mine?.percent ?? 0,
        threshold: ATTENDANCE_THRESHOLD,
        classes: sessions.map((x) => ({
          sessionId: x.id,
          date: x.date,
          time: `${x.startTime}–${x.endTime}`,
          status: byId.get(x.id)?.status ?? 'ABSENT',
          source: byId.get(x.id)?.source ?? null,
        })),
      },
      marks: assignment.components.map((c) => ({
        label: c.label,
        maxMarks: c.maxMarks,
        value: sheet?.entries.find((e) => e.componentId === c.id)?.value ?? null,
      })),
      marksStatus: sheet?.status ?? 'NOT_STARTED',
      otherSubjects: s.enrolments.map((e) => ({
        code: e.subject.code,
        name: e.subject.name,
        faculty: e.faculty,
        percent: elsewhere.get(`${studentId}:${e.subjectId}`)?.percent ?? 0,
        held: elsewhere.get(`${studentId}:${e.subjectId}`)?.total ?? 0,
      })),
      results: s.results,
      disputes: disputes.map((d) => ({
        id: d.id,
        date: d.session.date,
        time: d.session.startTime,
        markedAs: d.markedAs,
        requestedStatus: d.requestedStatus,
        status: d.status,
        reason: d.reason,
      })),
    });
  }),
);

// ─── GET /api/faculty/subjects/:assignmentId/register ─────────────────────────

/**
 * The attendance register as colleges keep it on paper: one row per student,
 * one column per class held, the mark in each cell and the total at the end.
 */
subjectRouter.get(
  '/subjects/:assignmentId/register',
  validate('params', z.object({ assignmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const assignment = await ownedAssignment((req.params as { assignmentId: string }).assignmentId, facultyId);
    const [sessions, enrolments] = await Promise.all([
      prisma.classSession.findMany({
        where: { subjectId: assignment.subjectId, date: { lte: istToday() } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        select: { id: true, date: true, startTime: true, markedAt: true },
      }),
      prisma.enrolment.findMany({
        where: { subjectId: assignment.subjectId, term: assignment.term },
        include: { student: { select: { id: true, rollNo: true, name: true } } },
        orderBy: { student: { rollNo: 'asc' } },
      }),
    ]);
    const records = await prisma.attendanceRecord.findMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
      select: { studentId: true, sessionId: true, status: true },
    });
    const cell = new Map(records.map((r) => [`${r.studentId}:${r.sessionId}`, r.status]));
    res.json({
      code: assignment.subject.code,
      subject: assignment.subject.name,
      classLabel: assignment.classLabel,
      term: assignment.term,
      sessions: sessions.map((s) => ({ id: s.id, date: s.date, time: s.startTime, submitted: Boolean(s.markedAt) })),
      students: enrolments.map((e) => {
        const marks = sessions.map((s) => cell.get(`${e.studentId}:${s.id}`) ?? 'ABSENT');
        const present = marks.filter((m) => m !== 'ABSENT').length;
        return {
          rollNo: e.student.rollNo,
          name: e.student.name,
          marks,
          present,
          percent: sessions.length ? Number(((present / sessions.length) * 100).toFixed(1)) : 0,
        };
      }),
    });
  }),
);
