import { Router, type Request } from 'express';
import { z } from 'zod';
import type { LifecycleEventKind, LifecycleRequestKind, Prisma, StudentStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validQuery, validate } from '../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../auth/middleware.js';
import { recordFor } from './itconsole/audit.js';
import { currentTerm, latestTerm, overallAttendance } from './faculty/shared.js';
import { CERTIFICATE_SLA, nextInSeries, slaDeadline } from './office/shared.js';
import { vacate } from './hostel/allot.js';

/**
 * The student lifecycle: where a student stands on the rolls, and every move
 * between standings — promotion, detention, a break in study, suspension,
 * withdrawal, transfer, rustication, readmission and graduation.
 *
 * Each move goes through `transition`, which checks the move is allowed from
 * the student's present standing, applies its side effects (enrolments, the
 * sign-in, the bus pass, the certificates a leaver is owed) and writes the
 * history entry, all in one transaction. Nothing else changes `status`.
 *
 * Leaving — withdrawal, transfer, graduation — needs a full no-dues
 * clearance. Fees, library and transport are read live from their own
 * ledgers; the hostel, laboratory and department sign off here.
 */
export const lifecycleRouter = Router();
lifecycleRouter.use(requireAuth);

/** The standings that put a student on a class roster. */
export const ON_ROLL: StudentStatus[] = ['ACTIVE'];
const EXITS: StudentStatus[] = ['WITHDRAWN', 'TRANSFERRED', 'RUSTICATED'];
const STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DETAINED', 'WITHDRAWN', 'TRANSFERRED', 'RUSTICATED', 'GRADUATED'] as const;

const STAFF = ['OFFICE', 'REGISTRAR', 'ADMIN', 'PRINCIPAL'] as const;
const DECIDERS = ['REGISTRAR', 'ADMIN'] as const;

// ─── Terms ────────────────────────────────────────────────────────────────────

const TERM = /^(\d{4})-(\d{2})-(ODD|EVEN)$/;

/** The term after this one: 2026-27-ODD → 2026-27-EVEN → 2027-28-ODD. */
export function nextTerm(term: string): string {
  const m = TERM.exec(term);
  if (!m) return term;
  const y = Number(m[1]);
  return m[3] === 'ODD' ? `${y}-${m[2]}-EVEN` : `${y + 1}-${String((y + 2) % 100).padStart(2, '0')}-ODD`;
}

/** Odd semesters run in the ODD term, even ones in the EVEN term. */
function termFitsSemester(term: string, semester: number) {
  const m = TERM.exec(term);
  return !m || (m[3] === 'ODD') === (semester % 2 === 1);
}

const finalSemester = (years: number) => years * 2;
const yearOf = (semester: number) => Math.ceil(semester / 2);

// ─── Who is acting ────────────────────────────────────────────────────────────

interface Actor { id: string | null; name: string }

async function actorOf(req: Request): Promise<Actor> {
  const auth = req.auth!;
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { email: true, office: { select: { name: true } }, faculty: { select: { name: true } }, student: { select: { name: true } } },
  });
  return { id: auth.sub, name: user?.office?.name ?? user?.faculty?.name ?? user?.student?.name ?? user?.email ?? 'Unknown' };
}

// ─── Enrolment ────────────────────────────────────────────────────────────────

/**
 * Puts a student on the subjects of a semester for a term, taking the
 * lecturer and room from the subject's allocation when one exists. A subject
 * already taken that term is left alone, so this is safe to repeat.
 */
async function enrolInSemester(tx: Prisma.TransactionClient, student: { id: string; programmeId: string }, semester: number, term: string) {
  const subjects = await tx.subject.findMany({ where: { programmeId: student.programmeId, semester }, select: { id: true } });
  if (subjects.length === 0) return 0;
  const allocations = await tx.subjectAssignment.findMany({
    where: { subjectId: { in: subjects.map((s) => s.id) }, term },
    orderBy: { section: 'asc' },
    select: { subjectId: true, facultyId: true, room: true, faculty: { select: { name: true } } },
  });
  const allocated = new Map<string, (typeof allocations)[number]>();
  for (const a of allocations) if (!allocated.has(a.subjectId)) allocated.set(a.subjectId, a);
  const result = await tx.enrolment.createMany({
    data: subjects.map((s) => {
      const a = allocated.get(s.id);
      return { studentId: student.id, subjectId: s.id, term, faculty: a?.faculty.name ?? 'To be allotted', facultyId: a?.facultyId ?? null, room: a?.room ?? 'To be allotted' };
    }),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * A student moved into a semester with no subjects would have no timetable,
 * no roll call and nothing to be examined in, so the move is refused until
 * the curriculum for that semester exists.
 */
async function requireCurriculum(programmeId: string, semester: number) {
  const subjects = await prisma.subject.count({ where: { programmeId, semester } });
  if (subjects === 0) {
    throw ApiError.conflict(`Semester ${semester} has no subjects in the curriculum yet — add them under Syllabus & Curriculum first`);
  }
  return subjects;
}

/** Raises the certificates a leaver is owed, unless one is already open. */
async function raiseCertificates(tx: Prisma.TransactionClient, studentId: string, types: string[], purpose: string) {
  const raised: string[] = [];
  const prefix = `CR/${new Date().getFullYear()}/`;
  for (const type of types) {
    const open = await tx.certificateRequest.findFirst({ where: { studentId, type, stage: { notIn: ['DISPATCHED', 'REJECTED'] } }, select: { id: true } });
    if (open) continue;
    const existing = await tx.certificateRequest.findMany({ where: { requestNo: { startsWith: prefix } }, select: { requestNo: true } });
    const fee = CERTIFICATE_SLA[type]?.fee ?? 0;
    const created = await tx.certificateRequest.create({
      data: {
        requestNo: nextInSeries(prefix, existing.map((r) => r.requestNo), 5),
        studentId, type, purpose, priority: 'NORMAL', fee, feePaid: fee === 0,
        slaDeadline: slaDeadline(type, 'NORMAL'), stage: 'REQUESTED',
      },
      select: { requestNo: true },
    });
    raised.push(`${type} (${created.requestNo})`);
  }
  return raised;
}

// ─── Academic standing ────────────────────────────────────────────────────────

interface Standing {
  semestersDeclared: number[];
  failedSemesters: number[];
  backlogs: Array<{ code: string; name: string; semester: number }>;
  cgpa: number | null;
  creditsEarned: number;
}

async function standingOf(studentIds: string[]): Promise<Map<string, Standing>> {
  const out = new Map<string, Standing>();
  for (const id of studentIds) out.set(id, { semestersDeclared: [], failedSemesters: [], backlogs: [], cgpa: null, creditsEarned: 0 });
  if (studentIds.length === 0) return out;
  const results = await prisma.semesterResult.findMany({
    where: { studentId: { in: studentIds }, published: true },
    orderBy: { semester: 'asc' },
    select: {
      studentId: true, semester: true, cgpa: true, outcome: true,
      subjects: { select: { passed: true, subject: { select: { code: true, name: true, credits: true, semester: true } } } },
    },
  });
  for (const r of results) {
    const s = out.get(r.studentId)!;
    s.semestersDeclared.push(r.semester);
    if (r.outcome !== 'PASS') s.failedSemesters.push(r.semester);
    s.cgpa = r.cgpa;
    for (const sub of r.subjects) {
      if (sub.passed) s.creditsEarned += sub.subject.credits;
      else s.backlogs.push({ code: sub.subject.code, name: sub.subject.name, semester: sub.subject.semester });
    }
  }
  return out;
}

async function feesDue(studentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(studentIds.map((id) => [id, 0]));
  if (studentIds.length === 0) return out;
  const items = await prisma.feeItem.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, amount: true, paid: true } });
  for (const i of items) out.set(i.studentId, (out.get(i.studentId) ?? 0) + Math.max(0, i.amount - i.paid));
  return out;
}

