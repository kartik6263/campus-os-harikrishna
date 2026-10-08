import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import {
  WEEKDAYS, addDays, datedClashes, istDate, isOver, mondayOf, occurrenceOf, occurrences, overlaps, weekdayOf,
  type DatedClash, type Occurrence,
} from './calendar.js';

/**
 * Timetable management (/api/timetable): the dated week for anyone — a
 * student, a parent, a lecturer, or staff looking at a class, a teacher or
 * a room; changes to single dated classes (cancel, reschedule, room change,
 * substitute, extra class) with clash checks and notices to the class; the
 * free-room and free-teacher finders; the room list and bell schedule; and
 * a health check of the whole term's timetable.
 *
 * The weekly pattern itself is written by subject allocation (/api/allocation).
 */
export const timetableRouter = Router();
timetableRouter.use(requireAuth);

const STAFF = ['FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'] as const;
const SENIOR = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const errClash = (c: DatedClash[]) => {
  const word = { faculty: 'the teacher already has', room: 'the room is taken by', class: 'the class already has' };
  const f = c[0]!;
  return ApiError.conflict(`Clash: ${word[f.kind]} ${f.with}${c.length > 1 ? ` (and ${c.length - 1} more)` : ''}`, { clashes: c });
};

interface Actor { role: string; userId: string; name: string; facultyId: string | null; isHod: boolean; department: string | null; collegeId: string | null }
async function actor(req: Request): Promise<Actor> {
  const u = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { email: true, faculty: { select: { id: true, name: true, isHod: true, department: true, collegeId: true } }, office: { select: { name: true, collegeId: true } } } });
  return {
    role: req.auth!.role, userId: req.auth!.sub,
    name: u?.faculty?.name ?? u?.office?.name ?? u?.email ?? 'Staff',
    facultyId: u?.faculty?.id ?? null, isHod: !!u?.faculty?.isHod, department: u?.faculty?.department ?? null,
    collegeId: u?.faculty?.collegeId ?? u?.office?.collegeId ?? null,
  };
}

/** May this person change this class? Its own lecturer, their head of department, or a senior office. */
async function mayChange(a: Actor, regularFacultyId: string | null) {
  if (SENIOR.includes(a.role)) return;
  if (a.role === 'FACULTY' && a.facultyId) {
    if (regularFacultyId === a.facultyId) return;
    if (a.isHod && regularFacultyId) {
      const f = await prisma.faculty.findUnique({ where: { id: regularFacultyId }, select: { department: true } });
      if (f?.department === a.department) return;
    }
  }
  throw ApiError.forbidden('Only the class’s own lecturer, their head of department or the principal can change it');
}

/** Has a roll call already been submitted for this occurrence? Then it happened, and stays as it is. */
async function rollCallTaken(o: { subjectId: string; date: string; startTime: string }) {
  const s = await prisma.classSession.findUnique({ where: { subjectId_date_startTime: { subjectId: o.subjectId, date: new Date(`${o.date}T00:00:00Z`), startTime: o.startTime } }, select: { markedAt: true } });
  return !!s?.markedAt;
}

async function notifyClass(subjectId: string, term: string, title: string, body: string, urgent = false) {
  const enrolled = await prisma.enrolment.findMany({ where: { subjectId, term, student: { status: 'ACTIVE' } }, select: { studentId: true } });
  if (enrolled.length) await prisma.notification.createMany({ data: enrolled.map((e) => ({ studentId: e.studentId, kind: 'GENERAL' as const, title, body, urgent, href: '/timetable' })) });
  return enrolled.length;
}

const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

async function knownRoom(code: string) {
  const rooms = await prisma.room.findMany({ where: { active: true }, select: { code: true, capacity: true } });
  if (!rooms.length) return code.trim();
  const r = rooms.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
  if (!r) throw ApiError.badRequest(`${code} is not on the room list`);
  return r.code;
}

// ─── The dated week ───────────────────────────────────────────────────────────

const weekQuery = z.object({
  weekOf: z.string().date().optional(),
  scope: z.enum(['me', 'class', 'faculty', 'room']).default('me'),
  programmeId: z.string().optional(),
  semester: z.coerce.number().int().min(1).max(24).optional(),
  facultyId: z.string().optional(),
  room: z.string().max(40).optional(),
});

