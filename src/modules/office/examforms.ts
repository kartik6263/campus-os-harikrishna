import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveStaffId } from './shared.js';
import { attendanceFor } from '../faculty/shared.js';
import { currentPolicy } from '../attendance/policy.js';

export const examFormsRouter = Router();

/**
 * Works out where a form stands, from the rows that decide it.
 *
 * Attendance comes from the same sessions the lecturer marked and the student
 * sees, and the dues from the same ledger the counter writes to — scrutiny is
 * a reading of the record, never a second copy of it.
 */
export async function scrutinise(formIds: string[]) {
  const forms = await prisma.examForm.findMany({
    where: { id: { in: formIds } },
    include: {
      student: { select: { id: true } },
      subjects: { include: { subject: { select: { id: true, code: true, name: true } } } },
    },
  });

  const studentIds = [...new Set(forms.map((f) => f.studentId))];
  const subjectIds = [...new Set(forms.flatMap((f) => f.subjects.map((s) => s.subjectId)))];

  const [attendance, feeItems, condonations] = await Promise.all([
    attendanceFor(studentIds, subjectIds),
    prisma.feeItem.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, amount: true, paid: true },
    }),
    prisma.attendanceCondonation.findMany({ where: { studentId: { in: studentIds }, status: 'APPROVED' }, select: { studentId: true, term: true } }),
  ]);

  const dueByStudent = new Map<string, number>();
  for (const f of feeItems) {
    dueByStudent.set(f.studentId, (dueByStudent.get(f.studentId) ?? 0) + (f.amount - f.paid));
  }

  const out = new Map<
    string,
    {
      due: number;
      shortfalls: number;
      computed: 'ELIGIBLE' | 'SHORTAGE' | 'FEE_DUE';
      subjects: Array<{
        code: string;
        name: string;
        kind: string;
        attendance: number;
        present: number;
        held: number;
        eligible: boolean;
        condoned: boolean;
      }>;
    }
  >();

  const { threshold, condonationFloor } = currentPolicy();
  for (const form of forms) {
    // An approved condonation for this term lets a shortage down to the floor through.
    const condoned = condonations.some((c) => c.studentId === form.studentId && c.term === form.term);
    const subjects = form.subjects.map((s) => {
      const cell = attendance.get(`${form.studentId}:${s.subjectId}`);
      const percent = cell?.percent ?? 0;
      return {
        code: s.subject.code,
        name: s.subject.name,
        kind: s.kind,
        attendance: percent,
        present: cell?.present ?? 0,
        held: cell?.total ?? 0,
        // A backlog paper is re-sat, so this term's attendance does not gate it.
        eligible: s.kind === 'BACKLOG' || percent >= threshold || (condoned && percent >= condonationFloor),
        condoned: s.kind !== 'BACKLOG' && percent < threshold && condoned && percent >= condonationFloor,
      };
    });

    const due = dueByStudent.get(form.studentId) ?? 0;
    const shortfalls = subjects.filter((s) => !s.eligible).length;

    // Money first: a clerk cannot clear a form the accounts office still holds.
    const computed = due > 0 ? 'FEE_DUE' : shortfalls > 0 ? 'SHORTAGE' : 'ELIGIBLE';

    out.set(form.id, { due, shortfalls, computed, subjects });
  }

  return out;
}

const INCLUDE = {
  student: {
    select: {
      id: true,
      enrolmentNo: true,
      rollNo: true,
      name: true,
      semester: true,
      programme: { select: { shortName: true } },
    },
  },
  subjects: { include: { subject: { select: { code: true, name: true } } } },
  scrutinisedBy: { select: { name: true } },
  waiver: { select: { requestNo: true, status: true, decisionNote: true } },
};

// ─── GET /api/office/exam-forms ───────────────────────────────────────────────

