import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * The institution's fee books, for the accounts section: who owes what and
 * for how long, every payment however it arrived, reminders to defaulters,
 * and raising a semester's charges on a whole programme at once.
 *
 * Everything reads and writes the same fee items and payments the student's
 * own fee screen and the college counter use — there is one ledger.
 */
export const financeRouter = Router();

const DAY = 86_400_000;

// ─── GET /api/office/finance/dues ─────────────────────────────────────────────

financeRouter.get(
  '/finance/dues',
  validate('query', z.object({ collegeId: z.string().optional(), programmeId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { collegeId, programmeId } = req.query as { collegeId?: string; programmeId?: string };
    const students = await prisma.student.findMany({
      where: { ...(collegeId ? { collegeId } : {}), ...(programmeId ? { programmeId } : {}) },
      select: {
        id: true, name: true, enrolmentNo: true, semester: true, mobile: true,
        programme: { select: { id: true, shortName: true } },
        college: { select: { id: true, name: true } },
        feeItems: { select: { amount: true, paid: true, dueDate: true, head: true } },
      },
    });
    const reminders = await prisma.notification.groupBy({
      by: ['studentId'],
      where: { kind: 'FEE', title: 'Fee reminder' },
      _max: { createdAt: true },
      _count: { _all: true },
    });
    const sent = new Map(reminders.map((r) => [r.studentId, r]));
    const now = Date.now();

    const rows = students
      .map((s) => {
        const charged = s.feeItems.reduce((n, f) => n + f.amount, 0);
        const paid = s.feeItems.reduce((n, f) => n + f.paid, 0);
        const owing = s.feeItems.filter((f) => f.amount > f.paid);
        const oldest = owing.map((f) => f.dueDate).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        const r = sent.get(s.id);
        return {
          id: s.id, name: s.name, enrolmentNo: s.enrolmentNo, semester: s.semester, mobile: s.mobile,
          programme: s.programme.shortName, programmeId: s.programme.id, college: s.college.name, collegeId: s.college.id,
          charged, paid, due: charged - paid,
          heads: owing.map((f) => ({ head: f.head, due: f.amount - f.paid })),
          oldestDue: oldest,
          daysOverdue: oldest ? Math.max(0, Math.floor((now - oldest.getTime()) / DAY)) : 0,
          reminders: r?._count._all ?? 0,
          lastReminderAt: r?._max.createdAt ?? null,
        };
      })
      .filter((r) => r.due > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.due - a.due);

    res.json({
      totals: {
        students: rows.length,
        due: rows.reduce((n, r) => n + r.due, 0),
        over30: rows.filter((r) => r.daysOverdue > 30).length,
        over90: rows.filter((r) => r.daysOverdue > 90).length,
      },
      rows,
    });
  }),
);

// ─── GET /api/office/finance/payments ─────────────────────────────────────────

financeRouter.get(
  '/finance/payments',
  validate('query', z.object({ from: z.string().date().optional(), to: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const gte = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 30 * DAY);
    const lt = to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY) : new Date(Date.now() + DAY);
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte, lt } },
      include: { student: { select: { name: true, enrolmentNo: true, programme: { select: { shortName: true } }, semester: true } }, receipt: { select: { status: true, instrument: true } } },
      orderBy: { paidAt: 'desc' },
      take: 2000,
    });
    const ok = payments.filter((p) => p.status === 'SUCCESS');
    const byMode: Record<string, number> = {};
    for (const p of ok) byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount;
    res.json({
      from: gte, to: new Date(lt.getTime() - DAY),
      totals: {
        collected: ok.reduce((n, p) => n + p.amount, 0),
        count: ok.length,
        pending: payments.filter((p) => p.status === 'PENDING').reduce((n, p) => n + p.amount, 0),
        failed: payments.filter((p) => p.status === 'FAILED').length,
        byMode,
      },
      payments: payments.map((p) => ({
        id: p.id, paidAt: p.paidAt, amount: p.amount, mode: p.mode, status: p.status, head: p.head,
        receiptNo: p.receiptNo, txnId: p.txnId, channel: p.receipt ? 'Counter' : 'Online',
        instrument: p.receipt?.instrument ?? null,
        student: p.student.name, enrolmentNo: p.student.enrolmentNo, programme: `${p.student.programme.shortName} ${p.student.semester}`,
      })),
    });
  }),
);

// ─── POST /api/office/finance/remind ──────────────────────────────────────────

/** An in-app reminder on each student's fee screen and notifications, with what they owe. */
financeRouter.post(
  '/finance/remind',
  validate('body', z.object({ studentIds: z.array(z.string().min(1)).min(1).max(1000), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { studentIds, note } = req.body as { studentIds: string[]; note?: string };
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, feeItems: { select: { amount: true, paid: true } } },
    });
    const owing = students
      .map((s) => ({ id: s.id, due: s.feeItems.reduce((n, f) => n + f.amount - f.paid, 0) }))
      .filter((s) => s.due > 0);
    if (owing.length === 0) throw ApiError.badRequest('None of those students owe anything');
    await prisma.notification.createMany({
      data: owing.map((s) => ({
        studentId: s.id,
        kind: 'FEE' as const,
        title: 'Fee reminder',
        titleHi: 'शुल्क अनुस्मारक',
        body: `₹${s.due.toLocaleString('en-IN')} is outstanding on your fee account. Please pay online or at the college counter.${note ? ` ${note}` : ''}`,
        bodyHi: `आपके शुल्क खाते पर ₹${s.due.toLocaleString('en-IN')} बकाया है। कृपया ऑनलाइन या कॉलेज काउंटर पर भुगतान करें।`,
        urgent: true,
        href: '/(tabs)/fee',
      })),
    });
    await recordFor(req, { module: 'Fee Management', action: 'remind', target: `${owing.length} student(s)`, detail: note ?? null });
    res.json({ sent: owing.length, skipped: studentIds.length - owing.length });
  }),
);

