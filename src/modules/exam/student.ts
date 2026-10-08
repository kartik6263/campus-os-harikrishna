import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveStudentId } from '../../auth/middleware.js';
import { scrutinise } from '../office/examforms.js';
import { nextInSeries } from '../office/shared.js';
import { latestTerm } from '../faculty/shared.js';

/**
 * The student's own examination counter: the sitting now open, their
 * examination form and whether the record makes them eligible, their hall
 * ticket once seated, and their revaluation applications.
 *
 * Fees are not paid here. Submitting a form puts the examination fee (and the
 * late fee, after the regular window) on the student's fee account, where it
 * is paid like any other fee — online or at the counter.
 */
export const studentExamRouter = Router();

/** The sitting a student deals with now: the one taking forms, else the latest not yet finished. */
async function currentSession() {
  return (
    (await prisma.examSession.findFirst({ where: { status: 'FORM_WINDOW_OPEN' }, orderBy: { examStartsOn: 'asc' } })) ??
    (await prisma.examSession.findFirst({ where: { status: { not: 'RESULT_PUBLISHED' } }, orderBy: { examStartsOn: 'desc' } })) ??
    (await prisma.examSession.findFirst({ orderBy: { examStartsOn: 'desc' } }))
  );
}

/** The term the student is enrolled in now: their latest enrolments'. */
async function currentTerm(studentId: string) {
  const terms = await prisma.enrolment.findMany({ where: { studentId }, distinct: ['term'], select: { term: true } });
  return latestTerm(terms.map((t) => t.term));
}

const examFeeHead = (code: string) => `Examination fee — ${code}`;
const backlogFeeHead = (code: string) => `Backlog examination fee — ${code}`;

/**
 * Papers the student has failed and not since cleared: each published
 * failure with no later pass of the same subject, in a marksheet or a
 * backlog result.
 */
async function backlogsOf(studentId: string) {
  const [failed, passed, cleared] = await Promise.all([
    prisma.subjectResult.findMany({ where: { passed: false, result: { studentId, published: true } }, include: { subject: { select: { id: true, code: true, name: true } }, result: { select: { semester: true } } } }),
    prisma.subjectResult.findMany({ where: { passed: true, result: { studentId } }, select: { subjectId: true } }),
    prisma.backlogResult.findMany({ where: { studentId, passed: true }, select: { subjectId: true } }),
  ]);
  const done = new Set([...passed.map((p) => p.subjectId), ...cleared.map((c) => c.subjectId)]);
  const seen = new Set<string>();
  return failed.filter((f) => !done.has(f.subjectId) && !seen.has(f.subjectId) && seen.add(f.subjectId))
    .map((f) => ({ subjectId: f.subject.id, code: f.subject.code, name: f.subject.name, semester: f.result.semester }));
}

/** Debarred from this sitting by an unfair-means decision in the one before it. */
async function debarredFrom(studentId: string, session: { id: string; examStartsOn: Date }) {
  const prev = await prisma.examSession.findFirst({ where: { examStartsOn: { lt: session.examStartsOn } }, orderBy: { examStartsOn: 'desc' }, select: { id: true, code: true } });
  if (!prev) return null;
  const c = await prisma.malpracticeCase.findFirst({ where: { studentId, sessionId: prev.id, decision: 'DEBARRED' }, select: { caseNo: true } });
  return c ? { caseNo: c.caseNo, session: prev.code } : null;
}
const lateFeeHead = (code: string) => `Late examination fee — ${code}`;

// ─── GET /api/student/exam ────────────────────────────────────────────────────

studentExamRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const [student, session, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { semester: true, enrolmentNo: true, rollNo: true, name: true, programme: { select: { name: true, shortName: true } }, college: { select: { name: true } } } }),
      currentSession(),
      currentTerm(studentId),
    ]);
    if (!student) throw ApiError.notFound('No student record');

    const form = term
      ? await prisma.examForm.findUnique({
          where: { studentId_semester_term: { studentId, semester: student.semester, term } },
          include: { subjects: { include: { subject: { select: { id: true, code: true, name: true } } } }, scrutinisedBy: { select: { name: true } } },
        })
      : null;
    const check = form ? (await scrutinise([form.id])).get(form.id) ?? null : null;

    const now = Date.now();
    const window = session
      ? {
          open: session.status === 'FORM_WINDOW_OPEN' && now <= session.lateClosesOn.getTime() && now >= session.formOpensOn.getTime(),
          late: session.status === 'FORM_WINDOW_OPEN' && now > session.formClosesOn.getTime() && now <= session.lateClosesOn.getTime(),
        }
      : { open: false, late: false };

    const [fees, seat, enrolled, revaluations] = await Promise.all([
      session ? prisma.feeItem.findMany({ where: { studentId, head: { in: [examFeeHead(session.code), lateFeeHead(session.code), backlogFeeHead(session.code)] } }, select: { head: true, amount: true, paid: true } }) : Promise.resolve([]),
      session ? prisma.seatAllocation.findUnique({ where: { sessionId_studentId: { sessionId: session.id, studentId } }, include: { centre: true } }) : Promise.resolve(null),
      term ? prisma.enrolment.findMany({ where: { studentId, term }, include: { subject: { select: { id: true, code: true, name: true } } }, orderBy: { subject: { code: 'asc' } } }) : Promise.resolve([]),
      prisma.revaluationApplication.findMany({ where: { studentId }, include: { paper: { include: { subject: { select: { code: true, name: true } } } } }, orderBy: { appliedAt: 'desc' } }),
    ]);

    const backlogs = await backlogsOf(studentId);
    const debarred = session ? await debarredFrom(studentId, session) : null;
    const formSubjectIds = form?.subjects.map((s) => s.subjectId) ?? [];
    // The date sheet: the sitting's papers in the student's subjects, published before seating.
    const sheetIds = formSubjectIds.length ? formSubjectIds : [...enrolled.map((e) => e.subject.id), ...backlogs.map((b) => b.subjectId)];
    const dateSheet = session && sheetIds.length
      ? await prisma.examPaper.findMany({ where: { sessionId: session.id, subjectId: { in: sheetIds } }, include: { subject: { select: { code: true, name: true } } }, orderBy: { examDate: 'asc' } })
      : [];
    const papers = session && seat && formSubjectIds.length
      ? await prisma.examPaper.findMany({ where: { sessionId: session.id, subjectId: { in: formSubjectIds } }, include: { subject: { select: { code: true, name: true } } }, orderBy: { examDate: 'asc' } })
      : [];

    res.json({
      student: { name: student.name, enrolmentNo: student.enrolmentNo, rollNo: student.rollNo, semester: student.semester, programme: student.programme.name, college: student.college.name },
      session: session && {
        id: session.id, code: session.code, name: session.name, status: session.status,
        formOpensOn: session.formOpensOn, formClosesOn: session.formClosesOn, lateClosesOn: session.lateClosesOn,
        examStartsOn: session.examStartsOn, examEndsOn: session.examEndsOn,
        fees: { regular: session.regularFee, late: session.lateFee, backlog: session.backlogFee },
      },
      window,
      term,
      subjects: enrolled.map((e) => ({ code: e.subject.code, name: e.subject.name })),
      backlogs: backlogs.map((b) => ({ code: b.code, name: b.name, semester: b.semester })),
      debarred,
      dateSheet: dateSheet.map((p) => ({ code: p.subject.code, name: p.subject.name, date: p.examDate, time: p.examTime })),
      form: form && {
        id: form.id, formNo: form.formNo, submittedAt: form.submittedAt, eligibility: form.eligibility,
        computed: check?.computed ?? null, shortfalls: check?.shortfalls ?? 0, remarks: form.remarks,
        scrutinisedBy: form.scrutinisedBy?.name ?? null, scrutinisedAt: form.scrutinisedAt,
        subjects: check?.subjects ?? form.subjects.map((s) => ({ code: s.subject.code, name: s.subject.name, kind: s.kind, attendance: 0, present: 0, held: 0, eligible: true })),
      },
      fee: { charged: fees.reduce((n, f) => n + f.amount, 0), paid: fees.reduce((n, f) => n + f.paid, 0) },
      // Only cleared candidates are seated, so a seat is the hall ticket.
      hallTicket: seat && form
        ? {
            rollNo: student.rollNo, seatNo: seat.seatNo, centre: { code: seat.centre.code, name: seat.centre.name, city: seat.centre.city, district: seat.centre.district },
            papers: papers.map((p) => ({ code: p.subject.code, name: p.subject.name, date: p.examDate, time: p.examTime })),
          }
        : null,
      seated: Boolean(seat),
      revaluations: revaluations.map((r) => ({
        id: r.id, applicationNo: r.applicationNo, code: r.paper.subject.code, subject: r.paper.subject.name, appliedAt: r.appliedAt,
        fee: r.fee, feePaid: r.feePaid, status: r.status, originalMark: r.originalMark, revisedMark: r.revisedMark, changed: r.changed, remarks: r.remarks,
      })),
    });
  }),
);

