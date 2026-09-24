import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import {
  GRACE,
  PASS_PERCENT,
  applyGrace,
  divisionFor,
  gradeFor,
  nextInSeries,
  requireStatus,
  resolveExamStaffId,
} from './shared.js';

export const resultsRouter = Router();

/**
 * A student's internal marks for a subject, from the sheet the head of
 * department approved in Phase 2.
 *
 * Only an APPROVED sheet counts. A draft is a lecturer's working; putting it
 * into a result would publish a number nobody signed for.
 */
async function approvedInternals(studentIds: string[], subjectIds: string[]) {
  const entries = await prisma.markEntry.findMany({
    where: {
      studentId: { in: studentIds },
      value: { not: null },
      sheet: { status: 'APPROVED' },
      component: { assignment: { subjectId: { in: subjectIds } } },
    },
    include: {
      component: { select: { maxMarks: true, assignment: { select: { subjectId: true } } } },
    },
  });

  const out = new Map<string, { scored: number; max: number }>();
  for (const e of entries) {
    const key = `${e.studentId}:${e.component.assignment.subjectId}`;
    const cell = out.get(key) ?? { scored: 0, max: 0 };
    cell.scored += e.value ?? 0;
    cell.max += e.component.maxMarks;
    out.set(key, cell);
  }
  return out;
}

/** Rescales an internal total onto the paper's internal component. */
function scaleInternal(scored: number, outOf: number, onto: number): number {
  if (outOf === 0) return 0;
  return Math.round((scored / outOf) * onto);
}

// ─── POST /api/exam/sessions/:id/process ──────────────────────────────────────

/**
 * Computes the results for a sitting.
 *
 * This is where the whole system meets: the internal marks a lecturer entered
 * and a head of department approved, plus the external marks two examiners
 * settled, become the `SemesterResult` rows the student portal has been
 * reading since Phase 1. Nothing is visible yet — results are written under
 * embargo and released only when the session is published.
 *
 * Re-runnable: processing again replaces the sitting's results rather than
 * duplicating them, because a late moderation should change the answer.
 */
