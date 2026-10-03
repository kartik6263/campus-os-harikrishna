import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, validQuery, validate } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

/**
 * Phase 11 — the institution at a glance.
 *
 * The admin console's figures, the global search and the activity feed. All
 * of it is counted from the other phases' tables on read; nothing here is
 * stored, so a figure cannot drift from the records it summarises.
 */
export const insightsRouter = Router();

insightsRouter.use(requireAuth);

const STAFF = ['FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'] as const;
const ADMINISTRATION = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'] as const;

/**
 * Share of seats filled: present (or late) marks over every enrolled student
 * of every class held. An absence has no row of its own, so dividing by the
 * rows that exist would always say 100%.
 */
async function attendanceRate(since: Date | null): Promise<number | null> {
  const from = since ?? new Date(0);
  const [row] = await prisma.$queryRaw<Array<{ expected: bigint; present: bigint }>>`
    SELECT
      (SELECT COALESCE(SUM(e.n), 0) FROM class_sessions cs
         JOIN (SELECT "subjectId", COUNT(*) AS n FROM enrolments GROUP BY "subjectId") e ON e."subjectId" = cs."subjectId"
        WHERE cs.date >= ${from} AND cs.date <= now())::bigint AS expected,
      (SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar."sessionId"
        WHERE ar.status IN ('PRESENT', 'LATE') AND cs.date >= ${from} AND cs.date <= now())::bigint AS present`;
  const expected = Number(row?.expected ?? 0);
  return expected ? Math.round((Number(row!.present) / expected) * 1000) / 10 : null;
}

const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

