import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/http.js';
import { feeHeadFor, nextNo, seatHolding, termEnd } from './shared.js';

/**
 * Putting a student on a route at a stop for a term. One pass per student:
 * a new term or a move re-points the same pass. The seat is held at once;
 * the pass becomes valid when its fee is paid (at once if there is none).
 * A move within a term charges only the difference when the new stop costs more.
 */
export async function issuePass(tx: Prisma.TransactionClient, input: { studentId: string; routeId: string; stopId: string; term: string; by: string; waiveFee?: boolean }) {
  const [student, route, stop, existing] = await Promise.all([
    tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true, status: true, enrolmentNo: true } }),
    tx.transportRoute.findUnique({ where: { id: input.routeId }, include: { vehicle: { select: { capacity: true, regNo: true } } } }),
    tx.routeStop.findUnique({ where: { id: input.stopId } }),
    tx.busPass.findUnique({ where: { studentId: input.studentId } }),
  ]);
  if (!student) throw ApiError.notFound('No such student');
  if (student.status !== 'ACTIVE') throw ApiError.conflict(`${student.name} is not on the rolls`);
  if (!route || !route.active) throw ApiError.conflict('That route is not running');
  if (!stop || stop.routeId !== route.id) throw ApiError.badRequest('That stop is not on this route');
  if (!route.vehicle) throw ApiError.conflict(`Route ${route.routeNo} has no vehicle assigned, so it has no seats yet`);

  const sameRoute = existing && existing.routeId === route.id && ['ACTIVE', 'PENDING_PAYMENT'].includes(existing.status) && existing.validTill >= new Date();
  if (!sameRoute) {
    const taken = await tx.busPass.count({ where: { ...seatHolding(route.id), ...(existing ? { id: { not: existing.id } } : {}) } });
    if (taken >= route.vehicle.capacity) throw ApiError.conflict(`Route ${route.routeNo} is full (${taken} of ${route.vehicle.capacity} seats)`);
  }

  const sameTerm = existing && existing.term === input.term && ['ACTIVE', 'PENDING_PAYMENT'].includes(existing.status);
  const fare = input.waiveFee ? 0 : stop.fare;
  const head = feeHeadFor(input.term, route.routeNo, stop.name);
  let charge = fare;
  if (sameTerm && existing.status === 'ACTIVE') charge = Math.max(0, fare - existing.fee);
  if (sameTerm && existing.status === 'PENDING_PAYMENT' && existing.feeHead) {
    // An unpaid charge for the old stop is replaced, not stacked.
    const old = await tx.feeItem.findFirst({ where: { studentId: student.id, head: existing.feeHead } });
    if (old && old.paid === 0) await tx.feeItem.delete({ where: { id: old.id } });
  }
  const chargedHead = sameTerm && existing.status === 'ACTIVE' && charge > 0 ? `Transport fare difference — ${input.term} (${route.routeNo} / ${stop.name})` : head;
  if (charge > 0) {
    const dup = await tx.feeItem.findFirst({ where: { studentId: student.id, head: chargedHead }, select: { id: true } });
    if (!dup) await tx.feeItem.create({ data: { studentId: student.id, head: chargedHead, amount: charge, category: 'OTHER', term: input.term, dueDate: new Date(Date.now() + 15 * 86_400_000) } });
  }

  const status = charge > 0 ? 'PENDING_PAYMENT' as const : 'ACTIVE' as const;
  const data = {
    routeId: route.id, stopId: stop.id, term: input.term, fee: sameTerm && existing.status === 'ACTIVE' ? Math.max(existing.fee, fare) : fare,
    feeHead: charge > 0 ? chargedHead : (sameTerm ? existing.feeHead : null), status, valid: status === 'ACTIVE', validTill: termEnd(input.term), issuedBy: input.by, issuedAt: new Date(), cancelledReason: null,
  };
  const pass = existing
    ? await tx.busPass.update({ where: { id: existing.id }, data })
    : await tx.busPass.create({ data: { ...data, studentId: student.id, passNo: await nextNo((p) => tx.busPass.findMany({ where: { passNo: { startsWith: p } }, select: { passNo: true } }), 'passNo', `BP/${new Date().getFullYear()}/`) } });

  await tx.notification.create({
    data: {
      studentId: student.id, kind: charge > 0 ? 'FEE' : 'GENERAL',
      title: charge > 0 ? `Bus pass ${pass.passNo}: pay ₹${charge.toLocaleString('en-IN')} to activate` : `Bus pass ${pass.passNo} is active`,
      body: `Route ${route.routeNo}, boarding at ${stop.name}, for ${input.term}.${charge > 0 ? ' The fee is on your fee account; the pass activates as soon as it is paid.' : ''}`,
      href: charge > 0 ? '/fees' : '/bus-track',
    },
  });
  return { pass, charge, route, stop, student };
}
