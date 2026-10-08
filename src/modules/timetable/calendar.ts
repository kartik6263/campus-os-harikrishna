import type { Weekday } from '@prisma/client';
import { prisma } from '../../db.js';
import { currentTerm } from '../faculty/shared.js';

/**
 * What actually happens on a date: the weekly timetable, less holidays and
 * cancelled classes, with room changes and substitutes applied, plus extra
 * (make-up) classes. Every screen that shows a dated class — timetables,
 * today's classes, the roll call, roll-call compliance — reads this, so
 * they cannot disagree.
 */

export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Today on the Indian calendar, yyyy-mm-dd. */
export const istDate = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
/** Minutes past midnight now, Indian time. */
export const istMinutes = () => { const t = new Date(Date.now() + 5.5 * 3_600_000); return t.getUTCHours() * 60 + t.getUTCMinutes(); };
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** MON…SAT for a date, or null on a Sunday. */
export const weekdayOf = (d: string): Weekday | null => { const i = new Date(`${d}T00:00:00Z`).getUTCDay(); return i === 0 ? null : WEEKDAYS[i - 1]!; };
/** The Monday of the week a date falls in. */
export const mondayOf = (d: string) => { const i = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, i === 0 ? -6 : 1 - i); };
export const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;
/** True once a class on this date has ended. */
export const isOver = (date: string, endTime: string) => date < istDate() || (date === istDate() && toMinutes(endTime) <= istMinutes());

export interface Occurrence {
  /** The weekly slot's id, or the extra class's change id: what the roll call is opened against. */
  id: string;
  slotId: string | null;
  extraId: string | null;
  kind: 'REGULAR' | 'EXTRA';
  date: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  room: string;
  subjectId: string;
  code: string;
  subject: string;
  programmeId: string;
  semester: number;
  /** Who teaches this occurrence (the substitute, if one is arranged). */
  facultyId: string | null;
  faculty: string;
  /** Whose class it is on the weekly timetable. */
  regularFacultyId: string | null;
  regularFaculty: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'HOLIDAY';
  /** Why it is not happening, or why it was added. */
  note: string | null;
  cancelId: string | null;
  roomChange: { id: string; from: string; reason: string } | null;
  substitute: { id: string; reason: string } | null;
  makeupFor: { date: string; startTime: string } | null;
}

export interface OccurrenceFilter {
  from: string;
  to: string;
  subjectIds?: string[];
  programmeId?: string;
  semester?: number;
  /** The teacher, either as the one teaching or as the one whose class it is. */
  facultyId?: string;
  room?: string;
  term?: string;
}

