import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { allocate, nextNumber, reverse, statement, withSeries } from './ledger.js';

/**
 * Fee administration (/api/fee-admin): fee structures and applying them to a
 * class, instalment plans, concessions and waivers, refunds, cancelling a
 * receipt, late fines, the day book and closing it, and any student's
 * statement.
 *
 * The college office proposes and collects; the registrar, principal or
 * administrator approves concessions and refunds and sets structures.
 */
export const feeAdminRouter = Router();
feeAdminRouter.use(requireAuth);
feeAdminRouter.use(requireRole('OFFICE', 'REGISTRAR', 'PRINCIPAL', 'ADMIN'));

const APPROVERS = ['REGISTRAR', 'PRINCIPAL', 'ADMIN'] as const;
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const dayRange = (d: string) => ({ gte: new Date(new Date(`${d}T00:00:00Z`).getTime() - 5.5 * 3_600_000), lt: new Date(new Date(`${d}T00:00:00Z`).getTime() + 18.5 * 3_600_000) });
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

async function who(req: Request) {
  const u = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { email: true, office: { select: { name: true } }, faculty: { select: { name: true } } } });
  return u?.office?.name ?? u?.faculty?.name ?? u?.email ?? 'Staff';
}

async function notify(studentId: string, title: string, body: string, urgent = false) {
  await prisma.notification.create({ data: { studentId, kind: 'FEE', title, body, urgent, href: '/fee' } });
}

// ─── Fee structures ───────────────────────────────────────────────────────────

const headSchema = z.object({ head: z.string().trim().min(2).max(120), category: z.enum(['TUITION', 'DEVELOPMENT', 'EXAM', 'OTHER']), amount: z.number().int().positive().max(10_000_000), dueDate: z.string().date() });
const structureBody = z.object({
  name: z.string().trim().min(3).max(120),
  programmeId: z.string().min(1),
  semester: z.number().int().min(1).max(12),
  term: z.string().trim().min(3).max(40),
  heads: z.array(headSchema).min(1).max(25),
  instalments: z.array(z.object({ percent: z.number().int().min(1).max(100), dueDate: z.string().date() })).max(6).default([]),
});
type StructureBody = z.infer<typeof structureBody>;

function checkStructure(b: StructureBody) {
  const names = b.heads.map((h) => h.head.toLowerCase());
  if (new Set(names).size !== names.length) throw ApiError.badRequest('A head appears twice');
  if (b.instalments.length) {
    const total = b.instalments.reduce((t, i) => t + i.percent, 0);
    if (total !== 100) throw ApiError.badRequest(`The instalments add up to ${total}%, not 100%`);
    const dates = b.instalments.map((i) => i.dueDate);
    if (dates.some((d, i) => i > 0 && d <= dates[i - 1]!)) throw ApiError.badRequest('Instalment due dates must run in order');
  }
}

