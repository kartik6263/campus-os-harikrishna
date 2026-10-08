import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { allot, transfer, vacate } from './allot.js';
import { OPS, READ, SETUP, actorName, bedLabels, genderFits } from './shared.js';
import { opsRouter } from './ops.js';
import { meRouter } from './me.js';

/**
 * Hostel management (/api/hostel).
 *
 * Any number of hostels, each with its rooms and beds; applications scored
 * by the allotment policy and allotted by hand or in one run; residents
 * moved and vacated; complaints with a service standard; gate passes and
 * leave with the parent's consent; visitors; the night roll call; the mess
 * menu; and mess and room-rent charges onto the fee ledger.
 *
 * The registrar and administrator set hostels up; the hostel office (OFFICE)
 * runs them; the principal reads. Students and parents use /api/hostel/me.
 */
export const hostelRouter = Router();
hostelRouter.use(requireAuth);
hostelRouter.use('/me', meRouter);
hostelRouter.use(opsRouter);

const ROOM_INCLUDE = {
  allotments: {
    where: { status: 'ACTIVE' as const },
    select: { id: true, bed: true, allotmentNo: true, allottedAt: true, checkedInAt: true, student: { select: { id: true, name: true, enrolmentNo: true, gender: true, programme: { select: { shortName: true } }, semester: true } } },
    orderBy: { bed: 'asc' as const },
  },
};

type RoomRow = Prisma.HostelRoomGetPayload<{ include: typeof ROOM_INCLUDE }>;
const presentRoom = (r: RoomRow) => ({
  id: r.id, hostelId: r.hostelId, roomNo: r.roomNo, floor: r.floor, capacity: r.capacity, ac: r.ac, attachedBath: r.attachedBath,
  amenities: r.amenities, rentPerSemester: r.rentPerSemester, status: r.status, notes: r.notes,
  occupied: r.allotments.length,
  beds: bedLabels(r.capacity).map((b) => {
    const a = r.allotments.find((x) => x.bed === b);
    return { bed: b, allotmentId: a?.id ?? null, allotmentNo: a?.allotmentNo ?? null, checkedIn: !!a?.checkedInAt, student: a ? { id: a.student.id, name: a.student.name, enrolmentNo: a.student.enrolmentNo, programme: `${a.student.programme.shortName} sem ${a.student.semester}` } : null };
  }),
});

// ─── Overview ─────────────────────────────────────────────────────────────────

hostelRouter.get(
  '/overview',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [hostels, rooms, active, pending, complaints, out, overdue, today] = await Promise.all([
      prisma.hostel.findMany({ orderBy: { name: 'asc' } }),
      prisma.hostelRoom.findMany({ select: { hostelId: true, capacity: true, status: true } }),
      prisma.hostelAllotment.findMany({ where: { status: 'ACTIVE' }, select: { room: { select: { hostelId: true } } } }),
      prisma.hostelApplication.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'WAITLISTED'] } }, _count: { _all: true } }),
      prisma.hostelComplaint.findMany({ where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }, select: { hostelId: true, dueBy: true, priority: true } }),
      prisma.hostelLeave.count({ where: { status: 'OUT' } }),
      prisma.hostelLeave.count({ where: { status: 'OUT', leaveTo: { lt: now } } }),
      prisma.hostelLeave.count({ where: { status: { in: ['AWAITING_PARENT', 'PENDING'] } } }),
    ]);
    const visitorsIn = await prisma.hostelVisitor.count({ where: { outAt: null } });
    res.json({
      totals: {
        hostels: hostels.filter((h) => h.active).length,
        beds: rooms.filter((r) => r.status === 'AVAILABLE').reduce((t, r) => t + r.capacity, 0),
        occupied: active.length,
        pendingApplications: pending.find((p) => p.status === 'PENDING')?._count._all ?? 0,
        waitlisted: pending.find((p) => p.status === 'WAITLISTED')?._count._all ?? 0,
        openComplaints: complaints.length,
        overdueComplaints: complaints.filter((c) => c.dueBy < now).length,
        studentsOut: out,
        overdueReturns: overdue,
        leaveRequests: today,
        visitorsIn,
      },
      hostels: hostels.map((h) => {
        const own = rooms.filter((r) => r.hostelId === h.id);
        const beds = own.filter((r) => r.status === 'AVAILABLE').reduce((t, r) => t + r.capacity, 0);
        const occupied = active.filter((a) => a.room.hostelId === h.id).length;
        return {
          id: h.id, code: h.code, name: h.name, gender: h.gender, active: h.active, wardenName: h.wardenName, wardenPhone: h.wardenPhone,
          address: h.address, amenities: h.amenities, rules: h.rules, messRatePerMonth: h.messRatePerMonth,
          rooms: own.length, beds, occupied, vacant: Math.max(0, beds - occupied),
          outOfService: own.filter((r) => r.status !== 'AVAILABLE').length,
          openComplaints: complaints.filter((c) => c.hostelId === h.id).length,
        };
      }),
    });
  }),
);