function shapeWeek(from: string, occ: Occurrence[], holidays: Array<{ date: string; name: string }>) {
  return WEEKDAYS.map((day, i) => {
    const date = addDays(from, i);
    return { date, day, holiday: holidays.find((h) => h.date === date)?.name ?? null, classes: occ.filter((o) => o.date === date) };
  });
}

timetableRouter.get(
  '/week',
  validate('query', weekQuery),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof weekQuery>>(req);
    const from = mondayOf(q.weekOf ?? istDate());
    const to = addDays(from, 5);
    const term = await currentTerm();
    const role = req.auth!.role;
    let occ: Occurrence[];
    let title: string;

    if (q.scope === 'me') {
      if (role === 'STUDENT' || role === 'PARENT') {
        const studentId = await resolveStudentId(req);
        const [enrolled, s] = await Promise.all([
          prisma.enrolment.findMany({ where: { studentId, term }, select: { subjectId: true } }),
          prisma.student.findUnique({ where: { id: studentId }, select: { name: true, semester: true, programme: { select: { shortName: true } } } }),
        ]);
        occ = await occurrences({ from, to, subjectIds: enrolled.map((e) => e.subjectId), term });
        title = s ? `${s.name} · ${s.programme.shortName} semester ${s.semester}` : 'My timetable';
      } else if (role === 'FACULTY') {
        const a = await actor(req);
        if (!a.facultyId) throw ApiError.forbidden('No faculty record');
        occ = await occurrences({ from, to, facultyId: a.facultyId, term });
        title = a.name;
      } else throw ApiError.badRequest('Choose a class, a teacher or a room');
    } else {
      if (!(STAFF as readonly string[]).includes(role)) throw ApiError.forbidden('Only staff can look at other timetables');
      if (q.scope === 'class') {
        if (!q.programmeId || !q.semester) throw ApiError.badRequest('Choose the programme and semester');
        const p = await prisma.programme.findUnique({ where: { id: q.programmeId }, select: { shortName: true } });
        if (!p) throw ApiError.notFound('No such programme');
        occ = await occurrences({ from, to, programmeId: q.programmeId, semester: q.semester, term });
        title = `${p.shortName} semester ${q.semester}`;
      } else if (q.scope === 'faculty') {
        if (!q.facultyId) throw ApiError.badRequest('Choose the teacher');
        const f = await prisma.faculty.findUnique({ where: { id: q.facultyId }, select: { name: true } });
        if (!f) throw ApiError.notFound('No such teacher');
        occ = await occurrences({ from, to, facultyId: q.facultyId, term });
        title = f.name;
      } else {
        if (!q.room) throw ApiError.badRequest('Choose the room');
        occ = await occurrences({ from, to, room: q.room, term });
        title = `Room ${q.room}`;
      }
    }
    const [holidays, periods] = await Promise.all([
      prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, name: true } }),
      prisma.bellPeriod.findMany({ orderBy: { startTime: 'asc' } }),
    ]);
    res.json({ term, title, weekOf: from, today: istDate(), periods, days: shapeWeek(from, occ, holidays) });
  }),
);

/** The weekly pattern (no dates) — what is printed and pinned on the notice board. */
timetableRouter.get(
  '/pattern',
  requireRole(...STAFF),
  validate('query', weekQuery.omit({ weekOf: true })),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof weekQuery>>(req);
    const term = await currentTerm();
    if (q.scope === 'me') throw ApiError.badRequest('Choose a class, a teacher or a room');
    const slots = await prisma.timetableSlot.findMany({
      where: {
        term,
        ...(q.scope === 'class' ? { subject: { programmeId: q.programmeId ?? '-', semester: q.semester ?? -1 } } : {}),
        ...(q.scope === 'faculty' ? { facultyId: q.facultyId ?? '-' } : {}),
        ...(q.scope === 'room' ? { room: { equals: q.room ?? '-', mode: 'insensitive' as const } } : {}),
      },
      include: { subject: { select: { code: true, name: true, semester: true, programme: { select: { shortName: true } } } } },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });
    const periods = await prisma.bellPeriod.findMany({ orderBy: { startTime: 'asc' } });
    res.json({
      term, periods,
      slots: slots.map((s) => ({ id: s.id, day: s.day, startTime: s.startTime, endTime: s.endTime, room: s.room, faculty: s.faculty, code: s.subject.code, subject: s.subject.name, classLabel: `${s.subject.programme.shortName} sem ${s.subject.semester}`, suspended: s.cancelled })),
    });
  }),
);