feeAdminRouter.get('/structures', asyncHandler(async (_req, res) => {
  const [rows, programmes, counts] = await Promise.all([
    prisma.feeStructure.findMany({ orderBy: [{ term: 'desc' }, { semester: 'asc' }] }),
    prisma.programme.findMany({ select: { id: true, shortName: true, name: true } }),
    prisma.student.groupBy({ by: ['programmeId', 'semester'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
  ]);
  res.json(rows.map((r) => ({
    ...r,
    programme: programmes.find((p) => p.id === r.programmeId)?.shortName ?? '—',
    students: counts.find((c) => c.programmeId === r.programmeId && c.semester === r.semester)?._count._all ?? 0,
    total: (r.heads as Array<{ amount: number }>).reduce((t, h) => t + h.amount, 0),
  })));
}));

feeAdminRouter.post('/structures', requireRole(...APPROVERS), validate('body', structureBody), asyncHandler(async (req, res) => {
  const b = req.body as StructureBody;
  checkStructure(b);
  if (!(await prisma.programme.findUnique({ where: { id: b.programmeId }, select: { id: true } }))) throw ApiError.notFound('No such programme');
  if (await prisma.feeStructure.findUnique({ where: { programmeId_semester_term: { programmeId: b.programmeId, semester: b.semester, term: b.term } }, select: { id: true } })) {
    throw ApiError.conflict('A structure for that class and term already exists; edit it instead');
  }
  const s = await prisma.feeStructure.create({ data: { ...b, createdBy: await who(req) } });
  await recordFor(req, { module: 'Fee Management', action: 'structure created', target: b.name, detail: `${b.term} sem ${b.semester}` });
  res.status(201).json(s);
}));

feeAdminRouter.put('/structures/:id', requireRole(...APPROVERS), validate('body', structureBody), asyncHandler(async (req, res) => {
  const b = req.body as StructureBody;
  checkStructure(b);
  const s = await prisma.feeStructure.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw ApiError.notFound('No such structure');
  if (s.programmeId !== b.programmeId || s.semester !== b.semester || s.term !== b.term) throw ApiError.badRequest('A structure’s class and term cannot change; make a new one');
  const u = await prisma.feeStructure.update({ where: { id: s.id }, data: { name: b.name, heads: b.heads, instalments: b.instalments } });
  await recordFor(req, { module: 'Fee Management', action: 'structure edited', target: b.name });
  res.json(u);
}));

feeAdminRouter.delete('/structures/:id', requireRole(...APPROVERS), asyncHandler(async (req, res) => {
  const s = await prisma.feeStructure.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw ApiError.notFound('No such structure');
  if (s.appliedAt) throw ApiError.conflict('This structure has been charged to students; it stays on record');
  await prisma.feeStructure.delete({ where: { id: s.id } });
  res.status(204).end();
}));

/**
 * Charges a structure to every active student of its class: each head they
 * do not already carry for the term, and the instalment plan for those who
 * have none. Running it again bills no one twice — it catches up new admissions.
 */
feeAdminRouter.post('/structures/:id/apply', requireRole(...APPROVERS), validate('body', z.object({ dryRun: z.boolean().default(false) })), asyncHandler(async (req, res) => {
  const s = await prisma.feeStructure.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw ApiError.notFound('No such structure');
  const heads = s.heads as Array<{ head: string; category: 'TUITION' | 'DEVELOPMENT' | 'EXAM' | 'OTHER'; amount: number; dueDate: string }>;
  const plan = s.instalments as Array<{ percent: number; dueDate: string }>;
  const students = await prisma.student.findMany({
    where: { programmeId: s.programmeId, semester: s.semester, status: 'ACTIVE' },
    select: { id: true, feeItems: { where: { term: s.term }, select: { head: true } }, instalments: { where: { term: s.term }, select: { id: true } } },
  });
  const items = students.flatMap((st) => heads.filter((h) => !st.feeItems.some((f) => f.head.toLowerCase() === h.head.toLowerCase()))
    .map((h) => ({ studentId: st.id, head: h.head, category: h.category, amount: h.amount, term: s.term, dueDate: new Date(`${h.dueDate}T00:00:00Z`) })));
  const total = heads.reduce((t, h) => t + h.amount, 0);
  const planFor = plan.length ? students.filter((st) => st.instalments.length === 0) : [];
  const instalments = planFor.flatMap((st) => {
    let given = 0;
    return plan.map((p, i) => {
      const amount = i === plan.length - 1 ? total - given : Math.round((total * p.percent) / 100);
      given += amount;
      return { studentId: st.id, number: i + 1, amount, dueDate: new Date(`${p.dueDate}T00:00:00Z`), term: s.term };
    });
  });
  if (!req.body.dryRun) {
    await prisma.$transaction(async (tx) => {
      if (items.length) await tx.feeItem.createMany({ data: items });
      if (instalments.length) await tx.instalment.createMany({ data: instalments });
      await tx.feeStructure.update({ where: { id: s.id }, data: { appliedAt: new Date(), appliedTo: { increment: new Set(items.map((i) => i.studentId)).size } } });
      const touched = [...new Set(items.map((i) => i.studentId))];
      if (touched.length) await tx.notification.createMany({ data: touched.map((studentId) => ({ studentId, kind: 'FEE' as const, title: `Fees for ${s.term}`, body: `${s.name}: ${inr(total)} is now on your fee account${plan.length ? ` in ${plan.length} instalments` : ''}.`, href: '/fee' })) });
    });
    await recordFor(req, { module: 'Fee Management', action: 'structure applied', target: s.name, detail: `${items.length} charges, ${instalments.length} instalments` });
  }
  res.status(req.body.dryRun ? 200 : 201).json({ students: students.length, charges: items.length, amount: items.reduce((t, i) => t + i.amount, 0), instalments: instalments.length, skipped: students.length * heads.length - items.length });
}));

// ─── Instalment plan for one student ──────────────────────────────────────────

feeAdminRouter.post(
  '/instalments',
  validate('body', z.object({ studentId: z.string().min(1), term: z.string().trim().min(3).max(40), parts: z.array(z.object({ amount: z.number().int().positive(), dueDate: z.string().date() })).min(1).max(12) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; term: string; parts: Array<{ amount: number; dueDate: string }> };
    const [items, existing] = await Promise.all([
      prisma.feeItem.findMany({ where: { studentId: b.studentId, term: b.term }, select: { amount: true, paid: true } }),
      prisma.instalment.findMany({ where: { studentId: b.studentId, term: b.term } }),
    ]);
    if (!items.length) throw ApiError.badRequest('The student has no fees for that term');
    if (existing.some((i) => i.paidAt)) throw ApiError.conflict('An instalment of this term is already paid; the plan cannot be redrawn');
    const due = items.reduce((t, i) => t + i.amount - i.paid, 0);
    const sum = b.parts.reduce((t, p) => t + p.amount, 0);
    if (sum !== due) throw ApiError.badRequest(`The instalments add up to ${inr(sum)}, but ${inr(due)} is outstanding`);
    if (b.parts.some((p, i) => i > 0 && p.dueDate <= b.parts[i - 1]!.dueDate)) throw ApiError.badRequest('Instalment due dates must run in order');
    await prisma.$transaction([
      prisma.instalment.deleteMany({ where: { studentId: b.studentId, term: b.term } }),
      prisma.instalment.createMany({ data: b.parts.map((p, i) => ({ studentId: b.studentId, term: b.term, number: i + 1, amount: p.amount, dueDate: new Date(`${p.dueDate}T00:00:00Z`) })) }),
    ]);
    await notify(b.studentId, 'Instalment plan', `${inr(due)} for ${b.term} is now payable in ${b.parts.length} instalment${b.parts.length === 1 ? '' : 's'}, the first by ${b.parts[0]!.dueDate}.`);
    await recordFor(req, { module: 'Fee Management', action: 'instalment plan', target: b.studentId, detail: `${b.term}: ${b.parts.length} parts` });
    res.status(201).json({ parts: b.parts.length, total: due });
  }),
);

// ─── Concessions ──────────────────────────────────────────────────────────────

const STUDENT = { select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } } } } as const;

