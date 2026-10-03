import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * The transport desk: routes and their stops, bus passes, where each bus is,
 * and alerts to everyone holding a pass on a route. The student's own
 * Transport screen and bus tracker read these same rows.
 */
export const transportRouter = Router();

const stopSchema = z.object({ name: z.string().trim().min(1).max(120), time: z.string().trim().regex(/^\d{1,2}:\d{2}( ?[AP]M)?$/i, 'Times look like 07:45 or 7:45 AM') });
const routeBody = z.object({
  routeNo: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  busNo: z.string().trim().min(2).max(20),
  driver: z.string().trim().min(2).max(80),
  driverPhone: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid phone number'),
  stops: z.array(stopSchema).min(2, 'A route needs at least two stops').max(60),
});

async function presentRoutes() {
  const routes = await prisma.transportRoute.findMany({
    include: { stops: { orderBy: { order: 'asc' } }, _count: { select: { passes: true } }, passes: { where: { valid: true, validTill: { gte: new Date() } }, select: { id: true } } },
    orderBy: { routeNo: 'asc' },
  });
  return routes.map((r) => ({
    id: r.id, routeNo: r.routeNo, name: r.name, busNo: r.busNo, driver: r.driver, driverPhone: r.driverPhone,
    currentStop: r.currentStop, updatedAt: r.updatedAt,
    stops: r.stops.map((s) => ({ name: s.name, time: s.time })),
    passes: r._count.passes, activePasses: r.passes.length,
  }));
}

transportRouter.get('/transport/routes', asyncHandler(async (_req, res) => { res.json(await presentRoutes()); }));

transportRouter.post(
  '/transport/routes',
  validate('body', routeBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof routeBody>;
    if (await prisma.transportRoute.findUnique({ where: { routeNo: b.routeNo }, select: { id: true } })) throw ApiError.conflict(`Route ${b.routeNo} already exists`);
    const r = await prisma.transportRoute.create({
      data: { routeNo: b.routeNo, name: b.name, busNo: b.busNo, driver: b.driver, driverPhone: b.driverPhone, stops: { create: b.stops.map((s, i) => ({ ...s, order: i })) } },
    });
    await recordFor(req, { module: 'Transport', action: 'route-create', target: r.routeNo, detail: `${b.stops.length} stops` });
    res.status(201).json({ id: r.id });
  }),
);

/** Replaces a route's details and stops. The bus restarts from the first stop. */
transportRouter.put(
  '/transport/routes/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', routeBody),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const b = req.body as z.infer<typeof routeBody>;
    const existing = await prisma.transportRoute.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound('No such route');
    const clash = await prisma.transportRoute.findUnique({ where: { routeNo: b.routeNo }, select: { id: true } });
    if (clash && clash.id !== id) throw ApiError.conflict(`Route ${b.routeNo} already exists`);
    await prisma.$transaction([
      prisma.routeStop.deleteMany({ where: { routeId: id } }),
      prisma.transportRoute.update({
        where: { id },
        data: { routeNo: b.routeNo, name: b.name, busNo: b.busNo, driver: b.driver, driverPhone: b.driverPhone, currentStop: 0, stops: { create: b.stops.map((s, i) => ({ ...s, order: i })) } },
      }),
    ]);
    await recordFor(req, { module: 'Transport', action: 'route-edit', target: b.routeNo });
    res.json({ id });
  }),
);

transportRouter.delete(
  '/transport/routes/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const r = await prisma.transportRoute.findUnique({ where: { id }, include: { _count: { select: { passes: true } } } });
    if (!r) throw ApiError.notFound('No such route');
    if (r._count.passes > 0) throw ApiError.conflict(`${r._count.passes} pass(es) are issued on this route. Move or cancel them first.`);
    await prisma.transportRoute.delete({ where: { id } });
    await recordFor(req, { module: 'Transport', action: 'route-delete', target: r.routeNo, outcome: 'WARN' });
    res.status(204).end();
  }),
);

