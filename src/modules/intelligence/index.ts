import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { WEIGHTS, assess, project } from './scoring.js';

/**
 * Phase 10 — the intelligence layer.
 *
 * Reporting over everything below, which is why it is last. Three things: a
 * transparent risk score that always shows its working, snapshots so a score
 * can be compared with itself across an intervention, and the interventions
 * themselves — because a list of at-risk students that nobody acts on is a
 * report, not a system.
 *
 * There is no prediction engine here and no assistant. What it does is
 * arithmetic over records, stated plainly enough to be argued with.
 */
export const intelligenceRouter = Router();

intelligenceRouter.use(requireAuth);
intelligenceRouter.use(requireRole('FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'));

/** The cohort the caller may look at. */
async function resolveScope(req: Request): Promise<{ studentIds: string[]; scope: string }> {
  const auth = req.auth!;

  // A lecturer sees the students they mentor, and nobody else's.
  if (auth.role === 'FACULTY') {
    if (!auth.facultyId) throw ApiError.forbidden('This account has no faculty record');
    const mentorships = await prisma.mentorship.findMany({
      where: { facultyId: auth.facultyId },
      select: { studentId: true },
    });
    return { studentIds: mentorships.map((m) => m.studentId), scope: 'mentees' };
  }

  const faculty = await prisma.faculty.findUnique({
    where: { userId: auth.sub },
    select: { collegeId: true },
  });
  const staff = faculty
    ? null
    : await prisma.officeStaff.findUnique({ where: { userId: auth.sub }, select: { collegeId: true } });

  const collegeId = faculty?.collegeId ?? staff?.collegeId;
  const students = await prisma.student.findMany({
    where: collegeId ? { collegeId } : {},
    select: { id: true },
  });

  return { studentIds: students.map((s) => s.id), scope: collegeId ? 'college' : 'all' };
}

const STUDENT_SELECT = {
  id: true,
  enrolmentNo: true,
  rollNo: true,
  name: true,
  semester: true,
  programme: { select: { shortName: true } },
  mentorships: { select: { faculty: { select: { name: true } } }, take: 1 },
} as const;

// ─── GET /api/intelligence/risk ───────────────────────────────────────────────

/**
 * The cohort, scored now.
 *
 * Each row carries the factors that produced its score, so a mentor can see
 * why a student is on the list and disagree with it.
 */
intelligenceRouter.get(
  '/risk',
  validate('query', z.object({ band: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).optional() })),
  asyncHandler(async (req, res) => {
    const { studentIds, scope } = await resolveScope(req);
    const band = typeof req.query.band === 'string' ? req.query.band : undefined;

    const [scores, students] = await Promise.all([
      assess(studentIds),
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: STUDENT_SELECT }),
    ]);

    const open = await prisma.intervention.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, outcome: 'OPEN' },
      _count: { _all: true },
    });
    const openByStudent = new Map(open.map((o) => [o.studentId, o._count._all]));

    const rows = students
      .map((s) => {
        const a = scores.get(s.id)!;
        return {
          id: s.id,
          enrolmentNo: s.enrolmentNo,
          rollNo: s.rollNo,
          name: s.name,
          programme: s.programme.shortName,
          semester: s.semester,
          mentor: s.mentorships[0]?.faculty.name ?? null,
          score: a.score,
          band: a.band,
          basis: a.basis,
          // Not a confidence percentage: the number of records behind it.
          dataPoints: a.dataPoints,
          factors: a.factors,
          openInterventions: openByStudent.get(s.id) ?? 0,
        };
      })
      .filter((r) => (band ? r.band === band : true))
      .sort((a, b) => b.score - a.score);

    res.json({
      scope,
      model: {
        weights: WEIGHTS,
        note:
          'A weighted score over records already held — attendance marked, results declared, ' +
          'fees owed. Not a prediction, and every factor is returned with its weight.',
      },
      totals: {
        assessed: rows.length,
        critical: rows.filter((r) => r.band === 'CRITICAL').length,
        high: rows.filter((r) => r.band === 'HIGH').length,
        moderate: rows.filter((r) => r.band === 'MODERATE').length,
        low: rows.filter((r) => r.band === 'LOW').length,
        withOpenIntervention: rows.filter((r) => r.openInterventions > 0).length,
      },
      students: rows,
    });
  }),
);