feeAdminRouter.get('/concessions', validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })), asyncHandler(async (req, res) => {
  const { status } = validQuery<{ status?: 'PENDING' }>(req);
  res.json(await prisma.feeConcession.findMany({ where: status ? { status } : {}, include: { student: STUDENT, feeItem: { select: { head: true, term: true, amount: true, paid: true } } }, orderBy: { createdAt: 'desc' }, take: 300 }));
}));

feeAdminRouter.post(
  '/concessions',
  validate('body', z.object({
    studentId: z.string().min(1), feeItemId: z.string().min(1),
    kind: z.enum(['MERIT', 'NEED_BASED', 'SIBLING', 'STAFF_WARD', 'SPORTS', 'SCHOLARSHIP', 'OTHER']),
    amount: z.number().int().positive(), reason: z.string().trim().min(10).max(500), proofFileId: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; feeItemId: string; kind: 'OTHER'; amount: number; reason: string; proofFileId?: string };
    const item = await prisma.feeItem.findFirst({ where: { id: b.feeItemId, studentId: b.studentId } });
    if (!item) throw ApiError.notFound('No such fee head for that student');
    const pending = await prisma.feeConcession.aggregate({ where: { feeItemId: item.id, status: 'PENDING' }, _sum: { amount: true } });
    const room = item.amount - item.paid - (pending._sum.amount ?? 0);
    if (b.amount > room) throw ApiError.badRequest(`At most ${inr(Math.max(0, room))} of ${item.head} is unpaid and not already under a concession request`);
    const c = await withSeries(async () => prisma.feeConcession.create({ data: { ...b, concessionNo: await nextNumber('CON'), requestedBy: await who(req) } }));
    await recordFor(req, { module: 'Fee Management', action: 'concession requested', target: c.concessionNo, detail: `${inr(b.amount)} on ${item.head}: ${b.reason}` });
    res.status(201).json(c);
  }),
);

