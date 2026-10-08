import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { institutionCode } from '../institution.js';
import { nextInSeries } from '../office/shared.js';

/**
 * The fee ledger's rules, in one place: how money received is spread over
 * what is owed, how a receipt is reversed, how receipt numbers run, and the
 * statement a student, a parent or the accounts office reads.
 *
 * Every rupee received or credited is allocated to a fee head and the
 * allocation is recorded, so a cancelled receipt reverses exactly what it
 * paid and a statement can say what each payment settled.
 */

type Tx = Prisma.TransactionClient;

/** Owed heads, oldest due first (heads with no due date last), then by name. */
export async function owing(tx: Tx, studentId: string, opts: { term?: string; feeItemId?: string } = {}) {
  const items = await tx.feeItem.findMany({
    where: { studentId, ...(opts.term ? { term: opts.term } : {}), ...(opts.feeItemId ? { id: opts.feeItemId } : {}) },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { head: 'asc' }],
  });
  return items.filter((i) => i.amount - i.paid > 0);
}

/**
 * Spreads an amount over what is owed and records each share against the
 * payment. Returns what was applied and what was left over (an advance).
 */
export async function allocate(tx: Tx, paymentId: string, studentId: string, amount: number, opts: { term?: string; feeItemId?: string } = {}) {
  let remaining = amount;
  const applied: Array<{ feeItemId: string; head: string; amount: number }> = [];
  for (const item of await owing(tx, studentId, opts)) {
    if (remaining <= 0) break;
    const add = Math.min(item.amount - item.paid, remaining);
    // Guarded on the paid figure read, so two settlements cannot both apply the same balance.
    const r = await tx.feeItem.updateMany({ where: { id: item.id, paid: item.paid }, data: { paid: item.paid + add } });
    if (r.count === 0) throw new Error('The fee account changed while this payment was being applied; try again');
    await tx.feeAllocation.create({ data: { paymentId, feeItemId: item.id, amount: add } });
    applied.push({ feeItemId: item.id, head: item.head, amount: add });
    remaining -= add;
  }
  return { applied, unallocated: remaining };
}

/** Undoes a payment's allocations: the heads it paid are owed again. */
export async function reverse(tx: Tx, paymentId: string) {
  const rows = await tx.feeAllocation.findMany({ where: { paymentId } });
  for (const r of rows) await tx.feeItem.update({ where: { id: r.feeItemId }, data: { paid: { decrement: r.amount } } });
  await tx.feeAllocation.deleteMany({ where: { paymentId } });
  return rows.reduce((t, r) => t + r.amount, 0);
}

/** The next number in a ledger series: RCT/CODE/2026/000001, CON/…, RF/…. */
export async function nextNumber(series: 'RCT' | 'CON' | 'RF', tx: Tx | typeof prisma = prisma) {
  const prefix = `${series}/${await institutionCode()}/${new Date().getFullYear()}/`;
  const rows = series === 'RF'
    ? (await tx.feeRefund.findMany({ where: { refundNo: { startsWith: prefix } }, select: { refundNo: true } })).map((r) => r.refundNo)
    : series === 'CON'
      ? (await tx.feeConcession.findMany({ where: { concessionNo: { startsWith: prefix } }, select: { concessionNo: true } })).map((r) => r.concessionNo)
      : (await tx.payment.findMany({ where: { receiptNo: { startsWith: prefix } }, select: { receiptNo: true } })).map((r) => r.receiptNo ?? '');
  return nextInSeries(prefix, rows);
}

/** Retries a write that takes the next number in a series, should two clerks take the same one. */
export async function withSeries<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'P2002' || i >= tries - 1) throw e;
    }
  }
}

/** Money received, as opposed to a concession credited or a refund paid out. */
export const isReceipt = (p: { kind: string }) => p.kind === 'RECEIPT';

/**
 * A student's fee statement: every charge and every ledger entry in date
 * order with a running balance, and each receipt with the heads it paid.
 */