// ─── Hostels ──────────────────────────────────────────────────────────────────

const hostelBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, 'Code: 1–10 letters, digits or hyphens'),
  name: z.string().trim().min(3).max(120),
  gender: z.enum(['BOYS', 'GIRLS', 'CO_ED']),
  address: z.string().trim().max(300).optional().nullable(),
  wardenName: z.string().trim().max(120).optional().nullable(),
  wardenPhone: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid phone number').optional().nullable().or(z.literal('')),
  amenities: z.array(z.string().trim().min(2).max(60)).max(30).default([]),
  rules: z.string().trim().max(4000).optional().nullable(),
  messRatePerMonth: z.number().int().min(0).max(100_000).default(0),
  active: z.boolean().optional(),
});

/** An edit carries only what changed: no defaults, so nothing unsent is overwritten. */
const hostelPatch = z.object({
  name: z.string().trim().min(3).max(120),
  gender: z.enum(['BOYS', 'GIRLS', 'CO_ED']),
  address: z.string().trim().max(300).nullable(),
  wardenName: z.string().trim().max(120).nullable(),
  wardenPhone: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid phone number').nullable().or(z.literal('')),
  amenities: z.array(z.string().trim().min(2).max(60)).max(30),
  rules: z.string().trim().max(4000).nullable(),
  messRatePerMonth: z.number().int().min(0).max(100_000),
  active: z.boolean(),
}).partial();

hostelRouter.post(
  '/hostels',
  requireRole(...SETUP),
  validate('body', hostelBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof hostelBody>;
    if (await prisma.hostel.findUnique({ where: { code: b.code }, select: { id: true } })) throw ApiError.conflict(`A hostel with code ${b.code} already exists`);
    const h = await prisma.hostel.create({ data: { ...b, wardenPhone: b.wardenPhone || null } });
    await recordFor(req, { module: 'Hostel', action: 'add hostel', target: h.code, detail: `${h.name} (${h.gender})` });
    res.status(201).json(h);
  }),
);

hostelRouter.patch(
  '/hostels/:id',
  requireRole(...SETUP),
  validate('body', hostelPatch),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const before = await prisma.hostel.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('No such hostel');
    const b = req.body as z.infer<typeof hostelPatch>;
    if (b.gender && b.gender !== before.gender) {
      // Changing who a hostel is for cannot strand the people already in it.
      const residents = await prisma.hostelAllotment.findMany({ where: { status: 'ACTIVE', room: { hostelId: id } }, select: { student: { select: { name: true, gender: true } } } });
      const misfit = residents.find((r) => !genderFits(b.gender!, r.student.gender).ok);
      if (misfit) throw ApiError.conflict(`${misfit.student.name} lives here and would not fit a ${b.gender.toLowerCase().replace('_', '-')} hostel`);
    }
    if (b.active === false) {
      const n = await prisma.hostelAllotment.count({ where: { status: 'ACTIVE', room: { hostelId: id } } });
      if (n) throw ApiError.conflict(`${n} resident${n === 1 ? '' : 's'} still live here; move or vacate them before closing the hostel`);
    }
    const h = await prisma.hostel.update({ where: { id }, data: { ...b, ...(b.wardenPhone !== undefined ? { wardenPhone: b.wardenPhone || null } : {}) } });
    await recordFor(req, { module: 'Hostel', action: 'edit hostel', target: h.code, detail: Object.keys(b).join(', ') });
    res.json(h);
  }),
);

