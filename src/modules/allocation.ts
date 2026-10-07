import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, Weekday } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { recordFor } from './itconsole/audit.js';
import { currentTerm } from './faculty/shared.js';

/**
 * Subject allocation: who teaches which subject, to which class, when and
 * where.
 *
 * Allocating a subject writes the three things every other module reads — the
 * teaching assignment (roster, marks sheet), the weekly timetable slots (the
 * lecturer's and the students' timetables, the roll call) and the class's
 * enrolments — in one transaction, after checking that the lecturer, the room
 * and the class are each free at every hour asked for.
 *
 * The principal, registrar and administrator allocate for any department; a
 * head of department allocates only their own department's lecturers.
 */
export const allocationRouter = Router();
allocationRouter.use(requireAuth);

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Who may allocate, and for a head of department, within which department. */
async function allocator(req: Request): Promise<{ department: string | null }> {
  const role = req.auth!.role;
  if (role === 'PRINCIPAL' || role === 'REGISTRAR' || role === 'ADMIN') return { department: null };
  if (role === 'FACULTY' && req.auth!.facultyId) {
    const me = await prisma.faculty.findUnique({ where: { id: req.auth!.facultyId }, select: { isHod: true, department: true } });
    if (me?.isHod) return { department: me.department };
  }
  throw ApiError.forbidden('Subject allocation is for the principal, the registrar, administrators and heads of department');
}

const hours = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh! * 60 + em! - (sh! * 60 + sm!)) / 60;
};
const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) =>
  a.startTime < b.endTime && b.startTime < a.endTime;

const slotInput = z
  .object({
    day: z.enum(DAYS),
    startTime: z.string().regex(TIME, 'Times are HH:MM, 24-hour'),
    endTime: z.string().regex(TIME, 'Times are HH:MM, 24-hour'),
    room: z.string().trim().min(1).max(40).optional(),
  })
  .refine((s) => s.startTime < s.endTime, { message: 'A class must end after it starts' });
type SlotInput = z.infer<typeof slotInput>;

interface Clash { day: string; time: string; kind: 'faculty' | 'room' | 'class'; with: string }

/**
 * Every clash the proposed slots would cause, in plain words. `ignoreSlotIds`
 * leaves out the slots being replaced, so moving a class never clashes with itself.
 */
async function findClashes(opts: {
  term: string;
  facultyId: string;
  programmeId: string;
  semester: number;
  slots: Array<SlotInput & { room: string }>;
  ignoreSlotIds?: string[];
}): Promise<Clash[]> {
  const days = [...new Set(opts.slots.map((s) => s.day))] as Weekday[];
  const existing = await prisma.timetableSlot.findMany({
    where: { term: opts.term, day: { in: days }, cancelled: false, id: { notIn: opts.ignoreSlotIds ?? [] } },
    include: { subject: { select: { code: true, programmeId: true, semester: true } } },
  });
  const clashes: Clash[] = [];
  for (const s of opts.slots) {
    for (const e of existing) {
      if (e.day !== s.day || !overlaps(s, e)) continue;
      const time = `${s.startTime}–${s.endTime}`;
      const what = `${e.subject.code} ${e.startTime}–${e.endTime}`;
      if (e.facultyId === opts.facultyId) clashes.push({ day: s.day, time, kind: 'faculty', with: `${what} (${e.faculty})` });
      if (e.room.trim().toLowerCase() === s.room.trim().toLowerCase()) clashes.push({ day: s.day, time, kind: 'room', with: `${what} in ${e.room}` });
      if (e.subject.programmeId === opts.programmeId && e.subject.semester === opts.semester) {
        clashes.push({ day: s.day, time, kind: 'class', with: `${what} for the same class` });
      }
    }
  }
  // The new slots must not overlap one another either.
  opts.slots.forEach((a, i) => opts.slots.slice(i + 1).forEach((b) => {
    if (a.day === b.day && overlaps(a, b)) clashes.push({ day: a.day, time: `${a.startTime}–${a.endTime}`, kind: 'class', with: `another slot you added (${b.startTime}–${b.endTime})` });
  }));
  return clashes;
}

