import { Router, type Request } from 'express';
import { institutionCode } from './institution.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth, resolveStudentId } from '../auth/middleware.js';
import {
  checkoutSignatureValid,
  createOrder,
  fetchOrder,
  fetchPayment,
  razorpayEnabled,
  webhookSignatureValid,
} from '../lib/razorpay.js';

export const feesRouter = Router();
feesRouter.use(requireAuth);

// ─── GET /api/student/fees ────────────────────────────────────────────────────

feesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);

    const [items, payments, instalments, scholarships] = await Promise.all([
      prisma.feeItem.findMany({ where: { studentId: id }, orderBy: { head: 'asc' } }),
      prisma.payment.findMany({ where: { studentId: id }, orderBy: { paidAt: 'desc' } }),
      prisma.instalment.findMany({ where: { studentId: id }, orderBy: { number: 'asc' } }),
      prisma.scholarshipAward.findMany({ where: { studentId: id } }),
    ]);

    const total = items.reduce((a, f) => a + f.amount, 0);
    const paid = items.reduce((a, f) => a + f.paid, 0);

    res.json({
      summary: { total, paid, due: total - paid },
      items: items.map((f) => ({
        id: f.id,
        head: f.head,
        amount: f.amount,
        paid: f.paid,
        outstanding: f.amount - f.paid,
        category: f.category,
        dueDate: f.dueDate,
      })),
      instalments: instalments.map((i) => ({
        id: i.id,
        number: i.number,
        amount: i.amount,
        dueDate: i.dueDate,
        paid: i.paidAt !== null,
        paidAt: i.paidAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        date: p.paidAt,
        head: p.head,
        amount: p.amount,
        mode: p.mode,
        txnId: p.txnId,
        receipt: p.receiptNo,
        status: p.status,
      })),
      scholarships,
    });
  }),
);

// ─── Settlement ───────────────────────────────────────────────────────────────

/**
 * Settles an instalment: records the payment, marks the instalment paid, and
 * applies the amount across outstanding fee heads — in one transaction, since
 * a partial write would leave the ledger inconsistent.
 *
 * Idempotent on `txnId`: the gateway's checkout callback and its webhook both
 * report the same payment, and whichever arrives second finds it settled.
 */
async function settleInstalment(studentId: string, instalmentId: string, mode: string, txnId: string) {
  const existing = await prisma.payment.findUnique({ where: { txnId } });
  if (existing) return { payment: existing, already: true };

  const receiptNo = `RCT/${await institutionCode()}/${new Date().getFullYear()}/${crypto.randomInt(100000, 999999)}`;

  const payment = await prisma.$transaction(async (tx) => {
    const instalment = await tx.instalment.findFirst({ where: { id: instalmentId, studentId } });
    if (!instalment) throw ApiError.notFound('Instalment not found for this student');

    // Claim the instalment atomically, so two settlements cannot both apply it.
    const claimed = await tx.instalment.updateMany({
      where: { id: instalment.id, paidAt: null },
      data: { paidAt: new Date() },
    });
    if (claimed.count === 0) throw ApiError.conflict('That instalment is already paid');

    const created = await tx.payment.create({
      data: {
        studentId,
        head: `Instalment ${instalment.number}`,
        amount: instalment.amount,
        mode,
        txnId,
        receiptNo,
        status: 'SUCCESS',
        instalmentId: instalment.id,
      },
    });

    // Oldest unpaid head first, until the instalment is exhausted.
    let remaining = instalment.amount;
    const outstanding = await tx.feeItem.findMany({
      where: { studentId, term: instalment.term },
      orderBy: { head: 'asc' },
    });
    for (const item of outstanding) {
      if (remaining <= 0) break;
      const gap = item.amount - item.paid;
      if (gap <= 0) continue;
      const apply = Math.min(gap, remaining);
      await tx.feeItem.update({ where: { id: item.id }, data: { paid: item.paid + apply } });
      remaining -= apply;
    }

    return created;
  });

  return { payment, already: false };
}

/**
 * Settles what is outstanding on one fee head — an examination fee, a mess
 * bill, a revaluation fee — that is not part of an instalment plan. Same
 * guarantees as an instalment: one transaction, idempotent on `txnId`, and
 * the amount is the ledger's, never the client's.
 */