// ─── Rooms ────────────────────────────────────────────────────────────────────

hostelRouter.get(
  '/hostels/:id/rooms',
  requireRole(...READ),
  asyncHandler(async (req, res) => {
    const rooms = await prisma.hostelRoom.findMany({ where: { hostelId: String(req.params.id) }, include: ROOM_INCLUDE, orderBy: [{ floor: 'asc' }, { roomNo: 'asc' }] });
    res.json(rooms.map(presentRoom));
  }),
);

const roomBody = z.object({
  roomNo: z.string().trim().toUpperCase().min(1).max(12),
  floor: z.number().int().min(-2).max(60),
  capacity: z.number().int().min(1).max(20),
  ac: z.boolean().default(false),
  attachedBath: z.boolean().default(false),
  amenities: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
  rentPerSemester: z.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'BLOCKED']).default('AVAILABLE'),
  notes: z.string().trim().max(300).optional().nullable(),
});

const roomPatch = z.object({
  floor: z.number().int().min(-2).max(60),
  capacity: z.number().int().min(1).max(20),
  ac: z.boolean(),
  attachedBath: z.boolean(),
  amenities: z.array(z.string().trim().min(2).max(60)).max(20),
  rentPerSemester: z.number().int().min(0).max(1_000_000),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'BLOCKED']),
  notes: z.string().trim().max(300).nullable(),
}).partial();

hostelRouter.post(
  '/hostels/:id/rooms',
  requireRole(...SETUP),
  validate('body', roomBody),
  asyncHandler(async (req, res) => {
    const hostelId = String(req.params.id);
    const hostel = await prisma.hostel.findUnique({ where: { id: hostelId }, select: { code: true } });
    if (!hostel) throw ApiError.notFound('No such hostel');
    const b = req.body as z.infer<typeof roomBody>;
    if (await prisma.hostelRoom.findUnique({ where: { hostelId_roomNo: { hostelId, roomNo: b.roomNo } }, select: { id: true } })) throw ApiError.conflict(`Room ${b.roomNo} already exists in ${hostel.code}`);
    const r = await prisma.hostelRoom.create({ data: { ...b, hostelId }, include: ROOM_INCLUDE });
    await recordFor(req, { module: 'Hostel', action: 'add room', target: `${hostel.code}/${r.roomNo}`, detail: `${r.capacity} beds` });
    res.status(201).json(presentRoom(r));
  }),
);

/** Adds a block of rooms at once: floors × rooms per floor, numbered 101, 102… 201… */
hostelRouter.post(
  '/hostels/:id/rooms/bulk',
  requireRole(...SETUP),
  validate('body', z.object({
    fromFloor: z.number().int().min(0).max(60),
    toFloor: z.number().int().min(0).max(60),
    roomsPerFloor: z.number().int().min(1).max(60),
    prefix: z.string().trim().toUpperCase().max(4).default(''),
    capacity: z.number().int().min(1).max(20),
    ac: z.boolean().default(false),
    attachedBath: z.boolean().default(false),
    amenities: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
    rentPerSemester: z.number().int().min(0).max(1_000_000).default(0),
  }).refine((b) => b.toFloor >= b.fromFloor, { message: 'The last floor must not be below the first' })
    .refine((b) => (b.toFloor - b.fromFloor + 1) * b.roomsPerFloor <= 600, { message: 'At most 600 rooms at once' })),
  asyncHandler(async (req, res) => {
    const hostelId = String(req.params.id);
    const hostel = await prisma.hostel.findUnique({ where: { id: hostelId }, select: { code: true } });
    if (!hostel) throw ApiError.notFound('No such hostel');
    const b = req.body as { fromFloor: number; toFloor: number; roomsPerFloor: number; prefix: string; capacity: number; ac: boolean; attachedBath: boolean; amenities: string[]; rentPerSemester: number };
    const width = b.roomsPerFloor >= 100 ? 3 : 2;
    const data = [];
    for (let f = b.fromFloor; f <= b.toFloor; f++) {
      for (let n = 1; n <= b.roomsPerFloor; n++) {
        data.push({ hostelId, roomNo: `${b.prefix}${f === 0 ? 'G' : f}${String(n).padStart(width, '0')}`, floor: f, capacity: b.capacity, ac: b.ac, attachedBath: b.attachedBath, amenities: b.amenities, rentPerSemester: b.rentPerSemester });
      }
    }
    const r = await prisma.hostelRoom.createMany({ data, skipDuplicates: true });
    await recordFor(req, { module: 'Hostel', action: 'add rooms', target: hostel.code, detail: `${r.count} added, ${data.length - r.count} already existed` });
    res.status(201).json({ added: r.count, skipped: data.length - r.count });
  }),
);