// ─── No-dues clearance ────────────────────────────────────────────────────────

/** Departments that must sign off before a student leaves, in counter order. */
export const DEPARTMENTS = ['Accounts', 'Library', 'Transport', 'Hostel', 'Laboratory', 'Department'] as const;
type Department = (typeof DEPARTMENTS)[number];
/** Read from their own ledgers; a manual row for one of these is a waiver. */
const AUTOMATIC: Department[] = ['Accounts', 'Library', 'Transport', 'Hostel'];

interface ClearanceItem {
  department: Department;
  automatic: boolean;
  applicable: boolean;
  cleared: boolean;
  /** What is outstanding, or how it was cleared. */
  detail: string;
  waived: boolean;
  signedBy: string | null;
  signedAt: Date | null;
  remarks: string | null;
}

interface LoanDoc { title?: string; returnedOn?: string; fine?: number; fineReceipt?: string; fineWaived?: string; dueDate?: string }

export async function clearanceOf(studentId: string) {
  const [due, loans, pass, hostel, rows] = await Promise.all([
    feesDue([studentId]).then((m) => m.get(studentId) ?? 0),
    prisma.workspaceRecord.findMany({ where: { collection: 'desk:library-loans', studentId }, select: { data: true } }),
    prisma.busPass.findUnique({ where: { studentId }, select: { valid: true, validTill: true, route: { select: { routeNo: true } } } }),
    prisma.hostelAllotment.findMany({ where: { studentId }, orderBy: { allottedAt: 'desc' }, take: 1, select: { status: true, bed: true, room: { select: { roomNo: true, hostel: { select: { name: true } } } } } }).then((r) => r[0] ?? null),
    prisma.noDuesClearance.findMany({ where: { studentId } }),
  ]);
  const row = new Map(rows.map((r) => [r.department, r]));
  const sign = (d: Department) => row.get(d);

  const out: ClearanceItem[] = [];
  const push = (department: Department, applicable: boolean, liveClear: boolean, outstanding: string, clearText: string) => {
    const r = sign(department);
    const automatic = AUTOMATIC.includes(department);
    const waived = automatic && !liveClear && !!r?.cleared;
    const cleared = !applicable || (automatic ? liveClear || waived : !!r?.cleared);
    out.push({
      department, automatic, applicable, cleared, waived,
      detail: !applicable ? 'Not applicable' : automatic ? (liveClear ? clearText : waived ? `Waived — ${outstanding}` : outstanding) : r?.cleared ? clearText : outstanding,
      signedBy: r?.clearedBy ?? null, signedAt: r?.clearedAt ?? null, remarks: r?.remarks ?? null,
    });
  };

  push('Accounts', true, due === 0, `₹${due.toLocaleString('en-IN')} outstanding on the fee ledger`, 'No fee outstanding');

  const docs = loans.map((l) => l.data as LoanDoc);
  const out_ = docs.filter((l) => !l.returnedOn);
  const fines = docs.filter((l) => (l.fine ?? 0) > 0 && !l.fineReceipt && !l.fineWaived).reduce((t, l) => t + (l.fine ?? 0), 0);
  const libBits = [out_.length ? `${out_.length} book${out_.length > 1 ? 's' : ''} not returned (${out_.map((l) => l.title ?? 'untitled').slice(0, 3).join(', ')})` : '', fines ? `₹${fines} fine unpaid` : ''].filter(Boolean);
  push('Library', true, libBits.length === 0, libBits.join('; '), docs.length ? 'All books returned, no fines' : 'No borrowing on record');

  const passLive = !!pass && pass.valid && pass.validTill > new Date();
  push('Transport', true, !passLive, pass ? `Bus pass on route ${pass.route.routeNo} still valid — surrender it` : '', pass ? 'Bus pass surrendered' : 'No bus pass');

  push('Hostel', !!hostel, hostel?.status !== 'ACTIVE', hostel ? `Still allotted ${hostel.room.hostel.name}, room ${hostel.room.roomNo} bed ${hostel.bed} — the warden vacates it` : '', 'Room vacated');
  push('Laboratory', true, false, 'Laboratory in-charge to confirm no breakage or equipment due', 'No dues');
  push('Department', true, false, 'Head of department to sign off', 'Signed off');

  return { items: out, complete: out.every((i) => i.cleared), pending: out.filter((i) => !i.cleared).map((i) => i.department) };
}

// ─── Transitions ──────────────────────────────────────────────────────────────

