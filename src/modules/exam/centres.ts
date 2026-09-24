import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireStatus, resolveExamStaffId } from './shared.js';

export const centresRouter = Router();

// ─── GET /api/exam/centres ────────────────────────────────────────────────────

/** Every centre with how full it is for a given session. */
centresRouter.get(
  '/centres',
  validate('query', z.object({ sessionId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

    const centres = await prisma.examCentre.findMany({ orderBy: { code: 'asc' } });

    const counts = await prisma.seatAllocation.groupBy({
      by: ['centreId'],
      where: sessionId ? { sessionId } : {},
      _count: { _all: true },
    });
    const assigned = new Map(counts.map((c) => [c.centreId, c._count._all]));

    res.json(
      centres.map((c) => {
        const seated = assigned.get(c.id) ?? 0;
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          city: c.city,
          district: c.district,
          pincode: c.pincode,
          capacity: c.capacity,
          assigned: seated,
          free: c.capacity - seated,
          // The number the allocation screen colours on.
          utilisation: c.capacity === 0 ? 0 : Number(((seated / c.capacity) * 100).toFixed(1)),
          over: seated > c.capacity,
        };
      }),
    );
  }),
);

// ─── PATCH /api/exam/centres/:code ────────────────────────────────────────────

/**
 * Adjusts a hall's sanctioned capacity.
 *
 * The new figure cannot be below what is already seated there — that would
 * make the centre over-subscribed by arithmetic rather than by anyone's
 * decision, and the conflicts view would have nothing to act on.
 */
centresRouter.patch(
  "/centres/:code",
  validate("params", z.object({ code: z.string().min(1) })),
  validate("body", z.object({ capacity: z.number().int().min(1).max(20000) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { code } = req.params as { code: string };
    const { capacity } = req.body as { capacity: number };

    const centre = await prisma.examCentre.findUnique({ where: { code } });
    if (!centre) throw ApiError.notFound(`No centre with code ${code}`);

    const seated = await prisma.seatAllocation.count({ where: { centreId: centre.id } });
    if (capacity < seated) {
      throw ApiError.badRequest(
        `${seated} candidates are already seated at ${code}; capacity cannot be set below that`,
        { seated },
      );
    }

    const updated = await prisma.examCentre.update({ where: { code }, data: { capacity } });

    res.json({
      code: updated.code,
      name: updated.name,
      capacity: updated.capacity,
      assigned: seated,
      free: updated.capacity - seated,
    });
  }),
);

// ─── POST /api/exam/sessions/:id/allocate ─────────────────────────────────────

/**
 * Seats the candidates of a session.
 *
 * Only students whose examination form the college office actually cleared are
 * seated — Phase 3's scrutiny is the gate, so a candidate with a shortage or
 * an unpaid fee never reaches a hall. Capacity is hard: the allocation stops
 * rather than overfilling a room.
 */
centresRouter.post(
  '/sessions/:id/allocate',
  validate('params', z.object({ id: z.string().min(1) })),
  validate(
    'body',
    z.object({ centreCode: z.string().min(1), semester: z.number().int().min(1).max(12).optional() }),
  ),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { centreCode, semester } = req.body as { centreCode: string; semester?: number };

    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) throw ApiError.notFound('No such examination session');
    requireStatus(session, ['FORM_WINDOW_CLOSED'], 'allocating centres');

    const centre = await prisma.examCentre.findUnique({ where: { code: centreCode } });
    if (!centre) throw ApiError.notFound(`No centre with code ${centreCode}`);

    const cleared = await prisma.examForm.findMany({
      where: { eligibility: 'CLEARED', ...(semester ? { semester } : {}) },
      select: { studentId: true, semester: true },
      orderBy: { student: { rollNo: 'asc' } },
    });

    if (cleared.length === 0) {
      throw ApiError.badRequest(
        'No examination forms have been cleared by the college office yet',
      );
    }

    const already = await prisma.seatAllocation.findMany({
      where: { sessionId: id },
      select: { studentId: true, centreId: true },
    });
    const seatedIds = new Set(already.map((a) => a.studentId));
    const here = already.filter((a) => a.centreId === centre.id).length;

    const toSeat = cleared.filter((c) => !seatedIds.has(c.studentId));
    const room = centre.capacity - here;

    if (room <= 0) {
      throw ApiError.conflict(`${centre.code} is full (${here}/${centre.capacity})`);
    }

    const seating = toSeat.slice(0, room);

    await prisma.seatAllocation.createMany({
      data: seating.map((s, i) => ({
        sessionId: id,
        studentId: s.studentId,
        centreId: centre.id,
        seatNo: `${centre.code}/${String(here + i + 1).padStart(4, '0')}`,
      })),
      skipDuplicates: true,
    });

    res.status(201).json({
      centre: { code: centre.code, name: centre.name, capacity: centre.capacity },
      seated: seating.length,
      // Honest about what did not fit, rather than silently dropping it.
      unseated: toSeat.length - seating.length,
      occupancy: here + seating.length,
    });
  }),
);

// ─── GET /api/exam/sessions/:id/allocations ───────────────────────────────────

centresRouter.get(
  '/sessions/:id/allocations',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('query', z.object({ centreCode: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const centreCode = typeof req.query.centreCode === 'string' ? req.query.centreCode : undefined;

    const allocations = await prisma.seatAllocation.findMany({
      where: { sessionId: id, ...(centreCode ? { centre: { code: centreCode } } : {}) },
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
        centre: { select: { code: true, name: true, city: true } },
      },
      orderBy: { seatNo: 'asc' },
    });

    res.json(
      allocations.map((a) => ({
        id: a.id,
        seatNo: a.seatNo,
        studentId: a.student.id,
        enrolmentNo: a.student.enrolmentNo,
        rollNo: a.student.rollNo,
        name: a.student.name,
        programme: a.student.programme.shortName,
        semester: a.student.semester,
        centre: a.centre,
      })),
    );
  }),
);
