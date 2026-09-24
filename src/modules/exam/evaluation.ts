import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { nextInSeries, requireStatus, resolveExamStaffId, settleScript, toleranceFor } from './shared.js';

export const evaluationRouter = Router();

// ─── POST /api/exam/papers/:id/bundles ────────────────────────────────────────

/**
 * Makes up a bundle of scripts for one examiner.
 *
 * Scripts are created from the seating list, so a candidate who was never
 * allocated a hall has no script to mark — the paper trail starts at the door
 * of the examination room, not at a clerk's keyboard.
 */
evaluationRouter.post(
  '/papers/:id/bundles',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      centreCode: z.string().min(1),
      examinerName: z.string().min(2).max(120),
      examinerRole: z.enum(['E1', 'E2', 'MODERATOR']).default('E1'),
      size: z.number().int().min(1).max(200).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      centreCode: string;
      examinerName: string;
      examinerRole: 'E1' | 'E2' | 'MODERATOR';
      size?: number;
    };

    const paper = await prisma.examPaper.findUnique({
      where: { id },
      include: { session: true, subject: { select: { code: true, name: true } } },
    });
    if (!paper) throw ApiError.notFound('No such paper');
    requireStatus(paper.session, ['IN_PROGRESS', 'EVALUATION'], 'making up a bundle');

    const centre = await prisma.examCentre.findUnique({ where: { code: body.centreCode } });
    if (!centre) throw ApiError.notFound(`No centre with code ${body.centreCode}`);

    const seated = await prisma.seatAllocation.findMany({
      where: { sessionId: paper.sessionId, centreId: centre.id },
      select: { studentId: true },
      orderBy: { seatNo: 'asc' },
    });

    if (seated.length === 0) {
      throw ApiError.badRequest(`No candidates are seated at ${centre.code} for this session`);
    }

    // Only candidates who actually take this paper.
    const enrolled = await prisma.enrolment.findMany({
      where: { subjectId: paper.subjectId, studentId: { in: seated.map((s) => s.studentId) } },
      select: { studentId: true },
    });
    const takers = new Set(enrolled.map((e) => e.studentId));
    const candidates = seated.filter((s) => takers.has(s.studentId));

    if (candidates.length === 0) {
      throw ApiError.badRequest(`No candidate at ${centre.code} takes ${paper.subject.code}`);
    }

    const prefix = `BDL/${centre.code.replace('-', '')}/${paper.subject.code}/`;
    const existing = await prisma.answerBundle.findMany({
      where: { bundleNo: { startsWith: prefix } },
      select: { bundleNo: true },
    });

    const bundle = await prisma.$transaction(async (tx) => {
      const created = await tx.answerBundle.create({
        data: {
          bundleNo: nextInSeries(prefix, existing.map((b) => b.bundleNo)),
          paperId: paper.id,
          centreId: centre.id,
          status: 'UNDER_EVALUATION',
          examinerName: body.examinerName,
          examinerRole: body.examinerRole,
          assignedAt: new Date(),
        },
      });

      // A script exists once per candidate per paper, whoever is reading it.
      for (const c of candidates.slice(0, body.size ?? candidates.length)) {
        await tx.answerScript.upsert({
          where: { paperId_studentId: { paperId: paper.id, studentId: c.studentId } },
          create: { paperId: paper.id, studentId: c.studentId, bundleId: created.id },
          update: { bundleId: created.id },
        });
      }

      return created;
    });

    const scripts = await prisma.answerScript.count({ where: { bundleId: bundle.id } });

    res.status(201).json({
      id: bundle.id,
      bundleNo: bundle.bundleNo,
      paper: { code: paper.subject.code, name: paper.subject.name },
      centre: { code: centre.code, name: centre.name },
      examinerName: bundle.examinerName,
      examinerRole: bundle.examinerRole,
      status: bundle.status,
      scripts,
    });
  }),
);

// ─── GET /api/exam/bundles/:id ────────────────────────────────────────────────

/** The foil: every script in the bundle with whatever readings it has. */
evaluationRouter.get(
  '/bundles/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);

    const bundle = await prisma.answerBundle.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: {
        paper: { include: { subject: { select: { code: true, name: true } } } },
        centre: { select: { code: true, name: true } },
        scripts: {
          include: { student: { select: { id: true, rollNo: true, enrolmentNo: true, name: true } } },
          orderBy: { student: { rollNo: 'asc' } },
        },
      },
    });

    if (!bundle) throw ApiError.notFound('No such bundle');

    res.json({
      id: bundle.id,
      bundleNo: bundle.bundleNo,
      status: bundle.status,
      examinerName: bundle.examinerName,
      examinerRole: bundle.examinerRole,
      assignedAt: bundle.assignedAt,
      submittedAt: bundle.submittedAt,
      paper: {
        id: bundle.paper.id,
        code: bundle.paper.subject.code,
        name: bundle.paper.subject.name,
        maxExternal: bundle.paper.maxExternal,
        examDate: bundle.paper.examDate,
      },
      centre: bundle.centre,
      tolerance: toleranceFor(bundle.paper.maxExternal),
      scripts: bundle.scripts.map((s) => ({
        id: s.id,
        studentId: s.student.id,
        rollNo: s.student.rollNo,
        enrolmentNo: s.student.enrolmentNo,
        name: s.student.name,
        e1: s.e1,
        e2: s.e2,
        moderatorMark: s.moderatorMark,
        finalMark: s.finalMark,
        flagged: s.flagged,
        flagReason: s.flagReason,
        absent: s.absent,
      })),
    });
  }),
);

// ─── POST /api/exam/bundles/:id/marks ─────────────────────────────────────────

/**
 * Enters an examiner's readings and settles what it can.
 *
 * Which column a mark lands in comes from the bundle's examiner role, not from
 * the client — an examiner cannot overwrite their colleague's reading by
 * naming the wrong field.
 */
