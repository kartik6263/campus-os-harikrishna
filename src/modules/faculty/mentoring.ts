import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveFacultyId } from '../../auth/middleware.js';
import { ATTENDANCE_THRESHOLD, attendanceFor, overallAttendance } from './shared.js';

/**
 * Subject-wise attendance and internal marks for a set of students.
 *
 * The mentoring list shows this inline rather than making the client open each
 * mentee, so it is computed in bulk here and reused by the detail route.
 */
async function subjectBreakdown(studentIds: string[]) {
  const out = new Map<
    string,
    Array<{
      code: string;
      name: string;
      faculty: string;
      attendance: number;
      present: number;
      held: number;
      internalMarks: number | null;
      maxInternal: number | null;
    }>
  >();

  if (studentIds.length === 0) return out;

  const enrolments = await prisma.enrolment.findMany({
    where: { studentId: { in: studentIds } },
    include: { subject: { select: { id: true, code: true, name: true } } },
    orderBy: { subject: { code: 'asc' } },
  });

  const subjectIds = [...new Set(enrolments.map((e) => e.subjectId))];
  const stats = await attendanceFor(studentIds, subjectIds);

  const entries = await prisma.markEntry.findMany({
    where: { studentId: { in: studentIds }, value: { not: null } },
    include: {
      component: { select: { maxMarks: true, assignment: { select: { subjectId: true } } } },
    },
  });

  const internal = new Map<string, { scored: number; max: number }>();
  for (const e of entries) {
    const key = `${e.studentId}:${e.component.assignment.subjectId}`;
    const cell = internal.get(key) ?? { scored: 0, max: 0 };
    cell.scored += e.value ?? 0;
    cell.max += e.component.maxMarks;
    internal.set(key, cell);
  }

  for (const e of enrolments) {
    const cell = stats.get(`${e.studentId}:${e.subjectId}`);
    const marks = internal.get(`${e.studentId}:${e.subjectId}`);
    out.set(e.studentId, [
      ...(out.get(e.studentId) ?? []),
      {
        code: e.subject.code,
        name: e.subject.name,
        faculty: e.faculty,
        attendance: cell?.percent ?? 0,
        present: cell?.present ?? 0,
        held: cell?.total ?? 0,
        internalMarks: marks?.scored ?? null,
        maxInternal: marks?.max ?? null,
      },
    ]);
  }

  return out;
}

export const mentoringRouter = Router();

/** A mentee below this is flagged as academically at risk. */
const CGPA_FLOOR = 5.0;

/** Attendance this far under the bar is past recovering by attending more. */
const DEBARMENT_LINE = 50;

// ─── GET /api/faculty/mentees ─────────────────────────────────────────────────

/**
 * The mentees, with the alerts that make a mentoring meeting worth calling.
 *
 * Every flag is computed here from live attendance and results rather than
 * stored — a mentee who fixes their attendance stops being at risk the moment
 * the record says so, with nothing to recalculate.
 */
mentoringRouter.get(
  '/mentees',
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);

    const mentorships = await prisma.mentorship.findMany({
      where: { facultyId },
      include: {
        student: {
          select: {
            id: true,
            rollNo: true,
            enrolmentNo: true,
            name: true,
            nameHi: true,
            mobile: true,
            semester: true,
            programme: { select: { shortName: true } },
            results: {
              orderBy: { semester: 'desc' },
              take: 1,
              select: { cgpa: true, sgpa: true, semester: true, outcome: true },
            },
          },
        },
      },
      orderBy: { student: { rollNo: 'asc' } },
    });

    const studentIds = mentorships.map((m) => m.studentId);
    const [overall, breakdown] = await Promise.all([
      overallAttendance(studentIds),
      subjectBreakdown(studentIds),
    ]);

    // Backlogs: any subject the student has failed in a declared result.
    const failures = await prisma.subjectResult.groupBy({
      by: ['resultId'],
      where: { passed: false, result: { studentId: { in: studentIds } } },
      _count: { _all: true },
    });
    const resultOwners = await prisma.semesterResult.findMany({
      where: { id: { in: failures.map((f) => f.resultId) } },
      select: { id: true, studentId: true },
    });
    const backlogsByStudent = new Map<string, number>();
    for (const f of failures) {
      const owner = resultOwners.find((r) => r.id === f.resultId);
      if (!owner) continue;
      backlogsByStudent.set(
        owner.studentId,
        (backlogsByStudent.get(owner.studentId) ?? 0) + f._count._all,
      );
    }

    res.json(
      mentorships.map((m) => {
        const attendance = overall.get(m.studentId) ?? { present: 0, total: 0, percent: 0 };
        const latest = m.student.results[0] ?? null;
        const backlogs = backlogsByStudent.get(m.studentId) ?? 0;
        const alerts: string[] = [];

        if (attendance.percent < DEBARMENT_LINE) {
          alerts.push(`Critical attendance (${attendance.percent}%) — likely debarred`);
        } else if (attendance.percent < ATTENDANCE_THRESHOLD) {
          alerts.push(`Attendance below ${ATTENDANCE_THRESHOLD}% (${attendance.percent}%)`);
        }
        if (latest && latest.cgpa < CGPA_FLOOR) alerts.push(`CGPA below ${CGPA_FLOOR.toFixed(1)}`);
        if (backlogs > 0) alerts.push(`${backlogs} backlog${backlogs === 1 ? '' : 's'} pending`);

        return {
          mentorshipId: m.id,
          id: m.student.id,
          rollNo: m.student.rollNo,
          enrolmentNo: m.student.enrolmentNo,
          name: m.student.name,
          nameHi: m.student.nameHi,
          mobile: m.student.mobile,
          programme: m.student.programme.shortName,
          semester: m.student.semester,
          attendance: attendance.percent,
          cgpa: latest?.cgpa ?? null,
          backlogs,
          lastInteraction: m.lastInteractionAt,
          atRisk: alerts.length > 0,
          alerts,
          subjects: breakdown.get(m.studentId) ?? [],
        };
      }),
    );
  }),
);