// ─── Choices for staff screens ────────────────────────────────────────────────

timetableRouter.get(
  '/options',
  requireRole(...STAFF),
  asyncHandler(async (_req, res) => {
    const term = await currentTerm();
    const [programmes, classes, faculty, rooms, periods] = await Promise.all([
      prisma.programme.findMany({ orderBy: { code: 'asc' }, select: { id: true, shortName: true, name: true, years: true } }),
      prisma.subject.findMany({ where: { timetableSlots: { some: { term } } }, distinct: ['programmeId', 'semester'], select: { programmeId: true, semester: true } }),
      prisma.faculty.findMany({ orderBy: [{ department: 'asc' }, { name: 'asc' }], select: { id: true, name: true, department: true, designation: true } }),
      prisma.room.findMany({ orderBy: { code: 'asc' } }),
      prisma.bellPeriod.findMany({ orderBy: { startTime: 'asc' } }),
    ]);
    res.json({ term, today: istDate(), programmes, classes, faculty, rooms, periods });
  }),
);

/** The rooms free for a whole period on a date, best fit first. */
timetableRouter.get(
  '/free-rooms',
  requireRole(...STAFF),
  validate('query', z.object({ date: z.string().date(), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), capacity: z.coerce.number().int().min(0).max(5000).default(0) })),
  asyncHandler(async (req, res) => {
    const q = validQuery<{ date: string; startTime: string; endTime: string; capacity: number }>(req);
    if (q.startTime >= q.endTime) throw ApiError.badRequest('The period must end after it starts');
    const busy = (await occurrences({ from: q.date, to: q.date })).filter((o) => o.status === 'SCHEDULED' && overlaps(o, q)).map((o) => o.room.toLowerCase());
    const rooms = await prisma.room.findMany({ where: { active: true, capacity: { gte: q.capacity } }, orderBy: [{ capacity: 'asc' }, { code: 'asc' }] });
    res.json(rooms.filter((r) => !busy.includes(r.code.toLowerCase())));
  }),
);

/** Teachers with no class in a period on a date — the substitute list, the lecturer's department first. */
timetableRouter.get(
  '/free-faculty',
  requireRole(...STAFF),
  validate('query', z.object({ date: z.string().date(), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), department: z.string().max(120).optional() })),
  asyncHandler(async (req, res) => {
    const q = validQuery<{ date: string; startTime: string; endTime: string; department?: string }>(req);
    const day = await occurrences({ from: q.date, to: q.date });
    const busy = new Set(day.filter((o) => o.status === 'SCHEDULED' && overlaps(o, q)).map((o) => o.facultyId));
    const onLeave = await prisma.facultyLeave.findMany({ where: { status: 'APPROVED', fromDate: { lte: new Date(`${q.date}T00:00:00Z`) }, toDate: { gte: new Date(`${q.date}T00:00:00Z`) } }, select: { facultyId: true } });
    const away = new Set(onLeave.map((l) => l.facultyId));
    const faculty = await prisma.faculty.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, department: true, designation: true } });
    const load = new Map<string, number>();
    for (const o of day) if (o.status === 'SCHEDULED' && o.facultyId) load.set(o.facultyId, (load.get(o.facultyId) ?? 0) + 1);
    res.json(faculty.filter((f) => !busy.has(f.id) && !away.has(f.id))
      .map((f) => ({ ...f, classesThatDay: load.get(f.id) ?? 0, sameDepartment: !!q.department && f.department === q.department }))
      .sort((a, b) => Number(b.sameDepartment) - Number(a.sameDepartment) || a.classesThatDay - b.classesThatDay || a.name.localeCompare(b.name)));
  }),
);

// ─── Dated changes ────────────────────────────────────────────────────────────

const changeBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('CANCEL'), slotId: z.string().min(1), date: z.string().date(), reason: z.string().trim().min(10).max(300), notify: z.boolean().default(true),
    makeup: z.object({ date: z.string().date(), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), room: z.string().trim().min(1).max(40) }).optional(),
  }),
  z.object({ kind: z.literal('ROOM'), slotId: z.string().min(1), date: z.string().date(), room: z.string().trim().min(1).max(40), reason: z.string().trim().min(5).max(300) }),
  z.object({ kind: z.literal('SUBSTITUTE'), slotId: z.string().min(1), date: z.string().date(), facultyId: z.string().min(1), reason: z.string().trim().min(5).max(300) }),
  z.object({ kind: z.literal('EXTRA'), subjectId: z.string().min(1), date: z.string().date(), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), room: z.string().trim().min(1).max(40), reason: z.string().trim().min(5).max(300) }),
]);
type ChangeBody = z.infer<typeof changeBody>;

/** Shared checks for an extra or make-up class. */
async function checkExtra(p: { date: string; startTime: string; endTime: string; room: string; facultyId: string | null; programmeId: string; semester: number }) {
  if (p.startTime >= p.endTime) throw ApiError.badRequest('The class must end after it starts');
  if (!weekdayOf(p.date)) throw ApiError.badRequest('Classes are not held on Sundays');
  if (isOver(p.date, p.startTime)) throw ApiError.badRequest('An extra class must be in the future');
  if (await prisma.holiday.findUnique({ where: { date: p.date }, select: { id: true } })) throw ApiError.badRequest(`${p.date} is a holiday`);
  const clashes = await datedClashes(p);
  if (clashes.length) throw errClash(clashes);
}