resultsRouter.post(
  '/sessions/:id/process',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ applyGrace: z.boolean().default(true) }).default({ applyGrace: true })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { applyGrace: withGrace } = req.body as { applyGrace: boolean };

    const session = await prisma.examSession.findUnique({
      where: { id },
      include: {
        papers: {
          include: { subject: { select: { id: true, code: true, name: true, credits: true, semester: true } } },
        },
      },
    });
    if (!session) throw ApiError.notFound('No such examination session');
    requireStatus(session, ['RESULT_PROCESSING'], 'processing results');

    if (session.papers.length === 0) throw ApiError.badRequest('This session has no papers');

    const scripts = await prisma.answerScript.findMany({
      where: { paperId: { in: session.papers.map((p) => p.id) } },
      select: { paperId: true, studentId: true, finalMark: true, absent: true },
    });

    const studentIds = [...new Set(scripts.map((s) => s.studentId))];
    if (studentIds.length === 0) throw ApiError.badRequest('No scripts have been evaluated');

    const subjectIds = session.papers.map((p) => p.subjectId);
    const internals = await approvedInternals(studentIds, subjectIds);

    const paperById = new Map(session.papers.map((p) => [p.id, p]));
    const scriptsByStudent = new Map<string, typeof scripts>();
    for (const s of scripts) {
      scriptsByStudent.set(s.studentId, [...(scriptsByStudent.get(s.studentId) ?? []), s]);
    }

    // Prior credits, so the cumulative average is cumulative.
    //
    // The null branch is load-bearing: `{ not: id }` on a nullable column is
    // NULL for rows where sessionId is null, so it would silently drop every
    // result that predates Phase 4 and reset each CGPA to that term SGPA.
    const priorResults = await prisma.semesterResult.findMany({
      where: {
        studentId: { in: studentIds },
        OR: [{ sessionId: null }, { sessionId: { not: id } }],
      },
      select: { studentId: true, sgpa: true, totalCredits: true, semester: true },
    });

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, semester: true },
    });
    const semesterOf = new Map(students.map((s) => [s.id, s.semester]));

    let processed = 0;
    let passed = 0;
    let graced = 0;

    await prisma.$transaction(
      async (tx) => {
        // Replace, do not duplicate: a re-run is the corrected answer.
        await tx.semesterResult.deleteMany({ where: { sessionId: id } });

        for (const studentId of studentIds) {
          const own = scriptsByStudent.get(studentId) ?? [];

          const rows = own.map((s) => {
            const paper = paperById.get(s.paperId)!;
            const internal = internals.get(`${studentId}:${paper.subjectId}`);
            const internalMark = internal
              ? scaleInternal(internal.scored, internal.max, paper.maxInternal)
              : 0;
            const external = s.absent ? 0 : (s.finalMark ?? 0);
            const maxTotal = paper.maxExternal + paper.maxInternal;

            return {
              subjectId: paper.subjectId,
              code: paper.subject.code,
              credits: paper.subject.credits,
              internal: internalMark,
              external,
              total: internalMark + external,
              maxTotal,
              absent: s.absent,
            };
          });

          if (rows.length === 0) continue;

          const grace = withGrace
            ? applyGrace(rows.filter((r) => !r.absent).map((r) => ({ code: r.code, total: r.total, maxTotal: r.maxTotal })))
            : new Map<string, number>();

          const finalRows = rows.map((r) => {
            const given = grace.get(r.code) ?? 0;
            const total = r.total + given;
            const { grade, points } = gradeFor(total, r.maxTotal);
            return {
              ...r,
              graceGiven: given,
              total,
              grade,
              points,
              passed: !r.absent && (total / r.maxTotal) * 100 >= PASS_PERCENT,
            };
          });

          if (finalRows.some((r) => r.graceGiven > 0)) graced += 1;

          const credits = finalRows.reduce((sum, r) => sum + r.credits, 0);
          const weighted = finalRows.reduce((sum, r) => sum + r.points * r.credits, 0);
          const sgpa = credits === 0 ? 0 : Number((weighted / credits).toFixed(2));

          const prior = priorResults.filter((p) => p.studentId === studentId);
          const priorCredits = prior.reduce((sum, p) => sum + p.totalCredits, 0);
          const priorWeighted = prior.reduce((sum, p) => sum + p.sgpa * p.totalCredits, 0);
          const cgpa =
            priorCredits + credits === 0
              ? sgpa
              : Number(((priorWeighted + weighted) / (priorCredits + credits)).toFixed(2));

          const allPassed = finalRows.every((r) => r.passed);
          if (allPassed) passed += 1;

          const aggregate = finalRows.reduce((sum, r) => sum + r.total, 0);
          const aggregateMax = finalRows.reduce((sum, r) => sum + r.maxTotal, 0);
          const percent = aggregateMax === 0 ? 0 : (aggregate / aggregateMax) * 100;

          const semester = semesterOf.get(studentId) ?? finalRows[0]?.maxTotal ?? 1;

          const result = await tx.semesterResult.create({
            data: {
              studentId,
              semester: typeof semester === 'number' ? semester : 1,
              declaredOn: session.name,
              sgpa,
              cgpa,
              totalCredits: priorCredits + credits,
              outcome: allPassed ? 'PASS' : 'FAIL',
              // Written under embargo; publishing the session lifts it.
              published: false,
              sessionId: id,
              division: allPassed ? divisionFor(percent) : 'Fail',
              graceMarks: finalRows.reduce((sum, r) => sum + r.graceGiven, 0),
            },
          });

          await tx.subjectResult.createMany({
            data: finalRows.map((r) => ({
              resultId: result.id,
              subjectId: r.subjectId,
              internal: r.internal,
              external: r.external,
              total: r.total,
              grade: r.grade,
              passed: r.passed,
              graceGiven: r.graceGiven,
            })),
          });

          processed += 1;
        }
      },
      { timeout: 60_000 },
    );

    res.status(201).json({
      sessionId: id,
      processed,
      passed,
      failed: processed - passed,
      graced,
      passPercent: processed === 0 ? 0 : Number(((passed / processed) * 100).toFixed(1)),
      graceRules: GRACE,
      embargoed: true,
      note: 'Results are computed but not visible until the session is published.',
    });
  }),
);

// ─── GET /api/exam/sessions/:id/results ───────────────────────────────────────

