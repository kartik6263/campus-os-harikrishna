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