hostelRouter.patch(
  '/rooms/:id',
  requireRole(...OPS),
  validate('body', roomPatch),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const room = await prisma.hostelRoom.findUnique({ where: { id }, include: { hostel: { select: { code: true } }, allotments: { where: { status: 'ACTIVE' }, select: { bed: true } } } });
    if (!room) throw ApiError.notFound('No such room');
    const b = req.body as z.infer<typeof roomPatch>;
    // The office may take a room in and out of service; its make-up is the registrar's.
    const setupFields = Object.keys(b).filter((k) => k !== 'status' && k !== 'notes');
    if (setupFields.length && !['REGISTRAR', 'ADMIN'].includes(req.auth!.role)) throw ApiError.forbidden('Only the registrar can change a room\'s beds, rent or furnishing');
    if (b.capacity !== undefined) {
      const lost = room.allotments.filter((a) => !bedLabels(b.capacity!).includes(a.bed));
      if (lost.length) throw ApiError.conflict(`Bed ${lost.map((a) => a.bed).join(', ')} is occupied; move those residents first`);
    }
    if (b.status && b.status !== 'AVAILABLE' && room.allotments.length && b.status === 'BLOCKED') throw ApiError.conflict('Move the residents out before blocking the room');
    const r = await prisma.hostelRoom.update({ where: { id }, data: b, include: ROOM_INCLUDE });
    await recordFor(req, { module: 'Hostel', action: 'edit room', target: `${room.hostel.code}/${room.roomNo}`, detail: JSON.stringify(b).slice(0, 200) });
    res.json(presentRoom(r));
  }),
);

hostelRouter.delete(
  '/rooms/:id',
  requireRole(...SETUP),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const room = await prisma.hostelRoom.findUnique({ where: { id }, include: { hostel: { select: { code: true } }, _count: { select: { allotments: true } } } });
    if (!room) throw ApiError.notFound('No such room');
    // A room anyone has ever lived in stays, for the record; take it out of service instead.
    if (room._count.allotments) throw ApiError.conflict('This room has allotment history; block it instead of deleting it');
    await prisma.hostelRoom.delete({ where: { id } });
    await recordFor(req, { module: 'Hostel', action: 'delete room', target: `${room.hostel.code}/${room.roomNo}` });
    res.status(204).end();
  }),
);

/** Rooms with a free bed that suit a student, for the allot dialogs. */
hostelRouter.get(
  '/vacancies',
  requireRole(...OPS),
  validate('query', z.object({ studentId: z.string().min(1), hostelId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { studentId, hostelId } = validQuery<{ studentId: string; hostelId?: string }>(req);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { gender: true } });
    if (!student) throw ApiError.notFound('No such student');
    const rooms = await prisma.hostelRoom.findMany({
      where: { status: 'AVAILABLE', hostel: { active: true }, ...(hostelId ? { hostelId } : {}) },
      include: { hostel: { select: { id: true, code: true, name: true, gender: true } }, ...ROOM_INCLUDE },
      orderBy: [{ hostel: { name: 'asc' } }, { floor: 'asc' }, { roomNo: 'asc' }],
    });
    res.json(rooms
      .filter((r) => genderFits(r.hostel.gender, student.gender).ok && r.allotments.length < r.capacity)
      .map((r) => ({ ...presentRoom(r), hostel: r.hostel, freeBeds: bedLabels(r.capacity).filter((b) => !r.allotments.some((a) => a.bed === b)) })));
  }),
);