feeAdminRouter.post(
  '/concessions/:id/decide',
  requireRole(...APPROVERS),
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(300) })),
  asyncHandler(async (req, res) => {
    const { approve, note } = req.body as { approve: boolean; note: string };
    const c = await prisma.feeConcession.findUnique({ where: { id: String(req.params.id) }, include: { feeItem: true } });
    if (!c) throw ApiError.notFound('No such concession');
    if (c.status !== 'PENDING') throw ApiError.conflict(`This concession is already ${c.status.toLowerCase()}`);
    const by = await who(req);
    if (!approve) {
      await prisma.feeConcession.update({ where: { id: c.id }, data: { status: 'REJECTED', decidedBy: by, decidedAt: new Date(), decisionNote: note } });
      await notify(c.studentId, `Concession ${c.concessionNo} not granted`, note);
      res.json({ status: 'REJECTED' });
      return;
    }
    const room = c.feeItem.amount - c.feeItem.paid;
    if (room <= 0) throw ApiError.conflict(`${c.feeItem.head} has already been paid in full; refund it instead`);
    const amount = Math.min(c.amount, room);
    await prisma.$transaction(async (tx) => {
      // A concession is a credit on the head, recorded in the ledger like a payment but not as money received.
      const p = await tx.payment.create({ data: { studentId: c.studentId, head: `Concession — ${c.feeItem.head}`, amount, mode: 'CONCESSION', kind: 'CONCESSION', txnId: `CON-${crypto.randomBytes(8).toString('hex').toUpperCase()}`, receiptNo: c.concessionNo, status: 'SUCCESS' } });
      await allocate(tx, p.id, c.studentId, amount, { feeItemId: c.feeItemId });
      await tx.feeConcession.update({ where: { id: c.id }, data: { status: 'APPROVED', amount, decidedBy: by, decidedAt: new Date(), decisionNote: note, paymentId: p.id } });
    });
    await notify(c.studentId, `Concession ${c.concessionNo} granted`, `${inr(amount)} off ${c.feeItem.head}. ${note}`);
    await recordFor(req, { module: 'Fee Management', action: 'concession granted', target: c.concessionNo, detail: `${inr(amount)} on ${c.feeItem.head}`, outcome: 'WARN' });
    res.json({ status: 'APPROVED', amount });
  }),
);

// ─── Refunds ──────────────────────────────────────────────────────────────────