/** Where the bus is: the index of the last stop it cleared. */
transportRouter.post(
  '/transport/routes/:id/position',
  validate('body', z.object({ stop: z.number().int().min(0) })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { stop } = req.body as { stop: number };
    const r = await prisma.transportRoute.findUnique({ where: { id }, include: { _count: { select: { stops: true } } } });
    if (!r) throw ApiError.notFound('No such route');
    if (stop >= r._count.stops) throw ApiError.badRequest('That stop is not on this route');
    await prisma.transportRoute.update({ where: { id }, data: { currentStop: stop } });
    res.json({ id, currentStop: stop });
  }),
);

/** An in-app alert to every valid pass holder on the route: a delay, a breakdown, a changed stop. */
transportRouter.post(
  '/transport/routes/:id/alert',
  validate('body', z.object({ message: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { message } = req.body as { message: string };
    const r = await prisma.transportRoute.findUnique({ where: { id }, include: { passes: { where: { valid: true, validTill: { gte: new Date() } }, select: { studentId: true } } } });
    if (!r) throw ApiError.notFound('No such route');
    if (r.passes.length === 0) throw ApiError.badRequest('No one holds a valid pass on this route');
    await prisma.notification.createMany({
      data: r.passes.map((p) => ({ studentId: p.studentId, kind: 'GENERAL' as const, title: `Bus ${r.routeNo}: ${r.name}`, titleHi: `बस ${r.routeNo}`, body: message, urgent: true, href: '/bus-track' })),
    });
    await recordFor(req, { module: 'Transport', action: 'route-alert', target: r.routeNo, detail: message });
    res.json({ sent: r.passes.length });
  }),
);

// ─── Passes ──────────────────────────────────────────────────────────────────

transportRouter.get(
  '/transport/passes',
  asyncHandler(async (_req, res) => {
    const passes = await prisma.busPass.findMany({
      include: { student: { select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } } } }, route: { select: { id: true, routeNo: true, name: true } } },
      orderBy: { validTill: 'asc' },
    });
    const now = Date.now();
    res.json(passes.map((p) => ({
      id: p.id, studentId: p.student.id, student: p.student.name, enrolmentNo: p.student.enrolmentNo, programme: `${p.student.programme.shortName} ${p.student.semester}`,
      routeId: p.route.id, routeNo: p.route.routeNo, route: p.route.name, valid: p.valid, validTill: p.validTill,
      state: !p.valid ? 'cancelled' : p.validTill.getTime() < now ? 'expired' : p.validTill.getTime() - now < 30 * 86_400_000 ? 'expiring' : 'active',
    })));
  }),
);

/** Issues (or renews, or moves) a student's pass. A student holds one pass at a time. */
transportRouter.post(
  '/transport/passes',
  validate('body', z.object({ studentId: z.string().min(1), routeId: z.string().min(1), validTill: z.string().date() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; routeId: string; validTill: string };
    const till = new Date(`${b.validTill}T23:59:59.000Z`);
    if (till.getTime() < Date.now()) throw ApiError.badRequest('The pass must be valid until a future date');
    const [student, route] = await Promise.all([
      prisma.student.findUnique({ where: { id: b.studentId }, select: { enrolmentNo: true } }),
      prisma.transportRoute.findUnique({ where: { id: b.routeId }, select: { routeNo: true } }),
    ]);
    if (!student) throw ApiError.notFound('No such student');
    if (!route) throw ApiError.notFound('No such route');
    const pass = await prisma.busPass.upsert({
      where: { studentId: b.studentId },
      update: { routeId: b.routeId, validTill: till, valid: true },
      create: { studentId: b.studentId, routeId: b.routeId, validTill: till },
    });
    await recordFor(req, { module: 'Transport', action: 'pass-issue', target: student.enrolmentNo, detail: `Route ${route.routeNo} until ${b.validTill}` });
    res.status(201).json({ id: pass.id });
  }),
);

transportRouter.post(
  '/transport/passes/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const p = await prisma.busPass.findUnique({ where: { id }, include: { student: { select: { enrolmentNo: true } } } });
    if (!p) throw ApiError.notFound('No such pass');
    await prisma.busPass.update({ where: { id }, data: { valid: false } });
    await recordFor(req, { module: 'Transport', action: 'pass-cancel', target: p.student.enrolmentNo, outcome: 'WARN' });
    res.json({ id, valid: false });
  }),
);