const CLASH_WORD = { faculty: 'The lecturer already teaches', room: 'The room is taken by', class: 'The class already has' };
function refuseClashes(clashes: Clash[]) {
  if (clashes.length === 0) return;
  const first = clashes[0]!;
  throw ApiError.conflict(
    `Clash on ${first.day} ${first.time}: ${CLASH_WORD[first.kind]} ${first.with}${clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : ''}`,
    { clashes },
  );
}

/** A lecturer's weekly teaching hours this term, from the timetable. */
async function weeklyHours(facultyId: string, term: string, ignoreSlotIds: string[] = []) {
  const slots = await prisma.timetableSlot.findMany({
    where: { facultyId, term, cancelled: false, id: { notIn: ignoreSlotIds } },
    select: { startTime: true, endTime: true },
  });
  return slots.reduce((a, s) => a + hours(s.startTime, s.endTime), 0);
}

async function checkLoad(faculty: { id: string; name: string; maxWeeklyLoad: number }, term: string, adding: number, allowOverload: boolean, ignore: string[] = []) {
  const now = await weeklyHours(faculty.id, term, ignore);
  if (now + adding > faculty.maxWeeklyLoad && !allowOverload) {
    throw ApiError.conflict(
      `${faculty.name} would teach ${(now + adding).toFixed(1)} h a week, above the ${faculty.maxWeeklyLoad} h limit. Confirm the overload to go ahead.`,
      { overload: true, current: now, adding, limit: faculty.maxWeeklyLoad },
    );
  }
}

async function facultyFor(id: string, scope: { department: string | null }) {
  const f = await prisma.faculty.findUnique({ where: { id }, select: { id: true, name: true, department: true, maxWeeklyLoad: true } });
  if (!f) throw ApiError.notFound('No such lecturer');
  if (scope.department && f.department !== scope.department) throw ApiError.forbidden(`As head of ${scope.department} you allocate only your department's lecturers`);
  return f;
}

async function assignmentFor(id: string, scope: { department: string | null }) {
  const a = await prisma.subjectAssignment.findUnique({
    where: { id },
    include: {
      faculty: { select: { id: true, name: true, department: true, maxWeeklyLoad: true } },
      subject: { select: { id: true, code: true, name: true, semester: true, programmeId: true } },
      marksSheet: { select: { status: true, _count: { select: { entries: true } } } },
    },
  });
  if (!a) throw ApiError.notFound('No such allocation');
  if (scope.department && a.faculty.department !== scope.department) throw ApiError.forbidden('That subject is allocated outside your department');
  return a;
}

// ─── GET /api/allocation/options ──────────────────────────────────────────────

allocationRouter.get(
  '/options',
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const term = await currentTerm();
    const [programmes, faculty, slots] = await Promise.all([
      prisma.programme.findMany({
        orderBy: { code: 'asc' },
        include: {
          college: { select: { name: true } },
          subjects: { orderBy: [{ semester: 'asc' }, { code: 'asc' }], select: { id: true, code: true, name: true, credits: true, semester: true } },
        },
      }),
      prisma.faculty.findMany({
        where: scope.department ? { department: scope.department } : {},
        orderBy: [{ department: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, designation: true, department: true, maxWeeklyLoad: true, isHod: true },
      }),
      prisma.timetableSlot.findMany({ where: { term, cancelled: false }, select: { facultyId: true, startTime: true, endTime: true, room: true } }),
    ]);
    const load = new Map<string, number>();
    for (const s of slots) if (s.facultyId) load.set(s.facultyId, (load.get(s.facultyId) ?? 0) + hours(s.startTime, s.endTime));

    res.json({
      term,
      hodDepartment: scope.department,
      departments: [...new Set(faculty.map((f) => f.department))].sort(),
      programmes: programmes.map((p) => ({
        id: p.id, code: p.code, name: p.name, shortName: p.shortName, years: p.years, college: p.college?.name ?? null,
        subjects: p.subjects,
      })),
      faculty: faculty.map((f) => ({ ...f, weeklyHours: Number((load.get(f.id) ?? 0).toFixed(1)) })),
      rooms: [...new Set(slots.map((s) => s.room))].sort(),
    });
  }),
);

