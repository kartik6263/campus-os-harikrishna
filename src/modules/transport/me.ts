import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireRole, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import { activatePaid, istDate, nextNo, seatHolding } from './shared.js';
import { stopBoard } from './trips.js';

/**
 * A student's own transport (/api/transport/me), and their parent's view:
 * the pass and its fee, the route and crew, today's run stop by stop with
 * real times, whether they boarded, and requests for a pass or a move.
 */
export const meRouter = Router();

/** Today's run of a route — the one under way, else the latest — with its stop board. */
export async function liveFor(routeId: string, studentId?: string) {
  const trips = await prisma.transportTrip.findMany({
    where: { routeId, date: istDate() },
    include: { route: { include: { stops: true } }, events: true, boardings: studentId ? { where: { studentId }, select: { boardedAt: true } } : false },
    orderBy: { startedAt: 'desc' },
  });
  const t = trips.find((x) => x.status === 'RUNNING') ?? trips[0];
  if (!t) return null;
  const last = [...t.events].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  return {
    tripId: t.id, shift: t.shift, status: t.status, startedAt: t.startedAt, endedAt: t.endedAt, note: t.note,
    lastStop: t.lastStop, lastUpdated: last?.at ?? t.startedAt,
    delayMinutes: last?.delayMinutes ?? null,
    stops: stopBoard(t, t.route.stops),
    boardedAt: studentId ? (t.boardings as Array<{ boardedAt: Date }>)[0]?.boardedAt ?? null : null,
  };
}

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    await activatePaid({ studentId });
    const [student, pass, requests, routes, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { name: true, status: true } }),
      prisma.busPass.findUnique({
        where: { studentId },
        include: {
          stop: true,
          route: { include: { stops: { orderBy: { order: 'asc' } }, vehicle: { select: { regNo: true, kind: true, make: true } }, driver: { select: { name: true, phone: true } }, attendant: { select: { name: true, phone: true } } } },
        },
      }),
      prisma.transportRequest.findMany({ where: { studentId }, include: { route: { select: { routeNo: true, name: true } }, stop: { select: { name: true, fare: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.transportRoute.findMany({ where: { active: true, vehicleId: { not: null } }, include: { stops: { orderBy: { order: 'asc' } }, vehicle: { select: { capacity: true } } }, orderBy: { routeNo: 'asc' } }),
      currentTerm(),
    ]);
    if (!student) throw ApiError.notFound('Student record not found');
    const taken = await prisma.busPass.groupBy({ by: ['routeId'], where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, _count: { _all: true } });
    const fee = pass?.feeHead ? await prisma.feeItem.findFirst({ where: { studentId, head: pass.feeHead }, select: { amount: true, paid: true, dueDate: true } }) : null;
    const now = new Date();
    const state = !pass ? null : pass.status === 'CANCELLED' ? 'CANCELLED' : pass.validTill < now ? 'EXPIRED' : pass.status;
    const boardings = pass ? await prisma.tripBoarding.findMany({ where: { studentId }, orderBy: { boardedAt: 'desc' }, take: 10, include: { trip: { select: { date: true, shift: true } } } }) : [];
    res.json({
      student: { name: student.name, onRolls: student.status === 'ACTIVE' },
      term,
      pass: pass && {
        id: pass.id, passNo: pass.passNo, status: pass.status, state, term: pass.term, validTill: pass.validTill, issuedAt: pass.issuedAt, cancelledReason: pass.cancelledReason,
        fee: pass.fee, feeDue: fee ? Math.max(0, fee.amount - fee.paid) : 0, feeDueDate: fee?.dueDate ?? null,
        stop: pass.stop ? { id: pass.stop.id, name: pass.stop.name, time: pass.stop.time } : null,
        route: {
          id: pass.route.id, routeNo: pass.route.routeNo, name: pass.route.name, active: pass.route.active,
          vehicle: pass.route.vehicle, driver: pass.route.driver, attendant: pass.route.attendant,
          stops: pass.route.stops.map((s) => ({ id: s.id, name: s.name, time: s.time, order: s.order })),
        },
      },
      live: pass && state === 'ACTIVE' ? await liveFor(pass.routeId, studentId) : null,
      boardings: boardings.map((b) => ({ date: b.trip.date, shift: b.trip.shift, at: b.boardedAt })),
      requests,
      routes: routes.map((r) => ({
        id: r.id, routeNo: r.routeNo, name: r.name,
        seatsLeft: Math.max(0, r.vehicle!.capacity - (taken.find((x) => x.routeId === r.id)?._count._all ?? 0)),
        stops: r.stops.map((s) => ({ id: s.id, name: s.name, time: s.time, fare: s.fare })),
      })),
    });
  }),
);

