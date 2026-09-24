import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { requirePermission } from '../itconsole/permissions.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';
import { overallAttendance } from '../faculty/shared.js';

/**
 * Phase 5 — governance.
 *
 * Most of this is an aggregation of the four phases below it rather than a
 * store of its own: the dashboard and the approval inbox are computed on read,
 * so a figure the principal sees is the figure the record holds. Only the
 * compliance file and the requests that are neither leave nor marks are
 * tables here.
 */
export const governanceRouter = Router();

governanceRouter.use(requireAuth);
governanceRouter.use(requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'));
governanceRouter.use(requirePermission('Governance'));

/** Which faculty record the principal signs as. */
async function resolveSignatoryId(req: Request): Promise<string> {
  const auth = req.auth!;
  const faculty = await prisma.faculty.findUnique({
    where: { userId: auth.sub },
    select: { id: true },
  });
  if (faculty) return faculty.id;

  if (auth.role !== 'ADMIN') throw ApiError.forbidden('This account has no faculty record to sign as');

  const requested = typeof req.query.facultyId === 'string' ? req.query.facultyId : undefined;
  if (!requested) throw ApiError.badRequest('facultyId is required for administrator accounts');

  const exists = await prisma.faculty.findUnique({ where: { id: requested }, select: { id: true } });
  if (!exists) throw ApiError.notFound('No such faculty record');
  return exists.id;
}

/** The college the caller governs. */
async function resolveCollegeId(req: Request): Promise<string> {
  const auth = req.auth!;
  const faculty = await prisma.faculty.findUnique({
    where: { userId: auth.sub },
    select: { collegeId: true },
  });
  if (faculty) return faculty.collegeId;

  const staff = await prisma.officeStaff.findUnique({
    where: { userId: auth.sub },
    select: { collegeId: true },
  });
  if (staff) return staff.collegeId;

  const first = await prisma.college.findFirst({ select: { id: true } });
  if (!first) throw ApiError.notFound('No college on record');
  return first.id;
}

// ─── GET /api/governance/dashboard ────────────────────────────────────────────

/**
 * The college at a glance.
 *
 * Every figure is counted from the rows the other phases own — attendance
 * from marked sessions, money from the one fee ledger, results from published
 * sittings. Nothing here is a stored total that could drift.
 */
governanceRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);

    const [college, students, faculty, programmes] = await Promise.all([
      prisma.college.findUniqueOrThrow({
        where: { id: collegeId },
        select: { code: true, name: true, district: true },
      }),
      prisma.student.findMany({ where: { collegeId }, select: { id: true } }),
      prisma.faculty.count({ where: { collegeId } }),
      prisma.programme.count({ where: { collegeId } }),
    ]);

    const studentIds = students.map((s) => s.id);

    const [feeItems, examForms, results, attendance] = await Promise.all([
      prisma.feeItem.findMany({
        where: { studentId: { in: studentIds } },
        select: { amount: true, paid: true },
      }),
      prisma.examForm.groupBy({
        by: ['eligibility'],
        where: { studentId: { in: studentIds } },
        _count: { _all: true },
      }),
      prisma.semesterResult.findMany({
        where: { studentId: { in: studentIds }, published: true },
        select: { outcome: true, sgpa: true, division: true, semester: true, studentId: true },
        orderBy: { semester: 'desc' },
      }),
      overallAttendance(studentIds),
    ]);

    const charged = feeItems.reduce((sum, f) => sum + f.amount, 0);
    const collected = feeItems.reduce((sum, f) => sum + f.paid, 0);

    const percentages = studentIds
      .map((id) => attendance.get(id)?.percent ?? 0)
      .filter((p) => p > 0);
    const averageAttendance =
      percentages.length === 0
        ? 0
        : Number((percentages.reduce((a, b) => a + b, 0) / percentages.length).toFixed(1));
    const atRisk = percentages.filter((p) => p < ATTENDANCE_THRESHOLD).length;

    // The most recent published result per student, so a pass rate is not
    // inflated by counting every semester a student has ever cleared.
    const latestByStudent = new Map<string, (typeof results)[number]>();
    for (const r of results) if (!latestByStudent.has(r.studentId)) latestByStudent.set(r.studentId, r);
    const latest = [...latestByStudent.values()];

    const formsTotal = examForms.reduce((sum, e) => sum + e._count._all, 0);
    const formsCleared = examForms.find((e) => e.eligibility === 'CLEARED')?._count._all ?? 0;

    const compliance = await prisma.complianceItem.groupBy({
      by: ['status'],
      where: { collegeId },
      _count: { _all: true },
    });
    const compliant = compliance.find((c) => c.status === 'COMPLIANT')?._count._all ?? 0;
    const complianceTotal = compliance.reduce((sum, c) => sum + c._count._all, 0);
    const nonCompliant = compliance.find((c) => c.status === 'NON_COMPLIANT')?._count._all ?? 0;

    res.json({
      college,
      totalStudents: students.length,
      totalFaculty: faculty,
      programmes,
      averageAttendance,
      atRiskStudents: atRisk,
      attendanceThreshold: ATTENDANCE_THRESHOLD,
      fees: {
        charged,
        collected,
        pending: charged - collected,
        collectedPercent: charged === 0 ? 0 : Number(((collected / charged) * 100).toFixed(1)),
      },
      examForms: { total: formsTotal, cleared: formsCleared },
      results: {
        declared: latest.length,
        passPercent:
          latest.length === 0
            ? 0
            : Number(
                ((latest.filter((r) => r.outcome === 'PASS').length / latest.length) * 100).toFixed(1),
              ),
        distinctions: latest.filter((r) => r.division === 'Distinction').length,
        firstClass: latest.filter((r) => r.division === 'First Class').length,
      },
      compliance: {
        total: complianceTotal,
        compliant,
        nonCompliant,
        status:
          complianceTotal === 0
            ? 'unknown'
            : nonCompliant > 0
              ? 'at_risk'
              : compliant === complianceTotal
                ? 'compliant'
                : 'partial',
      },
    });
  }),
);