const ACTIONS = ['SUSPEND', 'REINSTATE', 'LEAVE', 'RESUME', 'DETAIN', 'WITHDRAW', 'TRANSFER', 'RUSTICATE', 'READMIT', 'GRADUATE'] as const;
type Action = (typeof ACTIONS)[number];

const RULES: Record<Action, { from: StudentStatus[]; to: StudentStatus; kind: LifecycleEventKind; label: string; clearance?: boolean; reenrol?: 'optional' | 'required' }> = {
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED', kind: 'SUSPENDED', label: 'Suspend' },
  REINSTATE: { from: ['SUSPENDED'], to: 'ACTIVE', kind: 'REINSTATED', label: 'Reinstate' },
  LEAVE: { from: ['ACTIVE'], to: 'ON_LEAVE', kind: 'LEAVE_STARTED', label: 'Break in study' },
  RESUME: { from: ['ON_LEAVE'], to: 'ACTIVE', kind: 'RESUMED', label: 'Resume studies', reenrol: 'optional' },
  DETAIN: { from: ['ACTIVE'], to: 'DETAINED', kind: 'DETAINED', label: 'Detain (year back)' },
  WITHDRAW: { from: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DETAINED'], to: 'WITHDRAWN', kind: 'WITHDRAWN', label: 'Withdraw', clearance: true },
  TRANSFER: { from: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DETAINED'], to: 'TRANSFERRED', kind: 'TRANSFERRED', label: 'Transfer out', clearance: true },
  RUSTICATE: { from: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DETAINED'], to: 'RUSTICATED', kind: 'RUSTICATED', label: 'Rusticate' },
  READMIT: { from: ['DETAINED', 'WITHDRAWN', 'ON_LEAVE'], to: 'ACTIVE', kind: 'READMITTED', label: 'Readmit', reenrol: 'required' },
  GRADUATE: { from: ['ACTIVE'], to: 'GRADUATED', kind: 'GRADUATED', label: 'Graduate', clearance: true },
};

const allowedActions = (status: StudentStatus) => ACTIONS.filter((a) => RULES[a].from.includes(status));

const CERTS_ON_EXIT: Partial<Record<Action, string[]>> = {
  WITHDRAW: ['Transfer Certificate'],
  TRANSFER: ['Transfer Certificate', 'Migration Certificate'],
  GRADUATE: ['Provisional Certificate', 'Degree Certificate'],
};

/** Why a student cannot yet graduate; empty when they can. */
async function graduationBlockers(student: { id: string; status: StudentStatus; semester: number; programme: { years: number } }) {
  const last = finalSemester(student.programme.years);
  const reasons: string[] = [];
  if (student.status !== 'ACTIVE') reasons.push(`Standing is ${student.status.toLowerCase().replace('_', ' ')}`);
  if (student.semester < last) reasons.push(`In semester ${student.semester} of ${last}`);
  const s = (await standingOf([student.id])).get(student.id)!;
  const missing = Array.from({ length: last }, (_, i) => i + 1).filter((n) => !s.semestersDeclared.includes(n));
  if (missing.length) reasons.push(`No published result for semester ${missing.join(', ')}`);
  if (s.backlogs.length) reasons.push(`${s.backlogs.length} subject${s.backlogs.length > 1 ? 's' : ''} not cleared (${s.backlogs.slice(0, 4).map((b) => b.code).join(', ')})`);
  else if (s.failedSemesters.length) reasons.push(`Result withheld or failed for semester ${s.failedSemesters.join(', ')}`);
  return { reasons, standing: s };
}

interface TransitionInput {
  action: Action;
  reason: string;
  reference?: string | null;
  effectiveOn?: Date;
  semester?: number;
  term?: string;
}

/**
 * The one place a student's standing changes. Throws with the reason when
 * the move is not allowed; returns what it did otherwise.
 */
export async function transition(studentId: string, input: TransitionInput, actor: Actor) {
  const rule = RULES[input.action];
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, enrolmentNo: true, status: true, semester: true, programmeId: true, userId: true, programme: { select: { years: true } } },
  });
  if (!student) throw ApiError.notFound('No such student');
  if (!rule.from.includes(student.status)) {
    throw ApiError.conflict(`${rule.label} is not possible while the student is ${student.status.toLowerCase().replace('_', ' ')}`);
  }

  if (rule.clearance) {
    const c = await clearanceOf(studentId);
    if (!c.complete) throw ApiError.conflict(`No-dues clearance is incomplete: ${c.pending.join(', ')}`, { pending: c.pending });
  }
  if (input.action === 'GRADUATE') {
    const { reasons } = await graduationBlockers(student);
    if (reasons.length) throw ApiError.conflict(`Not eligible to graduate: ${reasons.join('; ')}`, { reasons });
  }

  let semester = student.semester;
  let term: string | undefined;
  if (rule.reenrol === 'required' || (rule.reenrol === 'optional' && input.semester)) {
    if (!input.semester || !input.term) throw ApiError.badRequest('Give the semester and term the student rejoins in');
    const last = finalSemester(student.programme.years);
    if (input.semester < 1 || input.semester > last) throw ApiError.badRequest(`Semester must be between 1 and ${last}`);
    if (!TERM.test(input.term)) throw ApiError.badRequest('Term must look like 2026-27-ODD');
    if (!termFitsSemester(input.term, input.semester)) throw ApiError.badRequest(`Semester ${input.semester} runs in the ${input.semester % 2 ? 'ODD' : 'EVEN'} term`);
    await requireCurriculum(student.programmeId, input.semester);
    semester = input.semester;
    term = input.term;
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        status: rule.to, statusSince: input.effectiveOn ?? now,
        ...(term ? { semester, year: yearOf(semester) } : {}),
        ...(input.action === 'GRADUATE' ? { graduatedOn: input.effectiveOn ?? now } : {}),
      },
    });

    const enrolled = term ? await enrolInSemester(tx, student, semester, term) : 0;

    // An exit closes the sign-in and every live session; a return reopens it.
    if (EXITS.includes(rule.to)) {
      await tx.user.update({ where: { id: student.userId }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { userId: student.userId, revokedAt: null }, data: { revokedAt: now } });
    } else if (EXITS.includes(student.status) && rule.to === 'ACTIVE') {
      await tx.user.update({ where: { id: student.userId }, data: { isActive: true } });
    }
    if (EXITS.includes(rule.to) || rule.to === 'GRADUATED') {
      await tx.busPass.updateMany({ where: { studentId, status: { not: 'CANCELLED' } }, data: { valid: false, status: 'CANCELLED', cancelledReason: `${rule.label}: ${input.reason}`.slice(0, 300) } });
      // Leaving the rolls ends the hostel stay too.
      const bed = await tx.hostelAllotment.findUnique({ where: { activeStudent: studentId }, select: { id: true } });
      if (bed) await vacate(tx, bed.id, actor.name, `${rule.label}: ${input.reason}`.slice(0, 300), false);
    }

    const certificates = CERTS_ON_EXIT[input.action]
      ? await raiseCertificates(tx, studentId, CERTS_ON_EXIT[input.action]!, `${rule.label}: ${input.reason}`.slice(0, 200))
      : [];

    const event = await tx.lifecycleEvent.create({
      data: {
        studentId, kind: rule.kind, fromStatus: student.status, toStatus: rule.to,
        fromSemester: student.semester, toSemester: semester, term: term ?? null,
        reason: input.reason, reference: input.reference ?? null, effectiveOn: input.effectiveOn ?? now,
        actorId: actor.id, actorName: actor.name,
      },
    });

    await tx.notification.create({
      data: {
        studentId, kind: 'GENERAL', urgent: rule.to !== 'ACTIVE' && rule.to !== 'GRADUATED',
        title: `${rule.label} — your standing is now ${rule.to.toLowerCase().replace('_', ' ')}`,
        body: `${input.reason}${input.reference ? ` (Ref. ${input.reference})` : ''}${certificates.length ? `. Raised: ${certificates.join(', ')}.` : ''}`,
        href: '/profile',
      },
    });

    return { event, enrolled, certificates };
  });

  return { studentId, enrolmentNo: student.enrolmentNo, name: student.name, from: student.status, to: rule.to, semester, ...result };
}

