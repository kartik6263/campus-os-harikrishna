import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import { attendanceBySubject, attendanceOverall, attendancePolicy, forgetPolicy } from './policy.js';
import { isOver, occurrences } from '../timetable/calendar.js';

/**
 * Attendance administration (/api/attendance-admin): the policy and the
 * holiday list, the class-wise picture, the shortage list, whether
 * lecturers are taking their roll calls, leave approvals and condonation.
 *
 * The principal, registrar and administrator see the institution; the
 * office and heads of department their own college; a lecturer their own
 * roll calls and their mentees' leave.
 */
export const attendanceAdminRouter = Router();
attendanceAdminRouter.use(requireAuth);
attendanceAdminRouter.use(requireRole('OFFICE', 'FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'));

const SENIOR = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

interface Viewer { role: string; name: string; facultyId: string | null; isHod: boolean; collegeId: string | null }

async function viewer(req: Request): Promise<Viewer> {
  const u = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { email: true, faculty: { select: { id: true, name: true, isHod: true, collegeId: true } }, office: { select: { name: true, collegeId: true } } } });
  const role = req.auth!.role;
  return {
    role,
    name: u?.faculty?.name ?? u?.office?.name ?? u?.email ?? 'Staff',
    facultyId: u?.faculty?.id ?? null,
    isHod: !!u?.faculty?.isHod,
    // Institution-wide for senior offices; a college for the office and heads of department.
    collegeId: SENIOR.includes(role) ? null : (u?.faculty?.collegeId ?? u?.office?.collegeId ?? null),
  };
}

/** Reports are for the senior offices, the college office and heads of department. */
function requireReports(v: Viewer) {
  if (v.role === 'FACULTY' && !v.isHod) throw ApiError.forbidden('Attendance reports are for heads of department and the college office');
}

// ─── Policy ───────────────────────────────────────────────────────────────────

attendanceAdminRouter.get('/policy', asyncHandler(async (_req, res) => { res.json(await attendancePolicy()); }));

attendanceAdminRouter.put(
  '/policy',
  requireRole('REGISTRAR', 'ADMIN'),
  validate('body', z.object({
    threshold: z.number().int().min(50).max(100),
    condonationFloor: z.number().int().min(30).max(99),
    warnBelow: z.number().int().min(50).max(100),
    lateCountsAsPresent: z.boolean(),
    leaveBackdateDays: z.number().int().min(0).max(60),
  }).refine((b) => b.condonationFloor < b.threshold, { message: 'The condonation floor must be below the threshold' })
    .refine((b) => b.warnBelow >= b.threshold, { message: 'The warning line must be at or above the threshold' })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    const before = await attendancePolicy();
    const b = req.body as { threshold: number; condonationFloor: number; warnBelow: number; lateCountsAsPresent: boolean; leaveBackdateDays: number };
    const p = await prisma.attendancePolicy.update({ where: { id: 'default' }, data: { ...b, updatedBy: v.name } });
    forgetPolicy();
    await recordFor(req, { module: 'Attendance', action: 'policy changed', target: 'attendance policy', detail: `threshold ${before.threshold}→${p.threshold}, floor ${before.condonationFloor}→${p.condonationFloor}, warn ${before.warnBelow}→${p.warnBelow}, late ${before.lateCountsAsPresent}→${p.lateCountsAsPresent}, backdate ${before.leaveBackdateDays}→${p.leaveBackdateDays}`, outcome: 'WARN' });
    res.json(p);
  }),
);

// ─── Holidays ─────────────────────────────────────────────────────────────────

attendanceAdminRouter.get(
  '/holidays',
  validate('query', z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() })),
  asyncHandler(async (req, res) => {
    const { year } = validQuery<{ year?: number }>(req);
    const y = year ?? Number(istToday().slice(0, 4));
    res.json(await prisma.holiday.findMany({ where: { date: { gte: `${y}-01-01`, lte: `${y}-12-31` } }, orderBy: { date: 'asc' } }));
  }),
);