export async function statement(studentId: string) {
  const [student, items, payments] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { name: true, enrolmentNo: true, rollNo: true, semester: true, programme: { select: { name: true, shortName: true } } } }),
    prisma.feeItem.findMany({ where: { studentId }, orderBy: [{ term: 'asc' }, { head: 'asc' }] }),
    prisma.payment.findMany({ where: { studentId }, include: { allocations: { include: { feeItem: { select: { head: true } } } }, receipt: { select: { receiptNo: true, instrument: true, receivedBy: { select: { name: true } } } } }, orderBy: { paidAt: 'asc' } }),
  ]);
  type Line = { date: string; kind: 'CHARGE' | 'RECEIPT' | 'CONCESSION' | 'REFUND' | 'CANCELLED'; ref: string; particulars: string; debit: number; credit: number };
  const lines: Line[] = [];
  for (const i of items) lines.push({ date: (i.dueDate ?? new Date(0)).toISOString(), kind: 'CHARGE', ref: i.term, particulars: i.head, debit: i.amount, credit: 0 });
  for (const p of payments) {
    if (p.status === 'FAILED' || p.status === 'PENDING') continue;
    if (p.status === 'CANCELLED') { lines.push({ date: p.paidAt.toISOString(), kind: 'CANCELLED', ref: p.receiptNo ?? p.txnId, particulars: `${p.head} — cancelled${p.cancelReason ? `: ${p.cancelReason}` : ''}`, debit: 0, credit: 0 }); continue; }
    // A refund gives back money received: it reopens what the receipt had credited.
    if (p.kind === 'REFUND') lines.push({ date: p.paidAt.toISOString(), kind: 'REFUND', ref: p.receiptNo ?? p.txnId, particulars: p.head, debit: Math.abs(p.amount), credit: 0 });
    else if (p.amount < 0) lines.push({ date: p.paidAt.toISOString(), kind: 'CONCESSION', ref: p.receiptNo ?? p.txnId, particulars: p.head, debit: 0, credit: 0 });
    else lines.push({ date: p.paidAt.toISOString(), kind: p.kind === 'CONCESSION' ? 'CONCESSION' : 'RECEIPT', ref: p.receiptNo ?? p.txnId, particulars: `${p.head} (${p.mode})`, debit: 0, credit: p.amount });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'CHARGE' ? -1 : 1));
  const charged = items.reduce((t, i) => t + i.amount, 0);
  const paid = items.reduce((t, i) => t + i.paid, 0);
  // Settlements made before receipts were itemised (or imported balances) show as one honest line, so the
  // statement closes on what the fee heads actually say is owed.
  const drift = lines.reduce((t, l) => t + l.debit - l.credit, 0) - (charged - paid);
  if (drift !== 0) lines.push({ date: new Date().toISOString(), kind: drift > 0 ? 'RECEIPT' : 'CHARGE', ref: 'B/F', particulars: drift > 0 ? 'Settled earlier — before itemised receipts were kept' : 'Adjustment brought forward', debit: drift < 0 ? -drift : 0, credit: drift > 0 ? drift : 0 });
  let balance = 0;
  const withBalance = lines.map((l) => { balance += l.debit - l.credit; return { ...l, balance }; });
  return {
    student,
    totals: { charged, paid, due: charged - paid },
    lines: withBalance,
    receipts: payments.filter((p) => p.status !== 'FAILED').map((p) => ({
      id: p.id, receiptNo: p.receiptNo, txnId: p.txnId, date: p.paidAt, amount: p.amount, mode: p.mode, kind: p.kind, status: p.status, head: p.head,
      instrument: p.receipt?.instrument ?? null, receivedBy: p.receipt?.receivedBy.name ?? (p.kind === 'RECEIPT' && !p.receipt ? 'Online' : null),
      cancelledAt: p.cancelledAt, cancelReason: p.cancelReason,
      appliedTo: p.allocations.map((a) => ({ head: a.feeItem.head, amount: a.amount })),
    })).reverse(),
  };
}