// ─── GET /api/governance/workload ─────────────────────────────────────────────

/** Length of a slot in hours, the same reading the faculty timetable uses. */
function slotHours(start: string, end: string): number {
  const mins = (t: string) => {
    const [h = 0, m = 0] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let span = mins(end) - mins(start);
  if (span <= 0) span += 12 * 60;
  return span / 60;
}

/**
 * Teaching load across the department, against what each post is sanctioned.
 *
 * Counted from the timetable, so a load cannot be reported as balanced while
 * the grid says otherwise.
 */
governanceRouter.get(
  '/workload',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const term = typeof req.query.term === 'string' ? req.query.term : '2024-25-ODD';

    const staff = await prisma.faculty.findMany({
      where: { collegeId },
      include: {
        timetableSlots: {
          where: { term, cancelled: false },
          select: { startTime: true, endTime: true, subjectId: true },
        },
        _count: { select: { assignments: true, mentorships: true } },
      },
      orderBy: { name: 'asc' },
    });

    const rows = staff.map((f) => {
      const hours = f.timetableSlots.reduce((sum, s) => sum + slotHours(s.startTime, s.endTime), 0);
      const load = Number(hours.toFixed(1));
      return {
        id: f.id,
        employeeId: f.employeeId,
        name: f.name,
        designation: f.designation,
        department: f.department,
        isHod: f.isHod,
        sanctioned: f.maxWeeklyLoad,
        allotted: load,
        // Under half the sanctioned load is as much a problem as over it.
        utilisation: f.maxWeeklyLoad === 0 ? 0 : Number(((load / f.maxWeeklyLoad) * 100).toFixed(1)),
        over: load > f.maxWeeklyLoad,
        under: load < f.maxWeeklyLoad / 2,
        subjects: f._count.assignments,
        mentees: f._count.mentorships,
      };
    });

    res.json({
      term,
      totals: {
        staff: rows.length,
        sanctioned: rows.reduce((sum, r) => sum + r.sanctioned, 0),
        allotted: Number(rows.reduce((sum, r) => sum + r.allotted, 0).toFixed(1)),
        over: rows.filter((r) => r.over).length,
        under: rows.filter((r) => r.under).length,
      },
      faculty: rows,
    });
  }),
);

// ─── GET /api/governance/approvals ────────────────────────────────────────────

/**
 * One inbox over everything waiting on the principal.
 *
 * Leave applications and marks sheets stay where they live, in the faculty
 * domain — this gathers them on read rather than copying them, so deciding one
 * here is the same act as deciding it there, not a second record of it.
 */