attendanceAdminRouter.post(
  '/holidays',
  requireRole(...(SENIOR as ['PRINCIPAL'])),
  validate('body', z.object({ date: z.string().date(), name: z.string().trim().min(2).max(120) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { date: string; name: string };
    if (await prisma.holiday.findUnique({ where: { date: b.date }, select: { id: true } })) throw ApiError.conflict(`${b.date} is already a holiday`);
    const h = await prisma.holiday.create({ data: { ...b, createdBy: (await viewer(req)).name } });
    await recordFor(req, { module: 'Attendance', action: 'holiday added', target: b.date, detail: b.name });
    res.status(201).json(h);
  }),
);

attendanceAdminRouter.delete(
  '/holidays/:id',
  requireRole(...(SENIOR as ['PRINCIPAL'])),
  asyncHandler(async (req, res) => {
    const h = await prisma.holiday.findUnique({ where: { id: String(req.params.id) } });
    if (!h) throw ApiError.notFound('No such holiday');
    await prisma.holiday.delete({ where: { id: h.id } });
    await recordFor(req, { module: 'Attendance', action: 'holiday removed', target: h.date, detail: h.name });
    res.status(204).end();
  }),
);

// ─── Class-wise summary ───────────────────────────────────────────────────────

attendanceAdminRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    requireReports(v);
    const [policy, term] = await Promise.all([attendancePolicy(), currentTerm()]);
    const students = await prisma.student.findMany({
      where: { status: 'ACTIVE', ...(v.collegeId ? { collegeId: v.collegeId } : {}) },
      select: { id: true, semester: true, programme: { select: { id: true, shortName: true, name: true } } },
    });
    const enrolments = await prisma.enrolment.findMany({ where: { term, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, faculty: true, subject: { select: { id: true, code: true, name: true } } } });
    const [bySubject, overall] = await Promise.all([attendanceBySubject(students.map((s) => s.id), [...new Set(enrolments.map((e) => e.subject.id))]), attendanceOverall(students.map((s) => s.id))]);
    const held = await prisma.classSession.groupBy({ by: ['subjectId'], where: { markedAt: { not: null }, subjectId: { in: [...new Set(enrolments.map((e) => e.subject.id))] } }, _count: { _all: true }, _max: { date: true } });

    const classes = new Map<string, { programmeId: string; programme: string; semester: number; students: string[] }>();
    for (const s of students) {
      const k = `${s.programme.id}:${s.semester}`;
      if (!classes.has(k)) classes.set(k, { programmeId: s.programme.id, programme: s.programme.shortName, semester: s.semester, students: [] });
      classes.get(k)!.students.push(s.id);
    }
    res.json({
      term, threshold: policy.threshold, warnBelow: policy.warnBelow,
      classes: [...classes.values()].sort((a, b) => a.programme.localeCompare(b.programme) || a.semester - b.semester).map((c) => {
        const ids = new Set(c.students);
        const subjectIds = [...new Set(enrolments.filter((e) => ids.has(e.studentId)).map((e) => e.subject.id))];
        const subjects = subjectIds.map((sid) => {
          const e = enrolments.find((x) => x.subject.id === sid)!;
          const cells = c.students.map((st) => bySubject.get(`${st}:${sid}`)).filter((x): x is NonNullable<typeof x> => !!x && x.total > 0);
          const h = held.find((x) => x.subjectId === sid);
          return {
            code: e.subject.code, name: e.subject.name, faculty: e.faculty,
            held: h?._count._all ?? 0, lastHeld: h?._max.date ?? null,
            average: cells.length ? Number((cells.reduce((t, x) => t + x.percent, 0) / cells.length).toFixed(1)) : null,
            below: cells.filter((x) => x.percent < policy.threshold).length,
            warning: cells.filter((x) => x.percent >= policy.threshold && x.percent < policy.warnBelow).length,
          };
        }).sort((a, b) => a.code.localeCompare(b.code));
        const ov = c.students.map((st) => overall.get(st)!).filter((x) => x.total > 0);
        return {
          programmeId: c.programmeId, programme: c.programme, semester: c.semester, students: c.students.length,
          average: ov.length ? Number((ov.reduce((t, x) => t + x.percent, 0) / ov.length).toFixed(1)) : null,
          shortStudents: c.students.filter((st) => subjectIds.some((sid) => { const x = bySubject.get(`${st}:${sid}`); return x && x.total > 0 && x.percent < policy.threshold; })).length,
          subjects,
        };
      }),
    });
  }),
);