/** The provisional list, for the back-office to read before releasing it. */
resultsRouter.get(
  '/sessions/:id/results',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('query', z.object({ outcome: z.enum(['PASS', 'FAIL']).optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;

    const results = await prisma.semesterResult.findMany({
      where: { sessionId: id, ...(outcome ? { outcome: outcome as 'PASS' } : {}) },
      include: {
        student: {
          select: {
            id: true,
            rollNo: true,
            enrolmentNo: true,
            name: true,
            programme: { select: { shortName: true } },
            college: { select: { name: true } },
          },
        },
        subjects: { include: { subject: { select: { code: true, name: true } } } },
      },
      orderBy: { student: { rollNo: 'asc' } },
    });

    res.json({
      published: results.every((r) => r.published) && results.length > 0,
      totals: {
        total: results.length,
        passed: results.filter((r) => r.outcome === 'PASS').length,
        graced: results.filter((r) => r.graceMarks > 0).length,
      },
      results: results.map((r) => ({
        id: r.id,
        studentId: r.student.id,
        rollNo: r.student.rollNo,
        enrolmentNo: r.student.enrolmentNo,
        name: r.student.name,
        programme: r.student.programme.shortName,
        college: r.student.college.name,
        semester: r.semester,
        sgpa: r.sgpa,
        cgpa: r.cgpa,
        outcome: r.outcome,
        division: r.division,
        graceMarks: r.graceMarks,
        published: r.published,
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
    });
  }),
);

// ═══ Revaluation ═════════════════════════════════════════════════════════════

// ─── GET /api/exam/revaluations ───────────────────────────────────────────────

resultsRouter.get(
  '/revaluations',
  validate(
    'query',
    z.object({ status: z.enum(['APPLIED', 'UNDER_REVALUATION', 'COMPLETED', 'REJECTED']).optional() }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const applications = await prisma.revaluationApplication.findMany({
      where: status ? { status: status as 'APPLIED' } : {},
      include: {
        student: { select: { id: true, rollNo: true, enrolmentNo: true, name: true } },
        paper: { include: { subject: { select: { code: true, name: true } } } },
      },
      orderBy: { appliedAt: 'asc' },
    });

    res.json(
      applications.map((a) => ({
        id: a.id,
        applicationNo: a.applicationNo,
        studentId: a.student.id,
        rollNo: a.student.rollNo,
        name: a.student.name,
        code: a.paper.subject.code,
        subject: a.paper.subject.name,
        appliedAt: a.appliedAt,
        fee: a.fee,
        feePaid: a.feePaid,
        status: a.status,
        originalMark: a.originalMark,
        revisedMark: a.revisedMark,
        changed: a.changed,
        completedAt: a.completedAt,
        remarks: a.remarks,
      })),
    );
  }),
);

// ─── POST /api/exam/revaluations/:id/fee ──────────────────────────────────────

/** Records the revaluation fee as received, which is what starts the reading. */
resultsRouter.post(
  "/revaluations/:id/fee",
  validate("params", z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };

    const application = await prisma.revaluationApplication.findUnique({ where: { id } });
    if (!application) throw ApiError.notFound("No such revaluation application");
    if (application.feePaid) throw ApiError.conflict("That fee is already marked paid");

    const updated = await prisma.revaluationApplication.update({
      where: { id },
      data: { feePaid: true, status: "UNDER_REVALUATION" },
    });

    res.json({ id: updated.id, feePaid: updated.feePaid, status: updated.status });
  }),
);

// ─── POST /api/exam/revaluations/:id/complete ─────────────────────────────────

/**
 * Records a re-reading.
 *
 * If the mark moves, the published result is recomputed for that subject in
 * the same transaction — a revaluation that changed a mark but left the
 * marksheet saying something else would be worse than not doing it at all.
 */
resultsRouter.post(
  '/revaluations/:id/complete',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ revisedMark: z.number().int().min(0), remarks: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { revisedMark, remarks } = req.body as { revisedMark: number; remarks?: string };

    const application = await prisma.revaluationApplication.findUnique({
      where: { id },
      include: { paper: { include: { subject: { select: { code: true } } } } },
    });
    if (!application) throw ApiError.notFound('No such revaluation application');
    if (application.status === 'COMPLETED') throw ApiError.conflict('That revaluation is already done');
    if (!application.feePaid) throw ApiError.badRequest('The revaluation fee has not been paid');
    if (revisedMark > application.paper.maxExternal) {
      throw ApiError.badRequest(`This paper is out of ${application.paper.maxExternal}`);
    }

    const script = await prisma.answerScript.findUnique({
      where: {
        paperId_studentId: { paperId: application.paperId, studentId: application.studentId },
      },
    });
    if (!script) throw ApiError.notFound('No script on record for that candidate');

    const original = script.finalMark ?? 0;
    const changed = revisedMark !== original;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.revaluationApplication.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          originalMark: original,
          revisedMark,
          changed,
          completedAt: now,
          remarks: remarks ?? null,
        },
      });

      if (!changed) return;

      await tx.answerScript.update({
        where: { id: script.id },
        data: { finalMark: revisedMark, moderatorMark: revisedMark },
      });

      // Rewrite the published marksheet row so the two agree.
      const result = await tx.semesterResult.findFirst({
        where: { studentId: application.studentId, sessionId: application.paper.sessionId },
        include: { subjects: true },
      });
      if (!result) return;

      const row = result.subjects.find((s) => s.subjectId === application.paper.subjectId);
      if (!row) return;

      const maxTotal = application.paper.maxExternal + application.paper.maxInternal;
      const total = row.internal + revisedMark + row.graceGiven;
      const { grade } = gradeFor(total, maxTotal);

      await tx.subjectResult.update({
        where: { id: row.id },
        data: {
          external: revisedMark,
          total,
          grade,
          passed: (total / maxTotal) * 100 >= PASS_PERCENT,
        },
      });

      await tx.notification.create({
        data: {
          studentId: application.studentId,
          kind: 'RESULT',
          title: `Revaluation result — ${application.paper.subject.code}`,
          body: `Your mark changed from ${original} to ${revisedMark}.`,
          urgent: true,
          href: '/results',
        },
      });
    });

    res.json({
      id: application.id,
      applicationNo: application.applicationNo,
      code: application.paper.subject.code,
      originalMark: original,
      revisedMark,
      changed,
      completedAt: now,
    });
  }),
);