// ─── Applications ─────────────────────────────────────────────────────────────

const APP_INCLUDE = {
  student: { select: { id: true, name: true, enrolmentNo: true, gender: true, category: true, semester: true, status: true, programme: { select: { shortName: true } } } },
  preferredHostel: { select: { id: true, code: true, name: true } },
  allotment: { select: { allotmentNo: true, bed: true, room: { select: { roomNo: true, hostel: { select: { code: true } } } } } },
} as const;

hostelRouter.get(
  '/applications',
  requireRole(...READ),
  validate('query', z.object({ status: z.enum(['PENDING', 'WAITLISTED', 'ALLOTTED', 'REJECTED', 'CANCELLED']).optional(), q: z.string().trim().max(80).optional() })),
  asyncHandler(async (req, res) => {
    const { status, q } = validQuery<{ status?: 'PENDING'; q?: string }>(req);
    const rows = await prisma.hostelApplication.findMany({
      where: { ...(status ? { status } : {}), ...(q ? { OR: [{ applicationNo: { contains: q, mode: 'insensitive' } }, { student: { name: { contains: q, mode: 'insensitive' } } }, { student: { enrolmentNo: { contains: q, mode: 'insensitive' } } }] } : {}) },
      include: APP_INCLUDE,
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    });
    res.json(rows);
  }),
);

hostelRouter.post(
  '/applications/:id/decide',
  requireRole(...OPS),
  validate('body', z.object({
    action: z.enum(['ALLOT', 'WAITLIST', 'REJECT']),
    roomId: z.string().optional(),
    bed: z.string().max(2).optional(),
    note: z.string().trim().max(400).optional(),
  })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { action, roomId, bed, note } = req.body as { action: 'ALLOT' | 'WAITLIST' | 'REJECT'; roomId?: string; bed?: string; note?: string };
    const app = await prisma.hostelApplication.findUnique({ where: { id }, include: { student: { select: { name: true, enrolmentNo: true } } } });
    if (!app) throw ApiError.notFound('No such application');
    if (!['PENDING', 'WAITLISTED'].includes(app.status)) throw ApiError.conflict(`This application is already ${app.status.toLowerCase()}`);
    const by = await actorName(req);
    if (action === 'REJECT' && (!note || note.length < 5)) throw ApiError.badRequest('Tell the student why');
    if (action === 'ALLOT') {
      if (!roomId) throw ApiError.badRequest('Choose a room');
      const a = await prisma.$transaction((tx) => allot(tx, { studentId: app.studentId, roomId, bed, by, applicationId: app.id, note }));
      await recordFor(req, { module: 'Hostel', action: 'allot', target: app.student.enrolmentNo, detail: `${a.allotmentNo}: ${a.room.hostel.code}/${a.room.roomNo} bed ${a.bed}` });
      return void res.json({ status: 'ALLOTTED', allotmentNo: a.allotmentNo, room: a.room.roomNo, bed: a.bed });
    }
    const status = action === 'WAITLIST' ? 'WAITLISTED' : 'REJECTED';
    await prisma.$transaction([
      prisma.hostelApplication.update({ where: { id }, data: { status, decisionNote: note ?? null, decidedBy: by, decidedAt: new Date() } }),
      prisma.notification.create({ data: { studentId: app.studentId, kind: 'GENERAL', title: `Hostel application ${app.applicationNo} ${status === 'WAITLISTED' ? 'waitlisted' : 'not approved'}`, body: note ?? (status === 'WAITLISTED' ? 'No bed is free for you yet; you keep your place in the queue.' : ''), href: '/hostel' } }),
    ]);
    await recordFor(req, { module: 'Hostel', action: status.toLowerCase(), target: app.student.enrolmentNo, detail: app.applicationNo });
    res.json({ status });
  }),
);

