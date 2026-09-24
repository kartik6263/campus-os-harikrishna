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

export const authRouter = Router();

const REFRESH_COOKIE = 'campus_rt';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProd,
  path: '/api/auth',
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

// ─── POST /api/auth/register ──────────────────────────────────────────────────

/**
 * Requests an admin console account.
 *
 * Anyone can reach this form, so what it creates cannot sign in: the account
 * starts disabled and an IT console administrator has to approve it. The
 * captcha is required here from every client, not just the browser.
 */
authRouter.post(
  '/register',
  validate('body', z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password needs an uppercase letter')
      .regex(/[0-9]/, 'Password needs a number'),
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
    const existing = await prisma.user.findUnique({ where: { email: address }, select: { id: true } });
    if (existing) throw ApiError.conflict('An account with that email already exists');

    const user = await prisma.user.create({
      data: {
        email: address,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'ADMIN',
        isActive: false,
      },
      select: { id: true, email: true, role: true, isActive: true },
    });

    // The user table has no name column; the request's audit entry keeps it.
    await record({
      actorId: user.id,
      actorName: name,
      actorRole: user.role,
      module: 'System Config',
      action: 'register',
      target: user.email,
      detail: 'Admin account requested from the sign-in page; awaiting IT approval',
      ip: req.ip ?? null,
      outcome: 'WARN',
    });

    res.status(201).json({ ...user, pendingApproval: true });
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
      res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
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
    res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
    res.status(204).end();
  }),
);

// ─── POST /api/auth/logout-all ────────────────────────────────────────────────

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllForUser(req.auth!.sub);
    res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
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
        student: { select: { id: true, name: true, nameHi: true, enrolmentNo: true, rollNo: true } },
        faculty: FACULTY_SUMMARY,
        wards: { select: { id: true, name: true, enrolmentNo: true } },
      },
    });
    res.json(user);
  }),
);
