import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireRole, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { academicYear, genderFits, istDate, nextNo, priorityScore } from './shared.js';

/**
 * The student's own hostel (/api/hostel/me), and their parent's view of it.
 * A student applies, asks to change rooms, raises and rates complaints, and
 * asks for gate passes and leave; a parent reads all of it and consents to
 * leave. Everything is scoped to the one student by resolveStudentId.
 */
export const meRouter = Router();

/** Service standard per priority, in hours. */
const SLA_HOURS = { URGENT: 24, HIGH: 48, NORMAL: 72, LOW: 168 } as const;
const CATEGORIES = ['Electrical', 'Plumbing', 'Furniture', 'Cleanliness', 'Internet / Wi-Fi', 'Mess / Food', 'Security', 'Ragging', 'Medical', 'Pest control', 'Other'] as const;

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, gender: true, status: true, guardianId: true } });
    if (!student) throw ApiError.notFound('Student record not found');
    const [allotment, applications, complaints, leaves, roomChanges, hostels, dues] = await Promise.all([
      prisma.hostelAllotment.findUnique({
        where: { activeStudent: studentId },
        include: {
          room: {
            include: {
              hostel: true,
              allotments: { where: { status: 'ACTIVE' }, select: { bed: true, studentId: true, student: { select: { name: true, programme: { select: { shortName: true } }, semester: true } } } },
            },
          },
        },
      }),
      prisma.hostelApplication.findMany({ where: { studentId }, include: { preferredHostel: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.hostelComplaint.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.hostelLeave.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.hostelRoomChange.findMany({ where: { studentId }, include: { preferredRoom: { select: { roomNo: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.hostel.findMany({ where: { active: true }, include: { rooms: { where: { status: 'AVAILABLE' }, select: { capacity: true, rentPerSemester: true, ac: true, attachedBath: true, _count: { select: { allotments: { where: { status: 'ACTIVE' } } } } } } }, orderBy: { name: 'asc' } }),
      prisma.feeItem.findMany({ where: { studentId, head: { startsWith: 'Hostel' } }, select: { head: true, amount: true, paid: true, dueDate: true }, orderBy: { dueDate: 'desc' } }),
    ]);
    const hostelId = allotment?.room.hostelId;
    const [menu, absences, changeOptions] = await Promise.all([
      hostelId ? prisma.hostelMessMenu.findMany({ where: { hostelId }, orderBy: { day: 'asc' } }) : Promise.resolve([]),
      hostelId ? prisma.hostelRollCallEntry.findMany({ where: { studentId, status: 'ABSENT' }, orderBy: { date: 'desc' }, take: 10, select: { date: true, markedBy: true } }) : Promise.resolve([]),
      hostelId ? prisma.hostelRoom.findMany({ where: { hostelId, status: 'AVAILABLE', id: { not: allotment!.roomId } }, select: { id: true, roomNo: true, floor: true, capacity: true, ac: true, attachedBath: true, _count: { select: { allotments: { where: { status: 'ACTIVE' } } } } }, orderBy: { roomNo: 'asc' } }) : Promise.resolve([]),
    ]);
    const now = new Date();
    res.json({
      student: { name: student.name, onRolls: student.status === 'ACTIVE', parentLinked: !!student.guardianId },
      allotment: allotment && {
        id: allotment.id, allotmentNo: allotment.allotmentNo, bed: allotment.bed, academicYear: allotment.academicYear, allottedAt: allotment.allottedAt, checkedInAt: allotment.checkedInAt,
        room: { id: allotment.room.id, roomNo: allotment.room.roomNo, floor: allotment.room.floor, capacity: allotment.room.capacity, ac: allotment.room.ac, attachedBath: allotment.room.attachedBath, amenities: allotment.room.amenities, rentPerSemester: allotment.room.rentPerSemester },
        hostel: { id: allotment.room.hostel.id, code: allotment.room.hostel.code, name: allotment.room.hostel.name, address: allotment.room.hostel.address, wardenName: allotment.room.hostel.wardenName, wardenPhone: allotment.room.hostel.wardenPhone, amenities: allotment.room.hostel.amenities, rules: allotment.room.hostel.rules, messRatePerMonth: allotment.room.hostel.messRatePerMonth },
        roommates: allotment.room.allotments.filter((a) => a.studentId !== studentId).map((a) => ({ bed: a.bed, name: a.student.name, programme: `${a.student.programme.shortName} sem ${a.student.semester}` })),
      },
      hostels: hostels.filter((h) => genderFits(h.gender, student.gender).ok).map((h) => {
        const beds = h.rooms.reduce((t, r) => t + r.capacity, 0);
        const taken = h.rooms.reduce((t, r) => t + r._count.allotments, 0);
        const rents = h.rooms.map((r) => r.rentPerSemester).filter((r) => r > 0);
        return { id: h.id, code: h.code, name: h.name, gender: h.gender, amenities: h.amenities, address: h.address, messRatePerMonth: h.messRatePerMonth, vacantBeds: Math.max(0, beds - taken), rentFrom: rents.length ? Math.min(...rents) : null, rentTo: rents.length ? Math.max(...rents) : null, roomTypes: [...new Set(h.rooms.map((r) => r.capacity))].sort() };
      }),
      applications,
      complaints: complaints.map((c) => ({ ...c, overdue: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(c.status) && c.dueBy < now })),
      leaves,
      roomChanges,
      menu,
      absences,
      changeOptions: changeOptions.filter((r) => r._count.allotments < r.capacity).map((r) => ({ id: r.id, roomNo: r.roomNo, floor: r.floor, capacity: r.capacity, ac: r.ac, attachedBath: r.attachedBath, freeBeds: r.capacity - r._count.allotments })),
      dues: dues.map((d) => ({ head: d.head, amount: d.amount, paid: d.paid, due: Math.max(0, d.amount - d.paid), dueDate: d.dueDate })),
      categories: CATEGORIES,
      today: istDate(),
    });
  }),
);

// ─── Applying ─────────────────────────────────────────────────────────────────

meRouter.post(
  '/applications',
  requireRole('STUDENT'),
  validate('body', z.object({
    preferredHostelId: z.string().optional(),
    roomPreference: z.enum(['ANY', 'SINGLE', 'DOUBLE', 'TRIPLE', 'DORM']).default('ANY'),
    distanceKm: z.number().int().min(0).max(5000),
    specialNeeds: z.string().trim().max(300).optional(),
    reason: z.string().trim().min(10).max(600),
  })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { preferredHostelId?: string; roomPreference: string; distanceKm: number; specialNeeds?: string; reason: string };
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { status: true, category: true, semester: true, gender: true, enrolmentNo: true } });
    if (!s) throw ApiError.notFound('Student record not found');
    if (s.status !== 'ACTIVE') throw ApiError.conflict('Only students on the rolls can apply for a hostel');
    if (await prisma.hostelAllotment.findUnique({ where: { activeStudent: studentId }, select: { id: true } })) throw ApiError.conflict('You already have a hostel room');
    if (await prisma.hostelApplication.findFirst({ where: { studentId, status: { in: ['PENDING', 'WAITLISTED'] } }, select: { id: true } })) throw ApiError.conflict('You already have an application in the queue');
    if (b.preferredHostelId) {
      const h = await prisma.hostel.findUnique({ where: { id: b.preferredHostelId }, select: { gender: true, active: true } });
      if (!h || !h.active) throw ApiError.badRequest('No such hostel');
      const fit = genderFits(h.gender, s.gender);
      if (!fit.ok) throw ApiError.badRequest(fit.why!);
    }
    const year = academicYear();
    const app = await prisma.hostelApplication.create({
      data: {
        applicationNo: await nextNo((p) => prisma.hostelApplication.findMany({ where: { applicationNo: { startsWith: p } }, select: { applicationNo: true } }), 'applicationNo', `HAP/${year}/`, 5),
        studentId, academicYear: year, preferredHostelId: b.preferredHostelId ?? null, roomPreference: b.roomPreference,
        distanceKm: b.distanceKm, specialNeeds: b.specialNeeds || null, reason: b.reason,
        priorityScore: priorityScore({ distanceKm: b.distanceKm, category: s.category, specialNeeds: b.specialNeeds || null, semester: s.semester }),
      },
    });
    await recordFor(req, { module: 'Hostel', action: 'application', target: s.enrolmentNo, detail: app.applicationNo });
    res.status(201).json(app);
  }),
);

meRouter.post(
  '/applications/:id/cancel',
  requireRole('STUDENT'),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const a = await prisma.hostelApplication.findUnique({ where: { id: String(req.params.id) } });
    if (!a || a.studentId !== studentId) throw ApiError.notFound('No such application');
    if (!['PENDING', 'WAITLISTED'].includes(a.status)) throw ApiError.conflict('Only an application in the queue can be withdrawn');
    res.json(await prisma.hostelApplication.update({ where: { id: a.id }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: 'Withdrawn by the student' } }));
  }),
);