evaluationRouter.post(
  '/bundles/:id/marks',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      marks: z
        .array(
          z.object({
            studentId: z.string().min(1),
            mark: z.number().int().min(0).nullable(),
            absent: z.boolean().optional(),
          }),
        )
        .min(1),
      submit: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      marks: Array<{ studentId: string; mark: number | null; absent?: boolean }>;
      submit: boolean;
    };

    const bundle = await prisma.answerBundle.findUnique({
      where: { id },
      include: { paper: { include: { session: true } }, scripts: true },
    });
    if (!bundle) throw ApiError.notFound('No such bundle');
    requireStatus(bundle.paper.session, ['IN_PROGRESS', 'EVALUATION'], 'entering marks');

    if (bundle.status === 'SUBMITTED' || bundle.status === 'MODERATED') {
      throw ApiError.conflict('This bundle has already been submitted');
    }

    const max = bundle.paper.maxExternal;
    const over = body.marks.filter((m) => m.mark !== null && m.mark > max);
    if (over.length > 0) {
      throw ApiError.badRequest(`This paper is out of ${max}`, {
        studentIds: over.map((o) => o.studentId),
      });
    }

    const inBundle = new Map(bundle.scripts.map((s) => [s.studentId, s]));
    const strangers = body.marks.filter((m) => !inBundle.has(m.studentId));
    if (strangers.length > 0) {
      throw ApiError.badRequest('Some candidates are not in this bundle', {
        studentIds: strangers.map((s) => s.studentId),
      });
    }

    const column =
      bundle.examinerRole === 'E1' ? 'e1' : bundle.examinerRole === 'E2' ? 'e2' : 'moderatorMark';

    let settled = 0;
    let flagged = 0;

    for (const m of body.marks) {
      const current = inBundle.get(m.studentId)!;
      const next = {
        e1: current.e1,
        e2: current.e2,
        moderatorMark: current.moderatorMark,
        absent: m.absent ?? current.absent,
        [column]: m.mark,
      } as {
        e1: number | null;
        e2: number | null;
        moderatorMark: number | null;
        absent: boolean;
      };

      const outcome = settleScript(next, max);
      if (outcome.finalMark !== null) settled += 1;
      if (outcome.flagged) flagged += 1;

      await prisma.answerScript.update({
        where: { id: current.id },
        data: {
          [column]: m.mark,
          absent: next.absent,
          finalMark: outcome.finalMark,
          flagged: outcome.flagged,
          flagReason: outcome.flagReason,
        },
      });
    }

    const updated = body.submit
      ? await prisma.answerBundle.update({
          where: { id },
          data: {
            status: bundle.examinerRole === 'MODERATOR' ? 'MODERATED' : 'SUBMITTED',
            submittedAt: new Date(),
          },
        })
      : bundle;

    res.status(201).json({
      bundleId: bundle.id,
      saved: body.marks.length,
      settled,
      flagged,
      status: updated.status,
      tolerance: toleranceFor(max),
    });
  }),
);

// ─── GET /api/exam/sessions/:id/flagged ───────────────────────────────────────

/** Scripts waiting on a moderator, because two examiners disagreed. */
evaluationRouter.get(
  '/sessions/:id/flagged',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);

    const scripts = await prisma.answerScript.findMany({
      where: { paper: { sessionId: (req.params as { id: string }).id }, flagged: true },
      include: {
        student: { select: { rollNo: true, enrolmentNo: true, name: true } },
        paper: {
          include: { subject: { select: { code: true, name: true } } },
        },
      },
      orderBy: { student: { rollNo: 'asc' } },
    });

    res.json(
      scripts.map((s) => ({
        id: s.id,
        rollNo: s.student.rollNo,
        enrolmentNo: s.student.enrolmentNo,
        name: s.student.name,
        code: s.paper.subject.code,
        subject: s.paper.subject.name,
        maxExternal: s.paper.maxExternal,
        e1: s.e1,
        e2: s.e2,
        gap: s.e1 !== null && s.e2 !== null ? Math.abs(s.e1 - s.e2) : null,
        tolerance: toleranceFor(s.paper.maxExternal),
        flagReason: s.flagReason,
      })),
    );
  }),
);

// ─── POST /api/exam/scripts/:id/moderate ──────────────────────────────────────

/** A moderator's reading, which stands alone and settles the script. */
evaluationRouter.post(
  '/scripts/:id/moderate',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ mark: z.number().int().min(0), remarks: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { mark } = req.body as { mark: number };

    const script = await prisma.answerScript.findUnique({
      where: { id },
      include: { paper: { include: { session: true, subject: { select: { code: true } } } } },
    });
    if (!script) throw ApiError.notFound('No such script');
    requireStatus(script.paper.session, ['IN_PROGRESS', 'EVALUATION'], 'moderating');

    if (!script.flagged) throw ApiError.conflict('That script is not waiting on a moderator');
    if (mark > script.paper.maxExternal) {
      throw ApiError.badRequest(`This paper is out of ${script.paper.maxExternal}`);
    }

    const outcome = settleScript(
      { e1: script.e1, e2: script.e2, moderatorMark: mark, absent: script.absent },
      script.paper.maxExternal,
    );

    const updated = await prisma.answerScript.update({
      where: { id },
      data: {
        moderatorMark: mark,
        finalMark: outcome.finalMark,
        flagged: false,
        flagReason: null,
      },
    });

    res.json({
      id: updated.id,
      code: script.paper.subject.code,
      e1: updated.e1,
      e2: updated.e2,
      moderatorMark: updated.moderatorMark,
      finalMark: updated.finalMark,
      flagged: updated.flagged,
    });
  }),
);