// ─── GET /api/intelligence/risk/:studentId ────────────────────────────────────

/** One student: the score now, how it has moved, and what was done about it. */
intelligenceRouter.get(
  '/risk/:studentId',
  validate('params', z.object({ studentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { studentIds } = await resolveScope(req);
    const { studentId } = req.params as { studentId: string };

    if (!studentIds.includes(studentId)) {
      throw ApiError.notFound('That student is not in your cohort');
    }

    const [scores, student, history, interventions, projections] = await Promise.all([
      assess([studentId]),
      prisma.student.findUnique({ where: { id: studentId }, select: STUDENT_SELECT }),
      prisma.riskAssessment.findMany({
        where: { studentId },
        include: { factors: true },
        orderBy: { assessedAt: 'desc' },
        take: 12,
      }),
      prisma.intervention.findMany({
        where: { studentId },
        include: { raisedBy: { select: { name: true } } },
        orderBy: { raisedAt: 'desc' },
      }),
      project([studentId]),
    ]);

    if (!student) throw ApiError.notFound('No such student');

    const now = scores.get(studentId)!;
    const previous = history[0];

    res.json({
      student: {
        id: student.id,
        enrolmentNo: student.enrolmentNo,
        rollNo: student.rollNo,
        name: student.name,
        programme: student.programme.shortName,
        semester: student.semester,
        mentor: student.mentorships[0]?.faculty.name ?? null,
      },
      current: {
        score: now.score,
        band: now.band,
        basis: now.basis,
        dataPoints: now.dataPoints,
        factors: now.factors,
      },
      // The whole point of snapshots: has it moved, and which way.
      movement: previous
        ? {
            since: previous.assessedAt,
            was: previous.score,
            change: now.score - previous.score,
            direction:
              now.score < previous.score
                ? 'improved'
                : now.score > previous.score
                  ? 'worsened'
                  : 'unchanged',
          }
        : null,
      history: history.map((h) => ({
        assessedAt: h.assessedAt,
        score: h.score,
        band: h.band,
        basis: h.basis,
        dataPoints: h.dataPoints,
      })),
      projection: projections.get(studentId) ?? null,
      interventions: interventions.map((i) => ({
        id: i.id,
        kind: i.kind,
        note: i.note,
        raisedBy: i.raisedBy.name,
        raisedAt: i.raisedAt,
        dueOn: i.dueOn,
        outcome: i.outcome,
        outcomeNote: i.outcomeNote,
        closedAt: i.closedAt,
        scoreAtRaise: i.scoreAtRaise,
        // What the score has done since the intervention was opened.
        scoreSince: i.scoreAtRaise === null ? null : now.score - i.scoreAtRaise,
      })),
    });
  }),
);

// ─── POST /api/intelligence/risk/snapshot ─────────────────────────────────────

/**
 * Takes a snapshot of the cohort's scores.
 *
 * Scores are computed live, so a snapshot is not the answer — it is the answer
 * as it stood. Without one there is no way to tell later whether anything an
 * intervention did actually helped.
 */
intelligenceRouter.post(
  '/risk/snapshot',
  requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const { studentIds, scope } = await resolveScope(req);
    if (studentIds.length === 0) throw ApiError.badRequest('There is no cohort to assess');

    const scores = await assess(studentIds);
    const takenAt = new Date();

    await prisma.$transaction(
      [...scores.values()].map((a) =>
        prisma.riskAssessment.create({
          data: {
            studentId: a.studentId,
            assessedAt: takenAt,
            score: a.score,
            band: a.band,
            basis: a.basis,
            dataPoints: a.dataPoints,
            factors: {
              create: a.factors.map((f) => ({
                factor: f.factor,
                value: f.value,
                direction: f.direction,
                weight: f.weight,
                contribution: f.contribution,
              })),
            },
          },
        }),
      ),
      { timeout: 60_000 },
    );

    const bands = [...scores.values()];

    await recordFor(req, {
      module: 'Governance',
      action: 'create',
      target: `Risk snapshot — ${bands.length} students`,
      detail: `${bands.filter((b) => b.band === 'CRITICAL').length} critical, ${bands.filter((b) => b.band === 'HIGH').length} high`,
    });

    res.status(201).json({
      scope,
      takenAt,
      assessed: bands.length,
      critical: bands.filter((b) => b.band === 'CRITICAL').length,
      high: bands.filter((b) => b.band === 'HIGH').length,
    });
  }),
);