governanceRouter.get(
  '/approvals',
  validate('query', z.object({ status: z.enum(['pending', 'decided']).optional() })),
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);
    const pendingOnly = req.query.status !== 'decided';

    const [leaves, sheets, requests] = await Promise.all([
      prisma.facultyLeave.findMany({
        where: { faculty: { collegeId }, ...(pendingOnly ? { status: 'PENDING' } : {}) },
        include: { faculty: { select: { id: true, name: true, designation: true, employeeId: true } } },
        orderBy: { appliedAt: 'asc' },
      }),
      prisma.marksSheet.findMany({
        where: {
          assignment: { faculty: { collegeId } },
          ...(pendingOnly ? { status: 'SUBMITTED' } : {}),
        },
        include: {
          assignment: {
            include: {
              subject: { select: { code: true, name: true } },
              faculty: { select: { id: true, name: true, designation: true, employeeId: true } },
              _count: { select: { components: true } },
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
      }),
      prisma.governanceRequest.findMany({
        where: { collegeId, ...(pendingOnly ? { status: 'PENDING' } : {}) },
        include: { raisedBy: { select: { id: true, name: true, designation: true, employeeId: true } } },
        orderBy: { raisedAt: 'asc' },
      }),
    ]);

    const days = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86_400_000);

    const items = [
      ...leaves.map((l) => ({
        id: l.id,
        type: 'faculty_leave' as const,
        typeLabel: 'Faculty Leave',
        from: { id: l.faculty.id, name: l.faculty.name, role: l.faculty.designation },
        subject: `${l.kind[0]}${l.kind.slice(1).toLowerCase()} Leave — ${l.days} day(s)`,
        details: l.reason,
        raisedOn: l.appliedAt,
        // Leave has no formal deadline; three days is the working standard.
        slaDeadline: new Date(l.appliedAt.getTime() + 3 * 86_400_000),
        priority: l.kind === 'MEDICAL' ? ('high' as const) : ('normal' as const),
        status: l.status.toLowerCase(),
        amount: null,
        meta: {
          from: l.fromDate.toISOString().slice(0, 10),
          to: l.toDate.toISOString().slice(0, 10),
          substitute: l.substitute ?? '—',
        },
      })),
      ...sheets.map((s) => ({
        id: s.assignmentId,
        type: 'marks_entry' as const,
        typeLabel: 'Internal Marks',
        from: {
          id: s.assignment.faculty.id,
          name: s.assignment.faculty.name,
          role: s.assignment.faculty.designation,
        },
        subject: `${s.assignment.subject.code} ${s.assignment.subject.name} — ${s.assignment.classLabel}`,
        details: `Internal marks submitted for approval across ${s.assignment._count.components} component(s).`,
        raisedOn: s.submittedAt ?? s.updatedAt,
        slaDeadline: new Date((s.submittedAt ?? s.updatedAt).getTime() + 5 * 86_400_000),
        priority: 'high' as const,
        status: s.status.toLowerCase(),
        amount: null,
        meta: { course: s.assignment.subject.code, section: s.assignment.section },
      })),
      ...requests.map((r) => ({
        id: r.id,
        type: r.kind.toLowerCase(),
        typeLabel: `${r.kind[0]}${r.kind.slice(1).toLowerCase()}`,
        from: { id: r.raisedBy.id, name: r.raisedBy.name, role: r.raisedBy.designation },
        subject: r.subject,
        details: r.details,
        raisedOn: r.raisedAt,
        slaDeadline: r.slaDeadline,
        priority: r.priority.toLowerCase(),
        status: r.status.toLowerCase(),
        amount: r.amount,
        meta: {},
      })),
    ].map((i) => ({
      ...i,
      daysLeft: days(i.slaDeadline),
      overdue: i.status === 'pending' && days(i.slaDeadline) < 0,
    }));

    // Overdue first, then by how little time is left.
    items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysLeft - b.daysLeft);

    res.json({
      totals: {
        pending: items.filter((i) => i.status === 'pending' || i.status === 'submitted').length,
        overdue: items.filter((i) => i.overdue).length,
        byType: {
          faculty_leave: items.filter((i) => i.type === 'faculty_leave').length,
          marks_entry: items.filter((i) => i.type === 'marks_entry').length,
          other: items.filter((i) => i.type !== 'faculty_leave' && i.type !== 'marks_entry').length,
        },
      },
      items,
    });
  }),
);

