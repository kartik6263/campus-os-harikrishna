import { Prisma, type AttendancePolicy } from '@prisma/client';
import { currentTenant, prisma } from '../../db.js';

/**
 * The attendance rule, in one place.
 *
 * A class counts for a student once its roll call has been submitted (a
 * draft, or a QR window still open, does not) and the student was on that
 * roll. Present, excused (approved leave) and — if the policy says so — late
 * count as attended. Every percentage in the system, from the student's own
 * screen to exam eligibility, risk scoring and the assistant, comes from here.
 */

const DEFAULTS = { threshold: 75, condonationFloor: 65, warnBelow: 80, lateCountsAsPresent: true, leaveBackdateDays: 15 };
const cache = new Map<string, { at: number; policy: AttendancePolicy }>();

export async function attendancePolicy(): Promise<AttendancePolicy> {
  const key = currentTenant()?.slug ?? 'default';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.policy;
  const policy = await prisma.attendancePolicy.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default', ...DEFAULTS } });
  cache.set(key, { at: Date.now(), policy });
  return policy;
}

export function forgetPolicy() {
  cache.delete(currentTenant()?.slug ?? 'default');
}

/** The statuses that count as attending, under the policy. */
export function attendedStatuses(p: Pick<AttendancePolicy, 'lateCountsAsPresent'>): Array<'PRESENT' | 'LATE' | 'EXCUSED'> {
  return p.lateCountsAsPresent ? ['PRESENT', 'LATE', 'EXCUSED'] : ['PRESENT', 'EXCUSED'];
}

export const pct = (present: number, total: number) => (total === 0 ? 0 : Number(((present / total) * 100).toFixed(1)));

/** Classes still to attend, without a miss, before a subject clears the bar. */
export function classesNeeded(present: number, total: number, threshold: number) {
  if (total > 0 && (present / total) * 100 >= threshold) return 0;
  const frac = threshold / 100;
  return Math.max(0, Math.ceil((frac * total - present) / (1 - frac)));
}

/** Classes a student could miss and still stay at or above the bar. */
export function classesToSpare(present: number, total: number, threshold: number) {
  if (total === 0) return 0;
  return Math.max(0, Math.floor((present * 100) / threshold - total));
}

/** Held and attended per student and subject, keyed "studentId:subjectId". */
export async function attendanceBySubject(studentIds: string[], subjectIds?: string[]) {
  const out = new Map<string, { present: number; total: number; percent: number }>();
  if (studentIds.length === 0 || (subjectIds && subjectIds.length === 0)) return out;
  const p = await attendancePolicy();
  const rows = await prisma.$queryRaw<Array<{ studentId: string; subjectId: string; total: bigint; present: bigint }>>`
    SELECT ar."studentId", cs."subjectId", COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ar.status::text IN (${Prisma.join(attendedStatuses(p))}))::bigint AS present
    FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar."sessionId"
    WHERE cs."markedAt" IS NOT NULL AND ar."studentId" IN (${Prisma.join(studentIds)})
      ${subjectIds ? Prisma.sql`AND cs."subjectId" IN (${Prisma.join(subjectIds)})` : Prisma.empty}
    GROUP BY 1, 2`;
  for (const r of rows) {
    const total = Number(r.total);
    const present = Number(r.present);
    out.set(`${r.studentId}:${r.subjectId}`, { present, total, percent: pct(present, total) });
  }
  return out;
}

/** Held and attended per student, across every subject. */
export async function attendanceOverall(studentIds: string[]) {
  const out = new Map<string, { present: number; total: number; percent: number }>();
  if (studentIds.length === 0) return out;
  const p = await attendancePolicy();
  const rows = await prisma.$queryRaw<Array<{ studentId: string; total: bigint; present: bigint }>>`
    SELECT ar."studentId", COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ar.status::text IN (${Prisma.join(attendedStatuses(p))}))::bigint AS present
    FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar."sessionId"
    WHERE cs."markedAt" IS NOT NULL AND ar."studentId" IN (${Prisma.join(studentIds)})
    GROUP BY 1`;
  for (const id of studentIds) out.set(id, { present: 0, total: 0, percent: 0 });
  for (const r of rows) {
    const total = Number(r.total);
    const present = Number(r.present);
    out.set(r.studentId, { present, total, percent: pct(present, total) });
  }
  return out;
}

/** The same rule as SQL, for reports that aggregate in the database: held and attended for a student column. */
export function attendanceSql(studentCol: Prisma.Sql, p: Pick<AttendancePolicy, 'lateCountsAsPresent'>) {
  return {
    held: Prisma.sql`(SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar."sessionId" WHERE cs."markedAt" IS NOT NULL AND ar."studentId" = ${studentCol})`,
    attended: Prisma.sql`(SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar."sessionId" WHERE cs."markedAt" IS NOT NULL AND ar."studentId" = ${studentCol} AND ar.status::text IN (${Prisma.join(attendedStatuses(p))}))`,
  };
}

/**
 * The policy as last loaded for this institute, for code that cannot wait.
 * Every request loads it first (see primePolicy), so it is never older than
 * a minute; before any load it is the defaults every institute starts with.
 */
export function currentPolicy(): Pick<AttendancePolicy, 'threshold' | 'condonationFloor' | 'warnBelow' | 'lateCountsAsPresent' | 'leaveBackdateDays'> {
  return cache.get(currentTenant()?.slug ?? 'default')?.policy ?? DEFAULTS;
}

/** Express middleware: load the policy before the route runs. */
export function primePolicy(_req: unknown, _res: unknown, next: (err?: unknown) => void) {
  attendancePolicy().then(() => next(), next);
}