// ─── GET /api/intelligence/projection ─────────────────────────────────────────

/**
 * The term projected from the internal marks approved so far.
 *
 * Every row says what share of the assessment it is based on, so a projection
 * from a single component is visibly weaker than one from a full sheet.
 */
intelligenceRouter.get(
  '/projection',
  asyncHandler(async (req, res) => {
    const { studentIds, scope } = await resolveScope(req);

    const [projections, students] = await Promise.all([
      project(studentIds),
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: STUDENT_SELECT }),
    ]);

    const rows = students
      .map((s) => {
        const p = projections.get(s.id)!;
        // Spread first, then the identity, so the projection cannot shadow it.
        return {
          ...p,
          studentId: s.id,
          enrolmentNo: s.enrolmentNo,
          name: s.name,
          programme: s.programme.shortName,
          semester: s.semester,
          // The weakest subject is the one worth a conversation.
          weakest: [...p.subjects].sort((a, b) => a.percent - b.percent)[0] ?? null,
        };
      })
      // A student with nothing approved yet cannot be projected at all.
      .filter((r) => r.projectedPercent !== null)
      .sort((a, b) => (a.projectedPercent ?? 0) - (b.projectedPercent ?? 0));

    res.json({
      scope,
      note:
        'Extrapolated from internal marks a head of department has approved. ' +
        'Not a prediction of the examination — the share assessed is stated per row.',
      totals: {
        projected: rows.length,
        notYetAssessable: students.length - rows.length,
        belowPass: rows.filter((r) => r.band === 'below_pass').length,
      },
      students: rows,
    });
  }),
);

// ─── GET /api/intelligence/cohort ─────────────────────────────────────────────

/** Distributions, for seeing the shape of a cohort rather than one student. */
intelligenceRouter.get(
  '/cohort',
  asyncHandler(async (req, res) => {
    const { studentIds, scope } = await resolveScope(req);
    const scores = await assess(studentIds);
    const all = [...scores.values()];

    // Attendance in ten-point bands, which is how a warden reads it.
    const { overallAttendance } = await import('../faculty/shared.js');
    const attendance = await overallAttendance(studentIds);
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      from: i * 10,
      to: i * 10 + 9,
      students: 0,
    }));
    for (const a of attendance.values()) {
      const idx = Math.min(9, Math.floor(a.percent / 10));
      buckets[idx]!.students += 1;
    }

    const subjects = await prisma.subjectResult.groupBy({
      by: ['subjectId'],
      where: { result: { studentId: { in: studentIds }, published: true } },
      _count: { _all: true },
    });
    const passes = await prisma.subjectResult.groupBy({
      by: ['subjectId'],
      where: { result: { studentId: { in: studentIds }, published: true }, passed: true },
      _count: { _all: true },
    });
    const passBySubject = new Map(passes.map((p) => [p.subjectId, p._count._all]));

    const subjectRows = await prisma.subject.findMany({
      where: { id: { in: subjects.map((s) => s.subjectId) } },
      select: { id: true, code: true, name: true },
    });

    res.json({
      scope,
      riskBands: {
        critical: all.filter((a) => a.band === 'CRITICAL').length,
        high: all.filter((a) => a.band === 'HIGH').length,
        moderate: all.filter((a) => a.band === 'MODERATE').length,
        low: all.filter((a) => a.band === 'LOW').length,
      },
      attendanceDistribution: buckets,
      subjectPassRates: subjects
        .map((s) => {
          const subject = subjectRows.find((x) => x.id === s.subjectId);
          const sat = s._count._all;
          const passed = passBySubject.get(s.subjectId) ?? 0;
          return {
            code: subject?.code ?? '—',
            name: subject?.name ?? '—',
            sat,
            passed,
            passPercent: sat === 0 ? 0 : Number(((passed / sat) * 100).toFixed(1)),
          };
        })
        .sort((a, b) => a.passPercent - b.passPercent),
    });
  }),
);

