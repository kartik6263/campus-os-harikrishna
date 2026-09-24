import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { nextInSeries, resolveStaffId } from './shared.js';
import { recordFor } from '../itconsole/audit.js';

export const counterRouter = Router();

const MODE = z.enum(['CASH', 'CHEQUE', 'UPI', 'DD', 'CARD', 'NEFT']);

/** Modes that need an instrument number, and cannot be treated as settled. */
const DEFERRED = new Set(['CHEQUE', 'DD']);

// ─── GET /api/office/counter ──────────────────────────────────────────────────

/** The day's takings, newest first. */
counterRouter.get(
  '/counter',
  validate('query', z.object({ date: z.string().date().optional(), limit: z.coerce.number().min(1).max(200).optional() })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);

    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;

    const range = dateParam
      ? {
          gte: new Date(`${dateParam}T00:00:00.000Z`),
          lt: new Date(new Date(`${dateParam}T00:00:00.000Z`).getTime() + 86_400_000),
        }
      : undefined;

    const receipts = await prisma.counterReceipt.findMany({
      where: range ? { receivedAt: range } : {},
      include: {
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
        receivedBy: { select: { name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: range ? undefined : limit,
    });

    const settled = receipts.filter((r) => r.status === 'COMPLETE');

    res.json({
      totals: {
        count: receipts.length,
        collected: settled.reduce((sum, r) => sum + r.amount, 0),
        awaitingClearance: receipts
          .filter((r) => r.status === 'PENDING_CLEARANCE')
          .reduce((sum, r) => sum + r.amount, 0),
      },
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNo: r.receiptNo,
        studentId: r.student.id,
        enrolmentNo: r.student.enrolmentNo,
        studentName: r.student.name,
        programme: `${r.student.programme.shortName} ${r.student.semester}`,
        head: r.head,
        amount: r.amount,
        mode: r.mode,
        instrument: r.instrument,
        receivedBy: r.receivedBy.name,
        receivedAt: r.receivedAt,
        status: r.status,
        remarks: r.remarks,
      })),
    });
  }),
);

// ─── GET /api/office/counter/student ──────────────────────────────────────────

/**
 * What a student owes, for the clerk to read back before taking money.
 *
 * Deliberately the same numbers the student's own fee screen shows, from the
 * same rows — the counter must never quote a different balance.
 */