async function settleFeeItem(studentId: string, feeItemId: string, mode: string, txnId: string, expectAmount?: number) {
  const existing = await prisma.payment.findUnique({ where: { txnId } });
  if (existing) return { payment: existing, already: true };

  const receiptNo = `RCT/${await institutionCode()}/${new Date().getFullYear()}/${crypto.randomInt(100000, 999999)}`;

  const payment = await prisma.$transaction(async (tx) => {
    const item = await tx.feeItem.findFirst({ where: { id: feeItemId, studentId } });
    if (!item) throw ApiError.notFound('Fee head not found for this student');
    const owing = item.amount - item.paid;
    if (owing <= 0) throw ApiError.conflict('Nothing is outstanding on that fee head');
    if (expectAmount !== undefined && expectAmount !== owing) throw ApiError.badRequest('The amount paid does not match what is outstanding');

    // Claim the balance atomically, so two settlements cannot both apply it.
    const claimed = await tx.feeItem.updateMany({ where: { id: item.id, paid: item.paid }, data: { paid: item.amount } });
    if (claimed.count === 0) throw ApiError.conflict('That fee head was just paid');

    return tx.payment.create({
      data: { studentId, head: item.head, amount: owing, mode, txnId, receiptNo, status: 'SUCCESS' },
    });
  });

  return { payment, already: false };
}

const present = (p: { id: string; txnId: string; receiptNo: string | null; amount: number; status: string; paidAt: Date }) => ({
  id: p.id,
  txnId: p.txnId,
  receipt: p.receiptNo,
  amount: p.amount,
  status: p.status,
  paidAt: p.paidAt,
});

/** The simulated path moves no money, so only a demo or development server may use it. */
const simulatedAllowed = () => !razorpayEnabled() && (!env.isProd || env.SEED_DEMO);

// ─── GET /api/student/fees/gateway ────────────────────────────────────────────

/** Which way this server takes fees, so a client knows whether to open Checkout. */
feesRouter.get('/gateway', (_req, res) => {
  res.json(
    razorpayEnabled()
      ? { provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID }
      : { provider: simulatedAllowed() ? 'simulated' : 'none' },
  );
});

// ─── POST /api/student/fees/pay ───────────────────────────────────────────────

/**
 * Settles an instalment with no money moving — the demo's stand-in for a
 * gateway. Refused wherever a real gateway is configured, and on any
 * production server that is not the demo, so a student cannot mark their
 * own fees paid on an institute's live system.
 */
feesRouter.post(
  '/pay',
  validate('body', z.object({
    instalmentId: z.string().min(1).optional(),
    feeItemId: z.string().min(1).optional(),
    mode: z.enum(['UPI', 'CARD', 'NETBANKING']).default('UPI'),
  }).refine((b) => Boolean(b.instalmentId) !== Boolean(b.feeItemId), { message: 'Pay either an instalment or a fee head' })),
  asyncHandler(async (req, res) => {
    if (!simulatedAllowed()) {
      throw ApiError.conflict(
        razorpayEnabled()
          ? 'Pay through the payment gateway (POST /api/student/fees/order).'
          : 'Online payment is not set up on this server. Pay at the college fee counter.',
      );
    }
    const studentId = await resolveStudentId(req);
    const { instalmentId, feeItemId, mode } = req.body as { instalmentId?: string; feeItemId?: string; mode: string };
    const txnId = `${mode}${Date.now()}${crypto.randomInt(1000, 9999)}`;
    const { payment } = instalmentId
      ? await settleInstalment(studentId, instalmentId, mode, txnId)
      : await settleFeeItem(studentId, feeItemId!, mode, txnId);
    res.status(201).json(present(payment));
  }),
);

// ─── POST /api/student/fees/order ─────────────────────────────────────────────

/**
 * Opens a Razorpay order for an instalment. The amount is the instalment's,
 * read here — never the client's — and the order carries which instalment it
 * pays, so settlement can check it against the gateway's own record.
 */