// ─── Shortage list ────────────────────────────────────────────────────────────

attendanceAdminRouter.get(
  '/defaulters',
  validate('query', z.object({ programmeId: z.string().optional(), semester: z.coerce.number().int().min(1).max(24).optional(), q: z.string().trim().max(80).optional() })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    requireReports(v);
    const { programmeId, semester, q } = validQuery<{ programmeId?: string; semester?: number; q?: string }>(req);
    const [policy, term] = await Promise.all([attendancePolicy(), currentTerm()]);
    const where: Prisma.StudentWhereInput = {
      status: 'ACTIVE', ...(v.collegeId ? { collegeId: v.collegeId } : {}), ...(programmeId ? { programmeId } : {}), ...(semester ? { semester } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { enrolmentNo: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const students = await prisma.student.findMany({
      where, orderBy: [{ programme: { shortName: 'asc' } }, { semester: 'asc' }, { rollNo: 'asc' }],
      select: { id: true, name: true, enrolmentNo: true, rollNo: true, semester: true, mobile: true, programme: { select: { shortName: true } }, guardian: { select: { email: true } }, mentorships: { select: { faculty: { select: { name: true } } }, take: 1 } },
    });
    const ids = students.map((s) => s.id);
    const enrol = await prisma.enrolment.findMany({ where: { term, studentId: { in: ids } }, select: { studentId: true, subject: { select: { id: true, code: true } } } });
    const [att, overall, condonations, leaves] = await Promise.all([
      attendanceBySubject(ids, [...new Set(enrol.map((e) => e.subject.id))]), attendanceOverall(ids),
      prisma.attendanceCondonation.findMany({ where: { term, studentId: { in: ids } }, select: { studentId: true, status: true, requestNo: true } }),
      prisma.attendanceLeave.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    ]);
    const rows = students.flatMap((s) => {
      const short = enrol.filter((e) => e.studentId === s.id).map((e) => ({ code: e.subject.code, ...(att.get(`${s.id}:${e.subject.id}`) ?? { present: 0, total: 0, percent: 0 }) })).filter((x) => x.total > 0 && x.percent < policy.threshold);
      if (!short.length) return [];
      const lowest = Math.min(...short.map((x) => x.percent));
      const c = condonations.find((x) => x.studentId === s.id);
      return [{
        id: s.id, name: s.name, enrolmentNo: s.enrolmentNo, rollNo: s.rollNo, programme: `${s.programme.shortName} ${s.semester}`, mobile: s.mobile, parentEmail: s.guardian?.email ?? null,
        mentor: s.mentorships[0]?.faculty.name ?? null, overall: overall.get(s.id)?.percent ?? 0, short: short.sort((a, b) => a.percent - b.percent), lowest,
        condonable: lowest >= policy.condonationFloor, condonation: c ? { requestNo: c.requestNo, status: c.status } : null,
        pendingLeave: leaves.find((l) => l.studentId === s.id)?._count._all ?? 0,
      }];
    }).sort((a, b) => a.lowest - b.lowest);
    res.json({ term, threshold: policy.threshold, floor: policy.condonationFloor, students: rows });
  }),
);

attendanceAdminRouter.post(
  '/defaulters/notify',
  validate('body', z.object({ studentIds: z.array(z.string().min(1)).min(1).max(2000), message: z.string().trim().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    requireReports(v);
    const { studentIds, message } = req.body as { studentIds: string[]; message: string };
    const found = await prisma.student.findMany({ where: { id: { in: studentIds }, ...(v.collegeId ? { collegeId: v.collegeId } : {}) }, select: { id: true } });
    await prisma.notification.createMany({ data: found.map((s) => ({ studentId: s.id, kind: 'ATTENDANCE' as const, urgent: true, title: 'Attendance shortage', body: message, href: '/attendance' })) });
    await recordFor(req, { module: 'Attendance', action: 'shortage notice', target: `${found.length} students`, detail: message.slice(0, 200) });
    res.json({ sent: found.length });
  }),
);

// ─── Roll-call compliance ─────────────────────────────────────────────────────


/**
 * Every timetabled class in the period — less holidays, cancelled slots and
 * days still to come — against the roll calls actually submitted. A
 * lecturer sees their own; the senior offices and heads see everyone's.
 */
attendanceAdminRouter.get(
  '/compliance',
  validate('query', z.object({ from: z.string().date().optional(), to: z.string().date().optional() })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    const today = istToday();
    const q = validQuery<{ from?: string; to?: string }>(req);
    const to = q.to && q.to < today ? q.to : today;
    const from = q.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
    if (from > to) throw ApiError.badRequest('The period must start before it ends');
    if ((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 > 62) throw ApiError.badRequest('Look at two months at most at a time');
    const own = v.role === 'FACULTY' && !v.isHod;
    if (v.role === 'FACULTY' && !v.facultyId) throw ApiError.forbidden('No faculty record');
    // The dated classes — holidays, cancellations, substitutes and extra classes applied — that have ended.
    const [all, holidays] = await Promise.all([
      occurrences({ from, to, ...(own ? { facultyId: v.facultyId! } : {}) }),
      prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, name: true } }),
    ]);
    const teachers = await prisma.faculty.findMany({ where: { id: { in: [...new Set(all.flatMap((o) => (o.facultyId ? [o.facultyId] : [])))] } }, select: { id: true, name: true, department: true, collegeId: true } });
    const teacher = new Map(teachers.map((t) => [t.id, t]));
    const due = all.filter((o) => o.status === 'SCHEDULED' && o.facultyId && isOver(o.date, o.endTime)
      && (!own || o.facultyId === v.facultyId) && (own || !v.collegeId || teacher.get(o.facultyId)?.collegeId === v.collegeId));
    const sessions = await prisma.classSession.findMany({
      where: { subjectId: { in: [...new Set(due.map((o) => o.subjectId))] }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { subjectId: true, date: true, startTime: true, markedAt: true },
    });
    const sessionAt = new Map(sessions.map((x) => [`${x.subjectId}:${x.date.toISOString().slice(0, 10)}:${x.startTime}`, x]));

    const byFaculty = new Map<string, { id: string; name: string; department: string; expected: number; marked: number; draft: number; missing: Array<{ date: string; time: string; code: string; name: string; state: 'missing' | 'draft' }> }>();
    for (const o of due) {
      const f = teacher.get(o.facultyId!);
      if (!f) continue;
      if (!byFaculty.has(f.id)) byFaculty.set(f.id, { id: f.id, name: f.name, department: f.department, expected: 0, marked: 0, draft: 0, missing: [] });
      const row = byFaculty.get(f.id)!;
      row.expected++;
      const sess = sessionAt.get(`${o.subjectId}:${o.date}:${o.startTime}`);
      if (sess?.markedAt) row.marked++;
      else {
        if (sess) row.draft++;
        row.missing.push({ date: o.date, time: `${o.startTime}–${o.endTime}`, code: o.code, name: o.subject, state: sess ? 'draft' : 'missing' });
      }
    }
    const rows = [...byFaculty.values()].map((r) => ({ ...r, rate: r.expected ? Math.round((r.marked / r.expected) * 1000) / 10 : null, missing: r.missing.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100));
    const expected = rows.reduce((t, r) => t + r.expected, 0);
    const marked = rows.reduce((t, r) => t + r.marked, 0);
    res.json({ from, to, holidays, own, expected, marked, rate: expected ? Math.round((marked / expected) * 1000) / 10 : null, faculty: rows });
  }),
);

// ─── Leave approvals ──────────────────────────────────────────────────────────

/** Who may decide a student's leave: the senior offices, any head of department, or the student's own mentor. */
async function leaveScope(v: Viewer): Promise<Prisma.AttendanceLeaveWhereInput> {
  if (SENIOR.includes(v.role)) return {};
  if (v.role === 'FACULTY' && v.isHod) return v.collegeId ? { student: { collegeId: v.collegeId } } : {};
  if (v.role === 'FACULTY' && v.facultyId) return { student: { mentorships: { some: { facultyId: v.facultyId } } } };
  throw ApiError.forbidden('Leave is decided by the mentor, a head of department or the principal');
}

attendanceAdminRouter.get(
  '/leaves',
  validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    const { status } = validQuery<{ status?: 'PENDING' }>(req);
    const rows = await prisma.attendanceLeave.findMany({
      where: { ...(await leaveScope(v)), ...(status ? { status } : {}) },
      include: { student: { select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
    const files = await prisma.storedFile.findMany({ where: { id: { in: rows.flatMap((r) => (r.proofFileId ? [r.proofFileId] : [])) } }, select: { id: true, name: true } });
    res.json(rows.map((r) => ({ ...r, proof: files.find((f) => f.id === r.proofFileId) ?? null })));
  }),
);

/** Turns this leave's absences into excused ones (or back), across every class already marked in its dates. */
async function applyLeave(tx: Prisma.TransactionClient, leave: { studentId: string; leaveNo: string; fromDate: string; toDate: string }, on: boolean) {
  if (on) {
    const r = await tx.attendanceRecord.updateMany({
      where: { studentId: leave.studentId, status: 'ABSENT', session: { date: { gte: new Date(`${leave.fromDate}T00:00:00Z`), lte: new Date(`${leave.toDate}T00:00:00Z`) } } },
      data: { status: 'EXCUSED', source: `LEAVE:${leave.leaveNo}` },
    });
    return r.count;
  }
  const r = await tx.attendanceRecord.updateMany({ where: { studentId: leave.studentId, source: `LEAVE:${leave.leaveNo}` }, data: { status: 'ABSENT', source: 'MANUAL' } });
  return r.count;
}

attendanceAdminRouter.post(
  '/leaves/:id/decide',
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    const { approve, note } = req.body as { approve: boolean; note?: string };
    const leave = await prisma.attendanceLeave.findFirst({ where: { id: String(req.params.id), ...(await leaveScope(v)) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!leave) throw ApiError.notFound('No such leave in your charge');
    if (leave.status !== 'PENDING') throw ApiError.conflict(`This leave is already ${leave.status.toLowerCase()}`);
    if (!approve && (!note || note.length < 5)) throw ApiError.badRequest('Tell the student why');
    const excused = await prisma.$transaction(async (tx) => {
      const n = approve ? await applyLeave(tx, leave, true) : 0;
      await tx.attendanceLeave.update({ where: { id: leave.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: v.name, decidedAt: new Date(), decisionNote: note ?? null, excused: n } });
      await tx.notification.create({ data: { studentId: leave.studentId, kind: 'ATTENDANCE', title: `Leave ${leave.leaveNo} ${approve ? 'approved' : 'not approved'}`, body: approve ? `${n} absence${n === 1 ? '' : 's'} so far excused; classes marked later in these dates are excused too.` : note!, href: '/attendance' } });
      return n;
    });
    await recordFor(req, { module: 'Attendance', action: approve ? 'leave approved' : 'leave rejected', target: leave.student.enrolmentNo, detail: `${leave.leaveNo}${approve ? `: ${excused} excused` : `: ${note}`}` });
    res.json({ status: approve ? 'APPROVED' : 'REJECTED', excused });
  }),
);

/** Withdraws an approved leave found to be false: its absences count again. */
attendanceAdminRouter.post(
  '/leaves/:id/revoke',
  validate('body', z.object({ note: z.string().trim().min(10).max(300) })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    if (!SENIOR.includes(v.role) && !v.isHod) throw ApiError.forbidden('Only a head of department or the principal can revoke approved leave');
    const leave = await prisma.attendanceLeave.findFirst({ where: { id: String(req.params.id), ...(await leaveScope(v)) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!leave) throw ApiError.notFound('No such leave in your charge');
    if (leave.status !== 'APPROVED') throw ApiError.conflict('Only approved leave can be revoked');
    const { note } = req.body as { note: string };
    const restored = await prisma.$transaction(async (tx) => {
      const n = await applyLeave(tx, leave, false);
      await tx.attendanceLeave.update({ where: { id: leave.id }, data: { status: 'CANCELLED', decisionNote: `Revoked: ${note}`, decidedBy: v.name, decidedAt: new Date(), excused: 0 } });
      await tx.notification.create({ data: { studentId: leave.studentId, kind: 'ATTENDANCE', urgent: true, title: `Leave ${leave.leaveNo} revoked`, body: note, href: '/attendance' } });
      return n;
    });
    await recordFor(req, { module: 'Attendance', action: 'leave revoked', target: leave.student.enrolmentNo, detail: `${leave.leaveNo}: ${restored} absences restored — ${note}`, outcome: 'WARN' });
    res.json({ status: 'CANCELLED', restored });
  }),
);

// ─── Condonation ──────────────────────────────────────────────────────────────

attendanceAdminRouter.get(
  '/condonations',
  validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    requireReports(v);
    const { status } = validQuery<{ status?: 'PENDING' }>(req);
    const rows = await prisma.attendanceCondonation.findMany({
      where: { ...(status ? { status } : {}), ...(v.collegeId ? { student: { collegeId: v.collegeId } } : {}) },
      include: { student: { select: { id: true, name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
    const files = await prisma.storedFile.findMany({ where: { id: { in: rows.flatMap((r) => (r.proofFileId ? [r.proofFileId] : [])) } }, select: { id: true, name: true } });
    res.json(rows.map((r) => ({ ...r, proof: files.find((f) => f.id === r.proofFileId) ?? null })));
  }),
);

attendanceAdminRouter.post(
  '/condonations/:id/decide',
  requireRole(...(SENIOR as ['PRINCIPAL'])),
  validate('body', z.object({ approve: z.boolean(), note: z.string().trim().min(5).max(300), fee: z.number().int().min(0).max(100_000).default(0) })),
  asyncHandler(async (req, res) => {
    const v = await viewer(req);
    const { approve, note, fee } = req.body as { approve: boolean; note: string; fee: number };
    const c = await prisma.attendanceCondonation.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!c) throw ApiError.notFound('No such request');
    if (c.status !== 'PENDING') throw ApiError.conflict(`This request is already ${c.status.toLowerCase()}`);
    await prisma.$transaction(async (tx) => {
      await tx.attendanceCondonation.update({ where: { id: c.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decisionNote: note, decidedBy: v.name, decidedAt: new Date(), fee: approve ? fee : 0 } });
      // The fee goes on the fee account, so an unpaid one holds the exam form the same way any due does.
      if (approve && fee > 0) await tx.feeItem.create({ data: { studentId: c.studentId, head: `Attendance condonation fee — ${c.term}`, amount: fee, category: 'OTHER', term: c.term, dueDate: new Date(Date.now() + 7 * 86_400_000) } });
      await tx.notification.create({ data: { studentId: c.studentId, kind: 'ATTENDANCE', urgent: !approve, title: `Condonation ${c.requestNo} ${approve ? 'granted' : 'refused'}`, body: approve ? `${note}${fee ? ` A condonation fee of ₹${fee.toLocaleString('en-IN')} is on your fee account.` : ''}` : note, href: '/attendance' } });
    });
    await recordFor(req, { module: 'Attendance', action: approve ? 'condonation granted' : 'condonation refused', target: c.student.enrolmentNo, detail: `${c.requestNo} at ${c.percent}%${approve && fee ? `, fee ₹${fee}` : ''}: ${note}`, outcome: approve ? 'WARN' : 'OK' });
    res.json({ status: approve ? 'APPROVED' : 'REJECTED' });
  }),
);
