import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { actorName } from '../hostel/shared.js';
import { OPS, READ, SENIOR, activatePaid, clock, istDate, istMinutes, minutesOf, tripBlockers } from './shared.js';

/**
 * A day's runs. The morning run goes through the stops in timetable order
 * and its delay is measured against the timetable; the evening run goes the
 * other way and has no timetable, so it records times without a delay. The
 * attendant boards students by their pass number.
 */
export const tripsRouter = Router();

type Stop = { id: string; name: string; time: string; order: number };

/** The stops in the order a shift visits them. */
export const sequence = (stops: Stop[], shift: string) => {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  return shift === 'EVENING' ? sorted.reverse() : sorted;
};

/**
 * What a trip looks like stop by stop: when it left each one, how late it
 * was, and — for the stops still ahead on a morning run — when it should
 * get there at its present delay.
 */
export function stopBoard(trip: { shift: string; status: string; lastStop: number; events: Array<{ stopOrder: number; at: Date; delayMinutes: number | null }> }, stops: Stop[]) {
  const seq = sequence(stops, trip.shift);
  const lastDelay = [...trip.events].sort((a, b) => b.at.getTime() - a.at.getTime()).find((e) => e.delayMinutes !== null)?.delayMinutes ?? 0;
  const nowMin = istMinutes(new Date());
  return seq.map((s, i) => {
    const e = trip.events.find((x) => x.stopOrder === s.order);
    const scheduled = trip.shift === 'MORNING' ? minutesOf(s.time) : null;
    const eta = !e && trip.status === 'RUNNING' && i > trip.lastStop && scheduled !== null ? clock(Math.max(nowMin, scheduled + lastDelay)) : null;
    return {
      stopId: s.id, order: s.order, name: s.name, scheduled: trip.shift === 'MORNING' ? s.time : null,
      departedAt: e?.at ?? null, delayMinutes: e?.delayMinutes ?? null, skipped: !e && i < trip.lastStop, eta,
    };
  });
}

const TRIP_INCLUDE = {
  route: { include: { stops: true, vehicle: { select: { regNo: true, capacity: true } }, driver: { select: { name: true, phone: true } }, attendant: { select: { name: true, phone: true } } } },
  events: true,
  boardings: { include: { student: { select: { id: true, name: true, enrolmentNo: true } }, pass: { select: { passNo: true, stop: { select: { name: true } } } } }, orderBy: { boardedAt: 'asc' as const } },
} as const;

