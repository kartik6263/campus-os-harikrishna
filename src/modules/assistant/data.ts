import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { institutionOverview } from '../insights.js';
import { attendanceSql, currentPolicy } from '../attendance/policy.js';

/**
 * What the campus assistant may look up.
 *
 * Every function here is a read over the live tables, scoped to what the
 * asking user may see: a lecturer gets their own college, administration the
 * whole institution. The assistant can only answer from what these return, so
 * it cannot quote a figure the records do not hold.
 */

export interface Scope {
  /** Restrict to one college (a lecturer's or office's own); null for the whole institution. */
  collegeId: string | null;
  label: string;
}

const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);
const collegeFilter = (scope: Scope, alias = 's') =>
  scope.collegeId ? Prisma.sql`AND ${Prisma.raw(alias)}."collegeId" = ${scope.collegeId}` : Prisma.empty;

/** Attendance, fees owed, last result and risk for a set of students. */
async function studentFacts(ids: string[]) {
  if (ids.length === 0) return new Map<string, { attendance: number | null; feesDue: number; cgpa: number | null; risk: { score: number; band: string } | null }>();
  const att = attendanceSql(Prisma.raw('s.id'), currentPolicy());
  const rows = await prisma.$queryRaw<Array<{ id: string; expected: bigint; present: bigint; due: bigint; cgpa: number | null; score: number | null; band: string | null }>>`
    SELECT s.id,
      ${att.held}::bigint AS expected,
      ${att.attended}::bigint AS present,
      (SELECT COALESCE(SUM(f.amount - f.paid), 0) FROM fee_items f WHERE f."studentId" = s.id)::bigint AS due,
      (SELECT r.cgpa FROM semester_results r WHERE r."studentId" = s.id AND r.published ORDER BY r.semester DESC LIMIT 1) AS cgpa,
      (SELECT ra.score FROM risk_assessments ra WHERE ra."studentId" = s.id ORDER BY ra."assessedAt" DESC LIMIT 1) AS score,
      (SELECT ra.band::text FROM risk_assessments ra WHERE ra."studentId" = s.id ORDER BY ra."assessedAt" DESC LIMIT 1) AS band
    FROM students s WHERE s.id IN (${Prisma.join(ids)})`;
  return new Map(rows.map((r) => [r.id, {
    attendance: pct(Number(r.present), Number(r.expected)),
    feesDue: Number(r.due),
    cgpa: r.cgpa,
    risk: r.score !== null && r.band ? { score: r.score, band: r.band } : null,
  }]));
}

export async function overview(scope: Scope) {
  const o = await institutionOverview();
  if (!scope.collegeId) return o;
  const college = o.colleges.find((c) => c.id === scope.collegeId);
  return { note: `Institution-wide figures; your college is ${college?.name ?? 'not set'}.`, ...o };
}

export async function findStudents(scope: Scope, query: string) {
  const like = { contains: query, mode: 'insensitive' as const };
  const students = await prisma.student.findMany({
    where: { OR: [{ name: like }, { enrolmentNo: like }, { rollNo: like }], ...(scope.collegeId ? { collegeId: scope.collegeId } : {}) },
    select: { id: true, name: true, enrolmentNo: true, semester: true, category: true, programme: { select: { shortName: true } }, college: { select: { name: true } }, mentorships: { select: { faculty: { select: { name: true } } }, take: 1 } },
    take: 8,
  });
  const facts = await studentFacts(students.map((s) => s.id));
  return students.map((s) => ({
    name: s.name,
    enrolmentNo: s.enrolmentNo,
    programme: `${s.programme.shortName} Sem ${s.semester}`,
    college: s.college.name,
    mentor: s.mentorships[0]?.faculty.name ?? null,
    attendancePercent: facts.get(s.id)?.attendance ?? null,
    feesDueRupees: facts.get(s.id)?.feesDue ?? 0,
    latestCgpa: facts.get(s.id)?.cgpa ?? null,
    risk: facts.get(s.id)?.risk ?? null,
  }));
}

export async function atRiskStudents(scope: Scope, minBand: 'MODERATE' | 'HIGH' | 'CRITICAL' = 'HIGH', limit = 15) {
  const bands = minBand === 'CRITICAL' ? ['CRITICAL'] : minBand === 'HIGH' ? ['HIGH', 'CRITICAL'] : ['MODERATE', 'HIGH', 'CRITICAL'];
  const rows = await prisma.$queryRaw<Array<{ id: string; score: number; band: string; basis: string }>>`
    SELECT latest.* FROM (
      SELECT DISTINCT ON (ra."studentId") ra."studentId" AS id, ra.score, ra.band::text AS band, ra.basis
      FROM risk_assessments ra JOIN students s ON s.id = ra."studentId"
      WHERE true ${collegeFilter(scope)}
      ORDER BY ra."studentId", ra."assessedAt" DESC
    ) latest WHERE latest.band IN (${Prisma.join(bands)}) ORDER BY latest.score DESC LIMIT ${limit}`;
  const students = await prisma.student.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } }, college: { select: { name: true } } },
  });
  const facts = await studentFacts(rows.map((r) => r.id));
  const byId = new Map(students.map((s) => [s.id, s]));
  return rows.map((r) => {
    const s = byId.get(r.id)!;
    return {
      name: s.name, enrolmentNo: s.enrolmentNo, programme: `${s.programme.shortName} Sem ${s.semester}`, college: s.college.name,
      score: r.score, band: r.band, basis: r.basis,
      attendancePercent: facts.get(r.id)?.attendance ?? null, feesDueRupees: facts.get(r.id)?.feesDue ?? 0, latestCgpa: facts.get(r.id)?.cgpa ?? null,
    };
  });
}