/** The institution at a glance, counted from the live tables. */
export async function institutionOverview() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    colleges, programmes, students, faculty, users, lockedUsers,
    feeTotals, collectedMonth, paymentsByMonth,
    attendance30, attendanceAll,
    approvalsPending, certificatesOpen, admissionsPending,
    rtiOpen, tendersLive, examSessions, riskBands,
    grievancesOpen, auditToday, collegeRows,
  ] = await Promise.all([
    prisma.college.count(),
    prisma.programme.count(),
    prisma.student.count(),
    prisma.faculty.count(),
    prisma.user.count(),
    prisma.user.count({ where: { lockedAt: { not: null } } }),
    prisma.feeItem.aggregate({ _sum: { amount: true, paid: true } }),
    prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: monthStart(now) } }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw<Array<{ month: Date; amount: bigint }>>`
      SELECT date_trunc('month', "paidAt") AS month, COALESCE(SUM(amount), 0)::bigint AS amount
      FROM payments WHERE status = 'SUCCESS' AND "paidAt" >= ${sixMonthsAgo}
      GROUP BY 1 ORDER BY 1`,
    attendanceRate(since30),
    attendanceRate(null),
    prisma.governanceRequest.count({ where: { status: 'PENDING' } }),
    prisma.certificateRequest.count({ where: { stage: { in: ['REQUESTED', 'COLLEGE_OFFICE', 'READY'] } } }),
    prisma.admissionApplication.count({ where: { status: { in: ['PENDING_DOCS', 'VERIFIED'] } } }),
    prisma.rtiApplication.count({ where: { status: { notIn: ['REPLIED', 'REJECTED', 'CLOSED', 'TRANSFERRED'] } } }),
    prisma.tender.count({ where: { status: { in: ['PUBLISHED', 'CORRIGENDUM', 'BID_OPEN', 'EVALUATION'] } } }),
    prisma.examSession.groupBy({ by: ['status'], _count: true }),
    prisma.$queryRaw<Array<{ band: string; n: bigint }>>`
      SELECT band::text, COUNT(*)::bigint AS n FROM (
        SELECT DISTINCT ON ("studentId") band FROM risk_assessments ORDER BY "studentId", "assessedAt" DESC
      ) latest GROUP BY band`,
    prisma.workspaceRecord.count({ where: { collection: 'student:grievance', NOT: { data: { path: ['status'], string_contains: 'resolved' } } } }),
    prisma.auditEntry.count({ where: { occurredAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    prisma.college.findMany({
      select: { id: true, code: true, name: true, district: true, _count: { select: { students: true, faculty: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const due = feeTotals._sum.amount ?? 0;
  const paid = feeTotals._sum.paid ?? 0;

  return {
    generatedAt: now,
    counts: { colleges, programmes, students, faculty, users, lockedUsers },
    fees: {
      billed: due,
      collected: paid,
      outstanding: Math.max(0, due - paid),
      collectionRate: due ? Math.round((paid / due) * 1000) / 10 : null,
      collectedThisMonth: collectedMonth._sum.amount ?? 0,
      paymentsThisMonth: collectedMonth._count,
      byMonth: paymentsByMonth.map((r) => ({ month: r.month, amount: Number(r.amount) })),
    },
    attendance: { last30Days: attendance30, overall: attendanceAll },
    queues: { approvalsPending, certificatesOpen, admissionsPending, rtiOpen, tendersLive, grievancesOpen },
    exams: Object.fromEntries(examSessions.map((g) => [g.status, g._count])),
    risk: Object.fromEntries(riskBands.map((r) => [r.band, Number(r.n)])),
    auditToday,
    colleges: collegeRows.map((c) => ({ id: c.id, code: c.code, name: c.name, district: c.district, students: c._count.students, faculty: c._count.faculty })),
  };
}

insightsRouter.get(
  '/overview',
  requireRole(...ADMINISTRATION),
  asyncHandler(async (_req, res) => {
    res.json(await institutionOverview());
  }),
);

// ─── Global search ────────────────────────────────────────────────────────────

const searchQuery = z.object({ q: z.string().trim().min(2).max(80) });

insightsRouter.get(
  '/search',
  requireRole(...STAFF),
  validate('query', searchQuery),
  asyncHandler(async (req, res) => {
    const { q } = validQuery<z.infer<typeof searchQuery>>(req);
    const like = { contains: q, mode: 'insensitive' as const };
    const take = 6;

    const [students, faculty, admissions, certificates, rti, records] = await Promise.all([
      prisma.student.findMany({
        where: { OR: [{ name: like }, { enrolmentNo: like }, { rollNo: like }] },
        select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } }, college: { select: { name: true } } },
        take,
      }),
      prisma.faculty.findMany({
        where: { OR: [{ name: like }, { employeeId: like }, { department: like }] },
        select: { id: true, name: true, employeeId: true, designation: true, department: true },
        take,
      }),
      prisma.admissionApplication.findMany({
        where: { OR: [{ applicationNo: like }] },
        select: { id: true, applicationNo: true, status: true },
        take,
      }),
      prisma.certificateRequest.findMany({
        where: { requestNo: like },
        select: { id: true, requestNo: true, stage: true },
        take,
      }),
      req.auth!.role === 'FACULTY' || req.auth!.role === 'OFFICE'
        ? Promise.resolve([])
        : prisma.rtiApplication.findMany({
            where: { OR: [{ applicationNo: like }, { applicantName: like }, { subject: like }] },
            select: { id: true, applicationNo: true, applicantName: true, subject: true, status: true },
            take,
          }),
      prisma.workspaceRecord.findMany({
        where: { OR: [{ key: like }] },
        select: { id: true, collection: true, key: true, data: true },
        take,
      }),
    ]);

    type Hit = { kind: string; id: string; title: string; subtitle: string; screen: string };
    const hits: Hit[] = [
      ...students.map((s) => ({ kind: 'Student', id: s.id, title: s.name, subtitle: `${s.enrolmentNo} · ${s.programme.shortName} Sem ${s.semester} · ${s.college.name}`, screen: 'intelligence' })),
      ...faculty.map((f) => ({ kind: 'Staff', id: f.id, title: f.name, subtitle: `${f.employeeId} · ${f.designation}, ${f.department}`, screen: 'it-console' })),
      ...admissions.map((a) => ({ kind: 'Admission', id: a.id, title: a.applicationNo, subtitle: a.status.replace(/_/g, ' ').toLowerCase(), screen: 'college-office' })),
      ...certificates.map((c) => ({ kind: 'Certificate', id: c.id, title: c.requestNo, subtitle: c.stage.replace(/_/g, ' ').toLowerCase(), screen: 'college-office' })),
      ...rti.map((r) => ({ kind: 'RTI', id: r.id, title: r.applicationNo, subtitle: `${r.applicantName} — ${r.subject}`, screen: 'governance' })),
      ...records.map((r) => {
        const d = r.data as Record<string, unknown>;
        const title = String(d.name ?? d.title ?? d.subject ?? r.key);
        return { kind: r.collection.split(':')[1]!.replace(/[._-]/g, ' '), id: r.id, title, subtitle: r.key, screen: r.collection.startsWith('gov:') ? 'governance' : 'acad-ops' };
      }),
    ];
    res.json({ q, hits });
  }),
);

// ─── Activity ─────────────────────────────────────────────────────────────────

/** Administration sees the institution's activity; other staff see their own. */
insightsRouter.get(
  '/activity',
  requireRole(...STAFF),
  asyncHandler(async (req, res) => {
    const everyone = (ADMINISTRATION as readonly string[]).includes(req.auth!.role);
    const entries = await prisma.auditEntry.findMany({
      where: everyone ? {} : { actorId: req.auth!.sub },
      orderBy: { seq: 'desc' },
      take: 15,
      select: { id: true, seq: true, occurredAt: true, actorName: true, actorRole: true, module: true, action: true, target: true, outcome: true },
    });
    res.json({ entries });
  }),
);
