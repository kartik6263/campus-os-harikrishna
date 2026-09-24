import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireStatus, resolveExamStaffId } from './shared.js';
import { recordFor } from '../itconsole/audit.js';

export const sessionsRouter = Router();

/** Where a session can go from where it is — a sitting only runs forwards. */
const NEXT_STATUS: Record<string, string[]> = {
  PLANNED: ['FORM_WINDOW_OPEN'],
  FORM_WINDOW_OPEN: ['FORM_WINDOW_CLOSED'],
  FORM_WINDOW_CLOSED: ['IN_PROGRESS'],
  IN_PROGRESS: ['EVALUATION'],
  EVALUATION: ['RESULT_PROCESSING'],
  RESULT_PROCESSING: ['RESULT_PUBLISHED'],
  RESULT_PUBLISHED: [],
};

// ─── GET /api/exam/sessions ───────────────────────────────────────────────────

sessionsRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);

    const sessions = await prisma.examSession.findMany({
      orderBy: { examStartsOn: 'desc' },
      include: {
        _count: { select: { papers: true, allocations: true, results: true } },
      },
    });

    res.json(
      sessions.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        academicYear: s.academicYear,
        status: s.status,
        formOpensOn: s.formOpensOn,
        formClosesOn: s.formClosesOn,
        lateClosesOn: s.lateClosesOn,
        examStartsOn: s.examStartsOn,
        examEndsOn: s.examEndsOn,
        resultTargetOn: s.resultTargetOn,
        publishedAt: s.publishedAt,
        fees: { regular: s.regularFee, late: s.lateFee, backlog: s.backlogFee },
        papers: s._count.papers,
        candidates: s._count.allocations,
        results: s._count.results,
        nextStatus: NEXT_STATUS[s.status] ?? [],
      })),
    );
  }),
);

// ─── GET /api/exam/sessions/:id ───────────────────────────────────────────────

/** One session with its papers and how far evaluation has got on each. */
sessionsRouter.get(
  '/sessions/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);

    const session = await prisma.examSession.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: {
        papers: {
          include: {
            subject: { select: { code: true, name: true, credits: true, semester: true } },
            _count: { select: { bundles: true, scripts: true } },
          },
          orderBy: { examDate: 'asc' },
        },
      },
    });

    if (!session) throw ApiError.notFound('No such examination session');

    const settled = await prisma.answerScript.groupBy({
      by: ['paperId'],
      where: { paperId: { in: session.papers.map((p) => p.id) }, finalMark: { not: null } },
      _count: { _all: true },
    });
    const settledByPaper = new Map(settled.map((s) => [s.paperId, s._count._all]));

    const flagged = await prisma.answerScript.groupBy({
      by: ['paperId'],
      where: { paperId: { in: session.papers.map((p) => p.id) }, flagged: true },
      _count: { _all: true },
    });
    const flaggedByPaper = new Map(flagged.map((f) => [f.paperId, f._count._all]));

    res.json({
      id: session.id,
      code: session.code,
      name: session.name,
      academicYear: session.academicYear,
      status: session.status,
      publishedAt: session.publishedAt,
      nextStatus: NEXT_STATUS[session.status] ?? [],
      dates: {
        formOpensOn: session.formOpensOn,
        formClosesOn: session.formClosesOn,
        lateClosesOn: session.lateClosesOn,
        examStartsOn: session.examStartsOn,
        examEndsOn: session.examEndsOn,
        resultTargetOn: session.resultTargetOn,
      },
      fees: { regular: session.regularFee, late: session.lateFee, backlog: session.backlogFee },
      papers: session.papers.map((p) => ({
        id: p.id,
        code: p.subject.code,
        name: p.subject.name,
        credits: p.subject.credits,
        semester: p.subject.semester,
        examDate: p.examDate,
        examTime: p.examTime,
        maxExternal: p.maxExternal,
        maxInternal: p.maxInternal,
        dispatchedAt: p.dispatchedAt,
        bundles: p._count.bundles,
        scripts: p._count.scripts,
        settled: settledByPaper.get(p.id) ?? 0,
        flagged: flaggedByPaper.get(p.id) ?? 0,
      })),
    });
  }),
);

// ─── POST /api/exam/sessions/:id/status ───────────────────────────────────────

/**
 * Moves the session on.
 *
 * Each step is gated on the work it depends on actually being done: a sitting
 * cannot start without papers, and evaluation cannot close while scripts are
 * still waiting on a moderator.
 */