counterRouter.get(
  '/counter/student',
  validate('query', z.object({ q: z.string().min(2) })),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const q = (req.query.q as string).trim();

    const student = await prisma.student.findFirst({
      where: {
        OR: [
          { enrolmentNo: { equals: q, mode: 'insensitive' } },
          { rollNo: { equals: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        programme: { select: { shortName: true, name: true } },
        feeItems: { orderBy: { head: 'asc' } },
        instalments: { orderBy: { number: 'asc' } },
      },
    });

    if (!student) throw ApiError.notFound('No student matches that');

    const charged = student.feeItems.reduce((sum, f) => sum + f.amount, 0);
    const paid = student.feeItems.reduce((sum, f) => sum + f.paid, 0);

    res.json({
      id: student.id,
      enrolmentNo: student.enrolmentNo,
      rollNo: student.rollNo,
      name: student.name,
      semester: student.semester,
      programme: student.programme,
      mobile: student.mobile,
      totals: { charged, paid, due: charged - paid },
      heads: student.feeItems.map((f) => ({
        head: f.head,
        amount: f.amount,
        paid: f.paid,
        due: f.amount - f.paid,
        category: f.category,
        dueDate: f.dueDate,
      })),
      instalments: student.instalments.map((i) => ({
        id: i.id,
        number: i.number,
        amount: i.amount,
        dueDate: i.dueDate,
        paidAt: i.paidAt,
      })),
    });
  }),
);

// ─── POST /api/office/counter ─────────────────────────────────────────────────

/**
 * Takes money across the counter.
 *
 * The receipt and the ledger entry are written together, so a payment made at
 * the window appears on the student's own fee screen immediately. A cheque or
 * a demand draft is recorded as pending clearance and does **not** reduce the
 * balance until it settles — the money is not in the account yet.
 */
counterRouter.post(
  '/counter',
  validate(
    'body',
    z
      .object({
        studentId: z.string().min(1),
        head: z.string().min(2).max(120),
        amount: z.number().int().positive('An amount must be more than zero'),
        mode: MODE,
        instrument: z.string().max(60).optional(),
        remarks: z.string().max(300).optional(),
      })
      .refine((v) => !DEFERRED.has(v.mode) || !!v.instrument, {
        message: 'A cheque or demand draft needs its number',
        path: ['instrument'],
      }),
  ),
  asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req);
    const body = req.body as {
      studentId: string;
      head: string;
      amount: number;
      mode: z.infer<typeof MODE>;
      instrument?: string;
      remarks?: string;
    };

    const student = await prisma.student.findUnique({
      where: { id: body.studentId },
      select: { id: true, name: true, enrolmentNo: true },
    });
    if (!student) throw ApiError.notFound('No such student');

    const deferred = DEFERRED.has(body.mode);

    const year = new Date().getFullYear();
    const prefix = `CNT/JU/${year}/`;
    const existing = await prisma.counterReceipt.findMany({
      where: { receiptNo: { startsWith: prefix } },
      select: { receiptNo: true },
    });
    const receiptNo = nextInSeries(prefix, existing.map((r) => r.receiptNo));

    // Which heads this payment settles, oldest charge first.
    const dues = await prisma.feeItem.findMany({
      where: { studentId: student.id },
      orderBy: [{ dueDate: 'asc' }, { head: 'asc' }],
    });

    const allocations: Array<{ id: string; add: number; head: string }> = [];
    let remaining = body.amount;
    for (const item of dues) {
      if (remaining <= 0) break;
      const owing = item.amount - item.paid;
      if (owing <= 0) continue;
      const add = Math.min(owing, remaining);
      allocations.push({ id: item.id, add, head: item.head });
      remaining -= add;
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          head: body.head,
          amount: body.amount,
          mode: body.mode,
          txnId: `CNT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
          receiptNo,
          status: deferred ? 'PENDING' : 'SUCCESS',
          paidAt: new Date(),
        },
      });

      // Only settled money moves the balance.
      if (!deferred) {
        for (const a of allocations) {
          await tx.feeItem.update({
            where: { id: a.id },
            data: { paid: { increment: a.add } },
          });
        }
      }

      return tx.counterReceipt.create({
        data: {
          receiptNo,
          studentId: student.id,
          head: body.head,
          amount: body.amount,
          mode: body.mode,
          instrument: body.instrument ?? null,
          status: deferred ? 'PENDING_CLEARANCE' : 'COMPLETE',
          settledAt: deferred ? null : new Date(),
          remarks: body.remarks ?? null,
          receivedById: staffId,
          paymentId: payment.id,
        },
      });
    });

    await recordFor(req, {
      module: 'Fee Management',
      action: 'create',
      target: receipt.receiptNo,
      detail: `Rs ${body.amount} from ${student.enrolmentNo} by ${body.mode}`,
    });

    res.status(201).json({
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      studentName: student.name,
      enrolmentNo: student.enrolmentNo,
      head: receipt.head,
      amount: receipt.amount,
      mode: receipt.mode,
      instrument: receipt.instrument,
      status: receipt.status,
      receivedAt: receipt.receivedAt,
      appliedTo: deferred ? [] : allocations.map((a) => ({ head: a.head, amount: a.add })),
      unallocated: deferred ? body.amount : remaining,
    });
  }),
);

// ─── POST /api/office/counter/:id/settle ──────────────────────────────────────

/**
 * Clears or bounces a cheque or demand draft.
 *
 * Clearing is when the money becomes real, so this is where the balance moves
 * — not at the moment the paper was handed over.
 */
counterRouter.post(
  '/counter/:id/settle',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({
      outcome: z.enum(['CLEARED', 'BOUNCED']),
      remarks: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await resolveStaffId(req);
    const { id } = req.params as { id: string };
    const { outcome, remarks } = req.body as { outcome: 'CLEARED' | 'BOUNCED'; remarks?: string };

    const receipt = await prisma.counterReceipt.findUnique({ where: { id } });
    if (!receipt) throw ApiError.notFound('No such receipt');
    if (receipt.status !== 'PENDING_CLEARANCE') {
      throw ApiError.conflict(`That receipt is already ${receipt.status.toLowerCase()}`);
    }

    const now = new Date();

    if (outcome === 'BOUNCED') {
      const [updated] = await prisma.$transaction([
        prisma.counterReceipt.update({
          where: { id },
          data: { status: 'BOUNCED', settledAt: now, remarks: remarks ?? receipt.remarks },
        }),
        prisma.payment.update({ where: { id: receipt.paymentId }, data: { status: 'FAILED' } }),
        prisma.notification.create({
          data: {
            studentId: receipt.studentId,
            kind: 'FEE',
            title: 'Payment returned unpaid',
            titleHi: 'भुगतान अदत्त लौटा',
            body: `Receipt ${receipt.receiptNo} for ₹${receipt.amount} was returned. Please settle at the counter.`,
            urgent: true,
            href: '/fee',
          },
        }),
      ]);
      res.json({ id: updated.id, status: updated.status, settledAt: updated.settledAt });
      return;
    }

    const dues = await prisma.feeItem.findMany({
      where: { studentId: receipt.studentId },
      orderBy: [{ dueDate: 'asc' }, { head: 'asc' }],
    });

    let remaining = receipt.amount;
    const allocations: Array<{ id: string; add: number; head: string }> = [];
    for (const item of dues) {
      if (remaining <= 0) break;
      const owing = item.amount - item.paid;
      if (owing <= 0) continue;
      const add = Math.min(owing, remaining);
      allocations.push({ id: item.id, add, head: item.head });
      remaining -= add;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const a of allocations) {
        await tx.feeItem.update({ where: { id: a.id }, data: { paid: { increment: a.add } } });
      }
      await tx.payment.update({ where: { id: receipt.paymentId }, data: { status: 'SUCCESS' } });
      return tx.counterReceipt.update({
        where: { id },
        data: { status: 'COMPLETE', settledAt: now, remarks: remarks ?? receipt.remarks },
      });
    });

    res.json({
      id: updated.id,
      status: updated.status,
      settledAt: updated.settledAt,
      appliedTo: allocations.map((a) => ({ head: a.head, amount: a.add })),
    });
  }),
);