/** Creates one dated change; exported for the lecturer's old cancel route. */
export async function makeChange(req: Request, body: ChangeBody) {
  const a = await actor(req);
  const term = await currentTerm();

  if (body.kind === 'EXTRA') {
    const assignment = await prisma.subjectAssignment.findFirst({ where: { subjectId: body.subjectId, term }, include: { faculty: { select: { id: true, name: true } }, subject: { select: { code: true, name: true, programmeId: true, semester: true } } } });
    if (!assignment) throw ApiError.badRequest('That subject is not allocated to a lecturer this term');
    await mayChange(a, assignment.facultyId);
    const room = await knownRoom(body.room);
    await checkExtra({ date: body.date, startTime: body.startTime, endTime: body.endTime, room, facultyId: assignment.facultyId, programmeId: assignment.subject.programmeId, semester: assignment.subject.semester });
    const c = await prisma.timetableChange.create({ data: { kind: 'EXTRA', subjectId: body.subjectId, term, date: body.date, startTime: body.startTime, endTime: body.endTime, room, facultyId: assignment.facultyId, faculty: assignment.faculty.name, reason: body.reason, createdBy: a.name, createdById: a.userId } });
    const notified = await notifyClass(body.subjectId, term, `Extra class — ${assignment.subject.code}`, `${assignment.subject.name}: ${dayLabel(body.date)} ${body.startTime}–${body.endTime} in ${room}. ${body.reason}`);
    await recordFor(req, { module: 'Timetable', action: 'extra class', target: assignment.subject.code, detail: `${body.date} ${body.startTime}–${body.endTime} ${room}` });
    return { change: c, notified };
  }

  const o = await occurrenceOf(body.slotId, body.date);
  if (!o || o.kind !== 'REGULAR') throw ApiError.badRequest('That class does not meet on that date');
  await mayChange(a, o.regularFacultyId);
  if (o.status === 'HOLIDAY') throw ApiError.conflict(`${body.date} is a holiday (${o.note})`);
  if (o.status === 'CANCELLED') throw ApiError.conflict('That class is already cancelled');
  if (await rollCallTaken(o)) throw ApiError.conflict('The roll call for this class is already taken; it cannot be changed now');
  if (isOver(o.date, o.endTime)) throw ApiError.badRequest('That class is already over');
  const base = { slotId: o.slotId, subjectId: o.subjectId, term, date: o.date, startTime: o.startTime, endTime: o.endTime, createdBy: a.name, createdById: a.userId };
  const what = `${o.code} ${dayLabel(o.date)} ${o.startTime}–${o.endTime}`;

  if (body.kind === 'CANCEL') {
    let makeupRoom: string | null = null;
    if (body.makeup) {
      makeupRoom = await knownRoom(body.makeup.room);
      await checkExtra({ ...body.makeup, room: makeupRoom, facultyId: o.regularFacultyId, programmeId: o.programmeId, semester: o.semester });
    }
    const change = await prisma.$transaction(async (tx) => {
      const c = await tx.timetableChange.create({ data: { ...base, kind: 'CANCEL', room: o.room, facultyId: o.facultyId, faculty: o.faculty, reason: body.reason } });
      if (body.makeup) await tx.timetableChange.create({ data: { ...base, slotId: null, kind: 'EXTRA', date: body.makeup.date, startTime: body.makeup.startTime, endTime: body.makeup.endTime, room: makeupRoom!, facultyId: o.regularFacultyId, faculty: o.regularFaculty, reason: `Make-up for ${dayLabel(o.date)}`, makeupForId: c.id } });
      return c;
    });
    const notified = body.notify
      ? await notifyClass(o.subjectId, term, `Class cancelled — ${o.code}`, `${o.subject} (${dayLabel(o.date)} ${o.startTime}–${o.endTime}) is cancelled. ${body.reason}${body.makeup ? ` Make-up class: ${dayLabel(body.makeup.date)} ${body.makeup.startTime}–${body.makeup.endTime} in ${makeupRoom}.` : ''}`, true)
      : 0;
    await recordFor(req, { module: 'Timetable', action: body.makeup ? 'class rescheduled' : 'class cancelled', target: what, detail: body.reason });
    return { change, notified };
  }

  if (body.kind === 'ROOM') {
    if (o.roomChange) throw ApiError.conflict(`It has already been moved to ${o.room}; undo that first`);
    const room = await knownRoom(body.room);
    if (room.toLowerCase() === o.room.toLowerCase()) throw ApiError.badRequest(`It is already in ${room}`);
    const clashes = (await datedClashes({ date: o.date, startTime: o.startTime, endTime: o.endTime, room, ignore: o.id }));
    if (clashes.length) throw errClash(clashes);
    const change = await prisma.timetableChange.create({ data: { ...base, kind: 'ROOM', room, facultyId: o.facultyId, faculty: o.faculty, reason: body.reason } });
    const notified = await notifyClass(o.subjectId, term, `Room change — ${o.code}`, `${o.subject} on ${dayLabel(o.date)} ${o.startTime}–${o.endTime} moves from ${o.room} to ${room}. ${body.reason}`);
    await recordFor(req, { module: 'Timetable', action: 'room changed', target: what, detail: `${o.room} → ${room}: ${body.reason}` });
    return { change, notified };
  }

  // SUBSTITUTE
  if (o.substitute) throw ApiError.conflict(`${o.faculty} is already covering it; undo that first`);
  if (body.facultyId === o.regularFacultyId) throw ApiError.badRequest('Choose a colleague, not the class’s own lecturer');
  const sub = await prisma.faculty.findUnique({ where: { id: body.facultyId }, select: { id: true, name: true } });
  if (!sub) throw ApiError.notFound('No such teacher');
  const clashes = await datedClashes({ date: o.date, startTime: o.startTime, endTime: o.endTime, facultyId: sub.id, ignore: o.id });
  if (clashes.length) throw errClash(clashes);
  const change = await prisma.timetableChange.create({ data: { ...base, kind: 'SUBSTITUTE', room: o.room, facultyId: sub.id, faculty: sub.name, reason: body.reason } });
  const notified = await notifyClass(o.subjectId, term, `Substitute teacher — ${o.code}`, `${sub.name} takes ${o.subject} on ${dayLabel(o.date)} ${o.startTime}–${o.endTime} in place of ${o.regularFaculty}.`);
  await recordFor(req, { module: 'Timetable', action: 'substitute arranged', target: what, detail: `${o.regularFaculty} → ${sub.name}: ${body.reason}` });
  return { change, notified };
}

