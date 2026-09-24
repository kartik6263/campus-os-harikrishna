import { prisma } from '../../db.js';
import { overallAttendance } from '../faculty/shared.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';

/**
 * The risk model.
 *
 * This is not machine learning and does not pretend to be. It is a weighted
 * score over records the system already holds — attendance actually marked,
 * results actually declared, fees actually owed — and every factor it uses is
 * returned alongside the score with the weight it carried. A score nobody can
 * argue with is a score nobody should trust.
 *
 * It reports how much record it had to go on rather than a confidence figure,
 * because the number of marked sessions behind a score is a real quantity and
 * a confidence percentage would be invented.
 */

export interface Factor {
  factor: string;
  value: string;
  /** Whether this pushed the score up (worse) or down (better). */
  direction: 'negative' | 'positive' | 'neutral';
  weight: number;
  contribution: number;
}

export interface Assessment {
  studentId: string;
  score: number;
  band: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: Factor[];
  basis: string;
  dataPoints: number;
}

/** How much each signal can move the score, out of 100. */
export const WEIGHTS = {
  attendance: 0.4,
  results: 0.25,
  backlogs: 0.2,
  fees: 0.15,
} as const;

/** Attendance this far under the bar is past recovering by attending more. */
const DEBARMENT_LINE = 50;
const CGPA_FLOOR = 5.0;

function bandFor(score: number): Assessment['band'] {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MODERATE';
  return 'LOW';
}

/**
 * Scores a set of students.
 *
 * Every figure is read from the same rows the rest of the system reports, so
 * a student the model calls at risk is one whose own portal shows the same
 * attendance and the same arrears.
 */
export async function assess(studentIds: string[]): Promise<Map<string, Assessment>> {
  const out = new Map<string, Assessment>();
  if (studentIds.length === 0) return out;

  const [attendance, results, feeItems, sessionsSeen] = await Promise.all([
    overallAttendance(studentIds),
    prisma.semesterResult.findMany({
      where: { studentId: { in: studentIds }, published: true },
      select: { studentId: true, cgpa: true, semester: true },
      orderBy: { semester: 'desc' },
    }),
    prisma.feeItem.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, amount: true, paid: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
    }),
  ]);

  // Backlogs: subjects failed in a declared result.
  const failures = await prisma.subjectResult.findMany({
    where: { passed: false, result: { studentId: { in: studentIds } } },
    select: { result: { select: { studentId: true } } },
  });
  const backlogsByStudent = new Map<string, number>();
  for (const f of failures) {
    const id = f.result.studentId;
    backlogsByStudent.set(id, (backlogsByStudent.get(id) ?? 0) + 1);
  }

  const latestCgpa = new Map<string, number>();
  for (const r of results) if (!latestCgpa.has(r.studentId)) latestCgpa.set(r.studentId, r.cgpa);

  const dueByStudent = new Map<string, number>();
  for (const f of feeItems) {
    dueByStudent.set(f.studentId, (dueByStudent.get(f.studentId) ?? 0) + (f.amount - f.paid));
  }

  const recordsByStudent = new Map(sessionsSeen.map((s) => [s.studentId, s._count._all]));

  for (const studentId of studentIds) {
    const factors: Factor[] = [];
    const att = attendance.get(studentId);
    const percent = att?.percent ?? 0;
    const held = att?.total ?? 0;

    // ── Attendance ────────────────────────────────────────────────────────
    if (held === 0) {
      factors.push({
        factor: 'Attendance',
        value: 'no classes marked yet',
        direction: 'neutral',
        weight: WEIGHTS.attendance,
        contribution: 0,
      });
    } else {
      // Linear from the threshold down to the debarment line, so a student
      // just under the bar is not treated like one who has stopped coming.
      const shortfall = Math.max(0, ATTENDANCE_THRESHOLD - percent);
      const span = ATTENDANCE_THRESHOLD - DEBARMENT_LINE;
      const severity = Math.min(1, shortfall / span);
      factors.push({
        factor: 'Attendance',
        value: `${percent}% of ${held} classes`,
        direction: percent < ATTENDANCE_THRESHOLD ? 'negative' : 'positive',
        weight: WEIGHTS.attendance,
        contribution: Math.round(severity * WEIGHTS.attendance * 100),
      });
    }

    // ── Results ───────────────────────────────────────────────────────────
    const cgpa = latestCgpa.get(studentId);
    if (cgpa === undefined) {
      factors.push({
        factor: 'Results',
        value: 'no result declared yet',
        direction: 'neutral',
        weight: WEIGHTS.results,
        contribution: 0,
      });
    } else {
      // Ten-point scale: a CGPA at or above the floor contributes nothing.
      const severity = Math.min(1, Math.max(0, (CGPA_FLOOR - cgpa) / CGPA_FLOOR));
      factors.push({
        factor: 'Results',
        value: `CGPA ${cgpa.toFixed(2)}`,
        direction: cgpa < CGPA_FLOOR ? 'negative' : 'positive',
        weight: WEIGHTS.results,
        contribution: Math.round(severity * WEIGHTS.results * 100),
      });
    }

    // ── Backlogs ──────────────────────────────────────────────────────────
    const backlogs = backlogsByStudent.get(studentId) ?? 0;
    factors.push({
      factor: 'Backlogs',
      value: backlogs === 0 ? 'none' : `${backlogs} subject(s) failed`,
      direction: backlogs > 0 ? 'negative' : 'positive',
      weight: WEIGHTS.backlogs,
      // Three or more backlogs is the whole of this weight.
      contribution: Math.round(Math.min(1, backlogs / 3) * WEIGHTS.backlogs * 100),
    });

    // ── Fees ──────────────────────────────────────────────────────────────
    const due = dueByStudent.get(studentId) ?? 0;
    factors.push({
      factor: 'Fee arrears',
      value: due === 0 ? 'nothing outstanding' : `Rs ${due.toLocaleString('en-IN')} outstanding`,
      direction: due > 0 ? 'negative' : 'positive',
      weight: WEIGHTS.fees,
      // Ten thousand rupees outstanding is the whole of this weight.
      contribution: Math.round(Math.min(1, due / 10000) * WEIGHTS.fees * 100),
    });

    const score = Math.min(100, factors.reduce((sum, f) => sum + f.contribution, 0));
    const dataPoints = (recordsByStudent.get(studentId) ?? 0) + (cgpa === undefined ? 0 : 1);

    const drivers = factors
      .filter((f) => f.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .map((f) => f.factor.toLowerCase());

    out.set(studentId, {
      studentId,
      score,
      band: bandFor(score),
      factors,
      basis:
        drivers.length === 0
          ? 'Nothing in the record is pushing this student towards risk'
          : `Driven by ${drivers.join(', ')}`,
      dataPoints,
    });
  }

  return out;
}