// ─── GET /api/allocation?programmeId=&semester= ───────────────────────────────

allocationRouter.get(
  '/',
  validate('query', z.object({ programmeId: z.string().min(1), semester: z.coerce.number().int().min(1).max(12).optional() })),
  asyncHandler(async (req, res) => {
    await allocator(req);
    const { programmeId, semester } = validQuery<{ programmeId: string; semester?: number }>(req);
    const term = await currentTerm();

    const subjects = await prisma.subject.findMany({
      where: { programmeId, ...(semester ? { semester } : {}) },
      orderBy: [{ semester: 'asc' }, { code: 'asc' }],
      include: {
        assignments: {
          where: { term },
          include: {
            faculty: { select: { id: true, name: true, department: true, designation: true } },
            marksSheet: { select: { status: true } },
          },
        },
        timetableSlots: { where: { term }, orderBy: [{ day: 'asc' }, { startTime: 'asc' }] },
        _count: { select: { classSessions: true } },
      },
    });
    const enrolled = await prisma.enrolment.groupBy({
      by: ['subjectId'],
      where: { term, subjectId: { in: subjects.map((s) => s.id) } },
      _count: { _all: true },
    });
    const count = new Map(enrolled.map((e) => [e.subjectId, e._count._all]));
    const classSize = await prisma.student.groupBy({ by: ['semester'], where: { programmeId }, _count: { _all: true } });
    const sizeOf = new Map(classSize.map((c) => [c.semester, c._count._all]));

    res.json({
      term,
      subjects: subjects.map((s) => {
        const a = s.assignments[0] ?? null;
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          credits: s.credits,
          semester: s.semester,
          classSize: sizeOf.get(s.semester) ?? 0,
          enrolled: count.get(s.id) ?? 0,
          classesHeld: s._count.classSessions,
          allocation: a && {
            assignmentId: a.id,
            faculty: a.faculty,
            section: a.section,
            classLabel: a.classLabel,
            room: a.room,
            kind: a.kind,
            marksStatus: a.marksSheet?.status ?? 'NOT_STARTED',
            slots: s.timetableSlots
              .filter((t) => t.facultyId === a.facultyId)
              .map((t) => ({ id: t.id, day: t.day, startTime: t.startTime, endTime: t.endTime, room: t.room, cancelled: t.cancelled })),
          },
        };
      }),
    });
  }),
);

// ─── POST /api/allocation ─────────────────────────────────────────────────────

const createBody = z.object({
  subjectId: z.string().min(1),
  facultyId: z.string().min(1),
  section: z.string().trim().min(1).max(4).default('A'),
  room: z.string().trim().min(1).max(40),
  kind: z.enum(['THEORY', 'LAB', 'PROJECT']).default('THEORY'),
  slots: z.array(slotInput).min(1, 'Give at least one weekly class time').max(12),
  allowOverload: z.boolean().default(false),
});