// ─── Presenting ───────────────────────────────────────────────────────────────

async function historyOf(studentId: string) {
  const [events, admission, student] = await Promise.all([
    prisma.lifecycleEvent.findMany({ where: { studentId }, orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }] }),
    prisma.admissionApplication.findUnique({ where: { studentId }, select: { applicationNo: true, admissionDate: true } }),
    prisma.student.findUnique({ where: { id: studentId }, select: { createdAt: true, batch: true } }),
  ]);
  const list = events.map((e) => ({
    id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, fromSemester: e.fromSemester, toSemester: e.toSemester,
    term: e.term, reason: e.reason, reference: e.reference, effectiveOn: e.effectiveOn, by: e.actorName,
  }));
  // Students admitted before the lifecycle register existed still start somewhere.
  if (!events.some((e) => e.kind === 'ADMITTED') && student) {
    list.push({
      id: `admitted-${studentId}`, kind: 'ADMITTED', fromStatus: null, toStatus: 'ACTIVE', fromSemester: null, toSemester: 1, term: null,
      reason: `Admitted to batch ${student.batch}`, reference: admission?.applicationNo ?? null,
      effectiveOn: admission?.admissionDate ?? student.createdAt, by: 'Admission counter',
    });
  }
  return list;
}

function presentRequest(r: { id: string; requestNo: string; kind: string; reason: string; destination: string | null; returnBy: Date | null; status: string; decisionNote: string | null; decidedBy: string | null; decidedAt: Date | null; createdAt: Date }) {
  return { id: r.id, requestNo: r.requestNo, kind: r.kind, reason: r.reason, destination: r.destination, returnBy: r.returnBy, status: r.status, decisionNote: r.decisionNote, decidedBy: r.decidedBy, decidedAt: r.decidedAt, createdAt: r.createdAt };
}

// ─── GET /api/lifecycle/overview ──────────────────────────────────────────────

lifecycleRouter.get(
  '/overview',
  requireRole(...STAFF),
  asyncHandler(async (_req, res) => {
    const [byStatus, recent, pendingRequests, programmes] = await Promise.all([
      prisma.student.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.lifecycleEvent.findMany({
        orderBy: { createdAt: 'desc' }, take: 15,
        include: { student: { select: { id: true, name: true, enrolmentNo: true } } },
      }),
      prisma.lifecycleRequest.count({ where: { status: 'PENDING' } }),
      prisma.programme.findMany({ select: { id: true, code: true, name: true, shortName: true, years: true }, orderBy: { name: 'asc' } }),
    ]);
    const cohorts = await prisma.student.groupBy({ by: ['programmeId', 'semester', 'status'], _count: { _all: true } });
    res.json({
      counts: Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0])),
      pendingRequests,
      term: await currentTerm(),
      programmes: programmes.map((p) => ({
        ...p, finalSemester: finalSemester(p.years),
        semesters: [...new Set(cohorts.filter((c) => c.programmeId === p.id).map((c) => c.semester))].sort((a, b) => a - b).map((semester) => ({
          semester,
          active: cohorts.filter((c) => c.programmeId === p.id && c.semester === semester && c.status === 'ACTIVE').reduce((t, c) => t + c._count._all, 0),
          total: cohorts.filter((c) => c.programmeId === p.id && c.semester === semester).reduce((t, c) => t + c._count._all, 0),
        })),
      })),
      recent: recent.map((e) => ({ id: e.id, kind: e.kind, student: e.student, toStatus: e.toStatus, fromSemester: e.fromSemester, toSemester: e.toSemester, reason: e.reason, by: e.actorName, at: e.createdAt })),
    });
  }),
);

// ─── GET /api/lifecycle/students ──────────────────────────────────────────────

