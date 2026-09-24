import type { Request } from 'express';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';

/**
 * How long a roll call stays editable. After this the sheet is frozen and only
 * an approved correction can move a record, which is what makes the audit
 * trail worth anything.
 */
export const ATTENDANCE_LOCK_HOURS = 24;

/** The statuses that count towards a student's percentage. */
export const PRESENT_STATUSES = ['PRESENT', 'LATE', 'EXCUSED'] as const;

/** The term the current academic session runs under. */
export const CURRENT_TERM = '2024-25-ODD';

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

  if (!teaches) throw ApiError.forbidden('You do not teach this subject');

  return session;
}

/**
 * Running attendance for a set of students across a set of subjects.
 *
 * Deliberately the same rule the student portal uses — every session held for
 * the subject is the denominator — so a lecturer and a student never see two
 * different percentages for the same class.
 */
export async function attendanceFor(studentIds: string[], subjectIds: string[]) {
  if (studentIds.length === 0 || subjectIds.length === 0) {
    return new Map<string, { present: number; total: number; percent: number }>();
  }

  const [sessions, records] = await Promise.all([
    prisma.classSession.findMany({
      where: { subjectId: { in: subjectIds } },
      select: { id: true, subjectId: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { studentId: { in: studentIds }, status: { in: [...PRESENT_STATUSES] } },
      select: { studentId: true, sessionId: true },
    }),
  ]);

  const subjectOfSession = new Map(sessions.map((s) => [s.id, s.subjectId]));
  const heldBySubject = new Map<string, number>();
  for (const s of sessions) {
    heldBySubject.set(s.subjectId, (heldBySubject.get(s.subjectId) ?? 0) + 1);
  }

  const presentByKey = new Map<string, number>();
  for (const r of records) {
    const subjectId = subjectOfSession.get(r.sessionId);
    if (!subjectId) continue;
    const key = `${r.studentId}:${subjectId}`;
    presentByKey.set(key, (presentByKey.get(key) ?? 0) + 1);
  }

  // Keyed "studentId:subjectId" so one pass serves a whole roster.
  const out = new Map<string, { present: number; total: number; percent: number }>();
  for (const studentId of studentIds) {
    for (const subjectId of subjectIds) {
      const total = heldBySubject.get(subjectId) ?? 0;
      const present = presentByKey.get(`${studentId}:${subjectId}`) ?? 0;
      out.set(`${studentId}:${subjectId}`, {
        present,
        total,
        percent: total === 0 ? 0 : Number(((present / total) * 100).toFixed(1)),
      });
    }
  }

  return out;
}

/** Aggregate percentage across every subject a student is enrolled in. */
export async function overallAttendance(studentIds: string[]) {
  const out = new Map<string, { present: number; total: number; percent: number }>();
  if (studentIds.length === 0) return out;

  const enrolments = await prisma.enrolment.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, subjectId: true },
  });

  const subjectIds = [...new Set(enrolments.map((e) => e.subjectId))];
  const perSubject = await attendanceFor(studentIds, subjectIds);

  // Group once rather than re-scanning the enrolment list per student.
  const subjectsOf = new Map<string, string[]>();
  for (const e of enrolments) {
    subjectsOf.set(e.studentId, [...(subjectsOf.get(e.studentId) ?? []), e.subjectId]);
  }

  for (const studentId of studentIds) {
    let present = 0;
    let total = 0;
    for (const subjectId of subjectsOf.get(studentId) ?? []) {
      const cell = perSubject.get(`${studentId}:${subjectId}`);
      if (!cell) continue;
      present += cell.present;
      total += cell.total;
    }
    out.set(studentId, {
      present,
      total,
      percent: total === 0 ? 0 : Number(((present / total) * 100).toFixed(1)),
    });
  }

  return out;
}

/** The term a request asks about, defaulting to the live academic session. */
export function requestedTerm(req: Request): string {
  const term = req.query.term;
  return typeof term === 'string' && term.length > 0 ? term : CURRENT_TERM;
}