// ─── POST /api/student/exam/form ──────────────────────────────────────────────

/**
 * Submits the examination form for the sitting taking forms, for every subject
 * the student is enrolled in this term. The fee goes on the fee account.
 */
studentExamRouter.post(
  '/form',
  validate('body', z.object({ declaration: z.literal(true, { message: 'Accept the declaration to submit' }) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const [student, session, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { semester: true, status: true } }),
      prisma.examSession.findFirst({ where: { status: 'FORM_WINDOW_OPEN' }, orderBy: { examStartsOn: 'asc' } }),
      currentTerm(studentId),
    ]);
    if (!student) throw ApiError.notFound('No student record');
    if (student.status !== 'ACTIVE') throw ApiError.conflict('Only students on the rolls can file an examination form — contact the registrar');
    if (!session) throw ApiError.conflict('No examination is taking forms right now');
    const now = Date.now();
    if (now < session.formOpensOn.getTime()) throw ApiError.conflict('The form window has not opened yet');
    if (now > session.lateClosesOn.getTime()) throw ApiError.conflict('The form window, including the late window, has closed');
    if (!term) throw ApiError.conflict('You are not enrolled in any subject this term');

    const existing = await prisma.examForm.findUnique({ where: { studentId_semester_term: { studentId, semester: student.semester, term } }, select: { formNo: true } });
    if (existing) throw ApiError.conflict(`You have already submitted form ${existing.formNo}`);

    const debarred = await debarredFrom(studentId, session);
    if (debarred) throw ApiError.forbidden(`You are debarred from this sitting by unfair-means case ${debarred.caseNo} (${debarred.session})`);

    const enrolled = await prisma.enrolment.findMany({ where: { studentId, term }, select: { subjectId: true } });
    if (!enrolled.length) throw ApiError.conflict('You are not enrolled in any subject this term');
    // Every uncleared paper of an earlier semester is re-sat with this one, for the backlog fee each.
    const backlogs = (await backlogsOf(studentId)).filter((b) => !enrolled.some((e) => e.subjectId === b.subjectId));

    const late = now > session.formClosesOn.getTime();
    const prefix = `EF/${new Date().getFullYear()}/`;
    const all = await prisma.examForm.findMany({ where: { formNo: { startsWith: prefix } }, select: { formNo: true } });
    const formNo = nextInSeries(prefix, all.map((f) => f.formNo), 5);
    const dueDate = session.lateClosesOn;

    const form = await prisma.$transaction(async (tx) => {
      const created = await tx.examForm.create({
        data: { formNo, studentId, semester: student.semester, term, subjects: { create: [...enrolled.map((e) => ({ subjectId: e.subjectId, kind: 'REGULAR' as const })), ...backlogs.map((b) => ({ subjectId: b.subjectId, kind: 'BACKLOG' as const }))] } },
      });
      await tx.feeItem.createMany({
        data: [
          { studentId, head: examFeeHead(session.code), category: 'EXAM' as const, amount: session.regularFee, term, dueDate },
          ...(late ? [{ studentId, head: lateFeeHead(session.code), category: 'EXAM' as const, amount: session.lateFee, term, dueDate }] : []),
          ...(backlogs.length ? [{ studentId, head: backlogFeeHead(session.code), category: 'EXAM' as const, amount: session.backlogFee * backlogs.length, term, dueDate }] : []),
        ],
      });
      return created;
    });

    res.status(201).json({ id: form.id, formNo: form.formNo, fee: session.regularFee + (late ? session.lateFee : 0) + session.backlogFee * backlogs.length, late, backlogs: backlogs.length });
  }),
);
