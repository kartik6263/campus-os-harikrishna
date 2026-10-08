import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { recordFor } from '../itconsole/audit.js';
import { nextInSeries, requireStatus, resolveExamStaffId, toleranceFor } from './shared.js';

/**
 * Conducting and evaluating a sitting: the examiner panel, the bundles in
 * evaluation, who was absent from each paper, and unfair-means cases.
 */
export const conductRouter = Router();

// ─── Examiner panel ───────────────────────────────────────────────────────────

const examinerBody = z.object({
  name: z.string().trim().min(3).max(120),
  designation: z.string().trim().min(2).max(80),
  institution: z.string().trim().min(2).max(160),
  subjects: z.string().trim().max(300).default(''),
  mobile: z.string().trim().regex(/^[0-9+\- ]{8,16}$/, 'A phone number, digits only').optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
});

conductRouter.get('/examiners', asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const rows = await prisma.examiner.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { bundles: { select: { status: true } } } });
  res.json(rows.map(({ bundles, ...e }) => ({ ...e, bundles: bundles.length, pending: bundles.filter((b) => b.status === 'UNDER_EVALUATION' || b.status === 'UNASSIGNED').length })));
}));

conductRouter.post('/examiners', validate('body', examinerBody), asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const b = req.body as z.infer<typeof examinerBody>;
  const e = await prisma.examiner.create({ data: { ...b, mobile: b.mobile || null, email: b.email || null } });
  await recordFor(req, { module: 'Examination', action: 'examiner added', target: e.name, detail: e.institution });
  res.status(201).json(e);
}));

conductRouter.patch('/examiners/:id', validate('body', examinerBody.partial().extend({ active: z.boolean().optional() })), asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const e = await prisma.examiner.findUnique({ where: { id: String(req.params.id) } });
  if (!e) throw ApiError.notFound('No such examiner');
  const b = req.body as Partial<z.infer<typeof examinerBody>> & { active?: boolean };
  const u = await prisma.examiner.update({ where: { id: e.id }, data: { ...b, ...(b.mobile !== undefined ? { mobile: b.mobile || null } : {}), ...(b.email !== undefined ? { email: b.email || null } : {}) } });
  res.json(u);
}));

// ─── Bundles in evaluation ────────────────────────────────────────────────────

/** Every bundle of a sitting, with how far its examiner has got. */
conductRouter.get('/sessions/:id/bundles', asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const bundles = await prisma.answerBundle.findMany({
    where: { paper: { sessionId: String(req.params.id) } },
    include: {
      paper: { include: { subject: { select: { code: true, name: true } } } },
      centre: { select: { code: true, name: true } },
      scripts: { select: { e1: true, e2: true, moderatorMark: true, flagged: true, absent: true } },
    },
    orderBy: { bundleNo: 'asc' },
  });
  res.json(bundles.map((b) => {
    const col = b.examinerRole === 'E1' ? 'e1' : b.examinerRole === 'E2' ? 'e2' : 'moderatorMark';
    return {
      id: b.id, bundleNo: b.bundleNo, status: b.status, examinerName: b.examinerName, examinerRole: b.examinerRole, examinerId: b.examinerId,
      assignedAt: b.assignedAt, submittedAt: b.submittedAt,
      paper: { id: b.paperId, code: b.paper.subject.code, name: b.paper.subject.name, maxExternal: b.paper.maxExternal },
      centre: b.centre,
      scripts: b.scripts.length,
      marked: b.scripts.filter((s) => s.absent || s[col] !== null).length,
      flagged: b.scripts.filter((s) => s.flagged).length,
      tolerance: toleranceFor(b.paper.maxExternal),
    };
  }));
}));

// ─── Who sat each paper ───────────────────────────────────────────────────────

/** Candidates for a paper: everyone seated whose cleared form carries the subject. */
export async function candidates(paper: { id: string; sessionId: string; subjectId: string }) {
  const seats = await prisma.seatAllocation.findMany({ where: { sessionId: paper.sessionId }, include: { student: { select: { id: true, name: true, rollNo: true, enrolmentNo: true } }, centre: { select: { code: true } } }, orderBy: { seatNo: 'asc' } });
  const ids = seats.map((s) => s.studentId);
  const [forms, enrolled] = await Promise.all([
    prisma.examFormSubject.findMany({ where: { subjectId: paper.subjectId, form: { studentId: { in: ids }, eligibility: 'CLEARED' } }, select: { kind: true, form: { select: { studentId: true } } } }),
    prisma.enrolment.findMany({ where: { subjectId: paper.subjectId, studentId: { in: ids } }, select: { studentId: true } }),
  ]);
  const kind = new Map(forms.map((f) => [f.form.studentId, f.kind]));
  const takers = new Set([...forms.map((f) => f.form.studentId), ...enrolled.map((e) => e.studentId)]);
  return seats.filter((s) => takers.has(s.studentId)).map((s) => ({ ...s, kind: kind.get(s.studentId) ?? 'REGULAR' }));
}