feesRouter.post(
  '/order',
  validate('body', z.object({ instalmentId: z.string().min(1).optional(), feeItemId: z.string().min(1).optional() })
    .refine((b) => Boolean(b.instalmentId) !== Boolean(b.feeItemId), { message: 'Pay either an instalment or a fee head' })),
  asyncHandler(async (req, res) => {
    if (!razorpayEnabled()) throw ApiError.conflict('No payment gateway is configured on this server');
    const studentId = await resolveStudentId(req);
    const { instalmentId, feeItemId } = req.body as { instalmentId?: string; feeItemId?: string };

    if (feeItemId) {
      const item = await prisma.feeItem.findFirst({
        where: { id: feeItemId, studentId },
        include: { student: { select: { name: true, mobile: true, enrolmentNo: true, user: { select: { email: true } } } } },
      });
      if (!item) throw ApiError.notFound('Fee head not found for this student');
      const owing = item.amount - item.paid;
      if (owing <= 0) throw ApiError.conflict('Nothing is outstanding on that fee head');
      const order = await createOrder(owing, `${item.student.enrolmentNo}-F${item.id.slice(-6)}`, { feeItemId: item.id, studentId, paidBy: req.auth!.sub });
      res.status(201).json({
        keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, description: item.head,
        prefill: { name: item.student.name, email: item.student.user.email, contact: item.student.mobile ?? '' },
      });
      return;
    }

    const instalment = await prisma.instalment.findFirst({
      where: { id: instalmentId!, studentId },
      include: { student: { select: { name: true, mobile: true, enrolmentNo: true, user: { select: { email: true } } } } },
    });
    if (!instalment) throw ApiError.notFound('Instalment not found for this student');
    if (instalment.paidAt) throw ApiError.conflict('That instalment is already paid');

    const order = await createOrder(instalment.amount, `${instalment.student.enrolmentNo}-I${instalment.number}`, {
      instalmentId: instalment.id,
      studentId,
      paidBy: req.auth!.sub,
    });

    res.status(201).json({
      keyId: env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      description: `Instalment ${instalment.number} · ${instalment.term}`,
      prefill: { name: instalment.student.name, email: instalment.student.user.email, contact: instalment.student.mobile ?? '' },
    });
  }),
);

/**
 * Settles a paid Razorpay order, after checking with Razorpay itself that the
 * payment belongs to the order, was captured, and is for the full amount of
 * the instalment the order names.
 */
async function settleRazorpay(orderId: string, paymentId: string, expectStudentId?: string) {
  const [order, payment] = await Promise.all([fetchOrder(orderId), fetchPayment(paymentId)]);
  if (payment.order_id !== order.id) throw ApiError.badRequest('That payment does not belong to that order');
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    throw new ApiError(402, `The payment is ${payment.status}, not captured`, 'payment_incomplete');
  }
  const { instalmentId, feeItemId, studentId } = order.notes ?? {};
  if ((!instalmentId && !feeItemId) || !studentId) throw ApiError.badRequest('That order is not a fee order');
  if (expectStudentId && studentId !== expectStudentId) throw ApiError.forbidden('That order is for another student');
  if (feeItemId) {
    if (payment.amount !== order.amount) throw ApiError.badRequest('The amount paid does not match the order');
    return settleFeeItem(studentId, feeItemId, `RAZORPAY_${payment.method.toUpperCase()}`, payment.id, payment.amount / 100);
  }

  const instalment = await prisma.instalment.findFirst({ where: { id: instalmentId!, studentId } });
  if (!instalment) throw ApiError.notFound('The instalment on that order no longer exists');
  if (payment.amount !== instalment.amount * 100) {
    throw ApiError.badRequest('The amount paid does not match the instalment');
  }
  return settleInstalment(studentId, instalmentId!, `RAZORPAY_${payment.method.toUpperCase()}`, payment.id);
}

// ─── POST /api/student/fees/verify ────────────────────────────────────────────

feesRouter.post(
  '/verify',
  validate('body', z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  })),
  asyncHandler(async (req: Request, res) => {
    if (!razorpayEnabled()) throw ApiError.conflict('No payment gateway is configured on this server');
    const body = req.body as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    if (!checkoutSignatureValid(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      throw ApiError.badRequest('The payment signature is not valid');
    }
    const studentId = await resolveStudentId(req);
    const { payment, already } = await settleRazorpay(body.razorpay_order_id, body.razorpay_payment_id, studentId);
    res.status(already ? 200 : 201).json(present(payment));
  }),
);

// ─── POST /api/payments/razorpay/webhook ──────────────────────────────────────

/**
 * Razorpay's server-to-server notice that a payment was captured. It settles
 * the same way the checkout callback does, so a student who closed the tab
 * after paying still gets their receipt. Mounted outside `requireAuth`.
 */
export const paymentsWebhookRouter = Router();

paymentsWebhookRouter.post(
  '/razorpay/webhook',
  asyncHandler(async (req, res) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw || !webhookSignatureValid(raw, req.header('x-razorpay-signature'))) {
      throw ApiError.unauthorized('Bad webhook signature');
    }
    const event = req.body as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string } } } };
    const entity = event.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity?.order_id) {
      try {
        await settleRazorpay(entity.order_id, entity.id);
      } catch (err) {
        // Already settled, or not a fee order: acknowledge so Razorpay stops retrying.
        if (!(err instanceof ApiError) || err.status >= 500) throw err;
        console.warn('[razorpay webhook]', err.message);
      }
    }
    res.json({ ok: true });
  }),
);