/**
 * Fills free beds from the queue, highest priority first: each applicant
 * gets their preferred hostel if it has a fitting bed, otherwise the first
 * fitting bed anywhere; whoever cannot be placed is waitlisted. Run as a
 * preview first (dryRun) — nothing is written until it is confirmed.
 */
hostelRouter.post(
  '/applications/auto-allot',
  requireRole(...OPS),
  validate('body', z.object({ hostelId: z.string().optional(), dryRun: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const { hostelId, dryRun } = req.body as { hostelId?: string; dryRun: boolean };
    const [apps, rooms] = await Promise.all([
      prisma.hostelApplication.findMany({ where: { status: { in: ['PENDING', 'WAITLISTED'] } }, include: { student: { select: { id: true, name: true, enrolmentNo: true, gender: true, status: true } } }, orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }] }),
      prisma.hostelRoom.findMany({ where: { status: 'AVAILABLE', hostel: { active: true }, ...(hostelId ? { hostelId } : {}) }, include: { hostel: { select: { id: true, code: true, gender: true } }, allotments: { where: { status: 'ACTIVE' }, select: { bed: true } } }, orderBy: [{ floor: 'asc' }, { roomNo: 'asc' }] }),
    ]);
    const free = rooms.map((r) => ({ room: r, beds: bedLabels(r.capacity).filter((b) => !r.allotments.some((a) => a.bed === b)) }));
    const plan: Array<{ applicationId: string; applicationNo: string; student: string; enrolmentNo: string; score: number; roomId: string | null; room: string | null; bed: string | null; why: string | null }> = [];
    for (const a of apps) {
      if (a.student.status !== 'ACTIVE') { plan.push({ applicationId: a.id, applicationNo: a.applicationNo, student: a.student.name, enrolmentNo: a.student.enrolmentNo, score: a.priorityScore, roomId: null, room: null, bed: null, why: 'Not on the rolls' }); continue; }
      const already = await prisma.hostelAllotment.findUnique({ where: { activeStudent: a.studentId }, select: { id: true } });
      if (already) { plan.push({ applicationId: a.id, applicationNo: a.applicationNo, student: a.student.name, enrolmentNo: a.student.enrolmentNo, score: a.priorityScore, roomId: null, room: null, bed: null, why: 'Already has a bed' }); continue; }
      const fits = free.filter((f) => f.beds.length && genderFits(f.room.hostel.gender, a.student.gender).ok && (a.roomPreference === 'ANY' || ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3 } as Record<string, number>)[a.roomPreference] === f.room.capacity || a.roomPreference === 'DORM' && f.room.capacity > 3));
      const pick = fits.find((f) => f.room.hostel.id === a.preferredHostelId) ?? fits.find((f) => !a.specialNeeds || f.room.floor === 0) ?? fits[0];
      if (!pick) { plan.push({ applicationId: a.id, applicationNo: a.applicationNo, student: a.student.name, enrolmentNo: a.student.enrolmentNo, score: a.priorityScore, roomId: null, room: null, bed: null, why: 'No fitting bed free' }); continue; }
      const bed = pick.beds.shift()!;
      plan.push({ applicationId: a.id, applicationNo: a.applicationNo, student: a.student.name, enrolmentNo: a.student.enrolmentNo, score: a.priorityScore, roomId: pick.room.id, room: `${pick.room.hostel.code}/${pick.room.roomNo}`, bed, why: null });
    }
    if (dryRun) return void res.json({ dryRun: true, plan });

    const by = await actorName(req);
    let allotted = 0;
    const failed: Array<{ student: string; reason: string }> = [];
    for (const p of plan) {
      if (!p.roomId) {
        if (p.why === 'No fitting bed free') await prisma.hostelApplication.updateMany({ where: { id: p.applicationId, status: 'PENDING' }, data: { status: 'WAITLISTED', decidedBy: by, decidedAt: new Date(), decisionNote: 'No fitting bed was free in the allotment run' } });
        continue;
      }
      try {
        await prisma.$transaction((tx) => allot(tx, { studentId: apps.find((a) => a.id === p.applicationId)!.studentId, roomId: p.roomId!, bed: p.bed!, by, applicationId: p.applicationId, note: 'Allotted in the allotment run' }));
        allotted++;
      } catch (err) {
        failed.push({ student: p.student, reason: err instanceof Error ? err.message : 'Failed' });
      }
    }
    await recordFor(req, { module: 'Hostel', action: 'allotment run', target: hostelId ?? 'all hostels', detail: `${allotted} allotted, ${failed.length} failed, ${plan.filter((p) => !p.roomId).length} not placed` });
    res.json({ dryRun: false, allotted, failed, plan });
  }),
);