// ─── Room change ──────────────────────────────────────────────────────────────

meRouter.post(
  '/room-change',
  requireRole('STUDENT'),
  validate('body', z.object({ preferredRoomId: z.string().optional(), reason: z.string().trim().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { preferredRoomId?: string; reason: string };
    const a = await prisma.hostelAllotment.findUnique({ where: { activeStudent: studentId }, select: { id: true, roomId: true, room: { select: { hostelId: true } } } });
    if (!a) throw ApiError.conflict('You do not have a hostel room');
    if (await prisma.hostelRoomChange.findFirst({ where: { allotmentId: a.id, status: 'PENDING' }, select: { id: true } })) throw ApiError.conflict('You already have a room change request open');
    if (b.preferredRoomId) {
      const r = await prisma.hostelRoom.findUnique({ where: { id: b.preferredRoomId }, select: { hostelId: true, capacity: true, status: true, _count: { select: { allotments: { where: { status: 'ACTIVE' } } } } } });
      if (!r || r.hostelId !== a.room.hostelId) throw ApiError.badRequest('Choose a room in your own hostel');
      if (r.status !== 'AVAILABLE' || r._count.allotments >= r.capacity) throw ApiError.conflict('That room has no free bed');
    }
    const year = new Date().getFullYear();
    const rc = await prisma.hostelRoomChange.create({
      data: {
        requestNo: await nextNo((p) => prisma.hostelRoomChange.findMany({ where: { requestNo: { startsWith: p } }, select: { requestNo: true } }), 'requestNo', `RC/${year}/`, 5),
        studentId, allotmentId: a.id, preferredRoomId: b.preferredRoomId ?? null, reason: b.reason,
      },
    });
    res.status(201).json(rc);
  }),
);

meRouter.post(
  '/room-change/:id/cancel',
  requireRole('STUDENT'),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const rc = await prisma.hostelRoomChange.findUnique({ where: { id: String(req.params.id) } });
    if (!rc || rc.studentId !== studentId) throw ApiError.notFound('No such request');
    if (rc.status !== 'PENDING') throw ApiError.conflict('Only a pending request can be withdrawn');
    res.json(await prisma.hostelRoomChange.update({ where: { id: rc.id }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: 'Withdrawn by the student' } }));
  }),
);