conductRouter.get('/papers/:id/attendance', asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const paper = await prisma.examPaper.findUnique({ where: { id: String(req.params.id) }, include: { subject: { select: { code: true, name: true } }, session: { select: { code: true, status: true } } } });
  if (!paper) throw ApiError.notFound('No such paper');
  const [list, scripts, cases] = await Promise.all([
    candidates(paper),
    prisma.answerScript.findMany({ where: { paperId: paper.id }, select: { studentId: true, absent: true, e1: true, e2: true, moderatorMark: true } }),
    prisma.malpracticeCase.findMany({ where: { paperId: paper.id }, select: { studentId: true, caseNo: true, status: true, decision: true } }),
  ]);
  const byStudent = new Map(scripts.map((s) => [s.studentId, s]));
  res.json({
    paper: { id: paper.id, code: paper.subject.code, name: paper.subject.name, examDate: paper.examDate, examTime: paper.examTime, session: paper.session },
    candidates: list.map((c) => {
      const s = byStudent.get(c.studentId);
      return {
        studentId: c.studentId, name: c.student.name, rollNo: c.student.rollNo, enrolmentNo: c.student.enrolmentNo, seatNo: c.seatNo, centre: c.centre.code, kind: c.kind,
        absent: s?.absent ?? false, marked: !!s && (s.e1 !== null || s.e2 !== null || s.moderatorMark !== null),
        ufm: cases.find((x) => x.studentId === c.studentId) ?? null,
      };
    }),
  });
}));

/**
 * Records who was absent from a paper, from the invigilator's sheet. An
 * absent candidate's script is settled at zero; a script already marked by
 * an examiner cannot be turned absent.
 */