/** Every class between two dates (inclusive), sorted by date and time. */
export async function occurrences(f: OccurrenceFilter): Promise<Occurrence[]> {
  const term = f.term ?? (await currentTerm());
  const subjectWhere = {
    ...(f.subjectIds ? { id: { in: f.subjectIds } } : {}),
    ...(f.programmeId ? { programmeId: f.programmeId } : {}),
    ...(f.semester ? { semester: f.semester } : {}),
  };
  const [slots, changes, holidays] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { term, subject: subjectWhere }, include: { subject: { select: { code: true, name: true, programmeId: true, semester: true } } } }),
    prisma.timetableChange.findMany({ where: { term, date: { gte: f.from, lte: f.to }, subject: subjectWhere }, include: { subject: { select: { code: true, name: true, programmeId: true, semester: true } } } }),
    prisma.holiday.findMany({ where: { date: { gte: f.from, lte: f.to } }, select: { date: true, name: true } }),
  ]);
  const holiday = new Map(holidays.map((h) => [h.date, h.name]));
  const bySlotDate = new Map<string, typeof changes>();
  for (const c of changes) if (c.slotId) { const k = `${c.slotId}:${c.date}`; bySlotDate.set(k, [...(bySlotDate.get(k) ?? []), c]); }
  const makeupOf = new Map(changes.filter((c) => c.kind === 'CANCEL').map((c) => [c.id, c]));

  const out: Occurrence[] = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
    const day = weekdayOf(d);
    if (!day) continue;
    for (const s of slots.filter((x) => x.day === day)) {
      const ch = bySlotDate.get(`${s.id}:${d}`) ?? [];
      const cancel = ch.find((c) => c.kind === 'CANCEL');
      const room = ch.find((c) => c.kind === 'ROOM');
      const sub = ch.find((c) => c.kind === 'SUBSTITUTE');
      const hol = holiday.get(d);
      out.push({
        id: s.id, slotId: s.id, extraId: null, kind: 'REGULAR', date: d, day,
        startTime: s.startTime, endTime: s.endTime, room: room?.room ?? s.room,
        subjectId: s.subjectId, code: s.subject.code, subject: s.subject.name, programmeId: s.subject.programmeId, semester: s.subject.semester,
        facultyId: sub?.facultyId ?? s.facultyId, faculty: sub?.faculty ?? s.faculty, regularFacultyId: s.facultyId, regularFaculty: s.faculty,
        status: hol ? 'HOLIDAY' : cancel || s.cancelled ? 'CANCELLED' : 'SCHEDULED',
        note: hol ?? cancel?.reason ?? (s.cancelled ? s.cancelReason : null) ?? sub?.reason ?? room?.reason ?? null,
        cancelId: cancel?.id ?? null,
        roomChange: room ? { id: room.id, from: s.room, reason: room.reason } : null,
        substitute: sub ? { id: sub.id, reason: sub.reason } : null,
        makeupFor: null,
      });
    }
    for (const e of changes.filter((c) => c.kind === 'EXTRA' && c.date === d)) {
      const of = e.makeupForId ? makeupOf.get(e.makeupForId) : undefined;
      out.push({
        id: e.id, slotId: null, extraId: e.id, kind: 'EXTRA', date: d, day,
        startTime: e.startTime, endTime: e.endTime, room: e.room,
        subjectId: e.subjectId, code: e.subject.code, subject: e.subject.name, programmeId: e.subject.programmeId, semester: e.subject.semester,
        facultyId: e.facultyId, faculty: e.faculty, regularFacultyId: e.facultyId, regularFaculty: e.faculty,
        status: holiday.has(d) ? 'HOLIDAY' : 'SCHEDULED', note: holiday.get(d) ?? e.reason, cancelId: null, roomChange: null, substitute: null,
        makeupFor: of ? { date: of.date, startTime: of.startTime } : null,
      });
    }
  }
  return out
    .filter((o) => !f.facultyId || o.facultyId === f.facultyId || o.regularFacultyId === f.facultyId)
    .filter((o) => !f.room || o.room.trim().toLowerCase() === f.room.trim().toLowerCase())
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.code.localeCompare(b.code));
}

/** The one occurrence a slot or extra-class id stands for on a date, or null. */
export async function occurrenceOf(id: string, date: string): Promise<Occurrence | null> {
  const extra = await prisma.timetableChange.findUnique({ where: { id }, select: { kind: true, subjectId: true, date: true, term: true } });
  if (extra?.kind === 'EXTRA') {
    if (extra.date !== date) return null;
    return (await occurrences({ from: date, to: date, subjectIds: [extra.subjectId], term: extra.term })).find((o) => o.id === id) ?? null;
  }
  const slot = await prisma.timetableSlot.findUnique({ where: { id }, select: { subjectId: true, term: true } });
  if (!slot) return null;
  return (await occurrences({ from: date, to: date, subjectIds: [slot.subjectId], term: slot.term })).find((o) => o.id === id) ?? null;
}

export interface DatedClash { kind: 'faculty' | 'room' | 'class'; with: string }

/**
 * What a class at this date and time would collide with: the teacher, the
 * room or the class already busy. `ignore` leaves out the occurrence being
 * changed, so moving a class never clashes with itself.
 */
export async function datedClashes(p: { date: string; startTime: string; endTime: string; room?: string; facultyId?: string | null; programmeId?: string; semester?: number; ignore?: string }): Promise<DatedClash[]> {
  const busy = (await occurrences({ from: p.date, to: p.date })).filter((o) => o.status === 'SCHEDULED' && o.id !== p.ignore && overlaps(o, p));
  const out: DatedClash[] = [];
  for (const o of busy) {
    const what = `${o.code} ${o.startTime}–${o.endTime}`;
    if (p.facultyId && o.facultyId === p.facultyId) out.push({ kind: 'faculty', with: `${what} (${o.faculty})` });
    if (p.room && o.room.trim().toLowerCase() === p.room.trim().toLowerCase()) out.push({ kind: 'room', with: `${what} in ${o.room}` });
    if (p.programmeId && o.programmeId === p.programmeId && o.semester === p.semester) out.push({ kind: 'class', with: `${what} for the same class` });
  }
  return out;
}

/** The next date (today included, if the class has not ended) a weekly slot meets on. */
export function nextDateOf(day: Weekday, endTime: string): string {
  const today = istDate();
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    if (weekdayOf(d) === day && !(i === 0 && toMinutes(endTime) <= istMinutes())) return d;
  }
  return today;
}