timetableRouter.post(
  '/changes',
  requireRole('FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  validate('body', changeBody),
  asyncHandler(async (req, res) => {
    const r = await makeChange(req, req.body as ChangeBody);
    res.status(201).json({ id: r.change.id, kind: r.change.kind, notified: r.notified });
  }),
);

/** Undoes a change before the class: the class goes back to how the weekly timetable has it. */
export async function undoChange(req: Request, id: string) {
  const a = await actor(req);
  const c = await prisma.timetableChange.findUnique({ where: { id }, include: { subject: { select: { code: true, name: true } }, slot: { select: { facultyId: true } } } });
  if (!c) throw ApiError.notFound('No such change');
  await mayChange(a, c.slot?.facultyId ?? c.facultyId);
  const makeups = c.kind === 'CANCEL' ? await prisma.timetableChange.findMany({ where: { makeupForId: c.id } }) : [];
  for (const x of [c, ...makeups]) {
    const at = x.kind === 'EXTRA' ? x : c;
    if (await rollCallTaken({ subjectId: at.subjectId, date: at.date, startTime: at.startTime })) throw ApiError.conflict('A roll call has already been taken for this class, so the change stands');
  }
  if (isOver(c.date, c.endTime) && c.kind !== 'CANCEL') throw ApiError.conflict('That class is already over');
  if (c.kind === 'CANCEL' && isOver(c.date, c.endTime)) throw ApiError.conflict('The class time has passed; the cancellation stands');
  await prisma.timetableChange.deleteMany({ where: { id: { in: [c.id, ...makeups.map((m) => m.id)] } } });
  const when = `${dayLabel(c.date)} ${c.startTime}–${c.endTime}`;
  const msg = {
    CANCEL: [`Class back on — ${c.subject.code}`, `${c.subject.name} on ${when} will be held after all.${makeups.length ? ' The make-up class is withdrawn.' : ''}`],
    ROOM: [`Room change withdrawn — ${c.subject.code}`, `${c.subject.name} on ${when} stays in its usual room.`],
    SUBSTITUTE: [`Substitute withdrawn — ${c.subject.code}`, `${c.subject.name} on ${when} is taken by its usual lecturer.`],
    EXTRA: [`Extra class withdrawn — ${c.subject.code}`, `The extra class of ${c.subject.name} on ${when} will not be held.`],
  }[c.kind];
  const notified = await notifyClass(c.subjectId, c.term, msg[0]!, msg[1]!);
  await recordFor(req, { module: 'Timetable', action: 'change withdrawn', target: `${c.subject.code} ${c.date} ${c.startTime}`, detail: c.kind });
  return { notified, kind: c.kind, slotId: c.slotId };
}

timetableRouter.delete(
  '/changes/:id',
  requireRole('FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await undoChange(req, String(req.params.id)));
  }),
);

