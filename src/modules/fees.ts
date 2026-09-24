import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth, resolveStudentId } from '../auth/middleware.js';

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

// ─── POST /api/student/fees/pay ───────────────────────────────────────────────

/**
 * Records a payment against an instalment.
 *
 * This stands in for a payment-gateway callback: a real integration would
 * create the row as PENDING, redirect to the gateway, and settle it on the
 * webhook. The money movement itself is not simulated here.
 */
feesRouter.post(
  '/pay',
  validate('body', z.object({
    instalmentId: z.string().min(1),
    mode: z.enum(['UPI', 'CARD', 'NETBANKING', 'COUNTER']).default('UPI'),
  })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const { instalmentId, mode } = req.body as { instalmentId: string; mode: string };

    const instalment = await prisma.instalment.findFirst({
      where: { id: instalmentId, studentId },
    });

    if (!instalment) throw ApiError.notFound('Instalment not found for this student');
    if (instalment.paidAt) throw ApiError.conflict('That instalment is already paid');

    const stamp = new Date();
    const txnId = `${mode}${stamp.getTime()}${crypto.randomInt(1000, 9999)}`;
    const receiptNo = `RCT/JU/${stamp.getFullYear()}/${crypto.randomInt(100000, 999999)}`;

    // Settle the instalment, record the payment, and apply the amount across
    // outstanding fee heads in one transaction — a partial write here would
    // leave the ledger inconsistent.
    const payment = await prisma.$transaction(async (tx) => {
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

      await tx.instalment.update({
        where: { id: instalment.id },
        data: { paidAt: stamp },
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
        await tx.feeItem.update({
          where: { id: item.id },
          data: { paid: item.paid + apply },
        });
        remaining -= apply;
      }

      return created;
    });

    res.status(201).json({
      id: payment.id,
      txnId: payment.txnId,
      receipt: payment.receiptNo,
      amount: payment.amount,
      status: payment.status,
      paidAt: payment.paidAt,
    });
  }),
);
