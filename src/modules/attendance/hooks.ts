import { prisma } from '../../db.js';
import { attendanceBySubject, attendancePolicy, attendedStatuses } from './policy.js';

/**
 * What happens after a roll call is submitted: absences covered by an
 * approved leave become excused, and a student whose subject has just
 * dipped near or below the bar is told at once — not at exam-form time.
 */

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Excuses absences in this class for students on approved leave that day. */
export async function applyLeavesToSession(sessionId: string) {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { date: true } });
  if (!session) return 0;
  const day = dayOf(session.date);
  const absent = await prisma.attendanceRecord.findMany({ where: { sessionId, status: 'ABSENT' }, select: { id: true, studentId: true } });
  if (!absent.length) return 0;
  const leaves = await prisma.attendanceLeave.findMany({
    where: { status: 'APPROVED', studentId: { in: absent.map((a) => a.studentId) }, fromDate: { lte: day }, toDate: { gte: day } },
    select: { id: true, leaveNo: true, studentId: true },
  });
  let n = 0;
  for (const l of leaves) {
    const rows = absent.filter((a) => a.studentId === l.studentId);
    await prisma.$transaction([
      prisma.attendanceRecord.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'EXCUSED', source: `LEAVE:${l.leaveNo}` } }),
      prisma.attendanceLeave.update({ where: { id: l.id }, data: { excused: { increment: rows.length } } }),
    ]);
    n += rows.length;
  }
  return n;
}

/** Tells each student marked absent here if this class took a subject below the warning line or the bar. */
export async function alertAfterRollCall(sessionId: string) {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { subjectId: true, date: true, subject: { select: { code: true, name: true } } } });
  if (!session) return 0;
  const policy = await attendancePolicy();
  const counted = new Set<string>(attendedStatuses(policy));
  const marks = await prisma.attendanceRecord.findMany({ where: { sessionId }, select: { studentId: true, status: true } });
  const missed = marks.filter((m) => !counted.has(m.status));
  if (!missed.length) return 0;
  const now = await attendanceBySubject(missed.map((m) => m.studentId), [session.subjectId]);
  const alerts = [];
  for (const m of missed) {
    const a = now.get(`${m.studentId}:${session.subjectId}`);
    if (!a || a.total < 3) continue; // too few classes for a percentage to mean anything
    const before = a.total > 1 ? (a.present / (a.total - 1)) * 100 : 100;
    const crossedBar = a.percent < policy.threshold && before >= policy.threshold;
    const crossedWarn = !crossedBar && a.percent < policy.warnBelow && before >= policy.warnBelow;
    if (!crossedBar && !crossedWarn) continue;
    alerts.push({
      studentId: m.studentId, kind: 'ATTENDANCE' as const, urgent: crossedBar,
      title: crossedBar ? `${session.subject.code}: attendance below ${policy.threshold}%` : `${session.subject.code}: attendance near the ${policy.threshold}% line`,
      body: crossedBar
        ? `You are at ${a.percent}% in ${session.subject.name} (${a.present} of ${a.total}). Below ${policy.threshold}% you cannot sit its exam. Attend every class from now, or apply for leave if you were away for a reason.`
        : `You are at ${a.percent}% in ${session.subject.name} (${a.present} of ${a.total}). A few more absences and you will fall below ${policy.threshold}%.`,
      href: '/attendance',
    });
  }
  if (alerts.length) await prisma.notification.createMany({ data: alerts });
  return alerts.length;
}

/** Both, after a roll call is submitted. Never lets a hook failure undo the roll call itself. */
export async function afterRollCall(sessionId: string) {
  try {
    await applyLeavesToSession(sessionId);
    await alertAfterRollCall(sessionId);
  } catch (err) {
    console.error('[attendance] after-roll-call hooks failed', err instanceof Error ? err.message : err);
  }
}