// ─── POST /api/governance/approvals/:type/:id/decide ──────────────────────────

/**
 * Decides an item, whichever kind it is.
 *
 * The decision is routed to the module that owns the record, so a leave
 * approved here is approved the same way the head of department would have
 * approved it — one code path, one set of rules.
 */
governanceRouter.post(
  '/approvals/:type/:id/decide',
  validate(
    'params',
    z.object({
      type: z.enum(['faculty_leave', 'marks_entry', 'request']),
      id: z.string().min(1),
    }),
  ),
  validate(
    'body',
    z.object({ decision: z.enum(['APPROVE', 'REJECT']), note: z.string().max(500).optional() }),
  ),
  asyncHandler(async (req, res) => {
    const signatoryId = await resolveSignatoryId(req);
    const { type, id } = req.params as { type: string; id: string };
    const { decision, note } = req.body as { decision: 'APPROVE' | 'REJECT'; note?: string };

    if (decision === 'REJECT' && !note) {
      throw ApiError.badRequest('A rejection needs a reason the applicant can act on');
    }

    const now = new Date();

    if (type === 'faculty_leave') {
      const leave = await prisma.facultyLeave.findUnique({ where: { id } });
      if (!leave) throw ApiError.notFound('No such leave application');
      if (leave.status !== 'PENDING') {
        throw ApiError.conflict(`That application is already ${leave.status.toLowerCase()}`);
      }
      if (leave.facultyId === signatoryId) {
        throw ApiError.forbidden('You cannot decide your own leave application');
      }

      const updated = await prisma.facultyLeave.update({
        where: { id },
        data: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedAt: now,
          decidedById: signatoryId,
          decisionNote: note ?? null,
        },
      });
      res.json({ id: updated.id, type, status: updated.status, decidedAt: updated.decidedAt });
      return;
    }

    if (type === 'marks_entry') {
      const assignment = await prisma.subjectAssignment.findUnique({
        where: { id },
        include: { marksSheet: true, faculty: { select: { id: true } } },
      });
      if (!assignment?.marksSheet) throw ApiError.notFound('No such marks sheet');
      if (assignment.marksSheet.status !== 'SUBMITTED') {
        throw ApiError.conflict('Only a submitted sheet can be approved or returned');
      }
      if (assignment.faculty.id === signatoryId) {
        throw ApiError.forbidden('You cannot approve your own marks sheet');
      }

      const updated = await prisma.marksSheet.update({
        where: { id: assignment.marksSheet.id },
        data: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
          decidedAt: now,
          decidedById: signatoryId,
          returnReason: decision === 'REJECT' ? (note ?? null) : null,
        },
      });
      res.json({ id: assignment.id, type, status: updated.status, decidedAt: updated.decidedAt });
      return;
    }

    const request = await prisma.governanceRequest.findUnique({ where: { id } });
    if (!request) throw ApiError.notFound('No such request');
    if (request.status !== 'PENDING') {
      throw ApiError.conflict(`That request is already ${request.status.toLowerCase()}`);
    }

    const updated = await prisma.governanceRequest.update({
      where: { id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedAt: now,
        decidedById: signatoryId,
        decisionNote: note ?? null,
      },
    });

    res.json({ id: updated.id, type: 'request', status: updated.status, decidedAt: updated.decidedAt });
  }),
);

// ─── POST /api/governance/requests ────────────────────────────────────────────