lifecycleRouter.get(
  '/students',
  requireRole(...STAFF),
  validate('query', z.object({
    status: z.enum(STATUSES).optional(),
    programmeId: z.string().optional(),
    semester: z.coerce.number().int().min(1).max(24).optional(),
    q: z.string().trim().max(80).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { status, programmeId, semester, q } = validQuery<{ status?: StudentStatus; programmeId?: string; semester?: number; q?: string }>(req);
    const where: Prisma.StudentWhereInput = {
      ...(status ? { status } : {}),
      ...(programmeId ? { programmeId } : {}),
      ...(semester ? { semester } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { enrolmentNo: { contains: q, mode: 'insensitive' } }, { rollNo: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where, take: 300, orderBy: [{ programme: { name: 'asc' } }, { semester: 'asc' }, { rollNo: 'asc' }],
        select: { id: true, name: true, enrolmentNo: true, rollNo: true, semester: true, batch: true, status: true, statusSince: true, programme: { select: { shortName: true, years: true } } },
      }),
    ]);
    const due = await feesDue(students.map((s) => s.id));
    res.json({
      total,
      shown: students.length,
      students: students.map((s) => ({ ...s, programme: s.programme.shortName, finalSemester: finalSemester(s.programme.years), feeDue: due.get(s.id) ?? 0 })),
    });
  }),
);

// ─── GET /api/lifecycle/students/:id ──────────────────────────────────────────

lifecycleRouter.get(
  '/students/:id',
  requireRole(...STAFF),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true, name: true, enrolmentNo: true, rollNo: true, semester: true, year: true, batch: true, status: true, statusSince: true, graduatedOn: true, mobile: true,
        user: { select: { email: true, isActive: true } },
        programme: { select: { code: true, name: true, shortName: true, years: true } },
        college: { select: { name: true } },
        lifecycleRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!student) throw ApiError.notFound('No such student');
    const [history, clearance, attendance, due, grad, latest] = await Promise.all([
      historyOf(id),
      clearanceOf(id),
      overallAttendance([id]).then((m) => m.get(id)),
      feesDue([id]).then((m) => m.get(id) ?? 0),
      graduationBlockers(student),
      prisma.enrolment.findMany({ where: { studentId: id }, distinct: ['term'], select: { term: true } }).then((t) => latestTerm(t.map((x) => x.term))),
    ]);
    res.json({
      id: student.id, name: student.name, enrolmentNo: student.enrolmentNo, rollNo: student.rollNo, semester: student.semester, year: student.year, batch: student.batch,
      status: student.status, statusSince: student.statusSince, graduatedOn: student.graduatedOn, mobile: student.mobile,
      email: student.user.email, signInOpen: student.user.isActive,
      programme: { ...student.programme, finalSemester: finalSemester(student.programme.years) },
      college: student.college.name,
      currentTerm: latest,
      suggestedTerm: latest ? nextTerm(latest) : await currentTerm(),
      standing: { ...grad.standing, attendance: attendance?.percent ?? null, feeDue: due },
      graduation: { eligible: grad.reasons.length === 0 && clearance.complete, blockers: [...grad.reasons, ...(clearance.complete ? [] : [`No-dues pending: ${clearance.pending.join(', ')}`])] },
      clearance,
      actions: allowedActions(student.status).map((a) => ({ action: a, label: RULES[a].label, needsClearance: !!RULES[a].clearance, reenrol: RULES[a].reenrol ?? null })),
      history,
      requests: student.lifecycleRequests.map(presentRequest),
    });
  }),
);

// ─── POST /api/lifecycle/students/:id/transition ──────────────────────────────

const transitionBody = z.object({
  action: z.enum(ACTIONS),
  reason: z.string().trim().min(5).max(500),
  reference: z.string().trim().max(80).optional(),
  effectiveOn: z.string().date().optional(),
  semester: z.number().int().min(1).max(24).optional(),
  term: z.string().trim().max(20).optional(),
});

lifecycleRouter.post(
  '/students/:id/transition',
  requireRole(...DECIDERS),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', transitionBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof transitionBody>;
    const done = await transition(String(req.params.id), {
      ...body, effectiveOn: body.effectiveOn ? new Date(`${body.effectiveOn}T00:00:00.000Z`) : undefined,
    }, await actorOf(req));
    await recordFor(req, {
      module: 'Student Lifecycle', action: body.action.toLowerCase(), target: done.enrolmentNo,
      detail: `${done.from} → ${done.to}: ${body.reason}${body.reference ? ` (Ref. ${body.reference})` : ''}`,
      outcome: ['RUSTICATE', 'SUSPEND'].includes(body.action) ? 'WARN' : 'OK',
    });
    res.json(done);
  }),
);

// ─── No-dues sign-off ─────────────────────────────────────────────────────────

lifecycleRouter.post(
  '/students/:id/clearance',
  requireRole('OFFICE', 'REGISTRAR', 'ADMIN'),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({
    department: z.enum(DEPARTMENTS),
    cleared: z.boolean(),
    remarks: z.string().trim().max(300).optional(),
  })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { department, cleared, remarks } = req.body as { department: Department; cleared: boolean; remarks?: string };
    const student = await prisma.student.findUnique({ where: { id }, select: { enrolmentNo: true } });
    if (!student) throw ApiError.notFound('No such student');
    const automatic = AUTOMATIC.includes(department);
    if (automatic && cleared) {
      // Fees, books and passes clear themselves; overriding the ledger is a waiver, and only the registrar waives.
      if (!['REGISTRAR', 'ADMIN'].includes(req.auth!.role)) throw ApiError.forbidden(`${department} clears from its own ledger; only the registrar can waive it`);
      if (!remarks || remarks.length < 5) throw ApiError.badRequest('Give the reason and authority for the waiver');
    }
    const actor = await actorOf(req);
    if (cleared) {
      await prisma.noDuesClearance.upsert({
        where: { studentId_department: { studentId: id, department } },
        create: { studentId: id, department, cleared: true, remarks: remarks ?? null, clearedBy: actor.name },
        update: { cleared: true, remarks: remarks ?? null, clearedBy: actor.name, clearedAt: new Date() },
      });
    } else {
      await prisma.noDuesClearance.deleteMany({ where: { studentId: id, department } });
    }
    await recordFor(req, {
      module: 'Student Lifecycle', action: cleared ? (automatic ? 'no-dues waiver' : 'no-dues sign-off') : 'no-dues revoked',
      target: student.enrolmentNo, detail: `${department}${remarks ? `: ${remarks}` : ''}`, outcome: automatic && cleared ? 'WARN' : 'OK',
    });
    res.json(await clearanceOf(id));
  }),
);

