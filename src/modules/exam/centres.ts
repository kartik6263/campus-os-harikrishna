import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireStatus, resolveExamStaffId } from './shared.js';
import { recordFor } from '../itconsole/audit.js';

/**
 * The next free seat number at a centre for a sitting. Numbers are never
 * reused — after a move the gap stays, so a printed seat plan stays true.
 */
async function nextSeatIndex(sessionId: string, centreId: string, code: string) {
  const seats = await prisma.seatAllocation.findMany({ where: { sessionId, centreId }, select: { seatNo: true } });
  let max = 0;
  for (const s of seats) {
    const n = Number((s.seatNo ?? '').slice(code.length + 1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

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
      where: { eligibility: 'CLEARED', student: { status: 'ACTIVE' }, ...(semester ? { semester } : {}) },
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
    const first = await nextSeatIndex(id, centre.id, centre.code);

    await prisma.seatAllocation.createMany({
      data: seating.map((s, i) => ({
        sessionId: id,
        studentId: s.studentId,
        centreId: centre.id,
        seatNo: `${centre.code}/${String(first + i).padStart(4, '0')}`,
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
  validate('query', z.object({ centreCode: z.string().optional(), withPapers: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const centreCode = typeof req.query.centreCode === 'string' ? req.query.centreCode : undefined;
    const withPapers = req.query.withPapers === '1';

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

    // For hall tickets: each candidate's own papers in this sitting, from the subjects on their form.
    const papersOf = new Map<string, Array<{ code: string; name: string; date: Date; time: string }>>();
    if (withPapers && allocations.length) {
      const [forms, papers] = await Promise.all([
        prisma.examForm.findMany({
          where: { studentId: { in: allocations.map((a) => a.student.id) }, eligibility: 'CLEARED' },
          select: { studentId: true, subjects: { select: { subjectId: true } } },
        }),
        prisma.examPaper.findMany({ where: { sessionId: id }, include: { subject: { select: { code: true, name: true } } }, orderBy: { examDate: 'asc' } }),
      ]);
      for (const f of forms) {
        const ids = new Set(f.subjects.map((x) => x.subjectId));
        papersOf.set(f.studentId, papers.filter((p) => ids.has(p.subjectId)).map((p) => ({ code: p.subject.code, name: p.subject.name, date: p.examDate, time: p.examTime })));
      }
    }

    res.json(
      allocations.map((a) => ({
        ...(withPapers ? { papers: papersOf.get(a.student.id) ?? [] } : {}),
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

// ─── GET /api/exam/sessions/:id/seating ───────────────────────────────────────

/** How many cleared candidates there are, how many have a seat, and who is still waiting. */
centresRouter.get(
  '/sessions/:id/seating',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) throw ApiError.notFound('No such examination session');

    const [cleared, seats] = await Promise.all([
      prisma.examForm.findMany({
        where: { eligibility: 'CLEARED' },
        select: { student: { select: { id: true, rollNo: true, name: true, semester: true, programme: { select: { shortName: true } } } } },
      }),
      prisma.seatAllocation.findMany({ where: { sessionId: id }, select: { studentId: true } }),
    ]);
    const seated = new Set(seats.map((x) => x.studentId));
    const waiting = cleared.filter((c) => !seated.has(c.student.id)).map((c) => ({
      studentId: c.student.id, rollNo: c.student.rollNo, name: c.student.name,
      programme: c.student.programme.shortName, semester: c.student.semester,
    }));

    res.json({ status: session.status, cleared: cleared.length, seated: seats.length, waiting });
  }),
);

// ─── POST /api/exam/sessions/:id/move ─────────────────────────────────────────

/**
 * Re-seats candidates from one centre to another — the way an over-subscribed
 * hall is relieved. Only before the examination starts, and never beyond the
 * receiving centre's capacity. The last-seated candidates move first.
 */
centresRouter.post(
  '/sessions/:id/move',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ from: z.string().min(1), to: z.string().min(1), count: z.number().int().min(1).max(20000) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const { from, to, count } = req.body as { from: string; to: string; count: number };
    if (from === to) throw ApiError.badRequest('Choose a different centre to move candidates to');

    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) throw ApiError.notFound('No such examination session');
    requireStatus(session, ['FORM_WINDOW_CLOSED'], 'moving candidates between centres');

    const [src, dst] = await Promise.all([
      prisma.examCentre.findUnique({ where: { code: from } }),
      prisma.examCentre.findUnique({ where: { code: to } }),
    ]);
    if (!src) throw ApiError.notFound(`No centre with code ${from}`);
    if (!dst) throw ApiError.notFound(`No centre with code ${to}`);

    const atDst = await prisma.seatAllocation.count({ where: { sessionId: id, centreId: dst.id } });
    const room = dst.capacity - atDst;
    if (room < count) throw ApiError.conflict(`${dst.code} has room for only ${Math.max(room, 0)}`, { room });

    const movers = await prisma.seatAllocation.findMany({
      where: { sessionId: id, centreId: src.id },
      orderBy: { seatNo: 'desc' },
      take: count,
      select: { id: true },
    });
    if (movers.length === 0) throw ApiError.badRequest(`Nobody is seated at ${src.code}`);

    const first = await nextSeatIndex(id, dst.id, dst.code);
    await prisma.$transaction(
      movers.reverse().map((m, i) =>
        prisma.seatAllocation.update({
          where: { id: m.id },
          data: { centreId: dst.id, seatNo: `${dst.code}/${String(first + i).padStart(4, '0')}` },
        }),
      ),
    );

    await recordFor(req, { module: 'Examinations', action: 'edit', target: session.code, detail: `Moved ${movers.length} candidate(s) from ${src.code} to ${dst.code}` });
    res.json({ moved: movers.length, from: src.code, to: dst.code });
  }),
);

// ─── POST /api/exam/sessions/:id/hall-tickets/notify ─────────────────────────

/** Tells every seated candidate that their hall ticket is ready, with their centre and seat. */
centresRouter.post(
  '/sessions/:id/hall-tickets/notify',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    await resolveExamStaffId(req);
    const { id } = req.params as { id: string };
    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) throw ApiError.notFound('No such examination session');

    const seats = await prisma.seatAllocation.findMany({
      where: { sessionId: id },
      select: { studentId: true, seatNo: true, centre: { select: { name: true, city: true } } },
    });
    if (seats.length === 0) throw ApiError.badRequest('No candidates have been allocated a centre');

    await prisma.notification.createMany({
      data: seats.map((x) => ({
        studentId: x.studentId,
        kind: 'EXAM' as const,
        title: `Hall ticket ready — ${session.name}`,
        titleHi: `प्रवेश पत्र उपलब्ध — ${session.name}`,
        body: `Centre: ${x.centre.name}, ${x.centre.city} · Seat ${x.seatNo ?? '—'}. Download it from the Examination section.`,
        href: '/(tabs)/more',
      })),
    });

    await recordFor(req, { module: 'Examinations', action: 'edit', target: session.code, detail: `Hall-ticket notice sent to ${seats.length} candidate(s)` });
    res.json({ notified: seats.length });
  }),
);