// ─── Complaints ───────────────────────────────────────────────────────────────

meRouter.post(
  '/complaints',
  requireRole('STUDENT'),
  validate('body', z.object({
    category: z.enum(CATEGORIES),
    description: z.string().trim().min(10).max(1500),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    inRoom: z.boolean().default(true),
  })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { category: (typeof CATEGORIES)[number]; description: string; priority: keyof typeof SLA_HOURS; inRoom: boolean };
    const a = await prisma.hostelAllotment.findUnique({ where: { activeStudent: studentId }, select: { roomId: true, room: { select: { hostelId: true, hostel: { select: { code: true } } } } } });
    if (!a) throw ApiError.conflict('Only hostel residents can raise a hostel complaint');
    // Ragging, security and medical matters are never left in the ordinary queue.
    const priority = ['Ragging', 'Security', 'Medical'].includes(b.category) ? 'URGENT' : b.priority;
    const year = new Date().getFullYear();
    const c = await prisma.hostelComplaint.create({
      data: {
        ticketNo: await nextNo((p) => prisma.hostelComplaint.findMany({ where: { ticketNo: { startsWith: p } }, select: { ticketNo: true } }), 'ticketNo', `HC/${a.room.hostel.code}/${year}/`, 5),
        studentId, hostelId: a.room.hostelId, roomId: b.inRoom ? a.roomId : null, category: b.category, priority, description: b.description,
        dueBy: new Date(Date.now() + SLA_HOURS[priority] * 3_600_000),
      },
    });
    await recordFor(req, { module: 'Hostel', action: 'complaint', target: c.ticketNo, detail: `${c.category} (${c.priority})`, outcome: c.category === 'Ragging' ? 'WARN' : 'OK' });
    res.status(201).json(c);
  }),
);

