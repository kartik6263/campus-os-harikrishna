import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { currentTerm } from '../faculty/shared.js';
import { attendanceBySubject, attendancePolicy } from './policy.js';

/**
 * A student's leave from classes and their request to have a shortage
 * condoned (/api/attendance/leaves, /api/attendance/condonation). A parent
 * reads both for their ward.
 */
export const attendanceSelfRouter = Router();
attendanceSelfRouter.use(requireAuth);

const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

async function nextNo(prefix: string, kind: 'leave' | 'condonation') {
  const rows = kind === 'leave'
    ? (await prisma.attendanceLeave.findMany({ where: { leaveNo: { startsWith: prefix } }, select: { leaveNo: true } })).map((r) => r.leaveNo)
    : (await prisma.attendanceCondonation.findMany({ where: { requestNo: { startsWith: prefix } }, select: { requestNo: true } })).map((r) => r.requestNo);
  const top = rows.reduce((m, r) => Math.max(m, Number(r.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(top + 1).padStart(5, '0')}`;
}

/** A proof file must be one this student uploaded. */
async function checkProof(fileId: string | undefined, userId: string) {
  if (!fileId) return null;
  const f = await prisma.storedFile.findUnique({ where: { id: fileId }, select: { id: true, uploadedById: true } });
  if (!f || f.uploadedById !== userId) throw ApiError.badRequest('Attach a file you uploaded');
  return f.id;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

attendanceSelfRouter.get(
  '/leaves',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const [leaves, policy] = await Promise.all([prisma.attendanceLeave.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 50 }), attendancePolicy()]);
    res.json({ leaves, backdateDays: policy.leaveBackdateDays, today: istToday() });
  }),
);

attendanceSelfRouter.post(
  '/leaves',
  requireRole('STUDENT'),
  validate('body', z.object({
    kind: z.enum(['MEDICAL', 'ON_DUTY', 'PERSONAL']),
    fromDate: z.string().date(),
    toDate: z.string().date(),
    reason: z.string().trim().min(10).max(600),
    proofFileId: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { kind: 'MEDICAL' | 'ON_DUTY' | 'PERSONAL'; fromDate: string; toDate: string; reason: string; proofFileId?: string };
    const policy = await attendancePolicy();
    const today = istToday();
    if (b.toDate < b.fromDate) throw ApiError.badRequest('The leave must end on or after the day it starts');
    if (daysBetween(b.fromDate, b.toDate) > 30) throw ApiError.badRequest('Leave of more than 30 days is a break in study; apply from your profile');
    if (daysBetween(b.fromDate, today) > policy.leaveBackdateDays) throw ApiError.badRequest(`Leave can be applied for at most ${policy.leaveBackdateDays} days after it began`);
    if (daysBetween(today, b.fromDate) > 60) throw ApiError.badRequest('Leave can be applied for at most 60 days ahead');
    const span = daysBetween(b.fromDate, b.toDate) + 1;
    // A medical leave over two days needs a certificate; college duty always needs the organiser's letter.
    if (!b.proofFileId && ((b.kind === 'MEDICAL' && span > 2) || b.kind === 'ON_DUTY')) {
      throw ApiError.badRequest(b.kind === 'MEDICAL' ? 'Attach a medical certificate for more than two days' : 'Attach the letter from the activity in-charge');
    }
    const proof = await checkProof(b.proofFileId, req.auth!.sub);
    const overlap = await prisma.attendanceLeave.findFirst({ where: { studentId, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: b.toDate }, toDate: { gte: b.fromDate } }, select: { leaveNo: true } });
    if (overlap) throw ApiError.conflict(`It overlaps leave ${overlap.leaveNo}`);
    const leave = await prisma.attendanceLeave.create({
      data: { leaveNo: await nextNo(`AL/${new Date().getFullYear()}/`, 'leave'), studentId, kind: b.kind, fromDate: b.fromDate, toDate: b.toDate, reason: b.reason, proofFileId: proof },
    });
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { enrolmentNo: true } });
    await recordFor(req, { module: 'Attendance', action: 'leave applied', target: s?.enrolmentNo ?? studentId, detail: `${leave.leaveNo} ${b.kind} ${b.fromDate}–${b.toDate}` });
    res.status(201).json(leave);
  }),
);

attendanceSelfRouter.post(
  '/leaves/:id/cancel',
  requireRole('STUDENT'),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const l = await prisma.attendanceLeave.findUnique({ where: { id: String(req.params.id) } });
    if (!l || l.studentId !== studentId) throw ApiError.notFound('No such leave');
    if (l.status !== 'PENDING') throw ApiError.conflict('Only leave awaiting a decision can be withdrawn');
    res.json(await prisma.attendanceLeave.update({ where: { id: l.id }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: 'Withdrawn by the student' } }));
  }),
);

// ─── Condonation ──────────────────────────────────────────────────────────────

/** Where this student stands for condonation this term, and any request already made. */
attendanceSelfRouter.get(
  '/condonation',
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const [policy, term] = await Promise.all([attendancePolicy(), currentTerm()]);
    const enrolled = await prisma.enrolment.findMany({ where: { studentId, term }, select: { subject: { select: { id: true, code: true, name: true } } } });
    const att = await attendanceBySubject([studentId], enrolled.map((e) => e.subject.id));
    const short = enrolled
      .map((e) => ({ ...e.subject, ...(att.get(`${studentId}:${e.subject.id}`) ?? { present: 0, total: 0, percent: 0 }) }))
      .filter((x) => x.total > 0 && x.percent < policy.threshold);
    const lowest = short.length ? Math.min(...short.map((x) => x.percent)) : null;
    const request = await prisma.attendanceCondonation.findUnique({ where: { studentId_term: { studentId, term } } });
    res.json({
      term, threshold: policy.threshold, floor: policy.condonationFloor,
      short: short.map(({ id: _id, ...x }) => x), lowest,
      eligible: lowest !== null && lowest >= policy.condonationFloor && !request,
      reason: lowest === null ? 'No subject is short of attendance' : lowest < policy.condonationFloor ? `Below ${policy.condonationFloor}% a shortage cannot be condoned` : request ? 'A request has already been made this term' : null,
      request,
    });
  }),
);

attendanceSelfRouter.post(
  '/condonation',
  requireRole('STUDENT'),
  validate('body', z.object({ kind: z.enum(['MEDICAL', 'OTHER']), reason: z.string().trim().min(20).max(1000), proofFileId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const b = req.body as { kind: 'MEDICAL' | 'OTHER'; reason: string; proofFileId?: string };
    const [policy, term] = await Promise.all([attendancePolicy(), currentTerm()]);
    if (await prisma.attendanceCondonation.findUnique({ where: { studentId_term: { studentId, term } }, select: { id: true } })) throw ApiError.conflict('You have already asked for condonation this term');
    const enrolled = await prisma.enrolment.findMany({ where: { studentId, term }, select: { subjectId: true } });
    const att = await attendanceBySubject([studentId], enrolled.map((e) => e.subjectId));
    const short = [...att.values()].filter((a) => a.total > 0 && a.percent < policy.threshold);
    if (!short.length) throw ApiError.conflict('No subject is short of attendance');
    const lowest = Math.min(...short.map((a) => a.percent));
    if (lowest < policy.condonationFloor) throw ApiError.conflict(`Your lowest subject is at ${lowest}%; below ${policy.condonationFloor}% a shortage cannot be condoned`);
    if (b.kind === 'MEDICAL' && !b.proofFileId) throw ApiError.badRequest('Attach the medical certificate');
    const proof = await checkProof(b.proofFileId, req.auth!.sub);
    const c = await prisma.attendanceCondonation.create({
      data: { requestNo: await nextNo(`CD/${new Date().getFullYear()}/`, 'condonation'), studentId, term, percent: lowest, kind: b.kind, reason: b.reason, proofFileId: proof },
    });
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { enrolmentNo: true } });
    await recordFor(req, { module: 'Attendance', action: 'condonation requested', target: s?.enrolmentNo ?? studentId, detail: `${c.requestNo} at ${lowest}%` });
    res.status(201).json(c);
  }),
);