// ─── GET /api/faculty/mentees/:studentId ──────────────────────────────────────

/** One mentee in full: subject-wise attendance, internal marks and notes. */
mentoringRouter.get(
  '/mentees/:studentId',
  validate('params', z.object({ studentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { studentId } = req.params as { studentId: string };

    const mentorship = await prisma.mentorship.findUnique({
      where: { facultyId_studentId: { facultyId, studentId } },
      include: {
        student: {
          select: {
            id: true,
            rollNo: true,
            enrolmentNo: true,
            name: true,
            nameHi: true,
            mobile: true,
            semester: true,
            programme: { select: { shortName: true, name: true } },
            results: { orderBy: { semester: 'desc' }, take: 1 },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { name: true } } },
        },
      },
    });

    if (!mentorship) throw ApiError.notFound('That student is not one of your mentees');

    const breakdown = await subjectBreakdown([studentId]);
    const latest = mentorship.student.results[0] ?? null;

    res.json({
      mentorshipId: mentorship.id,
      student: {
        id: mentorship.student.id,
        rollNo: mentorship.student.rollNo,
        enrolmentNo: mentorship.student.enrolmentNo,
        name: mentorship.student.name,
        nameHi: mentorship.student.nameHi,
        mobile: mentorship.student.mobile,
        semester: mentorship.student.semester,
        programme: mentorship.student.programme,
      },
      cgpa: latest?.cgpa ?? null,
      sgpa: latest?.sgpa ?? null,
      assignedAt: mentorship.assignedAt,
      lastInteraction: mentorship.lastInteractionAt,
      subjects: breakdown.get(studentId) ?? [],
      notes: mentorship.notes.map((n) => ({
        id: n.id,
        note: n.note,
        author: n.author.name,
        createdAt: n.createdAt,
      })),
    });
  }),
);

// ─── POST /api/faculty/mentees/:studentId/notes ───────────────────────────────

/** Logs a mentoring interaction, which is also what dates the pairing. */
mentoringRouter.post(
  '/mentees/:studentId/notes',
  validate('params', z.object({ studentId: z.string().min(1) })),
  validate('body', z.object({ note: z.string().min(3).max(2000) })),
  asyncHandler(async (req, res) => {
    const facultyId = await resolveFacultyId(req);
    const { studentId } = req.params as { studentId: string };
    const { note } = req.body as { note: string };

    const mentorship = await prisma.mentorship.findUnique({
      where: { facultyId_studentId: { facultyId, studentId } },
      select: { id: true },
    });

    if (!mentorship) throw ApiError.notFound('That student is not one of your mentees');

    const now = new Date();
    const [created] = await prisma.$transaction([
      prisma.mentorNote.create({
        data: { mentorshipId: mentorship.id, authorId: facultyId, note },
      }),
      prisma.mentorship.update({
        where: { id: mentorship.id },
        data: { lastInteractionAt: now },
      }),
    ]);

    res.status(201).json({ id: created.id, note: created.note, createdAt: created.createdAt });
  }),
);