/** The transport desk takes the bus pass back, which clears transport. */
lifecycleRouter.post(
  '/students/:id/clearance/surrender-pass',
  requireRole('OFFICE', 'REGISTRAR', 'ADMIN'),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const pass = await prisma.busPass.findUnique({ where: { studentId: id }, select: { id: true, valid: true, student: { select: { enrolmentNo: true } } } });
    if (!pass) throw ApiError.notFound('This student has no bus pass');
    if (pass.valid) await prisma.busPass.update({ where: { id: pass.id }, data: { valid: false, status: 'CANCELLED', cancelledReason: 'Surrendered for no-dues clearance' } });
    await recordFor(req, { module: 'Student Lifecycle', action: 'bus pass surrendered', target: pass.student.enrolmentNo });
    res.json(await clearanceOf(id));
  }),
);

// ─── Promotion ────────────────────────────────────────────────────────────────

const cohortQuery = z.object({
  programmeId: z.string().min(1),
  semester: z.coerce.number().int().min(1).max(24),
  maxBacklogs: z.coerce.number().int().min(0).max(50).optional(),
  minAttendance: z.coerce.number().min(0).max(100).optional(),
  requireResult: z.enum(['true', 'false']).optional(),
});

/**
 * The promotion sheet for one class: every active student, what the rules
 * say about them, and the term the next semester runs in. The registrar
 * reads it, changes any decision, and commits.
 */
lifecycleRouter.get(
  '/promotion',
  requireRole(...STAFF),
  validate('query', cohortQuery),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof cohortQuery>>(req);
    const programme = await prisma.programme.findUnique({ where: { id: q.programmeId }, select: { id: true, name: true, shortName: true, years: true } });
    if (!programme) throw ApiError.notFound('No such programme');
    const last = finalSemester(programme.years);
    // Moving into a new academic year is where results usually decide; within a year it is automatic.
    const requireResult = q.requireResult ? q.requireResult === 'true' : q.semester % 2 === 0;

    const students = await prisma.student.findMany({
      where: { programmeId: programme.id, semester: q.semester, status: 'ACTIVE' },
      orderBy: { rollNo: 'asc' },
      select: { id: true, name: true, rollNo: true, enrolmentNo: true },
    });
    const ids = students.map((s) => s.id);
    const [standing, attendance, due, latest] = await Promise.all([
      standingOf(ids), overallAttendance(ids), feesDue(ids),
      prisma.enrolment.findMany({ where: { studentId: { in: ids } }, distinct: ['studentId', 'term'], select: { studentId: true, term: true } }),
    ]);
    const perStudent = new Map<string, string[]>();
    for (const l of latest) perStudent.set(l.studentId, [...(perStudent.get(l.studentId) ?? []), l.term]);
    const terms = [...perStudent.values()].map((t) => latestTerm(t)!);
    const usual = terms.sort((a, b) => terms.filter((t) => t === b).length - terms.filter((t) => t === a).length)[0];
    const suggestedTerm = usual ? nextTerm(usual) : nextTerm(await currentTerm());

    const rows = students.map((s) => {
      const st = standing.get(s.id)!;
      const att = attendance.get(s.id);
      const declared = st.semestersDeclared.includes(q.semester);
      const flags: string[] = [];
      if (requireResult && !declared) flags.push(`Semester ${q.semester} result not published`);
      if (q.maxBacklogs !== undefined && st.backlogs.length > q.maxBacklogs) flags.push(`${st.backlogs.length} backlogs (limit ${q.maxBacklogs})`);
      if (q.minAttendance !== undefined && att && att.total > 0 && att.percent < q.minAttendance) flags.push(`Attendance ${att.percent}% (minimum ${q.minAttendance}%)`);
      return {
        ...s,
        resultDeclared: declared,
        cgpa: st.cgpa,
        backlogs: st.backlogs.length,
        backlogCodes: st.backlogs.map((b) => b.code),
        attendance: att && att.total > 0 ? att.percent : null,
        feeDue: due.get(s.id) ?? 0,
        flags,
        suggestion: flags.length ? ('DETAIN' as const) : ('PROMOTE' as const),
      };
    });

    res.json({
      programme: { ...programme, finalSemester: last },
      semester: q.semester,
      isFinal: q.semester >= last,
      toSemester: q.semester + 1,
      nextSemesterSubjects: q.semester >= last ? 0 : await prisma.subject.count({ where: { programmeId: programme.id, semester: q.semester + 1 } }),
      suggestedTerm,
      rules: { requireResult, maxBacklogs: q.maxBacklogs ?? null, minAttendance: q.minAttendance ?? null },
      students: rows,
    });
  }),
);

const promoteBody = z.object({
  programmeId: z.string().min(1),
  semester: z.number().int().min(1).max(24),
  term: z.string().trim().regex(TERM, 'Term must look like 2026-27-ODD'),
  reference: z.string().trim().max(80).optional(),
  decisions: z.array(z.object({
    studentId: z.string().min(1),
    decision: z.enum(['PROMOTE', 'DETAIN', 'HOLD']),
    reason: z.string().trim().max(300).optional(),
  })).min(1).max(2000),
});

