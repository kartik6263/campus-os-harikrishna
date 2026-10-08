import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import { actorName } from '../hostel/shared.js';
import { issuePass } from './passes.js';
import { OPS, READ, SENIOR, activatePaid, minutesOf, nextNo, paperState, seatHolding, tripBlockers } from './shared.js';
import { tripsRouter } from './trips.js';
import { meRouter } from './me.js';

/**
 * Transport management (/api/transport): the fleet and its papers, drivers
 * and attendants, routes with stop-wise fares, passes tied to the fee
 * ledger, students' requests, daily trips with stop times and boarding,
 * incidents, fuel and maintenance, and alerts to riders.
 *
 * The college office runs the transport desk; the registrar and
 * administrator also remove records. Students and parents use /me.
 */
export const transportRouter = Router();
transportRouter.use(requireAuth);
transportRouter.use('/me', meRouter);
transportRouter.use(tripsRouter);

const date = z.string().date();
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T23:59:59+05:30`) : null);
const phone = z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid phone number');

// ─── Overview ─────────────────────────────────────────────────────────────────

transportRouter.get(
  '/overview',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    await activatePaid();
    const [routes, vehicles, crew, pendingRequests, unpaid, incidents, today] = await Promise.all([
      prisma.transportRoute.findMany({ include: { vehicle: true, driver: true, stops: { orderBy: { order: 'asc' } } }, orderBy: { routeNo: 'asc' } }),
      prisma.vehicle.findMany({ where: { status: { not: 'RETIRED' } }, orderBy: { regNo: 'asc' } }),
      prisma.transportCrew.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.transportRequest.count({ where: { status: 'PENDING' } }),
      prisma.busPass.count({ where: { status: 'PENDING_PAYMENT' } }),
      prisma.transportIncident.count({ where: { status: 'OPEN' } }),
      prisma.transportTrip.findMany({ where: { date: new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10) }, select: { routeId: true, shift: true, status: true, lastStop: true } }),
    ]);
    const riders = await prisma.busPass.groupBy({ by: ['routeId'], where: { status: 'ACTIVE', validTill: { gte: new Date() } }, _count: { _all: true } });
    const holding = await prisma.busPass.groupBy({ by: ['routeId'], where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, _count: { _all: true } });
    const compliance = [
      ...vehicles.flatMap((v) => paperState(v).filter((p) => p.state !== 'ok').map((p) => ({ what: `${v.regNo} — ${p.name}`, state: p.state, till: p.till }))),
      ...crew.filter((c) => c.role === 'DRIVER').flatMap((c) => {
        const soon = new Date(Date.now() + 30 * 86_400_000);
        const state = !c.licenceValidTill ? 'missing' : c.licenceValidTill < new Date() ? 'expired' : c.licenceValidTill < soon ? 'expiring' : null;
        return state ? [{ what: `${c.name} — driving licence`, state, till: c.licenceValidTill }] : [];
      }),
      ...crew.filter((c) => !c.verifiedOn).map((c) => ({ what: `${c.name} — police verification`, state: 'missing' as const, till: null })),
    ];
    res.json({
      totals: {
        routes: routes.filter((r) => r.active).length,
        vehicles: vehicles.length,
        seats: routes.filter((r) => r.active && r.vehicle).reduce((t, r) => t + r.vehicle!.capacity, 0),
        riders: riders.reduce((t, r) => t + r._count._all, 0),
        pendingRequests, unpaid, openIncidents: incidents,
        tripsRunning: today.filter((t) => t.status === 'RUNNING').length,
        complianceIssues: compliance.filter((c) => c.state !== 'expiring').length,
      },
      compliance,
      routes: routes.map((r) => ({
        id: r.id, routeNo: r.routeNo, name: r.name, active: r.active,
        vehicle: r.vehicle ? { regNo: r.vehicle.regNo, capacity: r.vehicle.capacity } : null,
        driver: r.driver ? { name: r.driver.name, phone: r.driver.phone } : null,
        stops: r.stops.length, first: r.stops[0]?.time ?? null,
        riders: riders.find((x) => x.routeId === r.id)?._count._all ?? 0,
        seatsTaken: holding.find((x) => x.routeId === r.id)?._count._all ?? 0,
        today: today.filter((t) => t.routeId === r.id).map((t) => ({ shift: t.shift, status: t.status, lastStop: t.lastStop })),
        blockers: r.active ? tripBlockers(r.vehicle, r.driver) : [],
      })),
    });
  }),
);

// ─── Vehicles ─────────────────────────────────────────────────────────────────

const vehicleBody = z.object({
  regNo: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{1,4}$/, 'Registration looks like MP07-GC-4892'),
  kind: z.enum(['BUS', 'MINIBUS', 'VAN']),
  make: z.string().trim().max(80).nullable().optional(),
  capacity: z.number().int().min(4).max(90),
  ownership: z.enum(['OWNED', 'HIRED']),
  operator: z.string().trim().max(120).nullable().optional(),
  fitnessValidTill: date.nullable().optional(),
  insuranceValidTill: date.nullable().optional(),
  permitValidTill: date.nullable().optional(),
  pucValidTill: date.nullable().optional(),
  gpsDeviceId: z.string().trim().max(60).nullable().optional(),
  odometer: z.number().int().min(0).max(5_000_000).optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']).optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
const vehicleData = (b: Partial<z.infer<typeof vehicleBody>>) => ({
  ...b,
  ...(b.fitnessValidTill !== undefined ? { fitnessValidTill: toDate(b.fitnessValidTill) } : {}),
  ...(b.insuranceValidTill !== undefined ? { insuranceValidTill: toDate(b.insuranceValidTill) } : {}),
  ...(b.permitValidTill !== undefined ? { permitValidTill: toDate(b.permitValidTill) } : {}),
  ...(b.pucValidTill !== undefined ? { pucValidTill: toDate(b.pucValidTill) } : {}),
});

transportRouter.get(
  '/vehicles',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.vehicle.findMany({ include: { routes: { select: { routeNo: true } }, logs: { orderBy: { date: 'desc' }, take: 1, select: { date: true, kind: true } } }, orderBy: [{ status: 'asc' }, { regNo: 'asc' }] });
    res.json(rows.map((v) => ({ ...v, routes: v.routes.map((r) => r.routeNo), lastLog: v.logs[0] ?? null, papers: paperState(v) })));
  }),
);

transportRouter.post(
  '/vehicles',
  requireRole(...OPS),
  validate('body', vehicleBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof vehicleBody>;
    const regNo = b.regNo.replace(/\s+/g, '-');
    if (await prisma.vehicle.findUnique({ where: { regNo }, select: { id: true } })) throw ApiError.conflict(`${regNo} is already in the fleet`);
    const v = await prisma.vehicle.create({ data: { ...vehicleData(b), regNo } as Prisma.VehicleUncheckedCreateInput });
    await recordFor(req, { module: 'Transport', action: 'add vehicle', target: v.regNo, detail: `${v.kind}, ${v.capacity} seats` });
    res.status(201).json(v);
  }),
);

transportRouter.patch(
  '/vehicles/:id',
  requireRole(...OPS),
  validate('body', vehicleBody.omit({ regNo: true }).partial()),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const v = await prisma.vehicle.findUnique({ where: { id }, include: { routes: { where: { active: true }, select: { id: true, routeNo: true } } } });
    if (!v) throw ApiError.notFound('No such vehicle');
    const b = req.body as Partial<z.infer<typeof vehicleBody>>;
    if (b.capacity !== undefined) {
      for (const r of v.routes) {
        const taken = await prisma.busPass.count({ where: seatHolding(r.id) });
        if (taken > b.capacity) throw ApiError.conflict(`Route ${r.routeNo} has ${taken} passes; ${b.capacity} seats would not hold them`);
      }
    }
    if (b.status === 'RETIRED' && v.routes.length) throw ApiError.conflict(`Assign another vehicle to ${v.routes.map((r) => r.routeNo).join(', ')} before retiring ${v.regNo}`);
    if (b.odometer !== undefined && b.odometer < v.odometer) throw ApiError.badRequest(`The odometer cannot go back (it reads ${v.odometer} km)`);
    const u = await prisma.vehicle.update({ where: { id }, data: vehicleData(b) as Prisma.VehicleUncheckedUpdateInput });
    await recordFor(req, { module: 'Transport', action: 'edit vehicle', target: v.regNo, detail: Object.keys(b).join(', ') });
    res.json(u);
  }),
);

// ─── Vehicle logs: fuel, service, repairs ─────────────────────────────────────

transportRouter.get(
  '/vehicles/:id/logs',
  requireRole(...READ),
  asyncHandler(async (req, res) => {
    const logs = await prisma.vehicleLog.findMany({ where: { vehicleId: String(req.params.id) }, orderBy: { date: 'desc' }, take: 200 });
    // Mileage between consecutive fills, from the odometer readings.
    const fuel = logs.filter((l) => l.kind === 'FUEL' && l.odometer && l.litres);
    const mileage = fuel.slice(0, -1).map((l, i) => ({ id: l.id, kmpl: Number((((l.odometer! - fuel[i + 1]!.odometer!) / l.litres!)).toFixed(2)) })).filter((m) => m.kmpl > 0);
    res.json({ logs: logs.map((l) => ({ ...l, kmpl: mileage.find((m) => m.id === l.id)?.kmpl ?? null })), spend: logs.reduce((t, l) => t + l.cost, 0) });
  }),
);

transportRouter.post(
  '/vehicles/:id/logs',
  requireRole(...OPS),
  validate('body', z.object({
    kind: z.enum(['FUEL', 'SERVICE', 'REPAIR', 'INSPECTION', 'TYRE']),
    date, odometer: z.number().int().min(0).max(5_000_000).optional(), litres: z.number().positive().max(1000).optional(),
    cost: z.number().int().min(0).max(10_000_000), vendor: z.string().trim().max(120).optional(), notes: z.string().trim().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const b = req.body as { kind: string; date: string; odometer?: number; litres?: number; cost: number; vendor?: string; notes?: string };
    const v = await prisma.vehicle.findUnique({ where: { id }, select: { regNo: true, odometer: true } });
    if (!v) throw ApiError.notFound('No such vehicle');
    if (b.kind === 'FUEL' && !b.litres) throw ApiError.badRequest('Give the litres filled');
    if (new Date(`${b.date}T00:00:00+05:30`) > new Date()) throw ApiError.badRequest('The date cannot be in the future');
    const by = await actorName(req);
    const log = await prisma.$transaction(async (tx) => {
      const l = await tx.vehicleLog.create({ data: { vehicleId: id, kind: b.kind, date: new Date(`${b.date}T12:00:00+05:30`), odometer: b.odometer ?? null, litres: b.litres ?? null, cost: b.cost, vendor: b.vendor ?? null, notes: b.notes ?? null, by } });
      if (b.odometer && b.odometer > v.odometer) await tx.vehicle.update({ where: { id }, data: { odometer: b.odometer } });
      return l;
    });
    await recordFor(req, { module: 'Transport', action: `vehicle ${b.kind.toLowerCase()}`, target: v.regNo, detail: `₹${b.cost}` });
    res.status(201).json(log);
  }),
);

// ─── Crew ─────────────────────────────────────────────────────────────────────

const crewBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone,
  role: z.enum(['DRIVER', 'ATTENDANT']),
  licenceNo: z.string().trim().max(40).nullable().optional(),
  licenceValidTill: date.nullable().optional(),
  verifiedOn: date.nullable().optional(),
  active: z.boolean().optional(),
});

transportRouter.get(
  '/crew',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.transportCrew.findMany({ include: { drives: { select: { routeNo: true } }, attends: { select: { routeNo: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    res.json(rows.map((c) => ({ ...c, routes: [...c.drives, ...c.attends].map((r) => r.routeNo) })));
  }),
);

transportRouter.post(
  '/crew',
  requireRole(...OPS),
  validate('body', crewBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof crewBody>;
    if (b.role === 'DRIVER' && (!b.licenceNo || !b.licenceValidTill)) throw ApiError.badRequest('A driver needs a licence number and its validity');
    const c = await prisma.transportCrew.create({ data: { ...b, licenceValidTill: toDate(b.licenceValidTill), verifiedOn: b.verifiedOn ? new Date(`${b.verifiedOn}T12:00:00+05:30`) : null } });
    await recordFor(req, { module: 'Transport', action: 'add crew', target: c.name, detail: c.role });
    res.status(201).json(c);
  }),
);

transportRouter.patch(
  '/crew/:id',
  requireRole(...OPS),
  validate('body', crewBody.omit({ role: true }).partial()),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const c = await prisma.transportCrew.findUnique({ where: { id }, include: { drives: { where: { active: true }, select: { routeNo: true } }, attends: { where: { active: true }, select: { routeNo: true } } } });
    if (!c) throw ApiError.notFound('No such person');
    const b = req.body as Partial<z.infer<typeof crewBody>>;
    const on = [...c.drives, ...c.attends].map((r) => r.routeNo);
    if (b.active === false && on.length) throw ApiError.conflict(`${c.name} is assigned to ${on.join(', ')}; assign someone else first`);
    const u = await prisma.transportCrew.update({
      where: { id },
      data: { ...b, ...(b.licenceValidTill !== undefined ? { licenceValidTill: toDate(b.licenceValidTill) } : {}), ...(b.verifiedOn !== undefined ? { verifiedOn: b.verifiedOn ? new Date(`${b.verifiedOn}T12:00:00+05:30`) : null } : {}) },
    });
    await recordFor(req, { module: 'Transport', action: 'edit crew', target: c.name, detail: Object.keys(b).join(', ') });
    res.json(u);
  }),
);

// ─── Routes ───────────────────────────────────────────────────────────────────

const stopBody = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  time: z.string().trim().refine((t) => minutesOf(t) !== null, 'Times look like 07:45'),
  fare: z.number().int().min(0).max(200_000),
});
const routeBody = z.object({
  routeNo: z.string().trim().toUpperCase().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  vehicleId: z.string().nullable(),
  driverId: z.string().nullable(),
  attendantId: z.string().nullable(),
  active: z.boolean().default(true),
  stops: z.array(stopBody).min(2, 'A route needs at least two stops').max(60)
    .refine((s) => s.every((x, i) => i === 0 || minutesOf(x.time)! > minutesOf(s[i - 1]!.time)!), 'Stop times must run in order through the morning')
    .refine((s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length, 'Each stop appears once'),
});

transportRouter.get(
  '/routes',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    const routes = await prisma.transportRoute.findMany({ include: { stops: { orderBy: { order: 'asc' } }, vehicle: true, driver: true, attendant: true }, orderBy: { routeNo: 'asc' } });
    const holding = await prisma.busPass.groupBy({ by: ['routeId', 'stopId'], where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, _count: { _all: true } });
    res.json(routes.map((r) => ({
      ...r,
      stops: r.stops.map((s) => ({ ...s, riders: holding.find((h) => h.stopId === s.id)?._count._all ?? 0 })),
      seatsTaken: holding.filter((h) => h.routeId === r.id).reduce((t, h) => t + h._count._all, 0),
    })));
  }),
);

async function checkCrew(b: z.infer<typeof routeBody>) {
  const [vehicle, driver, attendant] = await Promise.all([
    b.vehicleId ? prisma.vehicle.findUnique({ where: { id: b.vehicleId } }) : null,
    b.driverId ? prisma.transportCrew.findUnique({ where: { id: b.driverId } }) : null,
    b.attendantId ? prisma.transportCrew.findUnique({ where: { id: b.attendantId } }) : null,
  ]);
  if (b.vehicleId && (!vehicle || vehicle.status === 'RETIRED')) throw ApiError.badRequest('That vehicle is not in service');
  if (b.driverId && (!driver || driver.role !== 'DRIVER' || !driver.active)) throw ApiError.badRequest('Choose an active driver');
  if (b.attendantId && (!attendant || attendant.role !== 'ATTENDANT' || !attendant.active)) throw ApiError.badRequest('Choose an active attendant');
  return { vehicle };
}

transportRouter.post(
  '/routes',
  requireRole(...OPS),
  validate('body', routeBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof routeBody>;
    if (await prisma.transportRoute.findUnique({ where: { routeNo: b.routeNo }, select: { id: true } })) throw ApiError.conflict(`Route ${b.routeNo} already exists`);
    await checkCrew(b);
    const r = await prisma.transportRoute.create({
      data: { routeNo: b.routeNo, name: b.name, vehicleId: b.vehicleId, driverId: b.driverId, attendantId: b.attendantId, active: b.active, stops: { create: b.stops.map((s, i) => ({ name: s.name, time: s.time, fare: s.fare, order: i })) } },
    });
    await recordFor(req, { module: 'Transport', action: 'add route', target: r.routeNo, detail: `${b.stops.length} stops` });
    res.status(201).json({ id: r.id });
  }),
);

/**
 * Edits a route. Stops are matched by id, so a stop students board at keeps
 * its passes when renamed or moved; a stop with riders cannot be removed.
 */
transportRouter.put(
  '/routes/:id',
  requireRole(...OPS),
  validate('body', routeBody),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const b = req.body as z.infer<typeof routeBody>;
    const route = await prisma.transportRoute.findUnique({ where: { id }, include: { stops: true } });
    if (!route) throw ApiError.notFound('No such route');
    const clash = await prisma.transportRoute.findUnique({ where: { routeNo: b.routeNo }, select: { id: true } });
    if (clash && clash.id !== id) throw ApiError.conflict(`Route ${b.routeNo} already exists`);
    const { vehicle } = await checkCrew(b);
    const taken = await prisma.busPass.count({ where: seatHolding(id) });
    if (vehicle && taken > vehicle.capacity) throw ApiError.conflict(`${taken} passes are held on this route; ${vehicle.regNo} has ${vehicle.capacity} seats`);
    if (!b.active && taken) throw ApiError.conflict(`${taken} students hold passes on this route; move or cancel them before stopping it`);
    const keep = new Set(b.stops.filter((s) => s.id).map((s) => s.id!));
    const removed = route.stops.filter((s) => !keep.has(s.id));
    for (const s of removed) {
      const riders = await prisma.busPass.count({ where: { stopId: s.id, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } } });
      if (riders) throw ApiError.conflict(`${riders} students board at ${s.name}; move them before removing the stop`);
    }
    if (b.stops.some((s) => s.id && !route.stops.some((x) => x.id === s.id))) throw ApiError.badRequest('A stop belongs to another route');
    await prisma.$transaction(async (tx) => {
      await tx.transportRequest.updateMany({ where: { stopId: { in: removed.map((s) => s.id) }, status: 'PENDING' }, data: { status: 'CANCELLED', decisionNote: 'The stop was removed from the route' } });
      await tx.routeStop.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
      // Orders are parked out of the way first, so renumbering never collides.
      await tx.routeStop.updateMany({ where: { routeId: id }, data: { order: { increment: 1000 } } });
      for (const [i, s] of b.stops.entries()) {
        if (s.id) await tx.routeStop.update({ where: { id: s.id }, data: { name: s.name, time: s.time, fare: s.fare, order: i } });
        else await tx.routeStop.create({ data: { routeId: id, name: s.name, time: s.time, fare: s.fare, order: i } });
      }
      await tx.transportRoute.update({ where: { id }, data: { routeNo: b.routeNo, name: b.name, vehicleId: b.vehicleId, driverId: b.driverId, attendantId: b.attendantId, active: b.active } });
    });
    await recordFor(req, { module: 'Transport', action: 'edit route', target: b.routeNo, detail: `${b.stops.length} stops${removed.length ? `, ${removed.length} removed` : ''}` });
    res.json({ id });
  }),
);

transportRouter.delete(
  '/routes/:id',
  requireRole(...SENIOR),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const r = await prisma.transportRoute.findUnique({ where: { id }, include: { _count: { select: { passes: true, trips: true } } } });
    if (!r) throw ApiError.notFound('No such route');
    if (r._count.passes || r._count.trips) throw ApiError.conflict('This route has passes or trips on record; stop it instead of deleting it');
    await prisma.transportRoute.delete({ where: { id } });
    await recordFor(req, { module: 'Transport', action: 'delete route', target: r.routeNo, outcome: 'WARN' });
    res.status(204).end();
  }),
);

/** An in-app alert to every rider on the route: a delay, a breakdown, a changed stop. */
transportRouter.post(
  '/routes/:id/alert',
  requireRole(...OPS),
  validate('body', z.object({ message: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { message } = req.body as { message: string };
    const r = await prisma.transportRoute.findUnique({ where: { id }, include: { passes: { where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, select: { studentId: true } } } });
    if (!r) throw ApiError.notFound('No such route');
    if (r.passes.length === 0) throw ApiError.badRequest('No one holds a pass on this route');
    await prisma.notification.createMany({ data: r.passes.map((p) => ({ studentId: p.studentId, kind: 'GENERAL' as const, title: `Bus ${r.routeNo}: ${r.name}`, titleHi: `बस ${r.routeNo}`, body: message, urgent: true, href: '/bus-track' })) });
    await recordFor(req, { module: 'Transport', action: 'route alert', target: r.routeNo, detail: message });
    res.json({ sent: r.passes.length });
  }),
);

// ─── Passes ───────────────────────────────────────────────────────────────────

transportRouter.get(
  '/passes',
  requireRole(...READ),
  validate('query', z.object({ routeId: z.string().optional(), status: z.enum(['ACTIVE', 'PENDING_PAYMENT', 'CANCELLED', 'EXPIRED']).optional(), q: z.string().trim().max(80).optional() })),
  asyncHandler(async (req, res) => {
    await activatePaid();
    const { routeId, status, q } = validQuery<{ routeId?: string; status?: string; q?: string }>(req);
    const now = new Date();
    const rows = await prisma.busPass.findMany({
      where: {
        ...(routeId ? { routeId } : {}),
        ...(status === 'EXPIRED' ? { status: { not: 'CANCELLED' }, validTill: { lt: now } } : status ? { status: status as 'ACTIVE', ...(status !== 'CANCELLED' ? { validTill: { gte: now } } : {}) } : {}),
        ...(q ? { OR: [{ passNo: { contains: q, mode: 'insensitive' } }, { student: { name: { contains: q, mode: 'insensitive' } } }, { student: { enrolmentNo: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      include: { student: { select: { id: true, name: true, enrolmentNo: true, mobile: true, semester: true, programme: { select: { shortName: true } } } }, route: { select: { id: true, routeNo: true, name: true } }, stop: { select: { id: true, name: true } } },
      orderBy: [{ route: { routeNo: 'asc' } }, { student: { name: 'asc' } }],
      take: 2000,
    });
    const heads = await prisma.feeItem.findMany({ where: { OR: rows.filter((p) => p.feeHead).map((p) => ({ studentId: p.studentId, head: p.feeHead! })) }, select: { studentId: true, head: true, amount: true, paid: true } });
    res.json(rows.map((p) => {
      const item = heads.find((h) => h.studentId === p.studentId && h.head === p.feeHead);
      return { ...p, state: p.status === 'CANCELLED' ? 'CANCELLED' : p.validTill < now ? 'EXPIRED' : p.status, feeDue: item ? Math.max(0, item.amount - item.paid) : 0 };
    }));
  }),
);

/** Issues a pass at the desk — for a student who asked in person. */
transportRouter.post(
  '/passes',
  requireRole(...OPS),
  validate('body', z.object({ studentId: z.string().min(1), routeId: z.string().min(1), stopId: z.string().min(1), waiveFee: z.boolean().default(false), reason: z.string().trim().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; routeId: string; stopId: string; waiveFee: boolean; reason?: string };
    if (b.waiveFee && !['REGISTRAR', 'ADMIN'].includes(req.auth!.role)) throw ApiError.forbidden('Only the registrar can waive a transport fee');
    if (b.waiveFee && (!b.reason || b.reason.length < 5)) throw ApiError.badRequest('Give the reason for waiving the fee');
    const term = await currentTerm();
    const by = await actorName(req);
    const r = await prisma.$transaction((tx) => issuePass(tx, { ...b, term, by }));
    await prisma.transportRequest.updateMany({ where: { studentId: b.studentId, status: 'PENDING' }, data: { status: 'APPROVED', decidedBy: by, decidedAt: new Date(), decisionNote: 'Issued at the desk' } });
    await recordFor(req, { module: 'Transport', action: 'issue pass', target: r.student.enrolmentNo, detail: `${r.pass.passNo}: ${r.route.routeNo} / ${r.stop.name}${b.waiveFee ? ` — fee waived: ${b.reason}` : r.charge ? `, ₹${r.charge} charged` : ''}`, outcome: b.waiveFee ? 'WARN' : 'OK' });
    res.status(201).json({ passNo: r.pass.passNo, status: r.pass.status, charged: r.charge });
  }),
);

transportRouter.post(
  '/passes/:id/cancel',
  requireRole(...OPS),
  validate('body', z.object({ reason: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const p = await prisma.busPass.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!p) throw ApiError.notFound('No such pass');
    if (p.status === 'CANCELLED') throw ApiError.conflict('This pass is already cancelled');
    const { reason } = req.body as { reason: string };
    await prisma.$transaction(async (tx) => {
      await tx.busPass.update({ where: { id: p.id }, data: { status: 'CANCELLED', valid: false, cancelledReason: reason } });
      // A fee not yet paid for a pass that will not run is withdrawn with it.
      if (p.status === 'PENDING_PAYMENT' && p.feeHead) await tx.feeItem.deleteMany({ where: { studentId: p.studentId, head: p.feeHead, paid: 0 } });
      await tx.notification.create({ data: { studentId: p.studentId, kind: 'GENERAL', title: `Bus pass ${p.passNo} cancelled`, body: reason, href: '/bus-track' } });
    });
    await recordFor(req, { module: 'Transport', action: 'cancel pass', target: p.student.enrolmentNo, detail: `${p.passNo}: ${reason}`, outcome: 'WARN' });
    res.json({ status: 'CANCELLED' });
  }),
);

// ─── Students' requests ───────────────────────────────────────────────────────

transportRouter.get(
  '/requests',
  requireRole(...READ),
  validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() })),
  asyncHandler(async (req, res) => {
    const { status } = validQuery<{ status?: 'PENDING' }>(req);
    const rows = await prisma.transportRequest.findMany({
      where: status ? { status } : {},
      include: { student: { select: { id: true, name: true, enrolmentNo: true } }, route: { select: { id: true, routeNo: true, name: true, vehicle: { select: { capacity: true } } } }, stop: { select: { id: true, name: true, fare: true } } },
      orderBy: { createdAt: 'asc' }, take: 500,
    });
    const taken = await prisma.busPass.groupBy({ by: ['routeId'], where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, _count: { _all: true } });
    res.json(rows.map((r) => ({ ...r, seatsLeft: r.route.vehicle ? r.route.vehicle.capacity - (taken.find((t) => t.routeId === r.route.id)?._count._all ?? 0) : 0 })));
  }),
);

transportRouter.post(
  '/requests/:id/decide',
  requireRole(...OPS),
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { approve, note } = req.body as { approve: boolean; note?: string };
    const r = await prisma.transportRequest.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!r) throw ApiError.notFound('No such request');
    if (r.status !== 'PENDING') throw ApiError.conflict(`This request is already ${r.status.toLowerCase()}`);
    if (!approve && (!note || note.length < 5)) throw ApiError.badRequest('Tell the student why');
    const by = await actorName(req);
    if (approve) {
      const out = await prisma.$transaction(async (tx) => {
        const issued = await issuePass(tx, { studentId: r.studentId, routeId: r.routeId, stopId: r.stopId, term: r.term, by });
        await tx.transportRequest.update({ where: { id: r.id }, data: { status: 'APPROVED', decisionNote: note ?? null, decidedBy: by, decidedAt: new Date() } });
        return issued;
      });
      await recordFor(req, { module: 'Transport', action: 'approve request', target: r.student.enrolmentNo, detail: `${r.requestNo} → ${out.pass.passNo}${out.charge ? `, ₹${out.charge} charged` : ''}` });
      return void res.json({ status: 'APPROVED', passNo: out.pass.passNo, charged: out.charge });
    }
    await prisma.$transaction([
      prisma.transportRequest.update({ where: { id: r.id }, data: { status: 'REJECTED', decisionNote: note!, decidedBy: by, decidedAt: new Date() } }),
      prisma.notification.create({ data: { studentId: r.studentId, kind: 'GENERAL', title: `Transport request ${r.requestNo} not approved`, body: note!, href: '/bus-track' } }),
    ]);
    await recordFor(req, { module: 'Transport', action: 'reject request', target: r.student.enrolmentNo, detail: `${r.requestNo}: ${note}` });
    res.json({ status: 'REJECTED' });
  }),
);

// ─── Incidents ────────────────────────────────────────────────────────────────

transportRouter.get(
  '/incidents',
  requireRole(...READ),
  validate('query', z.object({ status: z.enum(['OPEN', 'CLOSED']).optional() })),
  asyncHandler(async (req, res) => {
    const { status } = validQuery<{ status?: string }>(req);
    res.json(await prisma.transportIncident.findMany({
      where: status ? { status } : {},
      include: { route: { select: { routeNo: true } }, vehicle: { select: { regNo: true } } },
      orderBy: { occurredAt: 'desc' }, take: 300,
    }));
  }),
);

transportRouter.post(
  '/incidents',
  requireRole(...OPS),
  validate('body', z.object({
    kind: z.enum(['BREAKDOWN', 'ACCIDENT', 'DELAY', 'MISCONDUCT', 'MEDICAL', 'OTHER']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: z.string().trim().min(10).max(2000),
    routeId: z.string().optional(), vehicleId: z.string().optional(), tripId: z.string().optional(),
    location: z.string().trim().max(200).optional(),
    occurredAt: z.string().datetime({ offset: true }),
    alertRiders: z.string().trim().min(5).max(300).optional(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { kind: string; severity: string; description: string; routeId?: string; vehicleId?: string; tripId?: string; location?: string; occurredAt: string; alertRiders?: string };
    if (new Date(b.occurredAt) > new Date(Date.now() + 5 * 60_000)) throw ApiError.badRequest('An incident cannot be in the future');
    if (b.alertRiders && !b.routeId) throw ApiError.badRequest('Choose the route whose riders should be alerted');
    const by = await actorName(req);
    const year = new Date().getFullYear();
    const incident = await prisma.$transaction(async (tx) => {
      let alerted = 0;
      if (b.alertRiders && b.routeId) {
        const riders = await tx.busPass.findMany({ where: { routeId: b.routeId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } }, select: { studentId: true } });
        await tx.notification.createMany({ data: riders.map((r) => ({ studentId: r.studentId, kind: 'GENERAL' as const, urgent: true, title: `Bus ${b.kind.toLowerCase()}`, body: b.alertRiders!, href: '/bus-track' })) });
        alerted = riders.length;
      }
      return tx.transportIncident.create({
        data: {
          incidentNo: await nextNo((p) => tx.transportIncident.findMany({ where: { incidentNo: { startsWith: p } }, select: { incidentNo: true } }), 'incidentNo', `TI/${year}/`, 5),
          kind: b.kind, severity: b.severity, description: b.description, routeId: b.routeId ?? null, vehicleId: b.vehicleId ?? null, tripId: b.tripId ?? null,
          location: b.location ?? null, occurredAt: new Date(b.occurredAt), reportedBy: by, ridersAlerted: alerted,
        },
      });
    });
    await recordFor(req, { module: 'Transport', action: 'incident', target: incident.incidentNo, detail: `${b.kind} (${b.severity})`, outcome: ['HIGH', 'CRITICAL'].includes(b.severity) ? 'WARN' : 'OK' });
    res.status(201).json(incident);
  }),
);

transportRouter.post(
  '/incidents/:id/close',
  requireRole(...OPS),
  validate('body', z.object({ actionTaken: z.string().trim().min(10).max(1000) })),
  asyncHandler(async (req, res) => {
    const i = await prisma.transportIncident.findUnique({ where: { id: String(req.params.id) } });
    if (!i) throw ApiError.notFound('No such incident');
    if (i.status === 'CLOSED') throw ApiError.conflict('Already closed');
    const u = await prisma.transportIncident.update({ where: { id: i.id }, data: { status: 'CLOSED', actionTaken: (req.body as { actionTaken: string }).actionTaken, closedBy: await actorName(req), closedAt: new Date() } });
    await recordFor(req, { module: 'Transport', action: 'close incident', target: i.incidentNo });
    res.json(u);
  }),
);