// ─── POST /api/intelligence/interventions ─────────────────────────────────────

/**
 * Records something done about a flagged student.
 *
 * The score at the moment it was opened is kept, so what happened afterwards
 * can be read off rather than remembered.
 */
intelligenceRouter.post(
  '/interventions',
  validate(
    'body',
    z.object({
      studentId: z.string().min(1),
      kind: z.enum(['COUNSELLING', 'PARENT_CONTACT', 'REMEDIAL_CLASS', 'FEE_RELIEF', 'MEDICAL_REFERRAL', 'OTHER']),
      note: z.string().min(10).max(2000),
      dueOn: z.string().date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { studentIds } = await resolveScope(req);
    const body = req.body as {
      studentId: string;
      kind: 'COUNSELLING';
      note: string;
      dueOn?: string;
    };

    if (!studentIds.includes(body.studentId)) {
      throw ApiError.forbidden('That student is not in your cohort');
    }

    const faculty = await prisma.faculty.findUnique({
      where: { userId: auth.sub },
      select: { id: true },
    });
    if (!faculty) throw ApiError.forbidden('An intervention is recorded against a member of staff');

    const open = await prisma.intervention.findFirst({
      where: { studentId: body.studentId, kind: body.kind, outcome: 'OPEN' },
      select: { id: true },
    });
    if (open) {
      throw ApiError.conflict(
        `There is already an open ${body.kind.toLowerCase().replace(/_/g, ' ')} for this student`,
        { interventionId: open.id },
      );
    }

    const scores = await assess([body.studentId]);

    const created = await prisma.intervention.create({
      data: {
        studentId: body.studentId,
        raisedById: faculty.id,
        kind: body.kind,
        note: body.note,
        dueOn: body.dueOn ? new Date(`${body.dueOn}T00:00:00.000Z`) : null,
        scoreAtRaise: scores.get(body.studentId)?.score ?? null,
      },
    });

    res.status(201).json({
      id: created.id,
      studentId: created.studentId,
      kind: created.kind,
      outcome: created.outcome,
      raisedAt: created.raisedAt,
      dueOn: created.dueOn,
      scoreAtRaise: created.scoreAtRaise,
    });
  }),
);

// ─── POST /api/intelligence/interventions/:id/close ───────────────────────────

/**
 * Closes one with what came of it.
 *
 * The outcome is recorded against the score at the time, so "improved" is a
 * claim the record can be checked against rather than an opinion.
 */
intelligenceRouter.post(
  '/interventions/:id/close',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      outcome: z.enum(['IMPROVED', 'NO_CHANGE', 'WORSENED', 'WITHDRAWN']),
      outcomeNote: z.string().min(5).max(1000),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { outcome: 'IMPROVED'; outcomeNote: string };

    const intervention = await prisma.intervention.findUnique({ where: { id } });
    if (!intervention) throw ApiError.notFound('No such intervention');
    if (intervention.outcome !== 'OPEN') {
      throw ApiError.conflict(`That intervention is already ${intervention.outcome.toLowerCase()}`);
    }

    const scores = await assess([intervention.studentId]);
    const now = scores.get(intervention.studentId)?.score ?? null;

    const updated = await prisma.intervention.update({
      where: { id },
      data: { outcome: body.outcome, outcomeNote: body.outcomeNote, closedAt: new Date() },
    });

    res.json({
      id: updated.id,
      outcome: updated.outcome,
      closedAt: updated.closedAt,
      scoreAtRaise: updated.scoreAtRaise,
      scoreNow: now,
      // Whether the record agrees with the outcome claimed.
      change:
        updated.scoreAtRaise === null || now === null ? null : now - updated.scoreAtRaise,
    });
  }),
);