feeAdminRouter.get('/refunds', validate('query', z.object({ status: z.enum(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED']).optional() })), asyncHandler(async (req, res) => {
  const { status } = validQuery<{ status?: 'REQUESTED' }>(req);
  res.json(await prisma.feeRefund.findMany({ where: status ? { status } : {}, include: { student: STUDENT, feeItem: { select: { head: true, term: true, amount: true, paid: true } } }, orderBy: { createdAt: 'desc' }, take: 300 }));
}));

/** How much of a head was actually paid in money (not credited by a concession), less refunds already asked for. */
async function refundable(feeItemId: string) {
  const [allocs, open] = await Promise.all([
    prisma.feeAllocation.findMany({ where: { feeItemId, payment: { kind: 'RECEIPT', status: 'SUCCESS' } }, select: { amount: true } }),
    prisma.feeRefund.aggregate({ where: { feeItemId, status: { in: ['REQUESTED', 'APPROVED'] } }, _sum: { amount: true } }),
  ]);
  const item = await prisma.feeItem.findUnique({ where: { id: feeItemId }, select: { paid: true } });
  const concessions = await prisma.feeAllocation.aggregate({ where: { feeItemId, payment: { kind: 'CONCESSION', status: 'SUCCESS' } }, _sum: { amount: true } });
  // Payments recorded before allocations existed count by what the head shows paid, less concessions.
  const cash = Math.max(allocs.reduce((t, a) => t + a.amount, 0), (item?.paid ?? 0) - (concessions._sum.amount ?? 0));
  return cash - (open._sum.amount ?? 0);
}

feeAdminRouter.post(
  '/refunds',
  validate('body', z.object({ studentId: z.string().min(1), feeItemId: z.string().min(1), amount: z.number().int().positive(), reason: z.string().trim().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; feeItemId: string; amount: number; reason: string };
    const item = await prisma.feeItem.findFirst({ where: { id: b.feeItemId, studentId: b.studentId } });
    if (!item) throw ApiError.notFound('No such fee head for that student');
    const max = await refundable(item.id);
    if (b.amount > max) throw ApiError.badRequest(`At most ${inr(Math.max(0, max))} paid on ${item.head} can be refunded`);
    const r = await withSeries(async () => prisma.feeRefund.create({ data: { ...b, refundNo: await nextNumber('RF'), requestedBy: await who(req) } }));
    await recordFor(req, { module: 'Fee Management', action: 'refund requested', target: r.refundNo, detail: `${inr(b.amount)} on ${item.head}: ${b.reason}` });
    res.status(201).json(r);
  }),
);

feeAdminRouter.post(
  '/refunds/:id/decide',
  requireRole(...APPROVERS),
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(300) })),
  asyncHandler(async (req, res) => {
    const { approve, note } = req.body as { approve: boolean; note: string };
    const r = await prisma.feeRefund.findUnique({ where: { id: String(req.params.id) } });
    if (!r) throw ApiError.notFound('No such refund');
    if (r.status !== 'REQUESTED') throw ApiError.conflict(`This refund is already ${r.status.toLowerCase()}`);
    await prisma.feeRefund.update({ where: { id: r.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: await who(req), decidedAt: new Date(), decisionNote: note } });
    await notify(r.studentId, `Refund ${r.refundNo} ${approve ? 'approved' : 'not approved'}`, approve ? `${inr(r.amount)} will be paid to you. ${note}` : note);
    await recordFor(req, { module: 'Fee Management', action: approve ? 'refund approved' : 'refund rejected', target: r.refundNo, detail: note });
    res.json({ status: approve ? 'APPROVED' : 'REJECTED' });
  }),
);

/** Pays an approved refund out: the head's charge and payment both come down by the amount. */
feeAdminRouter.post(
  '/refunds/:id/pay',
  validate('body', z.object({ mode: z.enum(['NEFT', 'CHEQUE', 'CASH', 'UPI']), reference: z.string().trim().min(3).max(80) })),
  asyncHandler(async (req, res) => {
    const { mode, reference } = req.body as { mode: string; reference: string };
    const r = await prisma.feeRefund.findUnique({ where: { id: String(req.params.id) }, include: { feeItem: true } });
    if (!r) throw ApiError.notFound('No such refund');
    if (r.status !== 'APPROVED') throw ApiError.conflict(r.status === 'PAID' ? 'This refund is already paid' : 'Only an approved refund can be paid');
    if (r.feeItem.paid < r.amount) throw ApiError.conflict(`Only ${inr(r.feeItem.paid)} stands paid on ${r.feeItem.head} now`);
    const by = await who(req);
    await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({ data: { studentId: r.studentId, head: `Refund — ${r.feeItem.head}`, amount: -r.amount, mode: `REFUND_${mode}`, kind: 'REFUND', txnId: `RF-${reference}-${crypto.randomBytes(4).toString('hex')}`, receiptNo: r.refundNo, status: 'SUCCESS' } });
      await tx.feeItem.update({ where: { id: r.feeItemId }, data: { amount: { decrement: r.amount }, paid: { decrement: r.amount } } });
      await tx.feeRefund.update({ where: { id: r.id }, data: { status: 'PAID', payoutMode: mode, payoutRef: reference, paidBy: by, paidAt: new Date(), paymentId: p.id } });
    });
    await notify(r.studentId, `Refund ${r.refundNo} paid`, `${inr(r.amount)} paid by ${mode} (ref. ${reference}).`);
    await recordFor(req, { module: 'Fee Management', action: 'refund paid', target: r.refundNo, detail: `${inr(r.amount)} by ${mode} ${reference}`, outcome: 'WARN' });
    res.json({ status: 'PAID' });
  }),
);