meRouter.post(
  '/requests',
  requireRole('STUDENT'),
  validate('body', z.object({ routeId: z.string().min(1), stopId: z.string().min(1), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { routeId: string; stopId: string; note?: string };
    const [student, stop, pass, open, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { status: true, enrolmentNo: true } }),
      prisma.routeStop.findUnique({ where: { id: b.stopId }, include: { route: { include: { vehicle: { select: { capacity: true } } } } } }),
      prisma.busPass.findUnique({ where: { studentId } }),
      prisma.transportRequest.findFirst({ where: { studentId, status: 'PENDING' }, select: { requestNo: true } }),
      currentTerm(),
    ]);
    if (!student || student.status !== 'ACTIVE') throw ApiError.conflict('Only students on the rolls can apply for a bus pass');
    if (open) throw ApiError.conflict(`Request ${open.requestNo} is still with the transport desk`);
    if (!stop || stop.routeId !== b.routeId) throw ApiError.badRequest('That stop is not on this route');
    if (!stop.route.active || !stop.route.vehicle) throw ApiError.conflict('That route is not taking riders');
    const live = pass && ['ACTIVE', 'PENDING_PAYMENT'].includes(pass.status) && pass.validTill >= new Date() && pass.term === term;
    if (live && pass.routeId === b.routeId && pass.stopId === b.stopId) throw ApiError.conflict('You already have this route and stop');
    const sameRoute = live && pass.routeId === b.routeId;
    if (!sameRoute) {
      const taken = await prisma.busPass.count({ where: { ...seatHolding(b.routeId), ...(pass ? { id: { not: pass.id } } : {}) } });
      if (taken >= stop.route.vehicle.capacity) throw ApiError.conflict(`Route ${stop.route.routeNo} is full; ask the transport desk to waitlist you`);
    }
    const year = new Date().getFullYear();
    const r = await prisma.transportRequest.create({
      data: {
        requestNo: await nextNo((p) => prisma.transportRequest.findMany({ where: { requestNo: { startsWith: p } }, select: { requestNo: true } }), 'requestNo', `TR/${year}/`, 5),
        studentId, routeId: b.routeId, stopId: b.stopId, term, kind: live ? 'CHANGE' : 'NEW', note: b.note ?? null,
      },
    });
    await recordFor(req, { module: 'Transport', action: 'pass request', target: student.enrolmentNo, detail: `${r.requestNo}: ${stop.route.routeNo} / ${stop.name}` });
    res.status(201).json(r);
  }),
);

meRouter.post(
  '/requests/:id/cancel',
  requireRole('STUDENT'),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const r = await prisma.transportRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!r || r.studentId !== studentId) throw ApiError.notFound('No such request');
    if (r.status !== 'PENDING') throw ApiError.conflict('Only a pending request can be withdrawn');
    res.json(await prisma.transportRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: 'Withdrawn by the student' } }));
  }),
);

/**
 * The older single-route shape the mobile app's bus tracker reads
 * (GET /api/student/transport), now filled from the pass and today's trip.
 */
export async function legacyTransport(studentId: string) {
  await activatePaid({ studentId });
  const pass = await prisma.busPass.findUnique({
    where: { studentId },
    include: { route: { include: { stops: { orderBy: { order: 'asc' } }, vehicle: { select: { regNo: true } }, driver: { select: { name: true, phone: true } } } } },
  });
  if (!pass) return null;
  const live = await liveFor(pass.routeId);
  // The tracker counts stops in timetable order; an evening run is mapped back onto it.
  const lastOrder = live && live.lastStop >= 0 ? live.stops[live.lastStop]!.order : 0;
  return {
    routeNo: pass.route.routeNo,
    name: pass.route.name,
    busNo: pass.route.vehicle?.regNo ?? 'Not assigned',
    driver: pass.route.driver?.name ?? 'Not assigned',
    driverPhone: pass.route.driver?.phone ?? '',
    currentStop: lastOrder,
    lastUpdated: live?.lastUpdated ?? pass.route.updatedAt,
    passValid: pass.status === 'ACTIVE' && pass.validTill >= new Date(),
    passDue: pass.validTill,
    stops: pass.route.stops.map((s) => ({ name: s.name, time: s.time })),
    passNo: pass.passNo,
    passStatus: pass.status,
    live: live && { shift: live.shift, status: live.status, delayMinutes: live.delayMinutes, stops: live.stops },
  };
}