tripsRouter.get(
  '/trips',
  requireRole(...READ),
  validate('query', z.object({ date: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const { date } = validQuery<{ date?: string }>(req);
    const day = date ?? istDate();
    const trips = await prisma.transportTrip.findMany({ where: { date: day }, include: TRIP_INCLUDE, orderBy: [{ route: { routeNo: 'asc' } }, { shift: 'asc' }] });
    const riders = await prisma.busPass.groupBy({ by: ['routeId'], where: { status: 'ACTIVE', validTill: { gte: new Date() } }, _count: { _all: true } });
    res.json({ date: day, trips: trips.map((t) => ({ ...t, stops: stopBoard(t, t.route.stops), riders: riders.find((r) => r.routeId === t.routeId)?._count._all ?? 0, boarded: t.boardings.length })) });
  }),
);

tripsRouter.get(
  '/trips/:id',
  requireRole(...READ),
  asyncHandler(async (req, res) => {
    const t = await prisma.transportTrip.findUnique({ where: { id: String(req.params.id) }, include: TRIP_INCLUDE });
    if (!t) throw ApiError.notFound('No such trip');
    await activatePaid({ routeId: t.routeId });
    const passes = await prisma.busPass.findMany({ where: { routeId: t.routeId, status: 'ACTIVE', validTill: { gte: new Date() } }, include: { student: { select: { id: true, name: true, enrolmentNo: true, mobile: true } }, stop: { select: { name: true, order: true } } }, orderBy: [{ stop: { order: 'asc' } }, { student: { name: 'asc' } }] });
    res.json({ ...t, stops: stopBoard(t, t.route.stops), riders: passes.map((p) => ({ passNo: p.passNo, student: p.student, stop: p.stop?.name ?? null, boarded: t.boardings.some((b) => b.studentId === p.studentId) })) });
  }),
);

tripsRouter.post(
  '/trips',
  requireRole(...OPS),
  validate('body', z.object({ routeId: z.string().min(1), shift: z.enum(['MORNING', 'EVENING']), odometerStart: z.number().int().min(0).optional(), override: z.string().trim().min(10).max(300).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { routeId: string; shift: 'MORNING' | 'EVENING'; odometerStart?: number; override?: string };
    const route = await prisma.transportRoute.findUnique({ where: { id: b.routeId }, include: { vehicle: true, driver: true } });
    if (!route || !route.active) throw ApiError.notFound('That route is not running');
    const blockers = tripBlockers(route.vehicle, route.driver);
    if (blockers.length) {
      // A bus with lapsed papers or an unlicensed driver does not carry students — unless a senior officer takes it on record.
      if (!b.override) throw ApiError.conflict(`This trip cannot start: ${blockers.join('; ')}`, { blockers });
      if (!(SENIOR as readonly string[]).includes(req.auth!.role)) throw ApiError.forbidden('Only the registrar can start a trip past these checks');
      if (!route.vehicle || !route.driver) throw ApiError.conflict('A trip needs a vehicle and a driver, whatever the override');
    }
    if (route.vehicle) {
      const busy = await prisma.transportTrip.findFirst({ where: { vehicleId: route.vehicle.id, status: 'RUNNING' }, include: { route: { select: { routeNo: true } } } });
      if (busy) throw ApiError.conflict(`${route.vehicle.regNo} is still out on route ${busy.route.routeNo}; end that trip first`);
      if (b.odometerStart !== undefined && b.odometerStart < route.vehicle.odometer) throw ApiError.badRequest(`The odometer reads at least ${route.vehicle.odometer} km`);
    }
    const by = await actorName(req);
    try {
      const t = await prisma.transportTrip.create({
        data: { routeId: route.id, date: istDate(), shift: b.shift, vehicleId: route.vehicleId, driverId: route.driverId, odometerStart: b.odometerStart ?? null, startedBy: by, note: b.override ? `Started past checks: ${b.override}` : null },
      });
      await recordFor(req, { module: 'Transport', action: 'trip start', target: `${route.routeNo} ${b.shift.toLowerCase()}`, detail: b.override ? `OVERRIDE (${blockers.join('; ')}): ${b.override}` : '', outcome: b.override ? 'WARN' : 'OK' });
      res.status(201).json(t);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') throw ApiError.conflict(`The ${b.shift.toLowerCase()} trip on route ${route.routeNo} has already run today`);
      throw err;
    }
  }),
);

async function running(id: string) {
  const t = await prisma.transportTrip.findUnique({ where: { id }, include: { route: { include: { stops: true } } } });
  if (!t) throw ApiError.notFound('No such trip');
  if (t.status !== 'RUNNING') throw ApiError.conflict(`This trip is ${t.status.toLowerCase()}`);
  return t;
}

/** The bus left a stop. Stops may be passed over (no one waiting), never gone back to. */
tripsRouter.post(
  '/trips/:id/depart',
  requireRole(...OPS),
  validate('body', z.object({ index: z.number().int().min(0) })),
  asyncHandler(async (req, res) => {
    const t = await running(String(req.params.id));
    const { index } = req.body as { index: number };
    const seq = sequence(t.route.stops, t.shift);
    if (index >= seq.length) throw ApiError.badRequest('That stop is not on this route');
    if (index <= t.lastStop) throw ApiError.conflict(`The bus has already left ${seq[t.lastStop]!.name}`);
    const stop = seq[index]!;
    const now = new Date();
    const scheduled = t.shift === 'MORNING' ? minutesOf(stop.time) : null;
    const delay = scheduled === null ? null : istMinutes(now) - scheduled;
    await prisma.$transaction([
      prisma.tripStopEvent.create({ data: { tripId: t.id, stopOrder: stop.order, stopName: stop.name, at: now, delayMinutes: delay } }),
      prisma.transportTrip.update({ where: { id: t.id }, data: { lastStop: index } }),
    ]);
    res.json({ stop: stop.name, at: now, delayMinutes: delay });
  }),
);

tripsRouter.post(
  '/trips/:id/board',
  requireRole(...OPS),
  validate('body', z.object({ passNo: z.string().trim().min(3).max(40) })),
  asyncHandler(async (req, res) => {
    const t = await running(String(req.params.id));
    const passNo = (req.body as { passNo: string }).passNo.toUpperCase();
    await activatePaid({ passNo });
    const p = await prisma.busPass.findUnique({ where: { passNo }, include: { student: { select: { id: true, name: true } }, route: { select: { routeNo: true } } } });
    if (!p) throw ApiError.notFound('No pass with that number');
    if (p.status === 'CANCELLED') throw ApiError.conflict(`${p.student.name}'s pass is cancelled`);
    if (p.status === 'PENDING_PAYMENT') throw ApiError.conflict(`${p.student.name}'s transport fee is unpaid`);
    if (p.validTill < new Date()) throw ApiError.conflict(`${p.student.name}'s pass expired on ${p.validTill.toISOString().slice(0, 10)}`);
    if (p.routeId !== t.routeId) throw ApiError.conflict(`${p.student.name} travels on route ${p.route.routeNo}, not this one`);
    try {
      const b = await prisma.tripBoarding.create({ data: { tripId: t.id, studentId: p.studentId, passId: p.id, by: await actorName(req) } });
      res.status(201).json({ student: p.student.name, boardedAt: b.boardedAt });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') throw ApiError.conflict(`${p.student.name} is already on board`);
      throw err;
    }
  }),
);

tripsRouter.post(
  '/trips/:id/end',
  requireRole(...OPS),
  validate('body', z.object({ odometerEnd: z.number().int().min(0).optional() })),
  asyncHandler(async (req, res) => {
    const t = await running(String(req.params.id));
    const { odometerEnd } = req.body as { odometerEnd?: number };
    if (odometerEnd !== undefined && t.odometerStart !== null && odometerEnd < t.odometerStart) throw ApiError.badRequest(`The trip started at ${t.odometerStart} km`);
    await prisma.$transaction(async (tx) => {
      await tx.transportTrip.update({ where: { id: t.id }, data: { status: 'COMPLETED', endedAt: new Date(), odometerEnd: odometerEnd ?? null } });
      if (odometerEnd !== undefined && t.vehicleId) {
        const v = await tx.vehicle.findUnique({ where: { id: t.vehicleId }, select: { odometer: true } });
        if (v && odometerEnd > v.odometer) await tx.vehicle.update({ where: { id: t.vehicleId }, data: { odometer: odometerEnd } });
      }
    });
    await recordFor(req, { module: 'Transport', action: 'trip end', target: `${t.route.routeNo} ${t.shift.toLowerCase()}`, detail: odometerEnd !== undefined && t.odometerStart !== null ? `${odometerEnd - t.odometerStart} km` : '' });
    res.json({ status: 'COMPLETED' });
  }),
);

tripsRouter.post(
  '/trips/:id/cancel',
  requireRole(...OPS),
  validate('body', z.object({ reason: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const t = await running(String(req.params.id));
    const { reason } = req.body as { reason: string };
    const riders = await prisma.busPass.findMany({ where: { routeId: t.routeId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, select: { studentId: true } });
    await prisma.$transaction([
      prisma.transportTrip.update({ where: { id: t.id }, data: { status: 'CANCELLED', endedAt: new Date(), note: reason } }),
      prisma.notification.createMany({ data: riders.map((r) => ({ studentId: r.studentId, kind: 'GENERAL' as const, urgent: true, title: `Bus ${t.route.routeNo} ${t.shift.toLowerCase()} trip cancelled`, body: reason, href: '/bus-track' })) }),
    ]);
    await recordFor(req, { module: 'Transport', action: 'trip cancel', target: `${t.route.routeNo} ${t.shift.toLowerCase()}`, detail: reason, outcome: 'WARN' });
    res.json({ status: 'CANCELLED', alerted: riders.length });
  }),
);