allocationRouter.post(
  '/',
  validate('body', createBody),
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const body = req.body as z.infer<typeof createBody>;
    const term = await currentTerm();

    const subject = await prisma.subject.findUnique({
      where: { id: body.subjectId },
      include: { programme: { select: { id: true, shortName: true } } },
    });
    if (!subject) throw ApiError.notFound('No such subject');
    const taken = await prisma.subjectAssignment.findFirst({ where: { subjectId: subject.id, term }, include: { faculty: { select: { name: true } } } });
    if (taken) throw ApiError.conflict(`${subject.code} is already allocated to ${taken.faculty.name} this term. Reassign it instead.`);

    const faculty = await facultyFor(body.facultyId, scope);
    const slots = body.slots.map((s) => ({ ...s, room: s.room ?? body.room }));
    refuseClashes(await findClashes({ term, facultyId: faculty.id, programmeId: subject.programmeId, semester: subject.semester, slots }));
    await checkLoad(faculty, term, slots.reduce((a, s) => a + hours(s.startTime, s.endTime), 0), body.allowOverload);

    const classLabel = `${subject.programme.shortName} ${ROMAN[subject.semester] ?? subject.semester} Sem ${body.section}`;
    // The class: every student of the programme in the subject's semester.
    const students = await prisma.student.findMany({ where: { programmeId: subject.programmeId, semester: subject.semester }, select: { id: true } });

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.subjectAssignment.create({
        data: { facultyId: faculty.id, subjectId: subject.id, term, section: body.section, classLabel, room: body.room, kind: body.kind },
      });
      await tx.timetableSlot.createMany({
        data: slots.map((s) => ({ subjectId: subject.id, day: s.day, startTime: s.startTime, endTime: s.endTime, room: s.room, faculty: faculty.name, facultyId: faculty.id, term })),
      });
      for (const st of students) {
        await tx.enrolment.upsert({
          where: { studentId_subjectId_term: { studentId: st.id, subjectId: subject.id, term } },
          create: { studentId: st.id, subjectId: subject.id, term, faculty: faculty.name, facultyId: faculty.id, room: body.room },
          update: { faculty: faculty.name, facultyId: faculty.id, room: body.room },
        });
      }
      return created;
    });

    await recordFor(req, {
      module: 'Allocation',
      action: 'Subject allocated',
      target: `${subject.code} → ${faculty.name}`,
      detail: `${classLabel}, ${slots.map((s) => `${s.day} ${s.startTime}–${s.endTime} ${s.room}`).join('; ')}`,
    });
    res.status(201).json({ assignmentId: assignment.id, classLabel, enrolled: students.length });
  }),
);

// ─── PATCH /api/allocation/:id — reassign, change room/section/kind ───────────

const patchBody = z.object({
  facultyId: z.string().min(1).optional(),
  room: z.string().trim().min(1).max(40).optional(),
  section: z.string().trim().min(1).max(4).optional(),
  kind: z.enum(['THEORY', 'LAB', 'PROJECT']).optional(),
  allowOverload: z.boolean().default(false),
});

allocationRouter.patch(
  '/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', patchBody),
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const body = req.body as z.infer<typeof patchBody>;
    const a = await assignmentFor((req.params as { id: string }).id, scope);
    const slots = await prisma.timetableSlot.findMany({ where: { subjectId: a.subjectId, term: a.term, facultyId: a.facultyId } });
    const slotIds = slots.map((s) => s.id);

    const to = body.facultyId && body.facultyId !== a.facultyId ? await facultyFor(body.facultyId, scope) : null;
    const room = body.room && body.room !== a.room ? body.room : null;
    if (body.kind && body.kind !== a.kind && (a.marksSheet?._count.entries ?? 0) > 0) {
      throw ApiError.conflict('Marks have already been entered against this subject’s components, so its kind cannot change');
    }

    if (to || room) {
      const proposed = slots.map((s) => ({ day: s.day as SlotInput['day'], startTime: s.startTime, endTime: s.endTime, room: room ?? s.room }));
      refuseClashes(await findClashes({
        term: a.term, facultyId: to?.id ?? a.facultyId, programmeId: a.subject.programmeId, semester: a.subject.semester, slots: proposed, ignoreSlotIds: slotIds,
      }));
    }
    if (to) await checkLoad(to, a.term, slots.reduce((x, s) => x + hours(s.startTime, s.endTime), 0), body.allowOverload);

    const section = body.section ?? a.section;
    const classLabel = a.classLabel.replace(/ [A-Z0-9]{1,4}$/, ` ${section}`);
    await prisma.$transaction(async (tx) => {
      await tx.subjectAssignment.update({
        where: { id: a.id },
        data: {
          ...(to ? { facultyId: to.id } : {}),
          ...(room ? { room } : {}),
          ...(body.kind ? { kind: body.kind } : {}),
          section,
          classLabel,
        },
      });
      if (to || room) {
        await tx.timetableSlot.updateMany({
          where: { id: { in: slotIds } },
          data: { ...(to ? { facultyId: to.id, faculty: to.name } : {}), ...(room ? { room } : {}) },
        });
        await tx.enrolment.updateMany({
          where: { subjectId: a.subjectId, term: a.term },
          data: { ...(to ? { facultyId: to.id, faculty: to.name } : {}), ...(room ? { room } : {}) },
        });
      }
      // The components are copied from the kind's template on first open; a new kind starts afresh.
      if (body.kind && body.kind !== a.kind) await tx.marksComponent.deleteMany({ where: { assignmentId: a.id } });
    });

    await recordFor(req, {
      module: 'Allocation',
      action: to ? 'Subject reassigned' : 'Allocation updated',
      target: `${a.subject.code}${to ? `: ${a.faculty.name} → ${to.name}` : ''}`,
      detail: [room && `room ${room}`, body.kind && `kind ${body.kind}`, body.section && `section ${section}`].filter(Boolean).join(', ') || null,
    });
    res.json({ assignmentId: a.id });
  }),
);

