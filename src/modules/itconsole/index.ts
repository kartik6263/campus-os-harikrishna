import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { revokeAllForUser } from '../../auth/tokens.js';
import { ACTIONS, MODULES, requirePermission } from './permissions.js';
import { recordFor, verifyChain } from './audit.js';
import { institutionInput } from '../institution.js';

/**
 * Phase 9 — the IT console.
 *
 * Three things, each of which actually does something: user administration
 * where locking an account really stops it signing in, a permission matrix
 * the route guards consult on every request, and an append-only audit log
 * chained by hash and written by the modules as they act.
 */
export const itRouter = Router();

itRouter.use(requireAuth);
itRouter.use(requireRole('ADMIN', 'REGISTRAR'));

// ═══ Users ═══════════════════════════════════════════════════════════════════

// ─── GET /api/it/users ────────────────────────────────────────────────────────

itRouter.get(
  '/users',
  requirePermission('System Config', 'view'),
  validate('query', z.object({ role: z.string().optional(), q: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as Role } : {}),
        ...(q ? { email: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true, email: true, role: true, isActive: true, lastLoginAt: true,
        lockedAt: true, lockReason: true, failedAttempts: true,
        mustChangePassword: true, createdAt: true,
        student: { select: { name: true, enrolmentNo: true } },
        faculty: { select: { name: true, employeeId: true } },
        office: { select: { name: true, employeeId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      // Whichever record carries this person's name.
      name: u.faculty?.name ?? u.office?.name ?? u.student?.name ?? u.email,
      identifier: u.faculty?.employeeId ?? u.office?.employeeId ?? u.student?.enrolmentNo ?? null,
      isActive: u.isActive,
      locked: u.lockedAt !== null,
      lockedAt: u.lockedAt,
      lockReason: u.lockReason,
      failedAttempts: u.failedAttempts,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      // Never signed in, so the credentials have not been used.
      neverSignedIn: u.lastLoginAt === null,
      status: u.lockedAt
        ? 'locked'
        : !u.isActive
          ? 'disabled'
          : u.lastLoginAt === null
            ? 'pending'
            : 'active',
    }));

    res.json({
      totals: {
        total: rows.length,
        active: rows.filter((r) => r.status === 'active').length,
        locked: rows.filter((r) => r.status === 'locked').length,
        pending: rows.filter((r) => r.status === 'pending').length,
        disabled: rows.filter((r) => r.status === 'disabled').length,
      },
      byRole: Object.fromEntries(
        [...new Set(rows.map((r) => r.role))].map((r) => [r, rows.filter((x) => x.role === r).length]),
      ),
      users: rows,
    });
  }),
);

// ─── GET /api/it/provisioning-options ─────────────────────────────────────────

/** What the Create User form offers: the colleges and their programmes. */
itRouter.get(
  '/provisioning-options',
  requirePermission('System Config', 'view'),
  asyncHandler(async (_req, res) => {
    const colleges = await prisma.college.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    const programmes = await prisma.programme.findMany({
      select: { id: true, code: true, name: true, collegeId: true, years: true },
      orderBy: { name: 'asc' },
    });
    res.json({ colleges, programmes });
  }),
);

// ─── POST /api/it/users ───────────────────────────────────────────────────────

const PROVISION_ROLES = ['STUDENT', 'PARENT', 'FACULTY', 'PRINCIPAL', 'OFFICE', 'REGISTRAR', 'ADMIN'] as const;

const provisionInput = z
  .object({
    role: z.enum(PROVISION_ROLES),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    /** Blank: a temporary password is generated and shown once. */
    password: z.string().min(8).max(100).optional().or(z.literal('')),
    collegeId: z.string().optional(),
    // Student
    enrolmentNo: z.string().trim().max(40).optional(),
    programmeId: z.string().optional(),
    semester: z.coerce.number().int().min(1).max(12).optional(),
    dob: z.string().optional(),
    // Staff
    employeeId: z.string().trim().max(40).optional(),
    designation: z.string().trim().max(80).optional(),
    department: z.string().trim().max(80).optional(),
    // Parent
    wardEnrolmentNo: z.string().trim().max(40).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, label: string) => {
      if (!v[field]) ctx.addIssue({ code: 'custom', path: [field], message: `${label} is required for this role` });
    };
    if (v.role === 'STUDENT') {
      need('enrolmentNo', 'Enrolment number');
      need('programmeId', 'Programme');
      need('semester', 'Semester');
      need('dob', 'Date of birth');
    }
    if (['FACULTY', 'PRINCIPAL', 'OFFICE', 'REGISTRAR'].includes(v.role)) {
      need('employeeId', 'Employee ID');
      need('designation', 'Designation');
    }
    if (v.role === 'FACULTY' || v.role === 'PRINCIPAL') need('department', 'Department');
    if (v.role === 'PARENT') need('wardEnrolmentNo', 'Ward’s enrolment number');
  });