/** Raises something for the principal that is neither leave nor marks. */
governanceRouter.post(
  '/requests',
  validate(
    'body',
    z.object({
      kind: z.enum(['BUDGET', 'EVENT', 'INFRASTRUCTURE', 'PROCUREMENT', 'POLICY', 'OTHER']),
      subject: z.string().min(3).max(200),
      details: z.string().min(5).max(2000),
      amount: z.number().int().positive().optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
      slaDays: z.number().int().min(1).max(90).default(7),
    }),
  ),
  asyncHandler(async (req, res) => {
    const raisedById = await resolveSignatoryId(req);
    const collegeId = await resolveCollegeId(req);
    const body = req.body as {
      kind: 'BUDGET';
      subject: string;
      details: string;
      amount?: number;
      priority: 'LOW' | 'NORMAL' | 'HIGH';
      slaDays: number;
    };

    const year = new Date().getFullYear();
    const prefix = `GR/${year}/`;
    const existing = await prisma.governanceRequest.findMany({
      where: { requestNo: { startsWith: prefix } },
      select: { requestNo: true },
    });
    const highest = existing.reduce((max, no) => {
      const tail = Number(no.requestNo.slice(prefix.length));
      return Number.isFinite(tail) && tail > max ? tail : max;
    }, 0);

    const created = await prisma.governanceRequest.create({
      data: {
        requestNo: `${prefix}${String(highest + 1).padStart(4, '0')}`,
        kind: body.kind,
        subject: body.subject,
        details: body.details,
        amount: body.amount ?? null,
        priority: body.priority,
        slaDeadline: new Date(Date.now() + body.slaDays * 86_400_000),
        collegeId,
        raisedById,
      },
    });

    res.status(201).json({
      id: created.id,
      requestNo: created.requestNo,
      kind: created.kind,
      subject: created.subject,
      status: created.status,
      slaDeadline: created.slaDeadline,
    });
  }),
);

// ─── GET /api/governance/compliance ───────────────────────────────────────────

/** The affiliation file: what each regulator requires, and where it stands. */
governanceRouter.get(
  '/compliance',
  asyncHandler(async (req, res) => {
    const collegeId = await resolveCollegeId(req);

    const items = await prisma.complianceItem.findMany({
      where: { collegeId },
      include: { reviewedBy: { select: { name: true } } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });

    const byStatus = (s: string) => items.filter((i) => i.status === s).length;

    res.json({
      totals: {
        total: items.length,
        compliant: byStatus('COMPLIANT'),
        partial: byStatus('PARTIAL'),
        nonCompliant: byStatus('NON_COMPLIANT'),
        notApplicable: byStatus('NOT_APPLICABLE'),
        overdue: items.filter((i) => i.dueOn && i.dueOn.getTime() < Date.now() && i.status !== 'COMPLIANT')
          .length,
      },
      items: items.map((i) => ({
        id: i.id,
        code: i.code,
        category: i.category,
        requirement: i.requirement,
        authority: i.authority,
        status: i.status,
        evidence: i.evidence,
        remarks: i.remarks,
        dueOn: i.dueOn,
        lastReviewedAt: i.lastReviewedAt,
        reviewedBy: i.reviewedBy?.name ?? null,
        overdue: !!i.dueOn && i.dueOn.getTime() < Date.now() && i.status !== 'COMPLIANT',
      })),
    });
  }),
);

// ─── PATCH /api/governance/compliance/:code ───────────────────────────────────

/**
 * Records a review of one requirement.
 *
 * Marking something compliant demands the evidence that makes it so — a
 * checklist whose ticks point at nothing is worse than no checklist.
 */
governanceRouter.patch(
  '/compliance/:code',
  validate('params', z.object({ code: z.string().min(1) })),
  validate(
    'body',
    z.object({
      status: z.enum(['COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_APPLICABLE']),
      evidence: z.string().max(300).optional(),
      remarks: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const reviewerId = await resolveSignatoryId(req);
    const { code } = req.params as { code: string };
    const body = req.body as { status: string; evidence?: string; remarks?: string };

    const item = await prisma.complianceItem.findUnique({ where: { code } });
    if (!item) throw ApiError.notFound(`No compliance item with code ${code}`);

    const evidence = body.evidence ?? item.evidence;
    if (body.status === 'COMPLIANT' && !evidence) {
      throw ApiError.badRequest('Marking a requirement compliant needs the evidence for it');
    }

    const updated = await prisma.complianceItem.update({
      where: { code },
      data: {
        status: body.status as 'COMPLIANT',
        evidence: body.evidence ?? item.evidence,
        remarks: body.remarks ?? item.remarks,
        lastReviewedAt: new Date(),
        reviewedById: reviewerId,
      },
      include: { reviewedBy: { select: { name: true } } },
    });

    res.json({
      code: updated.code,
      status: updated.status,
      evidence: updated.evidence,
      remarks: updated.remarks,
      lastReviewedAt: updated.lastReviewedAt,
      reviewedBy: updated.reviewedBy?.name ?? null,
    });
  }),
);