conductRouter.post(
  '/papers/:id/attendance',
  validate('body', z.object({ absent: z.array(z.string().min(1)).max(5000) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const paper = await prisma.examPaper.findUnique({ where: { id: String(req.params.id) }, include: { session: true, subject: { select: { code: true } } } });
    if (!paper) throw ApiError.notFound('No such paper');
    requireStatus(paper.session, ['IN_PROGRESS', 'EVALUATION'], 'recording attendance');
    const list = await candidates(paper);
    const ids = new Set(list.map((c) => c.studentId));
    const absent = new Set(req.body.absent as string[]);
    const strangers = [...absent].filter((a) => !ids.has(a));
    if (strangers.length) throw ApiError.badRequest('Some of those are not candidates for this paper', { studentIds: strangers });
    const scripts = await prisma.answerScript.findMany({ where: { paperId: paper.id } });
    const marked = scripts.filter((s) => absent.has(s.studentId) && !s.absent && (s.e1 !== null || s.e2 !== null || s.moderatorMark !== null));
    if (marked.length) throw ApiError.conflict(`${marked.length} of them already have marks from an examiner; they cannot be absent`);
    await prisma.$transaction(async (tx) => {
      for (const c of list) {
        const isAbsent = absent.has(c.studentId);
        const existing = scripts.find((s) => s.studentId === c.studentId);
        if (!existing && !isAbsent) continue;
        if (existing && existing.absent === isAbsent) continue;
        await tx.answerScript.upsert({
          where: { paperId_studentId: { paperId: paper.id, studentId: c.studentId } },
          create: { paperId: paper.id, studentId: c.studentId, absent: true, finalMark: 0 },
          update: isAbsent ? { absent: true, finalMark: 0, flagged: false, flagReason: null } : { absent: false, finalMark: null },
        });
      }
    });
    await recordFor(req, { module: 'Examination', action: 'hall attendance', target: `${paper.session.code} ${paper.subject.code}`, detail: `${absent.size} absent of ${list.length}` });
    res.json({ candidates: list.length, absent: absent.size, present: list.length - absent.size });
  }),
);

// ─── Unfair means ─────────────────────────────────────────────────────────────

conductRouter.get('/sessions/:id/malpractice', asyncHandler(async (req, res) => {
  await resolveExamStaffId(req);
  const rows = await prisma.malpracticeCase.findMany({
    where: { sessionId: String(req.params.id) },
    include: { student: { select: { name: true, rollNo: true, enrolmentNo: true } }, paper: { include: { subject: { select: { code: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const files = await prisma.storedFile.findMany({ where: { id: { in: rows.flatMap((r) => (r.evidenceFileId ? [r.evidenceFileId] : [])) } }, select: { id: true, name: true } });
  res.json(rows.map((r) => ({
    id: r.id, caseNo: r.caseNo, status: r.status, decision: r.decision, decisionNote: r.decisionNote, decidedBy: r.decidedBy, decidedAt: r.decidedAt,
    description: r.description, reportedBy: r.reportedBy, createdAt: r.createdAt,
    student: r.student, paper: { id: r.paperId, code: r.paper.subject.code, name: r.paper.subject.name },
    evidence: files.find((f) => f.id === r.evidenceFileId) ?? null,
  })));
}));

conductRouter.post(
  '/papers/:id/malpractice',
  validate('body', z.object({ studentId: z.string().min(1), description: z.string().trim().min(15).max(1000), reportedBy: z.string().trim().min(3).max(120), evidenceFileId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const b = req.body as { studentId: string; description: string; reportedBy: string; evidenceFileId?: string };
    const paper = await prisma.examPaper.findUnique({ where: { id: String(req.params.id) }, include: { session: true, subject: { select: { code: true } } } });
    if (!paper) throw ApiError.notFound('No such paper');
    requireStatus(paper.session, ['IN_PROGRESS', 'EVALUATION'], 'reporting unfair means');
    if (!(await candidates(paper)).some((c) => c.studentId === b.studentId)) throw ApiError.badRequest('That student is not a candidate for this paper');
    if (await prisma.malpracticeCase.findUnique({ where: { paperId_studentId: { paperId: paper.id, studentId: b.studentId } }, select: { id: true } })) throw ApiError.conflict('A case is already on file for this candidate in this paper');
    const prefix = `UFM/${paper.session.code}/`;
    const all = await prisma.malpracticeCase.findMany({ where: { caseNo: { startsWith: prefix } }, select: { caseNo: true } });
    const c = await prisma.malpracticeCase.create({ data: { caseNo: nextInSeries(prefix, all.map((x) => x.caseNo)), sessionId: paper.sessionId, paperId: paper.id, studentId: b.studentId, description: b.description, reportedBy: b.reportedBy, evidenceFileId: b.evidenceFileId ?? null } });
    await prisma.notification.create({ data: { studentId: b.studentId, kind: 'RESULT', urgent: true, title: `Unfair-means case ${c.caseNo}`, body: `A case has been reported against you in ${paper.subject.code}. Your result in it is withheld until the committee decides.`, href: '/examination' } });
    await recordFor(req, { module: 'Examination', action: 'unfair means reported', target: c.caseNo, detail: `${paper.subject.code}: ${b.description.slice(0, 120)}`, outcome: 'WARN' });
    res.status(201).json(c);
  }),
);

const DECISION_TEXT: Record<string, string> = {
  WARNING: 'a warning; your paper is evaluated as usual',
  PAPER_CANCELLED: 'the paper is cancelled; you are declared failed in it',
  SESSION_CANCELLED: 'every paper of this sitting is cancelled',
  DEBARRED: 'every paper of this sitting is cancelled and you are debarred from the next sitting',
};

conductRouter.post(
  '/malpractice/:id/decide',
  validate('body', z.object({ decision: z.enum(['WARNING', 'PAPER_CANCELLED', 'SESSION_CANCELLED', 'DEBARRED']), note: z.string().trim().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { decision, note } = req.body as { decision: 'WARNING'; note: string };
    const c = await prisma.malpracticeCase.findUnique({ where: { id: String(req.params.id) }, include: { paper: { include: { session: true, subject: { select: { code: true } } } } } });
    if (!c) throw ApiError.notFound('No such case');
    if (c.status === 'DECIDED') throw ApiError.conflict('This case is already decided');
    if (c.paper.session.status === 'RESULT_PUBLISHED') throw ApiError.conflict('Results of this sitting are published; the case can no longer change them');
    const u = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { email: true, office: { select: { name: true } } } });
    await prisma.malpracticeCase.update({ where: { id: c.id }, data: { status: 'DECIDED', decision, decisionNote: note, decidedBy: u?.office?.name ?? u?.email ?? 'Examination committee', decidedAt: new Date() } });
    await prisma.notification.create({ data: { studentId: c.studentId, kind: 'RESULT', urgent: decision !== 'WARNING', title: `Unfair-means case ${c.caseNo} decided`, body: `The committee has decided ${DECISION_TEXT[decision]}. ${note}`, href: '/examination' } });
    await recordFor(req, { module: 'Examination', action: 'unfair means decided', target: c.caseNo, detail: `${decision}: ${note}`, outcome: 'WARN' });
    res.json({ status: 'DECIDED', decision });
  }),
);

/** Undecided cases of a sitting — results cannot be processed while any are open. */
export async function openCases(sessionId: string) {
  return prisma.malpracticeCase.count({ where: { sessionId, status: 'REPORTED' } });
}