lifecycleRouter.post(
  '/promotion',
  requireRole(...DECIDERS),
  validate('body', promoteBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof promoteBody>;
    const programme = await prisma.programme.findUnique({ where: { id: body.programmeId }, select: { id: true, shortName: true, years: true } });
    if (!programme) throw ApiError.notFound('No such programme');
    const to = body.semester + 1;
    if (to > finalSemester(programme.years)) throw ApiError.badRequest(`Semester ${body.semester} is the final semester — graduate these students instead`);
    if (!termFitsSemester(body.term, to)) throw ApiError.badRequest(`Semester ${to} runs in the ${to % 2 ? 'ODD' : 'EVEN'} term, not ${body.term}`);
    const missingReason = body.decisions.find((d) => d.decision === 'DETAIN' && (!d.reason || d.reason.length < 5));
    if (missingReason) throw ApiError.badRequest('Every detention needs a reason the student will read');
    const subjects = body.decisions.some((d) => d.decision === 'PROMOTE') ? await requireCurriculum(programme.id, to) : 0;

    const actor = await actorOf(req);
    const students = await prisma.student.findMany({
      where: { id: { in: body.decisions.map((d) => d.studentId) } },
      select: { id: true, name: true, enrolmentNo: true, status: true, semester: true, programmeId: true },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    const promoted: string[] = [];
    const detained: string[] = [];
    const skipped: Array<{ studentId: string; name: string; reason: string }> = [];

    for (const d of body.decisions) {
      const s = byId.get(d.studentId);
      if (!s) { skipped.push({ studentId: d.studentId, name: '—', reason: 'No such student' }); continue; }
      if (d.decision === 'HOLD') continue;
      if (s.programmeId !== programme.id || s.semester !== body.semester || s.status !== 'ACTIVE') {
        skipped.push({ studentId: s.id, name: s.name, reason: s.status !== 'ACTIVE' ? `Standing is ${s.status.toLowerCase()}` : `Now in semester ${s.semester}` });
        continue;
      }
      if (d.decision === 'DETAIN') {
        await transition(s.id, { action: 'DETAIN', reason: d.reason!, reference: body.reference }, actor);
        detained.push(s.enrolmentNo);
        continue;
      }
      await prisma.$transaction(async (tx) => {
        // Guarded on the semester, so two registrars committing the same sheet promote once.
        const moved = await tx.student.updateMany({ where: { id: s.id, semester: body.semester, status: 'ACTIVE' }, data: { semester: to, year: yearOf(to) } });
        if (moved.count === 0) return;
        await enrolInSemester(tx, s, to, body.term);
        await tx.lifecycleEvent.create({
          data: {
            studentId: s.id, kind: 'PROMOTED', fromStatus: 'ACTIVE', toStatus: 'ACTIVE', fromSemester: body.semester, toSemester: to, term: body.term,
            reason: d.reason || `Promoted to semester ${to}`, reference: body.reference ?? null, actorId: actor.id, actorName: actor.name,
          },
        });
        await tx.notification.create({
          data: { studentId: s.id, kind: 'GENERAL', title: `Promoted to semester ${to}`, body: `You are enrolled in semester ${to} subjects for ${body.term}.`, href: '/timetable' },
        });
        promoted.push(s.enrolmentNo);
      });
    }

    await recordFor(req, {
      module: 'Student Lifecycle', action: 'promotion', target: `${programme.shortName} sem ${body.semester} → ${to}`,
      detail: `${promoted.length} promoted, ${detained.length} detained, ${skipped.length} skipped, term ${body.term}${body.reference ? ` (Ref. ${body.reference})` : ''}`,
    });
    res.json({ promoted: promoted.length, detained: detained.length, skipped, toSemester: to, term: body.term, subjects });
  }),
);

// ─── Graduation ───────────────────────────────────────────────────────────────

lifecycleRouter.get(
  '/graduation',
  requireRole(...STAFF),
  validate('query', z.object({ programmeId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { programmeId } = validQuery<{ programmeId: string }>(req);
    const programme = await prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true, name: true, shortName: true, years: true } });
    if (!programme) throw ApiError.notFound('No such programme');
    const last = finalSemester(programme.years);
    const students = await prisma.student.findMany({
      where: { programmeId, semester: last, status: 'ACTIVE' },
      orderBy: { rollNo: 'asc' },
      select: { id: true, name: true, rollNo: true, enrolmentNo: true, status: true, semester: true },
    });
    const rows = [];
    for (const s of students) {
      const [grad, clearance] = await Promise.all([graduationBlockers({ ...s, programme }), clearanceOf(s.id)]);
      const blockers = [...grad.reasons, ...(clearance.complete ? [] : [`No-dues pending: ${clearance.pending.join(', ')}`])];
      rows.push({ id: s.id, name: s.name, rollNo: s.rollNo, enrolmentNo: s.enrolmentNo, cgpa: grad.standing.cgpa, creditsEarned: grad.standing.creditsEarned, eligible: blockers.length === 0, blockers });
    }
    const graduated = await prisma.student.count({ where: { programmeId, status: 'GRADUATED' } });
    res.json({ programme: { ...programme, finalSemester: last }, graduated, students: rows });
  }),
);

lifecycleRouter.post(
  '/graduation',
  requireRole(...DECIDERS),
  validate('body', z.object({
    studentIds: z.array(z.string().min(1)).min(1).max(2000),
    reference: z.string().trim().min(2).max(80),
    effectiveOn: z.string().date().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { studentIds, reference, effectiveOn } = req.body as { studentIds: string[]; reference: string; effectiveOn?: string };
    const actor = await actorOf(req);
    const graduated: string[] = [];
    const skipped: Array<{ studentId: string; reason: string }> = [];
    for (const id of studentIds) {
      try {
        const done = await transition(id, {
          action: 'GRADUATE', reason: 'Degree requirements certified complete', reference,
          effectiveOn: effectiveOn ? new Date(`${effectiveOn}T00:00:00.000Z`) : undefined,
        }, actor);
        graduated.push(done.enrolmentNo);
      } catch (e) {
        skipped.push({ studentId: id, reason: e instanceof Error ? e.message : 'Failed' });
      }
    }
    await recordFor(req, { module: 'Student Lifecycle', action: 'graduation', target: reference, detail: `${graduated.length} graduated, ${skipped.length} skipped` });
    res.json({ graduated: graduated.length, skipped });
  }),
);

// ─── Students' own applications ───────────────────────────────────────────────

const REQUEST_ACTION: Record<LifecycleRequestKind, Action> = {
  BREAK_OF_STUDY: 'LEAVE', RESUME: 'RESUME', WITHDRAWAL: 'WITHDRAW', TRANSFER: 'TRANSFER',
};

lifecycleRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const student = await prisma.student.findUnique({
      where: { id },
      select: { status: true, statusSince: true, graduatedOn: true, semester: true, batch: true, programme: { select: { name: true, years: true } }, lifecycleRequests: { orderBy: { createdAt: 'desc' } } },
    });
    if (!student) throw ApiError.notFound('Student record not found');
    const [history, clearance] = await Promise.all([historyOf(id), clearanceOf(id)]);
    const open = student.lifecycleRequests.find((r) => r.status === 'PENDING');
    res.json({
      status: student.status, statusSince: student.statusSince, graduatedOn: student.graduatedOn, semester: student.semester, batch: student.batch,
      programme: student.programme.name, finalSemester: finalSemester(student.programme.years),
      history, clearance,
      requests: student.lifecycleRequests.map(presentRequest),
      // What the student may apply for now; nothing while an application is open.
      canApply: open ? [] : (Object.keys(REQUEST_ACTION) as LifecycleRequestKind[]).filter((k) => RULES[REQUEST_ACTION[k]].from.includes(student.status)),
    });
  }),
);