sessionsRouter.post(
  '/sessions/:id/status',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      status: z.enum([
        'FORM_WINDOW_OPEN',
        'FORM_WINDOW_CLOSED',
        'IN_PROGRESS',
        'EVALUATION',
        'RESULT_PROCESSING',
        'RESULT_PUBLISHED',
      ]),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };

    const session = await prisma.examSession.findUnique({
      where: { id },
      include: { _count: { select: { papers: true, allocations: true, results: true } } },
    });
    if (!session) throw ApiError.notFound('No such examination session');

    const allowed = NEXT_STATUS[session.status] ?? [];
    if (!allowed.includes(status)) {
      throw ApiError.conflict(
        `A session at ${session.status.toLowerCase()} cannot move to ${status.toLowerCase()}`,
        { allowed },
      );
    }

    if (status === 'IN_PROGRESS') {
      if (session._count.papers === 0) {
        throw ApiError.badRequest('No papers have been scheduled for this session');
      }
      if (session._count.allocations === 0) {
        throw ApiError.badRequest('No candidates have been allocated a centre');
      }
    }

    if (status === 'RESULT_PROCESSING') {
      const unsettled = await prisma.answerScript.count({
        where: { paper: { sessionId: id }, finalMark: null },
      });
      if (unsettled > 0) {
        throw ApiError.badRequest(
          `${unsettled} script(s) still have no final mark. Moderate the flagged ones first.`,
          { unsettled },
        );
      }
    }

    if (status === 'RESULT_PUBLISHED' && session._count.results === 0) {
      throw ApiError.badRequest('No results have been processed for this session');
    }

    const now = new Date();

    // Publishing lifts the embargo on every result in the sitting at once,
    // which is the only moment students can see them.
    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'RESULT_PUBLISHED') {
        await tx.semesterResult.updateMany({
          where: { sessionId: id },
          data: { published: true, publishedAt: now },
        });

        const holders = await tx.semesterResult.findMany({
          where: { sessionId: id },
          select: { studentId: true, semester: true, sgpa: true, cgpa: true, outcome: true },
        });

        await tx.notification.createMany({
          data: holders.map((r) => ({
            studentId: r.studentId,
            kind: 'RESULT' as const,
            title: `Semester ${r.semester} result declared`,
            titleHi: `सेमेस्टर ${r.semester} का परिणाम घोषित`,
            body: `SGPA ${r.sgpa.toFixed(2)} · CGPA ${r.cgpa.toFixed(2)} · Result: ${r.outcome}`,
            href: '/results',
          })),
        });
      }

      return tx.examSession.update({
        where: { id },
        data: {
          status: status as 'EVALUATION',
          ...(status === 'RESULT_PUBLISHED' ? { publishedAt: now } : {}),
        },
      });
    });

    // Publishing a sitting's results is the single most consequential act in
    // the examination wing, so it goes on the record.
    await recordFor(req, {
      module: 'Examinations',
      action: status === 'RESULT_PUBLISHED' ? 'publish' : 'edit',
      target: updated.code,
      detail: `Session moved to ${status.toLowerCase().replace(/_/g, ' ')}`,
      outcome: status === 'RESULT_PUBLISHED' ? 'WARN' : 'OK',
    });

    res.json({
      id: updated.id,
      code: updated.code,
      status: updated.status,
      publishedAt: updated.publishedAt,
      nextStatus: NEXT_STATUS[updated.status] ?? [],
    });
  }),
);

// ─── POST /api/exam/sessions/:id/papers ───────────────────────────────────────

/** Schedules a subject's paper. */
sessionsRouter.post(
  '/sessions/:id/papers',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      subjectCode: z.string().min(1),
      examDate: z.string().date(),
      examTime: z.string().max(40).optional(),
      maxExternal: z.number().int().min(1).max(200).optional(),
      maxInternal: z.number().int().min(0).max(200).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      subjectCode: string;
      examDate: string;
      examTime?: string;
      maxExternal?: number;
      maxInternal?: number;
    };

    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) throw ApiError.notFound('No such examination session');
    requireStatus(session, ['PLANNED', 'FORM_WINDOW_OPEN', 'FORM_WINDOW_CLOSED'], 'scheduling a paper');

    const subject = await prisma.subject.findUnique({
      where: { code: body.subjectCode },
      select: { id: true, code: true, name: true },
    });
    if (!subject) throw ApiError.notFound(`No subject with code ${body.subjectCode}`);

    const clash = await prisma.examPaper.findUnique({
      where: { sessionId_subjectId: { sessionId: id, subjectId: subject.id } },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict(`${subject.code} already has a paper in this session`);

    const paper = await prisma.examPaper.create({
      data: {
        sessionId: id,
        subjectId: subject.id,
        examDate: new Date(`${body.examDate}T00:00:00.000Z`),
        examTime: body.examTime ?? '10:00–13:00',
        maxExternal: body.maxExternal ?? 70,
        maxInternal: body.maxInternal ?? 30,
      },
    });

    res.status(201).json({
      id: paper.id,
      code: subject.code,
      name: subject.name,
      examDate: paper.examDate,
      examTime: paper.examTime,
      maxExternal: paper.maxExternal,
      maxInternal: paper.maxInternal,
    });
  }),
);

// ─── POST /api/exam/papers/:id/dispatch ───────────────────────────────────────

/** Records question papers going out to centres under seal. */
sessionsRouter.post(
  '/papers/:id/dispatch',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };

    const paper = await prisma.examPaper.findUnique({
      where: { id },
      include: { session: true, subject: { select: { code: true } } },
    });
    if (!paper) throw ApiError.notFound('No such paper');
    if (paper.dispatchedAt) throw ApiError.conflict('That paper has already been dispatched');
    requireStatus(paper.session, ['FORM_WINDOW_CLOSED', 'IN_PROGRESS'], 'dispatching a paper');

    const updated = await prisma.examPaper.update({
      where: { id },
      data: { dispatchedAt: new Date() },
    });

    res.json({ id: updated.id, code: paper.subject.code, dispatchedAt: updated.dispatchedAt });
  }),
);