// ═══ The student's own side ══════════════════════════════════════════════════

export const studentRevaluationRouter = Router();

// ─── POST /api/student/revaluations ───────────────────────────────────────────

/** Applies for a re-reading of one published paper. */
studentRevaluationRouter.post(
  '/',
  validate('body', z.object({ subjectCode: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { resolveStudentId } = await import('../../auth/middleware.js');
    const studentId = await resolveStudentId(req);
    const { subjectCode } = req.body as { subjectCode: string };

    const script = await prisma.answerScript.findFirst({
      where: { studentId, paper: { subject: { code: subjectCode } } },
      include: {
        paper: { include: { session: true, subject: { select: { id: true, code: true } } } },
      },
      orderBy: { paper: { examDate: 'desc' } },
    });

    if (!script) throw ApiError.notFound(`No examination record for ${subjectCode}`);
    if (script.paper.session.status !== 'RESULT_PUBLISHED') {
      throw ApiError.badRequest('Results for that sitting have not been published yet');
    }

    const existing = await prisma.revaluationApplication.findUnique({
      where: { studentId_paperId: { studentId, paperId: script.paperId } },
      select: { id: true, applicationNo: true, status: true },
    });
    if (existing) {
      throw ApiError.conflict(`You have already applied for a revaluation of ${subjectCode}`, existing);
    }

    const year = new Date().getFullYear();
    const prefix = `RV/${year}/`;
    const all = await prisma.revaluationApplication.findMany({
      where: { applicationNo: { startsWith: prefix } },
      select: { applicationNo: true },
    });

    const created = await prisma.revaluationApplication.create({
      data: {
        applicationNo: nextInSeries(prefix, all.map((a) => a.applicationNo), 4),
        studentId,
        paperId: script.paperId,
        originalMark: script.finalMark,
      },
    });

    res.status(201).json({
      id: created.id,
      applicationNo: created.applicationNo,
      code: script.paper.subject.code,
      fee: created.fee,
      feePaid: created.feePaid,
      status: created.status,
      appliedAt: created.appliedAt,
    });
  }),
);