/**
 * The IT Cell issues a user ID (their email) and password to a student,
 * parent, faculty member or staff member, together with the record that role
 * works from. The holder must change the password at first sign-in; what
 * each role may do is set in Roles & Permissions.
 */
itRouter.post(
  '/users',
  requirePermission('System Config', 'edit'),
  validate('body', provisionInput),
  asyncHandler(async (req, res) => {
    const v = req.body as z.infer<typeof provisionInput>;
    const email = v.email.toLowerCase();

    // Only an IT Cell administrator can make another one.
    if (v.role === 'ADMIN' && req.auth!.role !== 'ADMIN') {
      throw ApiError.forbidden('Only an IT Cell administrator can create IT Cell accounts');
    }

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw ApiError.conflict('An account with that email already exists');
    }

    // A college is needed by every record that sits under one.
    const needsCollege = v.role !== 'PARENT' && v.role !== 'ADMIN';
    const collegeId = needsCollege
      ? (v.collegeId ?? (await prisma.college.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } }))?.id)
      : undefined;
    if (needsCollege && !collegeId) {
      throw ApiError.badRequest('Add a college first — this role’s record belongs to one');
    }

    const ward = v.role === 'PARENT'
      ? await prisma.student.findUnique({ where: { enrolmentNo: v.wardEnrolmentNo! }, select: { id: true, guardianId: true } })
      : null;
    if (v.role === 'PARENT' && !ward) throw ApiError.badRequest('No student has that enrolment number');

    const generated = !v.password;
    const password = v.password || `Welcome-${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash, role: v.role, mustChangePassword: true },
        select: { id: true, email: true, role: true },
      });

      if (v.role === 'STUDENT') {
        const semester = v.semester!;
        const year = Math.ceil(semester / 2);
        const intake = new Date().getFullYear() - (year - 1);
        await tx.student.create({
          data: {
            userId: u.id,
            name: v.name,
            enrolmentNo: v.enrolmentNo!,
            rollNo: v.enrolmentNo!,
            dob: new Date(v.dob!),
            semester,
            year,
            batch: `${intake}–${String(intake + 3).slice(2)}`,
            collegeId: collegeId!,
            programmeId: v.programmeId!,
          },
        });
      } else if (v.role === 'FACULTY' || v.role === 'PRINCIPAL') {
        await tx.faculty.create({
          data: {
            userId: u.id,
            name: v.name,
            employeeId: v.employeeId!,
            designation: v.designation!,
            department: v.department!,
            joinDate: new Date(),
            collegeId: collegeId!,
          },
        });
      } else if (v.role === 'OFFICE' || v.role === 'REGISTRAR') {
        await tx.officeStaff.create({
          data: {
            userId: u.id,
            name: v.name,
            employeeId: v.employeeId!,
            designation: v.designation!,
            collegeId: collegeId!,
          },
        });
      } else if (v.role === 'PARENT') {
        await tx.student.update({ where: { id: ward!.id }, data: { guardianId: u.id } });
      }
      return u;
    }).catch((err: unknown) => {
      // A unique field — enrolment number, employee ID — already taken.
      if ((err as { code?: string }).code === 'P2002') {
        const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? 'a field');
        throw ApiError.conflict(`That ${target.includes('employee') ? 'employee ID' : target.includes('enrolment') || target.includes('roll') ? 'enrolment number' : 'value'} is already in use`);
      }
      throw err;
    });

    await recordFor(req, {
      module: 'System Config',
      action: 'create-user',
      target: user.email,
      detail: `${v.name} created as ${v.role}; must set a new password at first sign-in`,
      outcome: 'OK',
    });

    res.status(201).json({
      ...user,
      name: v.name,
      // Shown once to the IT Cell to hand over; never stored in the clear.
      temporaryPassword: generated ? password : undefined,
      mustChangePassword: true,
    });
  }),
);

// ─── POST /api/it/users/:id/lock ──────────────────────────────────────────────

/**
 * Locks or unlocks an account.
 *
 * Locking is not cosmetic: the sign-in path checks it, and every live session
 * is revoked at the same moment, so the account stops working immediately
 * rather than when its token happens to expire.
 */
itRouter.post(
  '/users/:id/lock',
  requirePermission('System Config', 'edit'),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ locked: z.boolean(), reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { locked, reason } = req.body as { locked: boolean; reason?: string };

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, lockedAt: true } });
    if (!user) throw ApiError.notFound('No such account');

    if (locked && !reason) throw ApiError.badRequest('Locking an account needs a reason on file');
    if (locked && user.lockedAt) throw ApiError.conflict('That account is already locked');
    if (!locked && !user.lockedAt) throw ApiError.conflict('That account is not locked');

    if (id === req.auth!.sub) {
      throw ApiError.forbidden('You cannot lock the account you are signed in with');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: locked
        ? { lockedAt: new Date(), lockReason: reason ?? null }
        : { lockedAt: null, lockReason: null, failedAttempts: 0 },
      select: { id: true, email: true, lockedAt: true, lockReason: true },
    });

    // A lock that leaves live sessions running is not a lock.
    if (locked) await revokeAllForUser(id);

    await recordFor(req, {
      module: 'System Config',
      action: locked ? 'lock' : 'unlock',
      target: updated.email,
      detail: locked ? reason : 'Account unlocked and failed attempts cleared',
      outcome: 'WARN',
    });

    res.json({
      id: updated.id,
      email: updated.email,
      locked: updated.lockedAt !== null,
      lockedAt: updated.lockedAt,
      lockReason: updated.lockReason,
      sessionsRevoked: locked,
    });
  }),
);

// ─── POST /api/it/users/:id/activate ──────────────────────────────────────────

/** Approves a requested account, or disables one and ends its sessions. */
itRouter.post(
  '/users/:id/activate',
  requirePermission('System Config', 'edit'),
  validate('params', z.object({ id: z.string().min(1) })),
  validate('body', z.object({ active: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { active } = req.body as { active: boolean };

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, isActive: true } });
    if (!user) throw ApiError.notFound('No such account');
    if (user.isActive === active) {
      throw ApiError.conflict(active ? 'That account is already active' : 'That account is already disabled');
    }
    if (!active && id === req.auth!.sub) {
      throw ApiError.forbidden('You cannot disable the account you are signed in with');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: active },
      select: { id: true, email: true, isActive: true },
    });

    if (!active) await revokeAllForUser(id);

    await recordFor(req, {
      module: 'System Config',
      action: active ? 'activate' : 'deactivate',
      target: updated.email,
      detail: active ? 'Account approved and enabled' : 'Account disabled; sessions revoked',
      outcome: 'WARN',
    });

    res.json(updated);
  }),
);

// ─── POST /api/it/users/:id/reset-password ────────────────────────────────────

/** Issues a temporary password the holder must change on first use. */
itRouter.post(
  '/users/:id/reset-password',
  requirePermission('System Config', 'edit'),
  validate('params', z.object({ id: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) throw ApiError.notFound('No such account');

    // Readable but not guessable; it is used once and then replaced.
    const temporary = `Campus-${Math.random().toString(36).slice(2, 8)}`;

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(temporary, 10),
        mustChangePassword: true,
        failedAttempts: 0,
      },
    });

    await revokeAllForUser(id);

    await recordFor(req, {
      module: 'System Config',
      action: 'reset-password',
      target: user.email,
      detail: 'Temporary password issued; the holder must change it',
      outcome: 'WARN',
    });

    res.json({
      id: user.id,
      email: user.email,
      temporaryPassword: temporary,
      mustChangePassword: true,
      sessionsRevoked: true,
    });
  }),
);

// ═══ Institution settings ════════════════════════════════════════════════════

// ─── PUT /api/it/institution ──────────────────────────────────────────────────

/** Renames and re-addresses the whole deployment; every client follows. */
itRouter.put(
  '/institution',
  requirePermission('System Config', 'edit'),
  validate('body', institutionInput),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof institutionInput>;
    // Blank optional fields are stored as null, not as empty strings.
    const data = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, v === '' || v === undefined ? null : v]),
    ) as z.infer<typeof institutionInput>;

    const saved = await prisma.institution.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    await recordFor(req, {
      module: 'System Config',
      action: 'institution-settings',
      target: saved.name,
      detail: `Institution profile updated (${saved.kind}, ${saved.shortCode})`,
      outcome: 'OK',
    });

    res.json(saved);
  }),
);

// ═══ The permission matrix ═══════════════════════════════════════════════════

// ─── GET /api/it/permissions ──────────────────────────────────────────────────

itRouter.get(
  '/permissions',
  requirePermission('System Config', 'view'),
  asyncHandler(async (_req, res) => {
    const rules = await prisma.permissionRule.findMany({ orderBy: [{ role: 'asc' }, { module: 'asc' }] });

    res.json({
      modules: MODULES,
      actions: ACTIONS,
      // Stated plainly, because it is the thing that makes the matrix safe to
      // edit: a module with no rule is open, not closed.
      defaultEffect: 'ALLOW',
      denials: rules.filter((r) => r.effect === 'DENY').length,
      rules: rules.map((r) => ({
        id: r.id,
        role: r.role,
        module: r.module,
        action: r.action,
        effect: r.effect,
        note: r.note,
        updatedAt: r.updatedAt,
      })),
    });
  }),
);

// ─── PUT /api/it/permissions ──────────────────────────────────────────────────

/**
 * Sets one line of the matrix.
 *
 * ADMIN cannot be denied System Config: a console that can lock its own
 * administrators out of the console is a console that can brick itself.
 */
itRouter.put(
  '/permissions',
  requirePermission('System Config', 'edit'),
  validate(
    'body',
    z.object({
      role: z.enum(['STUDENT', 'PARENT', 'FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN']),
      module: z.enum(MODULES),
      action: z.enum(ACTIONS),
      effect: z.enum(['ALLOW', 'DENY']),
      note: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      role: Role; module: string; action: string;
      effect: 'ALLOW' | 'DENY'; note?: string;
    };

    if (body.role === 'ADMIN' && body.module === 'System Config' && body.effect === 'DENY') {
      throw ApiError.badRequest(
        'An administrator cannot be denied System Config — that would lock the console against itself',
      );
    }

    const rule = await prisma.permissionRule.upsert({
      where: { role_module_action: { role: body.role, module: body.module, action: body.action } },
      create: {
        role: body.role,
        module: body.module,
        action: body.action,
        effect: body.effect,
        note: body.note ?? null,
      },
      update: { effect: body.effect, note: body.note ?? null },
    });

    await recordFor(req, {
      module: 'System Config',
      action: 'edit',
      target: `${body.role} · ${body.module} · ${body.action}`,
      detail: `Set to ${body.effect}`,
      outcome: body.effect === 'DENY' ? 'WARN' : 'OK',
    });

    res.json({
      id: rule.id,
      role: rule.role,
      module: rule.module,
      action: rule.action,
      effect: rule.effect,
      note: rule.note,
    });
  }),
);

// ═══ The audit log ═══════════════════════════════════════════════════════════

// ─── GET /api/it/audit ────────────────────────────────────────────────────────

itRouter.get(
  '/audit',
  requirePermission('Audit Log', 'view'),
  validate(
    'query',
    z.object({
      module: z.string().optional(),
      outcome: z.enum(['OK', 'WARN', 'DENIED']).optional(),
      limit: z.coerce.number().min(1).max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const module = typeof req.query.module === 'string' ? req.query.module : undefined;
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;

    const entries = await prisma.auditEntry.findMany({
      where: {
        ...(module ? { module } : {}),
        ...(outcome ? { outcome: outcome as 'OK' } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    res.json({
      totals: {
        returned: entries.length,
        denied: entries.filter((e) => e.outcome === 'DENIED').length,
        warnings: entries.filter((e) => e.outcome === 'WARN').length,
      },
      entries: entries.map((e) => ({
        id: e.id,
        seq: e.seq,
        occurredAt: e.occurredAt,
        actor: e.actorName,
        actorRole: e.actorRole,
        module: e.module,
        action: e.action,
        target: e.target,
        detail: e.detail,
        ip: e.ip,
        outcome: e.outcome,
        // Shown short: the full digest is what verification walks.
        hash: e.hash.slice(0, 16),
        prevHash: e.prevHash.slice(0, 16),
      })),
    });
  }),
);

// ─── GET /api/it/audit/verify ─────────────────────────────────────────────────

/**
 * Walks the chain and reports the first break.
 *
 * The point of the log is that this can be run at any time and answered from
 * the rows themselves — no separate record of what the rows ought to say.
 */
itRouter.get(
  '/audit/verify',
  requirePermission('Audit Log', 'view'),
  asyncHandler(async (req, res) => {
    const result = await verifyChain();

    await recordFor(req, {
      module: 'Audit Log',
      action: 'verify',
      target: `${result.entries} entries`,
      detail: result.intact ? 'Chain intact' : `Broken at sequence ${result.brokenAt?.seq}`,
      outcome: result.intact ? 'OK' : 'WARN',
    });

    res.json(result);
  }),
);