const applyBody = z.object({
  kind: z.enum(['BREAK_OF_STUDY', 'RESUME', 'WITHDRAWAL', 'TRANSFER']),
  reason: z.string().trim().min(10).max(800),
  destination: z.string().trim().min(3).max(200).optional(),
  returnBy: z.string().date().optional(),
});

lifecycleRouter.post(
  '/me/requests',
  requireRole('STUDENT'),
  validate('body', applyBody),
  asyncHandler(async (req, res) => {
    const id = await resolveStudentId(req);
    const body = req.body as z.infer<typeof applyBody>;
    const student = await prisma.student.findUnique({ where: { id }, select: { status: true, enrolmentNo: true } });
    if (!student) throw ApiError.notFound('Student record not found');
    if (!RULES[REQUEST_ACTION[body.kind]].from.includes(student.status)) {
      throw ApiError.conflict(`You cannot apply for this while your standing is ${student.status.toLowerCase().replace('_', ' ')}`);
    }
    if (body.kind === 'TRANSFER' && !body.destination) throw ApiError.badRequest('Name the institution you are transferring to');
    if (body.kind === 'BREAK_OF_STUDY' && !body.returnBy) throw ApiError.badRequest('Say when you expect to return');
    if (await prisma.lifecycleRequest.findFirst({ where: { studentId: id, status: 'PENDING' }, select: { id: true } })) {
      throw ApiError.conflict('You already have an application awaiting a decision');
    }
    const prefix = `SLR/${new Date().getFullYear()}/`;
    const existing = await prisma.lifecycleRequest.findMany({ where: { requestNo: { startsWith: prefix } }, select: { requestNo: true } });
    const created = await prisma.lifecycleRequest.create({
      data: {
        requestNo: nextInSeries(prefix, existing.map((r) => r.requestNo), 5),
        studentId: id, kind: body.kind, reason: body.reason,
        destination: body.destination ?? null, returnBy: body.returnBy ? new Date(`${body.returnBy}T00:00:00.000Z`) : null,
      },
    });
    await recordFor(req, { module: 'Student Lifecycle', action: 'application', target: student.enrolmentNo, detail: `${created.requestNo} ${body.kind}` });
    res.status(201).json(presentRequest(created));
  }),
);

lifecycleRouter.post(
  '/me/requests/:id/cancel',
  requireRole('STUDENT'),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const r = await prisma.lifecycleRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!r || r.studentId !== studentId) throw ApiError.notFound('No such application');
    if (r.status !== 'PENDING') throw ApiError.conflict('Only an application awaiting a decision can be withdrawn');
    const updated = await prisma.lifecycleRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedBy: 'Withdrawn by the student' } });
    res.json(presentRequest(updated));
  }),
);

// ─── The registrar's queue of applications ────────────────────────────────────

lifecycleRouter.get(
  '/requests',
  requireRole(...STAFF),
  validate('query', z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() })),
  asyncHandler(async (req, res) => {
    const { status } = validQuery<{ status?: 'PENDING' }>(req);
    const rows = await prisma.lifecycleRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' }, take: 300,
      include: { student: { select: { id: true, name: true, enrolmentNo: true, semester: true, status: true, programme: { select: { shortName: true } } } } },
    });
    res.json(rows.map((r) => ({ ...presentRequest(r), student: { id: r.student.id, name: r.student.name, enrolmentNo: r.student.enrolmentNo, semester: r.student.semester, status: r.student.status, programme: r.student.programme.shortName } })));
  }),
);

const decideBody = z.object({
  approve: z.boolean(),
  note: z.string().trim().min(5).max(500),
  reference: z.string().trim().max(80).optional(),
  semester: z.number().int().min(1).max(24).optional(),
  term: z.string().trim().max(20).optional(),
});

lifecycleRouter.post(
  '/requests/:id/decide',
  requireRole(...DECIDERS),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', decideBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof decideBody>;
    const r = await prisma.lifecycleRequest.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { enrolmentNo: true } } } });
    if (!r) throw ApiError.notFound('No such application');
    if (r.status !== 'PENDING') throw ApiError.conflict(`This application is already ${r.status.toLowerCase()}`);
    const actor = await actorOf(req);

    if (body.approve) {
      // The move itself carries every check — standing, clearance — so an approval cannot skip them.
      const extra = r.kind === 'TRANSFER' && r.destination ? ` — to ${r.destination}` : r.kind === 'BREAK_OF_STUDY' && r.returnBy ? ` — return by ${r.returnBy.toISOString().slice(0, 10)}` : '';
      await transition(r.studentId, {
        action: REQUEST_ACTION[r.kind], reason: `${r.reason}${extra}`.slice(0, 500), reference: body.reference || r.requestNo,
        semester: body.semester, term: body.term,
      }, actor);
    } else {
      await prisma.notification.create({
        data: { studentId: r.studentId, kind: 'GENERAL', urgent: false, title: `Application ${r.requestNo} not approved`, body: body.note, href: '/profile' },
      });
    }
    const updated = await prisma.lifecycleRequest.update({
      where: { id: r.id },
      data: { status: body.approve ? 'APPROVED' : 'REJECTED', decisionNote: body.note, decidedBy: actor.name, decidedAt: new Date() },
    });
    await recordFor(req, { module: 'Student Lifecycle', action: body.approve ? 'application approved' : 'application rejected', target: r.student.enrolmentNo, detail: `${r.requestNo}: ${body.note}` });
    res.json(presentRequest(updated));
  }),
);