// ─── Cancelling a receipt ─────────────────────────────────────────────────────

/**
 * Cancels a receipt taken in error: the heads it paid are owed again. The
 * office may cancel its own day's counter receipts until the day is closed;
 * the registrar or administrator any counter receipt. Online payments are
 * not cancelled — the money has moved; refund it instead.
 */
feeAdminRouter.post(
  '/receipts/:id/cancel',
  validate('body', z.object({ reason: z.string().trim().min(10).max(300) })),
  asyncHandler(async (req, res) => {
    const { reason } = req.body as { reason: string };
    const p = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, include: { receipt: true, allocations: true } });
    if (!p) throw ApiError.notFound('No such receipt');
    if (p.kind !== 'RECEIPT') throw ApiError.badRequest('Only a receipt for money received can be cancelled');
    if (p.status === 'CANCELLED') throw ApiError.conflict('That receipt is already cancelled');
    if (!p.receipt) throw ApiError.conflict('An online payment cannot be cancelled; raise a refund instead');
    if (p.instalmentId) throw ApiError.conflict('An instalment receipt cannot be cancelled here; raise a refund instead');
    const day = istDay(p.receipt.receivedAt);
    const senior = ['REGISTRAR', 'ADMIN'].includes(req.auth!.role);
    if (!senior && day !== istToday()) throw ApiError.forbidden('The office cancels only today’s receipts; ask the registrar for older ones');
    if (await prisma.feeDayClose.findUnique({ where: { date: day }, select: { id: true } })) throw ApiError.conflict(`The day book for ${day} is closed; the receipt stands — refund it instead`);
    const by = await who(req);
    const reversed = await prisma.$transaction(async (tx) => {
      const n = p.status === 'SUCCESS' ? await reverse(tx, p.id) : 0;
      await tx.payment.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, cancelledBy: by } });
      await tx.counterReceipt.update({ where: { id: p.receipt!.id }, data: { status: 'CANCELLED', remarks: `Cancelled: ${reason}` } });
      return n;
    });
    if (p.status === 'SUCCESS' && reversed === 0 && p.amount > 0 && p.allocations.length === 0) {
      // Nothing recorded to reverse; say so plainly rather than pretend.
      await recordFor(req, { module: 'Fee Management', action: 'receipt cancelled', target: p.receiptNo ?? p.id, detail: `${reason} (no allocation on record — check the student's heads)`, outcome: 'WARN' });
    } else {
      await recordFor(req, { module: 'Fee Management', action: 'receipt cancelled', target: p.receiptNo ?? p.id, detail: `${inr(p.amount)}: ${reason}`, outcome: 'WARN' });
    }
    await notify(p.studentId, `Receipt ${p.receiptNo} cancelled`, `${inr(p.amount)} — ${reason}. Your fee balance has been restored accordingly.`, true);
    res.json({ status: 'CANCELLED', reversed });
  }),
);

// ─── Late fines ───────────────────────────────────────────────────────────────

/**
 * Levies a fine on every overdue head: so much a day after the grace
 * period, up to a cap. Running it again brings each fine up to date rather
 * than adding a second one; a fine already paid is never reduced.
 */