/** The student closes a resolved complaint with a rating, or reopens it if it is not fixed. */
meRouter.post(
  '/complaints/:id/feedback',
  requireRole('STUDENT'),
  validate('body', z.object({ reopen: z.boolean(), rating: z.number().int().min(1).max(5).optional(), feedback: z.string().trim().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { reopen: boolean; rating?: number; feedback?: string };
    const c = await prisma.hostelComplaint.findUnique({ where: { id: String(req.params.id) } });
    if (!c || c.studentId !== studentId) throw ApiError.notFound('No such complaint');
    if (c.status !== 'RESOLVED') throw ApiError.conflict('Only a resolved complaint can be rated or reopened');
    if (b.reopen) {
      if (!b.feedback || b.feedback.length < 5) throw ApiError.badRequest('Say what is still wrong');
      if (c.reopened >= 3) throw ApiError.conflict('This complaint has been reopened three times; raise it with the warden directly');
      res.json(await prisma.hostelComplaint.update({ where: { id: c.id }, data: { status: 'OPEN', reopened: { increment: 1 }, feedback: b.feedback, resolvedAt: null, dueBy: new Date(Date.now() + SLA_HOURS[c.priority] * 3_600_000) } }));
    } else {
      if (!b.rating) throw ApiError.badRequest('Rate the fix from 1 to 5');
      res.json(await prisma.hostelComplaint.update({ where: { id: c.id }, data: { status: 'CLOSED', rating: b.rating, feedback: b.feedback ?? null } }));
    }
  }),
);

// ─── Leave and gate passes ────────────────────────────────────────────────────

meRouter.post(
  '/leaves',
  requireRole('STUDENT'),
  validate('body', z.object({
    kind: z.enum(['GATE_PASS', 'LEAVE']),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    destination: z.string().trim().min(2).max(200),
    reason: z.string().trim().min(5).max(500),
  })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { kind: 'GATE_PASS' | 'LEAVE'; from: string; to: string; destination: string; reason: string };
    const from = new Date(b.from);
    const to = new Date(b.to);
    if (to <= from) throw ApiError.badRequest('The return must be after the departure');
    if (from < new Date(Date.now() - 15 * 60_000)) throw ApiError.badRequest('The departure cannot be in the past');
    if (b.kind === 'GATE_PASS' && (istDate(from) !== istDate(to))) throw ApiError.badRequest('A gate pass is for the same day; apply for leave to stay out overnight');
    if (b.kind === 'LEAVE' && to.getTime() - from.getTime() > 45 * 86_400_000) throw ApiError.badRequest('Leave longer than 45 days is a break in study; apply from your profile');
    const [student, a] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { guardianId: true, enrolmentNo: true } }),
      prisma.hostelAllotment.findUnique({ where: { activeStudent: studentId }, select: { id: true } }),
    ]);
    if (!a) throw ApiError.conflict('Only hostel residents need a gate pass or leave');
    const overlap = await prisma.hostelLeave.findFirst({ where: { studentId, status: { in: ['AWAITING_PARENT', 'PENDING', 'APPROVED', 'OUT'] }, leaveFrom: { lt: to }, leaveTo: { gt: from } }, select: { passNo: true } });
    if (overlap) throw ApiError.conflict(`It overlaps ${overlap.passNo}, which is still open`);
    // Leave needs the parent's consent when a parent account is linked; a same-day pass does not.
    const needsParent = b.kind === 'LEAVE' && !!student?.guardianId;
    const year = new Date().getFullYear();
    const l = await prisma.hostelLeave.create({
      data: {
        passNo: await nextNo((p) => prisma.hostelLeave.findMany({ where: { passNo: { startsWith: p } }, select: { passNo: true } }), 'passNo', `${b.kind === 'LEAVE' ? 'LV' : 'GP'}/${year}/`, 6),
        studentId, kind: b.kind, leaveFrom: from, leaveTo: to, destination: b.destination, reason: b.reason,
        status: needsParent ? 'AWAITING_PARENT' : 'PENDING', parentConsent: needsParent ? 'PENDING' : 'NOT_REQUIRED',
      },
    });
    res.status(201).json(l);
  }),
);

meRouter.post(
  '/leaves/:id/cancel',
  requireRole('STUDENT'),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const l = await prisma.hostelLeave.findUnique({ where: { id: String(req.params.id) } });
    if (!l || l.studentId !== studentId) throw ApiError.notFound('No such request');
    if (!['AWAITING_PARENT', 'PENDING', 'APPROVED'].includes(l.status)) throw ApiError.conflict(l.status === 'OUT' ? 'You are already out on this pass' : 'This request can no longer be withdrawn');
    res.json(await prisma.hostelLeave.update({ where: { id: l.id }, data: { status: 'CANCELLED', decisionNote: 'Withdrawn by the student' } }));
  }),
);

meRouter.post(
  '/leaves/:id/consent',
  requireRole('PARENT'),
  validate('body', z.object({ consent: z.boolean(), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { consent, note } = req.body as { consent: boolean; note?: string };
    const l = await prisma.hostelLeave.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { guardianId: true } } } });
    if (!l || l.student.guardianId !== req.auth!.sub) throw ApiError.notFound('No such request');
    if (l.status !== 'AWAITING_PARENT') throw ApiError.conflict('This request is not waiting for your consent');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.hostelLeave.update({
        where: { id: l.id },
        data: { parentConsent: consent ? 'GIVEN' : 'REFUSED', parentNote: note ?? null, status: consent ? 'PENDING' : 'REJECTED', ...(consent ? {} : { decisionNote: 'Parent did not consent', decidedBy: 'Parent', decidedAt: new Date() }) },
      });
      await tx.notification.create({ data: { studentId: l.studentId, kind: 'GENERAL', title: `Leave ${l.passNo}: your parent ${consent ? 'consented' : 'did not consent'}`, body: consent ? 'It has gone to the warden.' : (note ?? ''), href: '/hostel' } });
      return u;
    });
    await recordFor(req, { module: 'Hostel', action: consent ? 'parent consent' : 'parent refusal', target: l.passNo, detail: note ?? '' });
    res.json(updated);
  }),
);