// ─── Slots ────────────────────────────────────────────────────────────────────

allocationRouter.post(
  '/:id/slots',
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', slotInput.and(z.object({ allowOverload: z.boolean().default(false) }))),
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const a = await assignmentFor((req.params as { id: string }).id, scope);
    const body = req.body as SlotInput & { allowOverload: boolean };
    const slot = { day: body.day, startTime: body.startTime, endTime: body.endTime, room: body.room ?? a.room };
    refuseClashes(await findClashes({ term: a.term, facultyId: a.facultyId, programmeId: a.subject.programmeId, semester: a.subject.semester, slots: [slot] }));
    await checkLoad(a.faculty, a.term, hours(slot.startTime, slot.endTime), body.allowOverload);
    const created = await prisma.timetableSlot.create({
      data: { subjectId: a.subjectId, ...slot, faculty: a.faculty.name, facultyId: a.facultyId, term: a.term },
    });
    await recordFor(req, { module: 'Allocation', action: 'Class time added', target: a.subject.code, detail: `${slot.day} ${slot.startTime}–${slot.endTime} ${slot.room}` });
    res.status(201).json({ id: created.id });
  }),
);

allocationRouter.delete(
  '/:id/slots/:slotId',
  validate('params', z.object({ id: z.string().min(1), slotId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const { id, slotId } = req.params as { id: string; slotId: string };
    const a = await assignmentFor(id, scope);
    const slot = await prisma.timetableSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.subjectId !== a.subjectId || slot.term !== a.term) throw ApiError.notFound('No such class time for this subject');
    const remaining = await prisma.timetableSlot.count({ where: { subjectId: a.subjectId, term: a.term, facultyId: a.facultyId } });
    if (remaining <= 1) throw ApiError.conflict('A subject needs at least one weekly class. Remove the allocation instead.');
    // Registers already taken keep their own copy of the time; only the weekly slot goes.
    await prisma.timetableSlot.delete({ where: { id: slotId } });
    await recordFor(req, { module: 'Allocation', action: 'Class time removed', target: a.subject.code, detail: `${slot.day} ${slot.startTime}–${slot.endTime}` });
    res.status(204).end();
  }),
);

// ─── DELETE /api/allocation/:id ───────────────────────────────────────────────

allocationRouter.delete(
  '/:id',
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const scope = await allocator(req);
    const a = await assignmentFor((req.params as { id: string }).id, scope);
    const [held, marks] = await Promise.all([
      prisma.classSession.count({ where: { subjectId: a.subjectId, records: { some: {} } } }),
      prisma.markEntry.count({ where: { sheet: { assignmentId: a.id }, value: { not: null } } }),
    ]);
    if (held > 0 || marks > 0) {
      throw ApiError.conflict('Attendance or marks have already been recorded for this subject. Reassign it to another lecturer instead of removing it.');
    }
    const where: Prisma.TimetableSlotWhereInput = { subjectId: a.subjectId, term: a.term, facultyId: a.facultyId };
    await prisma.$transaction([
      prisma.timetableSlot.deleteMany({ where }),
      prisma.enrolment.updateMany({ where: { subjectId: a.subjectId, term: a.term }, data: { facultyId: null, faculty: 'Not allocated' } }),
      prisma.subjectAssignment.delete({ where: { id: a.id } }),
    ]);
    await recordFor(req, { module: 'Allocation', action: 'Allocation removed', target: `${a.subject.code} (${a.faculty.name})` });
    res.status(204).end();
  }),
);
