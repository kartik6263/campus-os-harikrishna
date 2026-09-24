import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, validate } from '../lib/http.js';
import { requireAuth } from './middleware.js';
import {
  issueRefreshToken,
  revokeAllForUser,
  revokeToken,
  rotateRefreshToken,
  signAccessToken,
} from './tokens.js';
import { env } from '../env.js';
import { captchaRequired, verifyTurnstile } from './turnstile.js';
import { record } from '../modules/itconsole/audit.js';
import { sendMail } from '../lib/mailer.js';

const PRODUCT = 'Resolion Campus OS';

export const authRouter = Router();

const REFRESH_COOKIE = 'campus_rt';

// In production the web app and the API sit on different sites (Vercel and
// Render), and a Lax cookie is never sent on a cross-site fetch. None is the
// only setting that reaches the API from there, and it requires Secure.
const clearOptions = {
  httpOnly: true,
  sameSite: env.isProd ? ('none' as const) : ('lax' as const),
  secure: env.isProd,
  path: '/api/auth',
};

const cookieOptions = {
  ...clearOptions,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

/**
 * Builds the session payload.
 *
 * The refresh token goes out in both a httpOnly cookie (for the web app) and
 * the JSON body (for React Native, which has no cookie jar). Clients use one
 * or the other, never both.
 */
async function session(userId: string, userAgent?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      student: { select: { id: true, name: true, enrolmentNo: true } },
      faculty: FACULTY_SUMMARY,
    },
  });

  if (!user.isActive) throw ApiError.forbidden('This account is disabled');

  const accessToken = signAccessToken(claimsFor(user));

  const refresh = await issueRefreshToken(user.id, undefined, userAgent);

  return {
    accessToken,
    refreshToken: refresh.token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      student: user.student,
      faculty: user.faculty,
    },
  };
}

/** What a session payload discloses about a staff caller. */
const FACULTY_SUMMARY = {
  select: {
    id: true,
    name: true,
    nameHi: true,
    employeeId: true,
    designation: true,
    department: true,
    isHod: true,
  },
} as const;

/**
 * The claims a token carries for this user, whichever kind of user they are.
 * Both branches are optional: an OFFICE or ADMIN account has neither.
 */
function claimsFor(user: {
  id: string;
  role: Role;
  student: { id: string } | null;
  faculty: { id: string; isHod: boolean } | null;
}) {
  return {
    sub: user.id,
    role: user.role,
    ...(user.student ? { studentId: user.student.id } : {}),
    ...(user.faculty ? { facultyId: user.faculty.id, isHod: user.faculty.isHod } : {}),
  };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post(
  '/login',
  validate('body', z.object({
    email: z.string().email(),
    password: z.string().min(1),
    turnstileToken: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { email, password, turnstileToken } = req.body as {
      email: string;
      password: string;
      turnstileToken?: string;
    };

    // Before any database work, so a bot cannot use this to probe accounts.
    if (captchaRequired(req)) await verifyTurnstile(req, turnstileToken);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Compare even when the user is missing, so a wrong address and a wrong
    // password take the same time and cannot be told apart.
    const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduu';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      // A wrong password against a real account is worth counting; the IT
      // console shows the tally and an administrator can lock on it.
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: { increment: 1 } },
        });
      }
      throw ApiError.unauthorized('Incorrect email or password');
    }
    if (!user.isActive) {
      throw ApiError.forbidden(
        user.lastLoginAt === null
          ? 'This account is awaiting approval from the IT cell.'
          : 'This account is disabled',
      );
    }
    if (user.lockedAt) {
      throw ApiError.forbidden(
        user.lockReason
          ? `This account is locked: ${user.lockReason}`
          : 'This account is locked. Contact the IT cell.',
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedAttempts: 0 },
    });

    const payload = await session(user.id, req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, payload.refreshToken, cookieOptions);
    res.json(payload);
  }),
);

// ─── GET /api/auth/setup ──────────────────────────────────────────────────────

/** Whether this organisation's IT Cell account has still to be created. */
async function itCellSetupOpen() {
  return (await prisma.user.count({ where: { role: 'ADMIN' } })) === 0;
}

authRouter.get(
  '/setup',
  asyncHandler(async (_req, res) => {
    res.json({ itCellSetupOpen: await itCellSetupOpen() });
  }),
);

// ─── POST /api/auth/register ──────────────────────────────────────────────────

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a number');

/**
 * Creates the organisation's IT Cell account — once.
 *
 * Only the IT Cell signs itself up; everyone else (students, faculty, staff,
 * further IT staff) is given an ID and password by the IT Cell from inside
 * the console. So this is open only until the first administrator exists,
 * and the account it creates is active and signed in straight away.
 */