feeAdminRouter.post(
  '/late-fines',
  requireRole(...APPROVERS),
  validate('body', z.object({ perDay: z.number().int().min(1).max(10_000), cap: z.number().int().min(1).max(100_000), graceDays: z.number().int().min(0).max(90).default(0), term: z.string().optional(), dryRun: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { perDay: number; cap: number; graceDays: number; term?: string; dryRun: boolean };
    const today = new Date(`${istToday()}T00:00:00Z`).getTime();
    const items = await prisma.feeItem.findMany({ where: { fineFor: null, dueDate: { not: null, lt: new Date(today) }, ...(b.term ? { term: b.term } : {}), student: { status: 'ACTIVE' } } });
    const overdue = items.filter((i) => i.amount > i.paid);
    const fines = await prisma.feeItem.findMany({ where: { fineFor: { in: overdue.map((i) => i.id) } } });
    let created = 0; let updated = 0; let amount = 0;
    const ops: Array<() => Promise<unknown>> = [];
    for (const i of overdue) {
      const late = Math.floor((today - i.dueDate!.getTime()) / 86_400_000) - b.graceDays;
      if (late <= 0) continue;
      const fine = Math.min(b.cap, late * b.perDay);
      const existing = fines.find((f) => f.fineFor === i.id);
      if (existing) {
        const next = Math.max(existing.paid, fine);
        if (next !== existing.amount) { updated++; amount += next - existing.amount; ops.push(() => prisma.feeItem.update({ where: { id: existing.id }, data: { amount: next } })); }
      } else {
        created++; amount += fine;
        ops.push(() => prisma.feeItem.create({ data: { studentId: i.studentId, head: `Late fine — ${i.head}`, category: 'OTHER', amount: fine, term: i.term, dueDate: new Date(today + 7 * 86_400_000), fineFor: i.id } }));
      }
    }
    if (!b.dryRun) {
      for (const op of ops) await op();
      await recordFor(req, { module: 'Fee Management', action: 'late fines', target: `${created + updated} heads`, detail: `${inr(b.perDay)}/day after ${b.graceDays} days, cap ${inr(b.cap)}: ${inr(amount)}` });
    }
    res.json({ overdue: overdue.length, created, updated, amount, dryRun: b.dryRun });
  }),
);

// ─── Day book ─────────────────────────────────────────────────────────────────

async function dayBook(date: string) {
  const payments = await prisma.payment.findMany({
    where: { paidAt: dayRange(date), kind: 'RECEIPT' },
    include: { receipt: { include: { receivedBy: { select: { name: true } } } }, student: { select: { name: true, enrolmentNo: true } } },
    orderBy: { paidAt: 'asc' },
  });
  const ok = payments.filter((p) => p.status === 'SUCCESS');
  const sum = (xs: typeof payments) => xs.reduce((t, p) => t + p.amount, 0);
  const group = (key: (p: (typeof payments)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of ok) m.set(key(p), (m.get(key(p)) ?? 0) + p.amount);
    return [...m.entries()].map(([k, v]) => ({ key: k, amount: v })).sort((a, b) => b.amount - a.amount);
  };
  const close = await prisma.feeDayClose.findUnique({ where: { date } });
  return {
    date,
    collected: sum(ok), count: ok.length,
    cash: sum(ok.filter((p) => p.mode === 'CASH')),
    pendingClearance: sum(payments.filter((p) => p.status === 'PENDING')),
    cancelled: payments.filter((p) => p.status === 'CANCELLED').map((p) => ({ receiptNo: p.receiptNo, amount: p.amount, reason: p.cancelReason, by: p.cancelledBy })),
    byMode: group((p) => p.mode),
    byClerk: group((p) => p.receipt?.receivedBy.name ?? 'Online'),
    byHead: group((p) => p.head),
    entries: payments.map((p) => ({ id: p.id, time: p.paidAt, receiptNo: p.receiptNo, student: p.student.name, enrolmentNo: p.student.enrolmentNo, head: p.head, amount: p.amount, mode: p.mode, status: p.status, channel: p.receipt ? 'Counter' : 'Online', clerk: p.receipt?.receivedBy.name ?? null })),
    closed: close,
  };
}

feeAdminRouter.get('/daybook', validate('query', z.object({ date: z.string().date().optional() })), asyncHandler(async (req, res) => {
  res.json(await dayBook(validQuery<{ date?: string }>(req).date ?? istToday()));
}));

feeAdminRouter.post(
  '/daybook/close',
  validate('body', z.object({ date: z.string().date(), countedCash: z.number().int().min(0), remarks: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { date: string; countedCash: number; remarks?: string };
    if (b.date > istToday()) throw ApiError.badRequest('A day still to come cannot be closed');
    if (await prisma.feeDayClose.findUnique({ where: { date: b.date }, select: { id: true } })) throw ApiError.conflict(`${b.date} is already closed`);
    const book = await dayBook(b.date);
    const difference = b.countedCash - book.cash;
    if (difference !== 0 && (!b.remarks || b.remarks.length < 5)) throw ApiError.badRequest(`The cash counted differs from the book by ${inr(difference)}; explain it in the remarks`);
    const c = await prisma.feeDayClose.create({ data: { date: b.date, expectedCash: book.cash, countedCash: b.countedCash, difference, totals: { collected: book.collected, count: book.count, byMode: book.byMode }, remarks: b.remarks ?? null, closedBy: await who(req) } });
    await recordFor(req, { module: 'Fee Management', action: 'day closed', target: b.date, detail: `cash ${inr(book.cash)}, counted ${inr(b.countedCash)}`, outcome: difference ? 'WARN' : 'OK' });
    res.status(201).json(c);
  }),
);

// ─── A student's statement ────────────────────────────────────────────────────

feeAdminRouter.get('/students/:id/statement', asyncHandler(async (req, res) => {
  const s = await statement(String(req.params.id));
  if (!s.student) throw ApiError.notFound('No such student');
  const [concessions, refunds, instalments] = await Promise.all([
    prisma.feeConcession.findMany({ where: { studentId: String(req.params.id) }, include: { feeItem: { select: { head: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.feeRefund.findMany({ where: { studentId: String(req.params.id) }, include: { feeItem: { select: { head: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.instalment.findMany({ where: { studentId: String(req.params.id) }, orderBy: [{ term: 'asc' }, { number: 'asc' }] }),
  ]);
  const items = await prisma.feeItem.findMany({ where: { studentId: String(req.params.id) }, orderBy: [{ term: 'asc' }, { head: 'asc' }] });
  res.json({ ...s, items: items.map((i) => ({ id: i.id, head: i.head, term: i.term, category: i.category, amount: i.amount, paid: i.paid, due: i.amount - i.paid, dueDate: i.dueDate, fine: !!i.fineFor })), concessions, refunds, instalments });
}));

// ─── Lookups for the desk ─────────────────────────────────────────────────────

/** A student by enrolment or roll number, or by a name that matches only one. */
feeAdminRouter.get('/lookup', validate('query', z.object({ q: z.string().trim().min(2).max(80) })), asyncHandler(async (req, res) => {
  const { q } = validQuery<{ q: string }>(req);
  const exact = await prisma.student.findFirst({ where: { OR: [{ enrolmentNo: { equals: q, mode: 'insensitive' } }, { rollNo: { equals: q, mode: 'insensitive' } }] }, select: { id: true } });
  let id = exact?.id;
  if (!id) {
    const named = await prisma.student.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { id: true, name: true, enrolmentNo: true }, take: 10 });
    if (named.length === 0) throw ApiError.notFound('No student matches that');
    if (named.length > 1) throw ApiError.conflict(`${named.length === 10 ? 'Many' : named.length} students match — enter the enrolment number: ${named.map((n) => `${n.name} (${n.enrolmentNo})`).join(', ')}`, { matches: named });
    id = named[0]!.id;
  }
  const s = await prisma.student.findUniqueOrThrow({ where: { id }, include: { programme: { select: { shortName: true, name: true } }, feeItems: { orderBy: [{ term: 'asc' }, { head: 'asc' }] }, instalments: { orderBy: { number: 'asc' } } } });
  const charged = s.feeItems.reduce((t, f) => t + f.amount, 0);
  const paid = s.feeItems.reduce((t, f) => t + f.paid, 0);
  res.json({
    id: s.id, enrolmentNo: s.enrolmentNo, rollNo: s.rollNo, name: s.name, semester: s.semester, programme: s.programme, mobile: s.mobile,
    totals: { charged, paid, due: charged - paid },
    heads: s.feeItems.map((f) => ({ id: f.id, term: f.term, head: f.head, amount: f.amount, paid: f.paid, due: f.amount - f.paid, category: f.category, dueDate: f.dueDate })),
    instalments: s.instalments.map((i) => ({ id: i.id, number: i.number, amount: i.amount, dueDate: i.dueDate, paidAt: i.paidAt })),
  });
}));

feeAdminRouter.get('/programmes', asyncHandler(async (_req, res) => {
  const [programmes, counts] = await Promise.all([
    prisma.programme.findMany({ select: { id: true, shortName: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.student.groupBy({ by: ['programmeId', 'semester'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
  ]);
  res.json(programmes.map((p) => ({ ...p, semesters: counts.filter((c) => c.programmeId === p.id).map((c) => ({ semester: c.semester, students: c._count._all })).sort((a, b) => a.semester - b.semester) })));
}));
