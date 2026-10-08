import type { Request } from 'express';
import { currentTenant, prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';
import { attendanceBySubject, attendanceOverall } from '../attendance/policy.js';

/**
 * How long a roll call stays editable. After this the sheet is frozen and only
 * an approved correction can move a record, which is what makes the audit
 * trail worth anything.
 */
export const ATTENDANCE_LOCK_HOURS = 24;

/** The statuses that count towards a student's percentage. */
export const PRESENT_STATUSES = ['PRESENT', 'LATE', 'EXCUSED'] as const;

/**
 * The term the current academic session runs under: the latest term anyone
 * is enrolled in, so a new term takes over as soon as its enrolments exist —
 * no code change at the start of a semester. Cached briefly per institute.
 */
const termCache = new Map<string, { term: string; at: number }>();

/**
 * Orders terms in time. As text, 2024-25-ODD sorts after 2024-25-EVEN, which
 * would keep the odd term current for the whole year; the EVEN half of an
 * academic year comes after its ODD half.
 */
export function termRank(term: string): number {
  const m = /^(\d{4})-\d{2}-(ODD|EVEN)$/.exec(term);
  return m ? Number(m[1]) * 2 + (m[2] === 'EVEN' ? 1 : 0) : -1;
}

/** The latest of some terms, or null for none. */
export function latestTerm(terms: string[]): string | null {
  return terms.reduce<string | null>((best, t) => (best === null || termRank(t) > termRank(best) || (termRank(t) === termRank(best) && t > best) ? t : best), null);
}

export async function currentTerm(): Promise<string> {
  const key = currentTenant()?.slug ?? 'default';
  const hit = termCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.term;
  const terms = await prisma.enrolment.findMany({ distinct: ['term'], select: { term: true } });
  const latest = latestTerm(terms.map((t) => t.term));
  const term = latest ?? `${new Date().getFullYear()}-${String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}-ODD`;
  termCache.set(key, { term, at: Date.now() });
  return term;
}

export { ATTENDANCE_THRESHOLD };

/** A sheet marked this long ago can no longer be edited directly. */
export function lockedAt(markedAt: Date | null): Date | null {
  return markedAt ? new Date(markedAt.getTime() + ATTENDANCE_LOCK_HOURS * 3_600_000) : null;
}

export function isLocked(markedAt: Date | null, now = new Date()): boolean {
  const lock = lockedAt(markedAt);
  return lock !== null && lock.getTime() <= now.getTime();
}

/**
 * Loads an assignment and proves it belongs to this lecturer.
 *
 * Every marks and roster route goes through here rather than trusting the id
 * in the URL, so a guessed id returns 404 rather than someone else's class.
 */
export async function ownedAssignment(assignmentId: string, facultyId: string) {
  const assignment = await prisma.subjectAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      subject: { select: { id: true, code: true, name: true, credits: true, semester: true } },
      components: { orderBy: { order: 'asc' } },
    },
  });

  if (!assignment || assignment.facultyId !== facultyId) {
    throw ApiError.notFound('No such class on your teaching load');
  }

  return assignment;
}

/**
 * Loads a class session and proves the caller teaches that subject.
 *
 * A session carries its own facultyId, but a subject can be covered by a
 * substitute, so the assignment is the authority on who may mark it.
 */
export async function ownedSession(sessionId: string, facultyId: string) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { subject: { select: { id: true, code: true, name: true } } },
  });

  if (!session) throw ApiError.notFound('No such class');

  const teaches = await prisma.subjectAssignment.findFirst({
    where: { facultyId, subjectId: session.subjectId },
    select: { id: true },
  });
  // A colleague arranged as the substitute for this very class may take its roll call.
  const covering = teaches ? null : await prisma.timetableChange.findFirst({
    where: { kind: 'SUBSTITUTE', facultyId, subjectId: session.subjectId, date: session.date.toISOString().slice(0, 10), startTime: session.startTime },
    select: { id: true },
  });

  if (!teaches && !covering) throw ApiError.forbidden('You do not teach this subject');

  return session;
}

/** Held and attended per student and subject, keyed "studentId:subjectId" — see attendance/policy.ts. */
export async function attendanceFor(studentIds: string[], subjectIds: string[]) {
  return attendanceBySubject(studentIds, subjectIds);
}

/** Aggregate percentage across every subject a student has been marked in. */
export async function overallAttendance(studentIds: string[]) {
  return attendanceOverall(studentIds);
}

/** The term a request asks about, defaulting to the live academic session. */
export async function requestedTerm(req: Request): Promise<string> {
  const term = req.query.term;
  return typeof term === 'string' && term.length > 0 ? term : currentTerm();
}

/**
 * Today on the Indian calendar, as the midnight-UTC date class sessions are
 * keyed by. "Held so far" means on or before this — comparing with the clock
 * instead would hide today's classes until 05:30 IST.
 */
export function istToday(): Date {
  const n = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