// ─── POST /api/office/finance/charge-students ─────────────────────────────────

/**
 * Raises one charge on a named list of students — a month's mess bill on the
 * hostel residents, a tour fee on those going. A student who already carries
 * that head for that term is skipped, so a repeated run bills no one twice.
 */
financeRouter.post(
  '/finance/charge-students',
  validate('body', z.object({
    studentIds: z.array(z.string().min(1)).min(1).max(5000),
    head: z.string().trim().min(2).max(120),
    category: z.enum(['TUITION', 'DEVELOPMENT', 'EXAM', 'OTHER']).default('OTHER'),
    amount: z.number().int().positive().max(10_000_000),
    term: z.string().trim().min(3).max(40),
    dueDate: z.string().date(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentIds: string[]; head: string; category: 'OTHER'; amount: number; term: string; dueDate: string };
    const students = await prisma.student.findMany({
      where: { id: { in: [...new Set(b.studentIds)] } },
      select: { id: true, feeItems: { where: { term: b.term, head: b.head }, select: { id: true } } },
    });
    const fresh = students.filter((s) => s.feeItems.length === 0);
    if (fresh.length) {
      await prisma.feeItem.createMany({
        data: fresh.map((s) => ({ studentId: s.id, head: b.head, category: b.category, amount: b.amount, term: b.term, dueDate: new Date(`${b.dueDate}T00:00:00.000Z`) })),
      });
      await recordFor(req, { module: 'Fee Management', action: 'raise-charges', target: b.head, detail: `${b.term}: ₹${b.amount} on ${fresh.length} student(s)` });
    }
    res.status(201).json({ created: fresh.length, skipped: students.length - fresh.length, unknown: b.studentIds.length - students.length, total: fresh.length * b.amount });
  }),
);

// ─── GET /api/office/finance/programmes ───────────────────────────────────────

financeRouter.get(
  '/finance/programmes',
  asyncHandler(async (_req, res) => {
    const programmes = await prisma.programme.findMany({ select: { id: true, code: true, name: true, shortName: true, years: true }, orderBy: { name: 'asc' } });
    const counts = await prisma.student.groupBy({ by: ['programmeId', 'semester'], _count: { _all: true } });
    res.json(programmes.map((p) => ({
      ...p,
      semesters: counts.filter((c) => c.programmeId === p.id).map((c) => ({ semester: c.semester, students: c._count._all })).sort((a, b) => a.semester - b.semester),
    })));
  }),
);

// ─── POST /api/office/finance/charges ─────────────────────────────────────────

/**
 * Raises a fee structure on every student of a programme and semester: one
 * fee item per head. A student who already carries that head for that term is
 * skipped, so running it twice never bills anyone twice.
 */
financeRouter.post(
  '/finance/charges',
  requireRole('REGISTRAR', 'ADMIN'),
  validate('body', z.object({
    programmeId: z.string().min(1),
    semester: z.number().int().min(1).max(12),
    term: z.string().trim().min(3).max(40),
    heads: z.array(z.object({
      head: z.string().trim().min(2).max(120),
      category: z.enum(['TUITION', 'DEVELOPMENT', 'EXAM', 'OTHER']),
      amount: z.number().int().positive().max(10_000_000),
      dueDate: z.string().date(),
    })).min(1).max(20),
    dryRun: z.boolean().optional(),
  })),
  asyncHandler(async (req, res) => {
    const body = req.body as { programmeId: string; semester: number; term: string; heads: Array<{ head: string; category: 'TUITION'; amount: number; dueDate: string }>; dryRun?: boolean };
    const programme = await prisma.programme.findUnique({ where: { id: body.programmeId }, select: { shortName: true } });
    if (!programme) throw ApiError.notFound('No such programme');
    const students = await prisma.student.findMany({
      where: { programmeId: body.programmeId, semester: body.semester },
      select: { id: true, feeItems: { where: { term: body.term }, select: { head: true } } },
    });
    const rows = students.flatMap((s) => body.heads
      .filter((h) => !s.feeItems.some((f) => f.head.toLowerCase() === h.head.toLowerCase()))
      .map((h) => ({ studentId: s.id, head: h.head, category: h.category, amount: h.amount, term: body.term, dueDate: new Date(`${h.dueDate}T00:00:00.000Z`) })));
    const skipped = students.length * body.heads.length - rows.length;

    if (!body.dryRun && rows.length) {
      await prisma.feeItem.createMany({ data: rows });
      await recordFor(req, {
        module: 'Fee Management', action: 'raise-charges', target: `${programme.shortName} Sem ${body.semester}`,
        detail: `${body.term}: ${rows.length} charge(s) on ${students.length} student(s), ₹${rows.reduce((n, r) => n + r.amount, 0)}`,
      });
    }
    res.status(body.dryRun ? 200 : 201).json({
      students: students.length,
      created: body.dryRun ? 0 : rows.length,
      wouldCreate: rows.length,
      skipped,
      total: rows.reduce((n, r) => n + r.amount, 0),
    });
  }),
);