export interface Projection {
  studentId: string;
  /** Marks approved so far, as a share of the internal assessment. */
  assessedShare: number;
  internalScored: number;
  internalMax: number;
  projectedPercent: number | null;
  band: 'distinction' | 'first_class' | 'second_class' | 'pass' | 'below_pass' | null;
  subjects: Array<{ code: string; name: string; scored: number; max: number; percent: number }>;
}

/**
 * Projects the term from the internal marks approved so far.
 *
 * Deliberately not called a prediction: it extrapolates what has actually been
 * marked, and reports the share of the assessment that represents, so a
 * projection from one quiz is visibly weaker than one from a full sheet. Only
 * approved sheets count — a draft is nobody's signed number.
 */
export async function project(studentIds: string[]): Promise<Map<string, Projection>> {
  const out = new Map<string, Projection>();
  if (studentIds.length === 0) return out;

  const entries = await prisma.markEntry.findMany({
    where: { studentId: { in: studentIds }, sheet: { status: 'APPROVED' } },
    include: {
      component: {
        select: {
          maxMarks: true,
          assignment: { select: { subject: { select: { code: true, name: true } } } },
        },
      },
    },
  });

  for (const studentId of studentIds) {
    const own = entries.filter((e) => e.studentId === studentId);
    const bySubject = new Map<string, { code: string; name: string; scored: number; max: number }>();

    for (const e of own) {
      const subject = e.component.assignment.subject;
      const cell = bySubject.get(subject.code) ?? {
        code: subject.code,
        name: subject.name,
        scored: 0,
        max: 0,
      };
      cell.scored += e.value ?? 0;
      cell.max += e.component.maxMarks;
      bySubject.set(subject.code, cell);
    }

    const subjects = [...bySubject.values()].map((s) => ({
      ...s,
      percent: s.max === 0 ? 0 : Number(((s.scored / s.max) * 100).toFixed(1)),
    }));

    const scored = subjects.reduce((sum, s) => sum + s.scored, 0);
    const max = subjects.reduce((sum, s) => sum + s.max, 0);

    // How much of the student's enrolment has an approved sheet behind it.
    const enrolled = await prisma.enrolment.count({ where: { studentId } });
    const share = enrolled === 0 ? 0 : Number(((subjects.length / enrolled) * 100).toFixed(1));

    const percent = max === 0 ? null : Number(((scored / max) * 100).toFixed(1));

    out.set(studentId, {
      studentId,
      assessedShare: share,
      internalScored: scored,
      internalMax: max,
      projectedPercent: percent,
      band:
        percent === null
          ? null
          : percent >= 75
            ? 'distinction'
            : percent >= 60
              ? 'first_class'
              : percent >= 45
                ? 'second_class'
                : percent >= 33
                  ? 'pass'
                  : 'below_pass',
      subjects,
    });
  }

  return out;
}