/** The change log for a period: the senior offices see all; a head their department; a lecturer their own classes. */
timetableRouter.get(
  '/changes',
  requireRole(...STAFF),
  validate('query', z.object({ from: z.string().date().optional(), to: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const a = await actor(req);
    const q = validQuery<{ from?: string; to?: string }>(req);
    const from = q.from ?? addDays(istDate(), -7);
    const to = q.to ?? addDays(istDate(), 30);
    const term = await currentTerm();
    let facultyIds: string[] | null = null;
    if (a.role === 'FACULTY') {
      facultyIds = a.isHod ? (await prisma.faculty.findMany({ where: { department: a.department ?? '-' }, select: { id: true } })).map((f) => f.id) : [a.facultyId ?? '-'];
    }
    const rows = await prisma.timetableChange.findMany({
      where: { term, date: { gte: from, lte: to }, ...(facultyIds ? { OR: [{ facultyId: { in: facultyIds } }, { slot: { facultyId: { in: facultyIds } } }] } : {}) },
      include: { subject: { select: { code: true, name: true, semester: true, programme: { select: { shortName: true } } } }, slot: { select: { room: true, faculty: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    res.json({
      from, to,
      changes: rows.map((c) => ({
        id: c.id, kind: c.kind, date: c.date, startTime: c.startTime, endTime: c.endTime, room: c.room, usualRoom: c.slot?.room ?? null,
        faculty: c.faculty, usualFaculty: c.slot?.faculty ?? null, code: c.subject.code, subject: c.subject.name, classLabel: `${c.subject.programme.shortName} sem ${c.subject.semester}`,
        reason: c.reason, makeupForId: c.makeupForId, createdBy: c.createdBy, createdAt: c.createdAt, past: isOver(c.date, c.endTime),
      })),
    });
  }),
);

// ─── Rooms ────────────────────────────────────────────────────────────────────

const roomBody = z.object({
  code: z.string().trim().min(1).max(40),
  building: z.string().trim().max(80).default(''),
  capacity: z.number().int().min(1).max(5000),
  kind: z.enum(['CLASSROOM', 'LAB', 'HALL', 'SEMINAR', 'OTHER']).default('CLASSROOM'),
});
const roomPatch = z.object({
  building: z.string().trim().max(80).optional(),
  capacity: z.number().int().min(1).max(5000).optional(),
  kind: z.enum(['CLASSROOM', 'LAB', 'HALL', 'SEMINAR', 'OTHER']).optional(),
  active: z.boolean().optional(),
});

timetableRouter.get('/rooms', requireRole(...STAFF), asyncHandler(async (_req, res) => {
  const term = await currentTerm();
  const [rooms, slots] = await Promise.all([prisma.room.findMany({ orderBy: { code: 'asc' } }), prisma.timetableSlot.findMany({ where: { term, cancelled: false }, select: { room: true, startTime: true, endTime: true } })]);
  const hours = new Map<string, number>();
  for (const s of slots) { const k = s.room.toLowerCase(); hours.set(k, (hours.get(k) ?? 0) + (Number(s.endTime.slice(0, 2)) * 60 + Number(s.endTime.slice(3)) - Number(s.startTime.slice(0, 2)) * 60 - Number(s.startTime.slice(3))) / 60); }
  res.json(rooms.map((r) => ({ ...r, weeklyHours: Number((hours.get(r.code.toLowerCase()) ?? 0).toFixed(1)) })));
}));

timetableRouter.post('/rooms', requireRole('OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'), validate('body', roomBody), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof roomBody>;
  if (await prisma.room.findFirst({ where: { code: { equals: b.code, mode: 'insensitive' } }, select: { id: true } })) throw ApiError.conflict(`${b.code} is already on the list`);
  const r = await prisma.room.create({ data: b });
  await recordFor(req, { module: 'Timetable', action: 'room added', target: b.code, detail: `${b.kind}, ${b.capacity} seats` });
  res.status(201).json(r);
}));

timetableRouter.patch('/rooms/:id', requireRole('OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'), validate('body', roomPatch), asyncHandler(async (req, res) => {
  const r = await prisma.room.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw ApiError.notFound('No such room');
  const b = req.body as z.infer<typeof roomPatch>;
  if (b.active === false) {
    const term = await currentTerm();
    const using = await prisma.timetableSlot.count({ where: { term, room: { equals: r.code, mode: 'insensitive' } } });
    if (using) throw ApiError.conflict(`${using} weekly class${using === 1 ? '' : 'es'} still meet in ${r.code}; move them first`);
  }
  const u = await prisma.room.update({ where: { id: r.id }, data: b });
  await recordFor(req, { module: 'Timetable', action: 'room updated', target: r.code, detail: JSON.stringify(b) });
  res.json(u);
}));

// ─── Bell schedule ────────────────────────────────────────────────────────────

timetableRouter.get('/periods', asyncHandler(async (_req, res) => { res.json(await prisma.bellPeriod.findMany({ orderBy: { startTime: 'asc' } })); }));

timetableRouter.put(
  '/periods',
  requireRole('PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  validate('body', z.object({ periods: z.array(z.object({ label: z.string().trim().min(1).max(40), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), isBreak: z.boolean().default(false) })).max(20) })),
  asyncHandler(async (req, res) => {
    const periods = [...(req.body as { periods: Array<{ label: string; startTime: string; endTime: string; isBreak: boolean }> }).periods].sort((x, y) => x.startTime.localeCompare(y.startTime));
    periods.forEach((p, i) => {
      if (p.startTime >= p.endTime) throw ApiError.badRequest(`${p.label} must end after it starts`);
      const next = periods[i + 1];
      if (next && next.startTime < p.endTime) throw ApiError.badRequest(`${p.label} overlaps ${next.label}`);
    });
    await prisma.$transaction([prisma.bellPeriod.deleteMany(), prisma.bellPeriod.createMany({ data: periods })]);
    await recordFor(req, { module: 'Timetable', action: 'bell schedule saved', target: `${periods.length} periods` });
    res.json(await prisma.bellPeriod.findMany({ orderBy: { startTime: 'asc' } }));
  }),
);

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Everything wrong with this term's weekly timetable: double-booked teachers
 * and rooms, a class in two places, rooms too small for the class, classes
 * in rooms not on the list, lecturers over their weekly limit, and
 * allocated subjects with no class time.
 */
timetableRouter.get(
  '/health',
  requireRole(...STAFF),
  asyncHandler(async (_req, res) => {
    const term = await currentTerm();
    const [slots, rooms, sizes, faculty, assignments] = await Promise.all([
      prisma.timetableSlot.findMany({ where: { term, cancelled: false }, include: { subject: { select: { code: true, programmeId: true, semester: true, programme: { select: { shortName: true } } } } } }),
      prisma.room.findMany(),
      prisma.student.groupBy({ by: ['programmeId', 'semester'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      prisma.faculty.findMany({ select: { id: true, name: true, maxWeeklyLoad: true } }),
      prisma.subjectAssignment.findMany({ where: { term }, include: { subject: { select: { id: true, code: true, name: true } }, faculty: { select: { name: true } } } }),
    ]);
    const label = (s: (typeof slots)[number]) => `${s.subject.code} ${s.day} ${s.startTime}–${s.endTime}`;
    const issues: Array<{ kind: 'teacher' | 'room' | 'class' | 'capacity' | 'unknown-room' | 'overload' | 'no-slots'; severity: 'error' | 'warning'; text: string }> = [];
    for (const day of WEEKDAYS) {
      const d = slots.filter((s) => s.day === day);
      for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
        const x = d[i]!; const y = d[j]!;
        if (!overlaps(x, y)) continue;
        if (x.facultyId && x.facultyId === y.facultyId) issues.push({ kind: 'teacher', severity: 'error', text: `${x.faculty} is in two classes: ${label(x)} and ${label(y)}` });
        if (x.room.toLowerCase() === y.room.toLowerCase()) issues.push({ kind: 'room', severity: 'error', text: `${x.room} is booked twice: ${label(x)} and ${label(y)}` });
        if (x.subject.programmeId === y.subject.programmeId && x.subject.semester === y.subject.semester && x.subjectId !== y.subjectId) issues.push({ kind: 'class', severity: 'error', text: `${x.subject.programme.shortName} sem ${x.subject.semester} has two classes at once: ${label(x)} and ${label(y)}` });
      }
    }
    const roomBy = new Map(rooms.map((r) => [r.code.toLowerCase(), r]));
    const sizeOf = new Map(sizes.map((s) => [`${s.programmeId}:${s.semester}`, s._count._all]));
    const seen = new Set<string>();
    for (const s of slots) {
      const r = roomBy.get(s.room.toLowerCase());
      const size = sizeOf.get(`${s.subject.programmeId}:${s.subject.semester}`) ?? 0;
      if (!r && rooms.length && !seen.has(`u:${s.room}`)) { seen.add(`u:${s.room}`); issues.push({ kind: 'unknown-room', severity: 'warning', text: `${s.room} (used by ${s.subject.code}) is not on the room list` }); }
      if (r && size > r.capacity && !seen.has(`c:${s.room}:${s.subjectId}`)) { seen.add(`c:${s.room}:${s.subjectId}`); issues.push({ kind: 'capacity', severity: 'warning', text: `${s.subject.code} has ${size} students but ${r.code} seats ${r.capacity}` }); }
      if (r && !r.active) issues.push({ kind: 'unknown-room', severity: 'warning', text: `${label(s)} meets in ${r.code}, which is marked out of use` });
    }
    for (const f of faculty) {
      const h = slots.filter((s) => s.facultyId === f.id).reduce((t, s) => t + (Number(s.endTime.slice(0, 2)) * 60 + Number(s.endTime.slice(3)) - Number(s.startTime.slice(0, 2)) * 60 - Number(s.startTime.slice(3))) / 60, 0);
      if (h > f.maxWeeklyLoad) issues.push({ kind: 'overload', severity: 'warning', text: `${f.name} teaches ${h.toFixed(1)} h a week, above the ${f.maxWeeklyLoad} h limit` });
    }
    for (const a of assignments) {
      if (!slots.some((s) => s.subjectId === a.subject.id && s.facultyId === a.facultyId)) issues.push({ kind: 'no-slots', severity: 'error', text: `${a.subject.code} ${a.subject.name} (${a.faculty.name}) has no weekly class time` });
    }
    res.json({ term, slots: slots.length, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, issues });
  }),
);
