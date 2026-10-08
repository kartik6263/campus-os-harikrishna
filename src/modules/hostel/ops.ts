import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import { OPS, READ, SETUP, actorName, istDate } from './shared.js';

/** The hostel office's daily work: complaints, leave, visitors, roll call, mess and billing. */
export const opsRouter = Router();

// ─── Complaints ───────────────────────────────────────────────────────────────

opsRouter.get(
  '/complaints',
  requireRole(...READ),
  validate('query', z.object({ hostelId: z.string().optional(), status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ACTIVE']).optional() })),
  asyncHandler(async (req, res) => {
    const { hostelId, status } = validQuery<{ hostelId?: string; status?: string }>(req);
    const rows = await prisma.hostelComplaint.findMany({
      where: {
        ...(hostelId ? { hostelId } : {}),
        ...(status === 'ACTIVE' ? { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } : status ? { status: status as 'OPEN' } : {}),
      },
      include: { student: { select: { id: true, name: true, enrolmentNo: true } }, hostel: { select: { code: true, name: true } }, room: { select: { roomNo: true } } },
      orderBy: [{ dueBy: 'asc' }],
      take: 500,
    });
    const now = new Date();
    res.json(rows.map((c) => ({ ...c, overdue: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(c.status) && c.dueBy < now })));
  }),
);

opsRouter.post(
  '/complaints/:id/update',
  requireRole(...OPS),
  validate('body', z.object({
    status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    assignedTo: z.string().trim().max(120).optional(),
    response: z.string().trim().max(1000).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { status: 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; assignedTo?: string; response?: string; priority?: 'URGENT' };
    const c = await prisma.hostelComplaint.findUnique({ where: { id: String(req.params.id) } });
    if (!c) throw ApiError.notFound('No such complaint');
    if (c.status === 'CLOSED') throw ApiError.conflict('This complaint is closed');
    if (b.status === 'ASSIGNED' && !(b.assignedTo ?? c.assignedTo)) throw ApiError.badRequest('Say who it is assigned to');
    if (b.status === 'RESOLVED' && !(b.response ?? c.response)) throw ApiError.badRequest('Tell the student what was done');
    if (b.status === 'CLOSED' && c.status !== 'RESOLVED') throw ApiError.conflict('Only a resolved complaint can be closed');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.hostelComplaint.update({
        where: { id: c.id },
        data: {
          status: b.status, ...(b.assignedTo !== undefined ? { assignedTo: b.assignedTo || null } : {}), ...(b.response !== undefined ? { response: b.response || null } : {}),
          ...(b.priority ? { priority: b.priority } : {}), ...(b.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
        },
      });
      if (b.status !== c.status) {
        await tx.notification.create({
          data: {
            studentId: c.studentId, kind: 'GENERAL', title: `Complaint ${c.ticketNo}: ${b.status.toLowerCase().replace('_', ' ')}`,
            body: b.status === 'RESOLVED' ? `${u.response ?? ''} — rate the fix, or reopen it, from Hostel → Complaints.` : (u.response ?? (u.assignedTo ? `Assigned to ${u.assignedTo}` : '')), href: '/hostel',
          },
        });
      }
      return u;
    });
    await recordFor(req, { module: 'Hostel', action: `complaint ${b.status.toLowerCase()}`, target: c.ticketNo, detail: b.response ?? b.assignedTo ?? '' });
    res.json(updated);
  }),
);

// ─── Leave and gate passes ────────────────────────────────────────────────────

const LEAVE_INCLUDE = {
  student: {
    select: {
      id: true, name: true, enrolmentNo: true, mobile: true,
      guardian: { select: { email: true } },
      hostelAllotments: { where: { status: 'ACTIVE' as const }, select: { bed: true, room: { select: { roomNo: true, hostel: { select: { id: true, code: true } } } } } },
    },
  },
};

opsRouter.get(
  '/leaves',
  requireRole(...READ),
  validate('query', z.object({ status: z.enum(['AWAITING_PARENT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'OUT', 'RETURNED', 'OVERDUE', 'ACTIVE']).optional(), hostelId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { status, hostelId } = validQuery<{ status?: string; hostelId?: string }>(req);
    const now = new Date();
    const rows = await prisma.hostelLeave.findMany({
      where: {
        ...(status === 'OVERDUE' ? { status: 'OUT', leaveTo: { lt: now } } : status === 'ACTIVE' ? { status: { in: ['AWAITING_PARENT', 'PENDING', 'APPROVED', 'OUT'] } } : status ? { status: status as 'PENDING' } : {}),
        ...(hostelId ? { student: { hostelAllotments: { some: { status: 'ACTIVE', room: { hostelId } } } } } : {}),
      },
      include: LEAVE_INCLUDE,
      orderBy: [{ leaveFrom: 'asc' }],
      take: 500,
    });
    res.json(rows.map((l) => ({ ...l, overdue: l.status === 'OUT' && l.leaveTo < now, lateReturn: l.status === 'RETURNED' && !!l.returnedAt && l.returnedAt > l.leaveTo })));
  }),
);

opsRouter.post(
  '/leaves/:id/decide',
  requireRole(...OPS),
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { approve, note } = req.body as { approve: boolean; note?: string };
    const l = await prisma.hostelLeave.findUnique({ where: { id: String(req.params.id) } });
    if (!l) throw ApiError.notFound('No such request');
    if (l.status === 'AWAITING_PARENT') throw ApiError.conflict("The parent has not consented yet");
    if (l.status !== 'PENDING') throw ApiError.conflict(`This request is already ${l.status.toLowerCase().replace('_', ' ')}`);
    if (!approve && (!note || note.length < 5)) throw ApiError.badRequest('Tell the student why');
    const by = await actorName(req);
    await prisma.$transaction([
      prisma.hostelLeave.update({ where: { id: l.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decisionNote: note ?? null, decidedBy: by, decidedAt: new Date() } }),
      prisma.notification.create({ data: { studentId: l.studentId, kind: 'GENERAL', title: `${l.kind === 'LEAVE' ? 'Leave' : 'Gate pass'} ${l.passNo} ${approve ? 'approved' : 'not approved'}`, body: note ?? (approve ? 'Show the pass number at the gate.' : ''), href: '/hostel' } }),
    ]);
    await recordFor(req, { module: 'Hostel', action: approve ? 'leave approved' : 'leave rejected', target: l.passNo, detail: note ?? '' });
    res.json({ status: approve ? 'APPROVED' : 'REJECTED' });
  }),
);

/** The gate: out on an approved pass, back in on return. */
opsRouter.post(
  '/leaves/:id/gate',
  requireRole(...OPS),
  validate('body', z.object({ event: z.enum(['OUT', 'IN']) })),
  asyncHandler(async (req, res) => {
    const { event } = req.body as { event: 'OUT' | 'IN' };
    const l = await prisma.hostelLeave.findUnique({ where: { id: String(req.params.id) } });
    if (!l) throw ApiError.notFound('No such pass');
    const now = new Date();
    if (event === 'OUT') {
      if (l.status !== 'APPROVED') throw ApiError.conflict(l.status === 'OUT' ? 'Already out' : 'Only an approved pass lets a student out');
      if (now > l.leaveTo) throw ApiError.conflict('This pass has expired');
      if (now < new Date(l.leaveFrom.getTime() - 2 * 3_600_000)) throw ApiError.conflict('This pass is not valid yet');
      await prisma.hostelLeave.update({ where: { id: l.id }, data: { status: 'OUT', outAt: now } });
    } else {
      if (l.status !== 'OUT') throw ApiError.conflict('The student is not recorded as out');
      await prisma.hostelLeave.update({ where: { id: l.id }, data: { status: 'RETURNED', returnedAt: now } });
    }
    const late = event === 'IN' && now > l.leaveTo;
    await recordFor(req, { module: 'Hostel', action: event === 'OUT' ? 'gate out' : 'gate in', target: l.passNo, outcome: late ? 'WARN' : 'OK', detail: late ? `returned ${Math.round((now.getTime() - l.leaveTo.getTime()) / 60_000)} min late` : '' });
    res.json({ status: event === 'OUT' ? 'OUT' : 'RETURNED', late });
  }),
);

/** Finds an approved pass by its number — what the gate types in or scans. */
opsRouter.get(
  '/passes/:passNo',
  requireRole(...OPS),
  asyncHandler(async (req, res) => {
    const l = await prisma.hostelLeave.findUnique({ where: { passNo: decodeURIComponent(String(req.params.passNo)).toUpperCase() }, include: LEAVE_INCLUDE });
    if (!l) throw ApiError.notFound('No pass with that number');
    res.json(l);
  }),
);

// ─── Visitors ─────────────────────────────────────────────────────────────────

opsRouter.get(
  '/visitors',
  requireRole(...READ),
  validate('query', z.object({ hostelId: z.string().optional(), date: z.string().date().optional(), inside: z.enum(['true', 'false']).optional() })),
  asyncHandler(async (req, res) => {
    const { hostelId, date, inside } = validQuery<{ hostelId?: string; date?: string; inside?: string }>(req);
    const day = date ?? istDate();
    const from = new Date(`${day}T00:00:00+05:30`);
    const to = new Date(from.getTime() + 86_400_000);
    res.json(await prisma.hostelVisitor.findMany({
      where: { ...(hostelId ? { hostelId } : {}), ...(inside === 'true' ? { outAt: null } : { inAt: { gte: from, lt: to } }) },
      include: { student: { select: { name: true, enrolmentNo: true } }, hostel: { select: { code: true } } },
      orderBy: { inAt: 'desc' },
    }));
  }),
);

opsRouter.post(
  '/visitors',
  requireRole(...OPS),
  validate('body', z.object({
    studentId: z.string().min(1),
    visitorName: z.string().trim().min(2).max(120),
    relation: z.string().trim().min(2).max(60),
    phone: z.string().trim().regex(/^[0-9+\- ]{10,20}$/, 'Enter a valid phone number'),
    idProof: z.string().trim().max(80).optional(),
    purpose: z.string().trim().min(3).max(200),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId: string; visitorName: string; relation: string; phone: string; idProof?: string; purpose: string };
    const a = await prisma.hostelAllotment.findUnique({ where: { activeStudent: b.studentId }, select: { room: { select: { hostelId: true } } } });
    if (!a) throw ApiError.conflict('That student does not live in a hostel');
    const v = await prisma.hostelVisitor.create({ data: { ...b, hostelId: a.room.hostelId, recordedBy: await actorName(req) } });
    await recordFor(req, { module: 'Hostel', action: 'visitor in', target: v.visitorName, detail: `${b.relation} of ${b.studentId}` });
    res.status(201).json(v);
  }),
);

opsRouter.post(
  '/visitors/:id/out',
  requireRole(...OPS),
  asyncHandler(async (req, res) => {
    const v = await prisma.hostelVisitor.findUnique({ where: { id: String(req.params.id) } });
    if (!v) throw ApiError.notFound('No such visit');
    if (v.outAt) throw ApiError.conflict('Exit already recorded');
    res.json(await prisma.hostelVisitor.update({ where: { id: v.id }, data: { outAt: new Date() } }));
  }),
);

// ─── Night roll call ──────────────────────────────────────────────────────────

/** Every resident for the night, with any mark already made; those out on a pass come pre-marked on leave. */
opsRouter.get(
  '/rollcall',
  requireRole(...READ),
  validate('query', z.object({ hostelId: z.string().min(1), date: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const { hostelId, date } = validQuery<{ hostelId: string; date?: string }>(req);
    const day = date ?? istDate();
    const night = new Date(`${day}T22:00:00+05:30`);
    const [residents, marks, away] = await Promise.all([
      prisma.hostelAllotment.findMany({ where: { status: 'ACTIVE', room: { hostelId }, allottedAt: { lte: night } }, select: { bed: true, student: { select: { id: true, name: true, enrolmentNo: true } }, room: { select: { roomNo: true } } }, orderBy: [{ room: { roomNo: 'asc' } }, { bed: 'asc' }] }),
      prisma.hostelRollCallEntry.findMany({ where: { hostelId, date: day } }),
      prisma.hostelLeave.findMany({ where: { status: { in: ['OUT', 'APPROVED'] }, leaveFrom: { lte: night }, leaveTo: { gte: night } }, select: { studentId: true, passNo: true, status: true } }),
    ]);
    res.json({
      date: day,
      marked: marks.length > 0,
      residents: residents.map((r) => {
        const m = marks.find((x) => x.studentId === r.student.id);
        const pass = away.find((x) => x.studentId === r.student.id);
        return { ...r.student, room: r.room.roomNo, bed: r.bed, status: m?.status ?? (pass ? 'ON_LEAVE' : null), pass: pass?.passNo ?? null, markedBy: m?.markedBy ?? null };
      }),
    });
  }),
);

opsRouter.post(
  '/rollcall',
  requireRole(...OPS),
  validate('body', z.object({
    hostelId: z.string().min(1),
    date: z.string().date(),
    entries: z.array(z.object({ studentId: z.string().min(1), status: z.enum(['PRESENT', 'ABSENT', 'ON_LEAVE']) })).min(1).max(2000),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { hostelId: string; date: string; entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' }> };
    if (b.date > istDate()) throw ApiError.badRequest('A roll call cannot be marked for a future night');
    const residents = new Set((await prisma.hostelAllotment.findMany({ where: { status: 'ACTIVE', room: { hostelId: b.hostelId } }, select: { studentId: true } })).map((r) => r.studentId));
    const strangers = b.entries.filter((e) => !residents.has(e.studentId));
    if (strangers.length) throw ApiError.badRequest(`${strangers.length} of these students do not live in this hostel`);
    const by = await actorName(req);
    await prisma.$transaction(b.entries.map((e) => prisma.hostelRollCallEntry.upsert({
      where: { hostelId_studentId_date: { hostelId: b.hostelId, studentId: e.studentId, date: b.date } },
      create: { hostelId: b.hostelId, studentId: e.studentId, date: b.date, status: e.status, markedBy: by },
      update: { status: e.status, markedBy: by, markedAt: new Date() },
    })));
    const absent = b.entries.filter((e) => e.status === 'ABSENT');
    // An unexplained absence at night is told to the student at once.
    if (absent.length) {
      await prisma.notification.createMany({ data: absent.map((e) => ({ studentId: e.studentId, kind: 'GENERAL' as const, urgent: true, title: `Marked absent at the hostel roll call, ${b.date}`, body: 'If you were out on a pass, ask the warden to correct it.', href: '/hostel' })) });
    }
    await recordFor(req, { module: 'Hostel', action: 'roll call', target: `${b.hostelId} ${b.date}`, detail: `${b.entries.length} marked, ${absent.length} absent`, outcome: absent.length ? 'WARN' : 'OK' });
    res.json({ marked: b.entries.length, absent: absent.length });
  }),
);

// ─── Mess menu ────────────────────────────────────────────────────────────────

opsRouter.get(
  '/mess/menu',
  requireRole(...READ),
  validate('query', z.object({ hostelId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { hostelId } = validQuery<{ hostelId: string }>(req);
    res.json(await prisma.hostelMessMenu.findMany({ where: { hostelId }, orderBy: { day: 'asc' } }));
  }),
);

opsRouter.put(
  '/mess/menu',
  requireRole(...OPS),
  validate('body', z.object({
    hostelId: z.string().min(1),
    days: z.array(z.object({
      day: z.number().int().min(0).max(6),
      breakfast: z.string().trim().min(2).max(300),
      lunch: z.string().trim().min(2).max(300),
      snacks: z.string().trim().max(300).default(''),
      dinner: z.string().trim().min(2).max(300),
    })).min(1).max(7),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { hostelId: string; days: Array<{ day: number; breakfast: string; lunch: string; snacks: string; dinner: string }> };
    const hostel = await prisma.hostel.findUnique({ where: { id: b.hostelId }, select: { code: true } });
    if (!hostel) throw ApiError.notFound('No such hostel');
    const by = await actorName(req);
    await prisma.$transaction(b.days.map((d) => prisma.hostelMessMenu.upsert({
      where: { hostelId_day: { hostelId: b.hostelId, day: d.day } },
      create: { hostelId: b.hostelId, ...d, updatedBy: by },
      update: { ...d, updatedBy: by },
    })));
    await recordFor(req, { module: 'Hostel', action: 'mess menu', target: hostel.code, detail: `${b.days.length} day(s) published` });
    res.json(await prisma.hostelMessMenu.findMany({ where: { hostelId: b.hostelId }, orderBy: { day: 'asc' } }));
  }),
);

// ─── Billing ──────────────────────────────────────────────────────────────────

opsRouter.get(
  '/billing/runs',
  requireRole(...READ),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.hostelBillRun.findMany({ include: { hostel: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }));
  }),
);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Charges a hostel's residents onto their fee accounts: the month's mess bill
 * at the hostel's rate, or a term's room rent at each room's rate. A run is
 * made once per hostel and period, and nobody is billed twice for the same head.
 */
opsRouter.post(
  '/billing',
  requireRole(...SETUP),
  validate('body', z.object({
    hostelId: z.string().min(1),
    kind: z.enum(['MESS', 'RENT']),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    dueDate: z.string().date(),
  })),
  asyncHandler(async (req, res) => {
    const b = req.body as { hostelId: string; kind: 'MESS' | 'RENT'; month?: string; dueDate: string };
    const hostel = await prisma.hostel.findUnique({ where: { id: b.hostelId } });
    if (!hostel) throw ApiError.notFound('No such hostel');
    if (b.kind === 'MESS' && !b.month) throw ApiError.badRequest('Choose the month');
    if (b.kind === 'MESS' && hostel.messRatePerMonth <= 0) throw ApiError.badRequest(`${hostel.name} has no mess rate set`);
    const term = await currentTerm();
    const period = b.kind === 'MESS' ? b.month! : term;
    if (await prisma.hostelBillRun.findUnique({ where: { hostelId_kind_period: { hostelId: hostel.id, kind: b.kind, period } }, select: { id: true } })) {
      throw ApiError.conflict(`${b.kind === 'MESS' ? 'Mess' : 'Rent'} for ${period} has already been billed in ${hostel.name}`);
    }
    const residents = await prisma.hostelAllotment.findMany({ where: { status: 'ACTIVE', room: { hostelId: hostel.id } }, select: { studentId: true, room: { select: { roomNo: true, rentPerSemester: true } } } });
    if (!residents.length) throw ApiError.conflict(`${hostel.name} has no residents to bill`);
    const label = b.kind === 'MESS' ? `${MONTHS[Number(b.month!.slice(5)) - 1]} ${b.month!.slice(0, 4)}` : term;
    const headOf = (roomNo: string) => (b.kind === 'MESS' ? `Hostel mess — ${label} (${hostel.code})` : `Hostel room rent — ${label} (${hostel.code}/${roomNo})`);
    const existing = new Set((await prisma.feeItem.findMany({ where: { studentId: { in: residents.map((r) => r.studentId) }, head: { startsWith: b.kind === 'MESS' ? `Hostel mess — ${label}` : `Hostel room rent — ${label}` } }, select: { studentId: true } })).map((f) => f.studentId));
    const toBill = residents.filter((r) => !existing.has(r.studentId) && (b.kind === 'MESS' ? hostel.messRatePerMonth : r.room.rentPerSemester) > 0);
    const by = await actorName(req);
    const total = toBill.reduce((t, r) => t + (b.kind === 'MESS' ? hostel.messRatePerMonth : r.room.rentPerSemester), 0);
    await prisma.$transaction([
      prisma.feeItem.createMany({ data: toBill.map((r) => ({ studentId: r.studentId, head: headOf(r.room.roomNo), amount: b.kind === 'MESS' ? hostel.messRatePerMonth : r.room.rentPerSemester, category: 'OTHER' as const, term, dueDate: new Date(`${b.dueDate}T00:00:00.000Z`) })) }),
      prisma.notification.createMany({ data: toBill.map((r) => ({ studentId: r.studentId, kind: 'FEE' as const, title: `${b.kind === 'MESS' ? 'Mess bill' : 'Room rent'} — ${label}`, body: `₹${(b.kind === 'MESS' ? hostel.messRatePerMonth : r.room.rentPerSemester).toLocaleString('en-IN')} is due by ${b.dueDate}. Pay from Fees.`, href: '/fees' })) }),
      prisma.hostelBillRun.create({ data: { hostelId: hostel.id, kind: b.kind, period, rate: b.kind === 'MESS' ? hostel.messRatePerMonth : null, charged: toBill.length, skipped: residents.length - toBill.length, total, runBy: by } }),
    ]);
    await recordFor(req, { module: 'Hostel', action: `${b.kind.toLowerCase()} billing`, target: `${hostel.code} ${period}`, detail: `${toBill.length} charged, ₹${total.toLocaleString('en-IN')}` });
    res.status(201).json({ charged: toBill.length, skipped: residents.length - toBill.length, total, period: label });
  }),
);