authRouter.post(
  '/register',
  validate('body', z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    password: strongPassword,
    turnstileToken: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { name, email, password, turnstileToken } = req.body as {
      name: string;
      email: string;
      password: string;
      turnstileToken?: string;
    };

    await verifyTurnstile(req, turnstileToken);

    const address = email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);

    // Checked and created in one serializable transaction, so two people
    // racing to set up the same organisation cannot both become its IT Cell.
    const user = await prisma.$transaction(
      async (tx) => {
        if ((await tx.user.count({ where: { role: 'ADMIN' } })) > 0) {
          throw ApiError.forbidden(
            'This organisation’s IT Cell is already set up. Ask your IT Cell for an account.',
          );
        }
        if (await tx.user.findUnique({ where: { email: address }, select: { id: true } })) {
          throw ApiError.conflict('An account with that email already exists');
        }
        return tx.user.create({
          data: { email: address, passwordHash, role: 'ADMIN', isActive: true, lastLoginAt: new Date() },
          select: { id: true, email: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    // The user table has no name column; the audit entry keeps it.
    await record({
      actorId: user.id,
      actorName: name,
      actorRole: 'ADMIN',
      module: 'System Config',
      action: 'it-cell-setup',
      target: user.email,
      detail: 'Organisation IT Cell account created from the sign-in page',
      ip: req.ip ?? null,
      outcome: 'WARN',
    });

    const payload = await session(user.id, req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, payload.refreshToken, cookieOptions);
    res.status(201).json(payload);
  }),
);

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────

const RESET_TTL_MINUTES = 30;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Emails a single-use link to set a new password.
 *
 * Open to everyone, and the answer is the same whether or not the address
 * has an account, so it cannot be used to find out who is registered.
 */
authRouter.post(
  '/forgot-password',
  validate('body', z.object({ email: z.string().email(), turnstileToken: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { email, turnstileToken } = req.body as { email: string; turnstileToken?: string };
    if (captchaRequired(req)) await verifyTurnstile(req, turnstileToken);

    const generic = {
      ok: true,
      message: 'If that address has an account, a link to set a new password has been sent to it.',
    };

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, isActive: true },
    });
    if (!user || !user.isActive) return void res.json(generic);

    // One live link a minute per account is plenty, and stops mail flooding.
    const recent = await prisma.passwordReset.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (recent) return void res.json(generic);

    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });

    const link = `${env.APP_URL.replace(/\/$/, '')}/?reset=${token}`;
    const text =
      `A new password was requested for ${user.email} on ${PRODUCT}.\n\n` +
      `Set it here (the link works once, for ${RESET_TTL_MINUTES} minutes):\n${link}\n\n` +
      `If you did not ask for this, ignore this email; your password is unchanged.`;

    try {
      const sent = await sendMail(user.email, `Set a new password — ${PRODUCT}`, text);
      if (!sent && !env.isProd) {
        // No mail server locally: print the link so it can still be tested.
        console.log(`\n[password reset] ${user.email}\n  ${link}\n`);
      }
    } catch (err) {
      console.error('Password reset email failed:', err);
    }

    res.json(generic);
  }),
);

// ─── POST /api/auth/reset-password ────────────────────────────────────────────

authRouter.post(
  '/reset-password',
  validate('body', z.object({ token: z.string().min(20), password: strongPassword })),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };

    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw ApiError.badRequest('This link has expired or was already used. Ask for a new one.');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false, failedAttempts: 0 },
      }),
      // This link, and any other outstanding one, stops working.
      prisma.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    // Whoever knew the old password is signed out everywhere.
    await revokeAllForUser(reset.userId);

    res.json({ ok: true });
  }),
);

// ─── POST /api/auth/change-password ───────────────────────────────────────────

/** A signed-in user replaces their password — required after the IT Cell issues one. */
authRouter.post(
  '/change-password',
  requireAuth,
  validate('body', z.object({ currentPassword: z.string().min(1), newPassword: strongPassword })),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Your current password is not correct');
    }
    if (currentPassword === newPassword) {
      throw ApiError.badRequest('Choose a password different from the current one');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
    });

    res.json({ ok: true, mustChangePassword: false });
  }),
);


// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const supplied =
      (req.body as { refreshToken?: string } | undefined)?.refreshToken ??
      (req.cookies?.[REFRESH_COOKIE] as string | undefined);

    if (!supplied) throw ApiError.unauthorized('No refresh token supplied');

    const result = await rotateRefreshToken(supplied, req.headers['user-agent']);

    if (!result.ok) {
      res.clearCookie(REFRESH_COOKIE, clearOptions);
      throw ApiError.unauthorized(
        result.reason === 'revoked'
          ? 'This session was revoked. Sign in again.'
          : 'Refresh token is invalid or expired',
      );
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: {
        student: { select: { id: true, name: true, enrolmentNo: true } },
        faculty: FACULTY_SUMMARY,
      },
    });

    const accessToken = signAccessToken(claimsFor(user));

    res.cookie(REFRESH_COOKIE, result.token, cookieOptions);
    res.json({
      accessToken,
      refreshToken: result.token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        student: user.student,
        faculty: user.faculty,
      },
    });
  }),
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const supplied =
      (req.body as { refreshToken?: string } | undefined)?.refreshToken ??
      (req.cookies?.[REFRESH_COOKIE] as string | undefined);

    if (supplied) await revokeToken(supplied);
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    res.status(204).end();
  }),
);

// ─── POST /api/auth/logout-all ────────────────────────────────────────────────

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllForUser(req.auth!.sub);
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    res.status(204).end();
  }),
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.sub },
      select: {
        id: true,
        email: true,
        role: true,
        lastLoginAt: true,
        mustChangePassword: true,
        student: { select: { id: true, name: true, nameHi: true, enrolmentNo: true, rollNo: true } },
        faculty: FACULTY_SUMMARY,
        wards: { select: { id: true, name: true, enrolmentNo: true } },
      },
    });
    res.json(user);
  }),
);
