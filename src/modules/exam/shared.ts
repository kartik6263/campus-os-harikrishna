import type { Request } from 'express';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';

/**
 * Who signs for the back-office.
 *
 * The examination wing is university-level, but its staff are the same kind of
 * record as the college counter's, so it reuses `OfficeStaff` rather than a
 * parallel model. ADMIN may act for one with `?staffId=`.
 */
export async function resolveExamStaffId(req: Request): Promise<string> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  if (auth.role === 'REGISTRAR') {
    const staff = await prisma.officeStaff.findUnique({
      where: { userId: auth.sub },
      select: { id: true },
    });
    if (!staff) throw ApiError.forbidden('This account has no staff record');
    return staff.id;
  }

  if (auth.role !== 'ADMIN') throw ApiError.forbidden('This endpoint is for the examination wing');

  const requested = typeof req.query.staffId === 'string' ? req.query.staffId : undefined;
  if (!requested) throw ApiError.badRequest('staffId is required for administrator accounts');

  const staff = await prisma.officeStaff.findUnique({
    where: { id: requested },
    select: { id: true },
  });
  if (!staff) throw ApiError.notFound('No such staff record');
  return staff.id;
}

/**
 * How far two examiners may disagree before a moderator is called.
 *
 * Expressed as a share of the paper rather than a flat number, so it means the
 * same thing on a 70-mark paper and a 100-mark one.
 */
export const MODERATION_TOLERANCE = 0.15;

export function toleranceFor(maxExternal: number): number {
  return Math.round(maxExternal * MODERATION_TOLERANCE);
}

/** The grace rules, as the ordinance states them. */
export const GRACE = {
  maxPerSubject: 5,
  maxTotal: 10,
  /** Grace is only for a candidate who falls short by this much or less. */
  eligibleIfShortBy: 4,
};

/** A subject is passed at this share of its total. */
export const PASS_PERCENT = 33;

/** The ten-point scale, highest band first. */
const GRADE_BANDS: Array<{ min: number; grade: string; points: number }> = [
  { min: 90, grade: 'A+', points: 10 },
  { min: 80, grade: 'A', points: 9 },
  { min: 70, grade: 'B+', points: 8 },
  { min: 60, grade: 'B', points: 7 },
  { min: 50, grade: 'C+', points: 6 },
  { min: 40, grade: 'C', points: 5 },
  { min: PASS_PERCENT, grade: 'D', points: 4 },
  { min: 0, grade: 'F', points: 0 },
];

export function gradeFor(total: number, maxTotal: number) {
  const percent = maxTotal === 0 ? 0 : (total / maxTotal) * 100;
  const band = GRADE_BANDS.find((b) => percent >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]!;
  return { grade: band.grade, points: band.points, percent: Number(percent.toFixed(1)) };
}

/** The division printed on a marksheet, from the aggregate. */
export function divisionFor(percent: number): string {
  if (percent >= 75) return 'Distinction';
  if (percent >= 60) return 'First Class';
  if (percent >= 45) return 'Second Class';
  if (percent >= PASS_PERCENT) return 'Pass';
  return 'Fail';
}

/**
 * Settles a script's final mark from however many readings it has.
 *
 * One reading stands on its own. Two that agree are averaged. Two that
 * disagree by more than the tolerance are not averaged — averaging a real
 * disagreement invents a mark neither examiner gave — so the script is
 * flagged and waits for a moderator, whose reading then stands alone.
 */
export function settleScript(
  script: { e1: number | null; e2: number | null; moderatorMark: number | null; absent: boolean },
  maxExternal: number,
): { finalMark: number | null; flagged: boolean; flagReason: string | null } {
  if (script.absent) return { finalMark: 0, flagged: false, flagReason: null };

  const { e1, e2, moderatorMark } = script;

  if (moderatorMark !== null) {
    return { finalMark: moderatorMark, flagged: false, flagReason: null };
  }

  if (e1 !== null && e2 !== null) {
    const gap = Math.abs(e1 - e2);
    const tolerance = toleranceFor(maxExternal);
    if (gap > tolerance) {
      return {
        finalMark: null,
        flagged: true,
        flagReason: `Examiners differ by ${gap} marks (tolerance ${tolerance}); moderation required`,
      };
    }
    return { finalMark: Math.round((e1 + e2) / 2), flagged: false, flagReason: null };
  }

  if (e1 !== null) return { finalMark: e1, flagged: false, flagReason: null };

  return { finalMark: null, flagged: false, flagReason: null };
}

/**
 * Applies the grace rules across one student's subjects.
 *
 * Grace is given to the narrowest shortfalls first: it is a finite allowance,
 * and spending it where it cannot turn a fail into a pass wastes it.
 */
export function applyGrace(
  subjects: Array<{ code: string; total: number; maxTotal: number }>,
): Map<string, number> {
  const given = new Map<string, number>();
  let budget = GRACE.maxTotal;

  const shortfalls = subjects
    .map((s) => ({ ...s, needs: Math.ceil((PASS_PERCENT / 100) * s.maxTotal) - s.total }))
    .filter((s) => s.needs > 0 && s.needs <= GRACE.eligibleIfShortBy)
    .sort((a, b) => a.needs - b.needs);

  for (const s of shortfalls) {
    if (budget <= 0) break;
    const grant = Math.min(s.needs, GRACE.maxPerSubject, budget);
    if (grant < s.needs) continue; // Grace that does not clear the bar is wasted.
    given.set(s.code, grant);
    budget -= grant;
  }

  return given;
}

/** Next number in a series, e.g. BDL/GWL04/BCA501/001. */
export function nextInSeries(prefix: string, existing: string[], width = 3): string {
  const highest = existing.reduce((max, no) => {
    const tail = Number(no.slice(prefix.length));
    return Number.isFinite(tail) && tail > max ? tail : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

/** Refuses work that is out of step with where the session has got to. */
export function requireStatus(
  session: { code: string; status: string },
  allowed: string[],
  doing: string,
) {
  if (!allowed.includes(session.status)) {
    throw ApiError.conflict(
      `${session.code} is at ${session.status.toLowerCase().replace(/_/g, ' ')}; ${doing} needs ${allowed
        .map((s) => s.toLowerCase().replace(/_/g, ' '))
        .join(' or ')}`,
    );
  }
}