examFormsRouter.get(
  '/exam-forms',
  validate(
    'query',
    z.object({
      eligibility: z.enum(['PENDING', 'ELIGIBLE', 'SHORTAGE', 'FEE_DUE', 'CLEARED']).optional(),
      semester: z.coerce.number().int().min(1).max(12).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const eligibility = typeof req.query.eligibility === 'string' ? req.query.eligibility : undefined;
    const semester = typeof req.query.semester === 'string' ? Number(req.query.semester) : undefined;

    const forms = await prisma.examForm.findMany({
      where: {
        ...(eligibility ? { eligibility: eligibility as 'PENDING' } : {}),
        ...(semester ? { semester } : {}),
      },
      include: INCLUDE,
      orderBy: { submittedAt: 'asc' },
    });

    const computed = await scrutinise(forms.map((f) => f.id));

    const rows = forms.map((f) => {
      const c = computed.get(f.id)!;
      return {
        id: f.id,
        formNo: f.formNo,
        studentId: f.student.id,
        studentName: f.student.name,
        enrolmentNo: f.student.enrolmentNo,
        rollNo: f.student.rollNo,
        programme: f.student.programme.shortName,
        semester: f.semester,
        submittedOn: f.submittedAt,
        // What the record says now, and what the clerk last decided.
        eligibility: f.eligibility,
        computedEligibility: c.computed,
        // A decision taken before the numbers moved is worth flagging.
        stale: f.eligibility !== 'PENDING' && f.eligibility !== c.computed,
        feeDue: c.due,
        shortfalls: c.shortfalls,
        remarks: f.remarks,
        scrutinisedBy: f.scrutinisedBy?.name ?? null,
        scrutinisedAt: f.scrutinisedAt,
        waiver: f.waiver ? { requestNo: f.waiver.requestNo, status: f.waiver.status, note: f.waiver.decisionNote } : null,
        subjects: c.subjects,
      };
    });

    res.json({
      threshold: currentPolicy().threshold,
      totals: {
        total: rows.length,
        eligible: rows.filter((r) => r.computedEligibility === 'ELIGIBLE').length,
        shortage: rows.filter((r) => r.computedEligibility === 'SHORTAGE').length,
        feeDue: rows.filter((r) => r.computedEligibility === 'FEE_DUE').length,
        stale: rows.filter((r) => r.stale).length,
      },
      forms: rows,
    });
  }),
);

// ─── POST /api/office/exam-forms/:id/decide ───────────────────────────────────

/**
 * Records the scrutiny decision.
 *
 * Clearing a form the record says is short is allowed — a medical exemption is
 * a real thing — but it demands a written remark, so the exception is on file
 * rather than inferred later from a number that no longer matches.
 */
examFormsRouter.post(
  '/exam-forms/:id/decide',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      decision: z.enum(['CLEAR', 'HOLD']),
      remarks: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { decision, remarks } = req.body as { decision: 'CLEAR' | 'HOLD'; remarks?: string };

    const form = await prisma.examForm.findUnique({ where: { id } });
    if (!form) throw ApiError.notFound('No such examination form');

    const computed = (await scrutinise([id])).get(id)!;

    if (decision === 'CLEAR' && computed.computed !== 'ELIGIBLE' && !remarks) {
      throw ApiError.badRequest(
        computed.computed === 'FEE_DUE'
          ? `This student owes ₹${computed.due}. Clearing anyway needs a written reason.`
          : `${computed.shortfalls} subject(s) are below ${currentPolicy().threshold}%. Clearing anyway needs a written reason.`,
        { computed: computed.computed, feeDue: computed.due, shortfalls: computed.shortfalls },
      );
    }

    const updated = await prisma.examForm.update({
      where: { id },
      data: {
        eligibility: decision === 'CLEAR' ? 'CLEARED' : computed.computed,
        remarks: remarks ?? null,
        scrutinisedById: staffId,
        scrutinisedAt: new Date(),
      },
      include: INCLUDE,
    });

    await prisma.notification.create({
      data: {
        studentId: form.studentId,
        kind: 'EXAM',
        title:
          decision === 'CLEAR'
            ? 'Examination form cleared'
            : 'Examination form held at scrutiny',
        body:
          decision === 'CLEAR'
            ? `Form ${form.formNo} has been cleared for Semester ${form.semester}.`
            : (remarks ?? 'Your examination form needs attention. Contact the college office.'),
        urgent: decision !== 'CLEAR',
        href: '/(tabs)/more',
      },
    });

    res.json({
      id: updated.id,
      formNo: updated.formNo,
      eligibility: updated.eligibility,
      remarks: updated.remarks,
      scrutinisedAt: updated.scrutinisedAt,
      computedEligibility: computed.computed,
    });
  }),
);

// ─── POST /api/office/exam-forms/:id/refer ────────────────────────────────────

/**
 * Refers a form the clerk cannot clear — an ex-student, a long medical absence —
 * to the Principal as an eligibility waiver. It lands in the Principal's
 * approval inbox; approving it there clears the form.
 */
examFormsRouter.post(
  '/exam-forms/:id/refer',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ reason: z.string().trim().min(10).max(2000) })),
  asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };

    const form = await prisma.examForm.findUnique({
      where: { id },
      include: { student: { select: { name: true, rollNo: true, collegeId: true } }, waiver: true },
    });
    if (!form) throw ApiError.notFound('No such examination form');
    if (form.eligibility === 'CLEARED') throw ApiError.conflict('This form is already cleared');
    if (form.waiver?.status === 'PENDING') throw ApiError.conflict(`Already with the Principal as ${form.waiver.requestNo}`);

    const computed = (await scrutinise([id])).get(id)!;
    const year = new Date().getFullYear();
    const prefix = `GR/${year}/`;
    const existing = await prisma.governanceRequest.findMany({ where: { requestNo: { startsWith: prefix } }, select: { requestNo: true } });
    const highest = existing.reduce((max, r) => { const t = Number(r.requestNo.slice(prefix.length)); return Number.isFinite(t) && t > max ? t : max; }, 0);
    const why = computed.computed === 'FEE_DUE' ? `₹${computed.due} outstanding` : computed.computed === 'SHORTAGE' ? `attendance short in ${computed.shortfalls} subject(s)` : 'eligible on the record';

    // A refused waiver can be referred again with a fuller reason; the old link is released.
    if (form.waiver) await prisma.governanceRequest.update({ where: { id: form.waiver.id }, data: { examFormId: null } });
    const created = await prisma.governanceRequest.create({
      data: {
        requestNo: `${prefix}${String(highest + 1).padStart(4, '0')}`,
        kind: 'EXAM_WAIVER',
        subject: `Exam eligibility waiver — ${form.student.name} (${form.student.rollNo}), form ${form.formNo}`,
        details: `Record: ${why}. Office's reason: ${reason}`,
        priority: 'HIGH',
        slaDeadline: new Date(Date.now() + 3 * 86_400_000),
        collegeId: form.student.collegeId,
        raisedByStaffId: staffId,
        examFormId: form.id,
      },
    });

    await prisma.examForm.update({ where: { id }, data: { remarks: `Referred to the Principal (${created.requestNo}): ${reason}`.slice(0, 500), scrutinisedById: staffId, scrutinisedAt: new Date() } });
    res.status(201).json({ requestNo: created.requestNo, status: created.status });
  }),
);
