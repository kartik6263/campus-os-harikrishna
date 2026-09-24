import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { resolveStaffId } from './shared.js';
import { attendanceFor } from '../faculty/shared.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';

export const examFormsRouter = Router();

/**
 * Works out where a form stands, from the rows that decide it.
 *
 * Attendance comes from the same sessions the lecturer marked and the student
 * sees, and the dues from the same ledger the counter writes to — scrutiny is
 * a reading of the record, never a second copy of it.
 */
async function scrutinise(formIds: string[]) {
  const forms = await prisma.examForm.findMany({
    where: { id: { in: formIds } },
    include: {
      student: { select: { id: true } },
      subjects: { include: { subject: { select: { id: true, code: true, name: true } } } },
    },
  });

  const studentIds = [...new Set(forms.map((f) => f.studentId))];
  const subjectIds = [...new Set(forms.flatMap((f) => f.subjects.map((s) => s.subjectId)))];

  const [attendance, feeItems] = await Promise.all([
    attendanceFor(studentIds, subjectIds),
    prisma.feeItem.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, amount: true, paid: true },
    }),
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
      }>;
    }
  >();

  for (const form of forms) {
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
        eligible: s.kind === 'BACKLOG' || percent >= ATTENDANCE_THRESHOLD,
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
        subjects: c.subjects,
      };
    });

    res.json({
      threshold: ATTENDANCE_THRESHOLD,
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
          : `${computed.shortfalls} subject(s) are below ${ATTENDANCE_THRESHOLD}%. Clearing anyway needs a written reason.`,
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
        href: '/exam-form',
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