// ─── Residents ────────────────────────────────────────────────────────────────

hostelRouter.get(
  '/residents',
  requireRole(...READ),
  validate('query', z.object({ hostelId: z.string().optional(), q: z.string().trim().max(80).optional(), status: z.enum(['ACTIVE', 'VACATED']).default('ACTIVE') })),
  asyncHandler(async (req, res) => {
    const { hostelId, q, status } = validQuery<{ hostelId?: string; q?: string; status: 'ACTIVE' | 'VACATED' }>(req);
    const rows = await prisma.hostelAllotment.findMany({
      where: {
        status, ...(hostelId ? { room: { hostelId } } : {}),
        ...(q ? { OR: [{ allotmentNo: { contains: q, mode: 'insensitive' } }, { student: { name: { contains: q, mode: 'insensitive' } } }, { student: { enrolmentNo: { contains: q, mode: 'insensitive' } } }, { room: { roomNo: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      include: {
        student: { select: { id: true, name: true, enrolmentNo: true, mobile: true, semester: true, programme: { select: { shortName: true } }, guardian: { select: { email: true } } } },
        room: { select: { id: true, roomNo: true, floor: true, rentPerSemester: true, hostel: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: [{ room: { hostel: { name: 'asc' } } }, { room: { roomNo: 'asc' } }, { bed: 'asc' }],
      take: 1000,
    });
    res.json(rows);
  }),
);

/** Puts a student in a bed without an application — a mid-year admission, a medical case. */
hostelRouter.post(
  '/allotments',
  requireRole(...OPS),
  validate('body', z.object({ studentId: z.string().min(1), roomId: z.string().min(1), bed: z.string().max(2).optional(), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; roomId: string; bed?: string; note?: string };
    const by = await actorName(req);
    const open = await prisma.hostelApplication.findFirst({ where: { studentId: b.studentId, status: { in: ['PENDING', 'WAITLISTED'] } }, select: { id: true } });
    const a = await prisma.$transaction((tx) => allot(tx, { ...b, by, applicationId: open?.id ?? null }));
    const s = await prisma.student.findUnique({ where: { id: b.studentId }, select: { enrolmentNo: true } });
    await recordFor(req, { module: 'Hostel', action: 'allot', target: s?.enrolmentNo ?? b.studentId, detail: `${a.allotmentNo}: ${a.room.hostel.code}/${a.room.roomNo} bed ${a.bed}${b.note ? ` — ${b.note}` : ''}` });
    res.status(201).json({ id: a.id, allotmentNo: a.allotmentNo, room: a.room.roomNo, bed: a.bed });
  }),
);

hostelRouter.post(
  '/allotments/:id/check-in',
  requireRole(...OPS),
  asyncHandler(async (req, res) => {
    const a = await prisma.hostelAllotment.findUnique({ where: { id: String(req.params.id) }, select: { id: true, status: true, checkedInAt: true, allotmentNo: true } });
    if (!a || a.status !== 'ACTIVE') throw ApiError.notFound('No active allotment');
    if (a.checkedInAt) throw ApiError.conflict('Already checked in');
    await prisma.hostelAllotment.update({ where: { id: a.id }, data: { checkedInAt: new Date() } });
    await recordFor(req, { module: 'Hostel', action: 'check in', target: a.allotmentNo });
    res.json({ checkedIn: true });
  }),
);

hostelRouter.post(
  '/allotments/:id/vacate',
  requireRole(...OPS),
  validate('body', z.object({ reason: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const by = await actorName(req);
    const a = await prisma.$transaction((tx) => vacate(tx, String(req.params.id), by, (req.body as { reason: string }).reason));
    await recordFor(req, { module: 'Hostel', action: 'vacate', target: a.allotmentNo, detail: `${a.room.hostel.code}/${a.room.roomNo}: ${(req.body as { reason: string }).reason}` });
    res.json({ vacated: true });
  }),
);

hostelRouter.post(
  '/allotments/:id/transfer',
  requireRole(...OPS),
  validate('body', z.object({ roomId: z.string().min(1), bed: z.string().max(2).optional(), reason: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { roomId: string; bed?: string; reason: string };
    const by = await actorName(req);
    const a = await prisma.$transaction((tx) => transfer(tx, String(req.params.id), b.roomId, by, b.reason, b.bed));
    await recordFor(req, { module: 'Hostel', action: 'transfer', target: a.allotmentNo, detail: `to ${a.room.hostel.code}/${a.room.roomNo} bed ${a.bed}: ${b.reason}` });
    res.json({ allotmentNo: a.allotmentNo, room: a.room.roomNo, bed: a.bed });
  }),
);

// ─── Room changes ─────────────────────────────────────────────────────────────

hostelRouter.get(
  '/room-changes',
  requireRole(...READ),
  validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() })),
  asyncHandler(async (req, res) => {
    const { status } = validQuery<{ status?: 'PENDING' }>(req);
    res.json(await prisma.hostelRoomChange.findMany({
      where: status ? { status } : {},
      include: {
        student: { select: { id: true, name: true, enrolmentNo: true } },
        allotment: { select: { id: true, bed: true, room: { select: { roomNo: true, hostel: { select: { id: true, code: true } } } } } },
        preferredRoom: { select: { id: true, roomNo: true, hostel: { select: { code: true } } } },
      },
      orderBy: { createdAt: 'desc' }, take: 300,
    }));
  }),
);

hostelRouter.post(
  '/room-changes/:id/decide',
  requireRole(...OPS),
  validate('body', z.object({ approve: z.boolean(), roomId: z.string().optional(), bed: z.string().max(2).optional(), note: z.string().trim().min(5).max(300) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { approve: boolean; roomId?: string; bed?: string; note: string };
    const rc = await prisma.hostelRoomChange.findUnique({ where: { id: String(req.params.id) } });
    if (!rc) throw ApiError.notFound('No such request');
    if (rc.status !== 'PENDING') throw ApiError.conflict(`This request is already ${rc.status.toLowerCase()}`);
    const by = await actorName(req);
    if (b.approve) {
      const to = b.roomId ?? rc.preferredRoomId;
      if (!to) throw ApiError.badRequest('Choose the room to move the student to');
      await prisma.$transaction(async (tx) => {
        await transfer(tx, rc.allotmentId, to, by, `Room change ${rc.requestNo}: ${rc.reason}`, b.bed);
        await tx.hostelRoomChange.update({ where: { id: rc.id }, data: { status: 'APPROVED', decisionNote: b.note, decidedBy: by, decidedAt: new Date() } });
      });
    } else {
      await prisma.$transaction([
        prisma.hostelRoomChange.update({ where: { id: rc.id }, data: { status: 'REJECTED', decisionNote: b.note, decidedBy: by, decidedAt: new Date() } }),
        prisma.notification.create({ data: { studentId: rc.studentId, kind: 'GENERAL', title: `Room change ${rc.requestNo} not approved`, body: b.note, href: '/hostel' } }),
      ]);
    }
    await recordFor(req, { module: 'Hostel', action: b.approve ? 'room change approved' : 'room change rejected', target: rc.requestNo, detail: b.note });
    res.json({ status: b.approve ? 'APPROVED' : 'REJECTED' });
  }),
);