export async function feeDefaulters(scope: Scope, limit = 15) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; enrolmentNo: string; college: string; due: bigint; billed: bigint }>>`
    SELECT s.id, s.name, s."enrolmentNo", c.name AS college, SUM(f.amount - f.paid)::bigint AS due, SUM(f.amount)::bigint AS billed
    FROM fee_items f JOIN students s ON s.id = f."studentId" JOIN colleges c ON c.id = s."collegeId"
    WHERE true ${collegeFilter(scope)}
    GROUP BY s.id, c.name HAVING SUM(f.amount - f.paid) > 0
    ORDER BY due DESC LIMIT ${limit}`;
  const [totals] = await prisma.$queryRaw<Array<{ students: bigint; due: bigint }>>`
    SELECT COUNT(*)::bigint AS students, COALESCE(SUM(due), 0)::bigint AS due FROM (
      SELECT SUM(f.amount - f.paid) AS due FROM fee_items f JOIN students s ON s.id = f."studentId"
      WHERE true ${collegeFilter(scope)} GROUP BY s.id HAVING SUM(f.amount - f.paid) > 0) t`;
  return {
    studentsWithDues: Number(totals?.students ?? 0),
    totalOutstandingRupees: Number(totals?.due ?? 0),
    largest: rows.map((r) => ({ name: r.name, enrolmentNo: r.enrolmentNo, college: r.college, dueRupees: Number(r.due), billedRupees: Number(r.billed) })),
  };
}

/** Attendance, fee collection and risk side by side, per college or per programme. */
export async function compare(scope: Scope, by: 'college' | 'programme') {
  const att = attendanceSql(Prisma.raw('s.id'), currentPolicy());
  const key = by === 'college' ? Prisma.sql`c.name` : Prisma.sql`p.name`;
  const rows = await prisma.$queryRaw<Array<{ name: string; students: bigint; expected: bigint; present: bigint; billed: bigint; paid: bigint; high: bigint }>>`
    SELECT ${key} AS name, COUNT(DISTINCT s.id)::bigint AS students,
      COALESCE(SUM(att.expected), 0)::bigint AS expected, COALESCE(SUM(att.present), 0)::bigint AS present,
      COALESCE(SUM(fee.billed), 0)::bigint AS billed, COALESCE(SUM(fee.paid), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE risk.band IN ('HIGH','CRITICAL'))::bigint AS high
    FROM students s
    JOIN colleges c ON c.id = s."collegeId"
    JOIN programmes p ON p.id = s."programmeId"
    LEFT JOIN LATERAL (
      SELECT ${att.held} AS expected,
             ${att.attended} AS present
    ) att ON true
    LEFT JOIN LATERAL (SELECT SUM(f.amount) AS billed, SUM(f.paid) AS paid FROM fee_items f WHERE f."studentId" = s.id) fee ON true
    LEFT JOIN LATERAL (SELECT ra.band::text AS band FROM risk_assessments ra WHERE ra."studentId" = s.id ORDER BY ra."assessedAt" DESC LIMIT 1) risk ON true
    WHERE true ${collegeFilter(scope)}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    [by]: r.name,
    students: Number(r.students),
    attendancePercent: pct(Number(r.present), Number(r.expected)),
    feeCollectionPercent: pct(Number(r.paid), Number(r.billed)),
    outstandingRupees: Number(r.billed) - Number(r.paid),
    highRiskStudents: Number(r.high),
  }));
}

/** Students under an attendance threshold — the detention list. */
export async function lowAttendance(scope: Scope, threshold = currentPolicy().threshold, limit = 20) {
  const att = attendanceSql(Prisma.raw('s.id'), currentPolicy());
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; enrolmentNo: string; college: string; expected: bigint; present: bigint }>>`
    SELECT * FROM (
      SELECT s.id, s.name, s."enrolmentNo", c.name AS college,
        ${att.held}::bigint AS expected,
        ${att.attended}::bigint AS present
      FROM students s JOIN colleges c ON c.id = s."collegeId" WHERE true ${collegeFilter(scope)}
    ) t WHERE t.expected > 0 AND (t.present::float / t.expected) * 100 < ${threshold}
    ORDER BY (t.present::float / t.expected) ASC LIMIT ${limit}`;
  const [count] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT ${att.held} AS expected,
             ${att.attended} AS present
      FROM students s WHERE true ${collegeFilter(scope)}) t
    WHERE t.expected > 0 AND (t.present::float / t.expected) * 100 < ${threshold}`;
  return {
    thresholdPercent: threshold,
    studentsBelow: Number(count?.n ?? 0),
    lowest: rows.map((r) => ({ name: r.name, enrolmentNo: r.enrolmentNo, college: r.college, attendancePercent: pct(Number(r.present), Number(r.expected)), classesHeld: Number(r.expected), attended: Number(r.present) })),
  };
}
