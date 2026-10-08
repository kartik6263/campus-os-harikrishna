import type { Prisma } from '@prisma/client';
import { PASS_PERCENT, divisionFor } from './shared.js';

/**
 * Recomputes a semester's SGPA, outcome and division from its subject rows
 * after one of them changed — a revaluation, or a backlog cleared in a later
 * sitting — and carries the CGPA through every later semester, so the
 * marksheets never disagree with one another.
 */

const POINTS: Record<string, number> = { 'A+': 10, A: 9, 'B+': 8, B: 7, 'C+': 6, C: 5, D: 4, F: 0 };

export async function recomputeStanding(tx: Prisma.TransactionClient, studentId: string, semester: number) {
  const results = await tx.semesterResult.findMany({
    where: { studentId },
    include: { subjects: { include: { subject: { select: { credits: true } } } } },
    orderBy: { semester: 'asc' },
  });
  const own = (r: (typeof results)[number]) => r.subjects.reduce((t, s) => t + s.subject.credits, 0);
  let cumCredits = 0;
  let cumWeighted = 0;
  for (const r of results) {
    const credits = own(r);
    let sgpa = r.sgpa;
    if (r.semester === semester && credits > 0) {
      sgpa = Number((r.subjects.reduce((t, s) => t + (POINTS[s.grade] ?? 0) * s.subject.credits, 0) / credits).toFixed(2));
    }
    cumCredits += credits;
    cumWeighted += sgpa * credits;
    if (r.semester < semester) continue;
    const cgpa = cumCredits ? Number((cumWeighted / cumCredits).toFixed(2)) : sgpa;
    if (r.semester === semester) {
      const passed = r.subjects.every((s) => s.passed);
      // Aggregate on the old 100-mark-per-paper scale the division rule is written for.
      const percent = r.subjects.length ? r.subjects.reduce((t, s) => t + s.total, 0) / r.subjects.length : 0;
      await tx.semesterResult.update({ where: { id: r.id }, data: { sgpa, cgpa, outcome: passed ? 'PASS' : 'FAIL', division: passed ? divisionFor(Math.max(percent, PASS_PERCENT)) : 'Fail' } });
    } else {
      await tx.semesterResult.update({ where: { id: r.id }, data: { cgpa } });
    }
  }
}
