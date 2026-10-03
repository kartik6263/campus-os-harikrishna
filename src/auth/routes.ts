import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { currentTenant, prisma } from '../db.js';
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
import { rateLimit } from '../lib/ratelimit.js';

const PRODUCT = 'Resolion Campus OS';

export const authRouter = Router();

/** One cookie per institute on a shared pool, so two institutes never collide. */
const refreshCookie = () => {
  const tenant = currentTenant();
  return tenant ? `campus_rt_${tenant.slug}` : 'campus_rt';
};

/** Where an institute's users open the app, for links in emails. */
const appUrl = () => {
  const tenant = currentTenant();
  if (tenant && env.APP_URL_TEMPLATE) return env.APP_URL_TEMPLATE.replace('{slug}', tenant.slug);
  return env.APP_URL;
};

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
      office: OFFICE_SUMMARY,
      vendor: VENDOR_SUMMARY,
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
      office: user.office,
      vendor: user.vendor,
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

const OFFICE_SUMMARY = { select: { id: true, name: true, employeeId: true, designation: true } } as const;

const VENDOR_SUMMARY = { select: { id: true, name: true, code: true, status: true } } as const;

/**
 * The claims a token carries for this user, whichever kind of user they are.
 * Both branches are optional: an OFFICE or ADMIN account has neither.
 */
function claimsFor(user: {
  id: string;
  role: Role;
  student: { id: string } | null;
  faculty: { id: string; isHod: boolean } | null;
  vendor?: { id: string } | null;
}) {
  return {
    sub: user.id,
    role: user.role,
    ...(user.student ? { studentId: user.student.id } : {}),
    ...(user.faculty ? { facultyId: user.faculty.id, isHod: user.faculty.isHod } : {}),
    ...(user.vendor ? { vendorId: user.vendor.id } : {}),
  };
}

/** Signs a user in and sets the refresh cookie, for routes outside this file that create accounts. */
export async function startSession(req: Request, res: Response, userId: string, status = 200) {
  const payload = await session(userId, req.headers['user-agent']);
  res.cookie(refreshCookie(), payload.refreshToken, cookieOptions);
  res.status(status).json(payload);
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post(
  '/login',
  rateLimit('login', { perIp: 30, perAccount: 10, windowMinutes: 15 }),
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
    res.cookie(refreshCookie(), payload.refreshToken, cookieOptions);
    res.json(payload);
  }),
);

// ─── POST /api/auth/otp/request · /api/auth/otp/verify ────────────────────────

/** How long an emailed sign-in code lasts, and how many guesses it allows. */
const OTP_MINUTES = 10;
const OTP_ATTEMPTS = 5;

const otpHash = (userId: string, code: string) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(`${userId}:${code}`).digest('hex');

/**
 * Emails a six-digit sign-in code. The answer is the same whether or not the
 * address has an account, so this cannot be used to discover who does.
 *
 * With no mail server configured, the demo deployment hands the code back in
 * the response (and says so) so the flow can still be shown end to end; a
 * real deployment never does.
 */
authRouter.post(
  '/otp/request',
  rateLimit('otp-request', { perIp: 10, perAccount: 5, windowMinutes: 15 }),
  validate('body', z.object({ email: z.string().email(), turnstileToken: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { email, turnstileToken } = req.body as { email: string; turnstileToken?: string };
    if (captchaRequired(req)) await verifyTurnstile(req, turnstileToken);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const usable = user && user.isActive && !user.lockedAt;

    let demoCode: string | undefined;
    let delivered = false;
    if (usable) {
      // One live code at a time, and not more than one a minute.
      const recent = await prisma.loginCode.findFirst({
        where: { userId: user.id, usedAt: null, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (recent) throw new ApiError(429, 'A code was sent less than a minute ago. Please wait before asking again.', 'rate_limited');

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await prisma.loginCode.create({
        data: { userId: user.id, codeHash: otpHash(user.id, code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) },
      });
      try {
        delivered = await sendMail(
          user.email,
          `Your sign-in code: ${code}`,
          `Your sign-in code is ${code}. It expires in ${OTP_MINUTES} minutes. If you did not ask for it, ignore this email.`,
        );
      } catch (err) {
        console.error('[otp] mail failed', err);
      }
      if (!delivered) {
        if (env.SEED_DEMO) demoCode = code;
        else console.log(`[otp] no mail server configured — code for ${user.email}: ${code}`);
      }
    }

    res.json({
      sent: true,
      expiresInMinutes: OTP_MINUTES,
      channel: 'email',
      ...(demoCode ? { demoCode, note: 'Demo deployment without a mail server: the code is shown instead of emailed.' } : {}),
    });
  }),
);

authRouter.post(
  '/otp/verify',
  rateLimit('otp-verify', { perIp: 30, perAccount: 10, windowMinutes: 15 }),
  validate('body', z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body as { email: string; code: string };
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const live = user
      ? await prisma.loginCode.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: 'desc' } })
      : null;

    if (!user || !live) throw new ApiError(401, 'No code is waiting for this address. Ask for a new one.', 'otp_missing');
    if (live.expiresAt < new Date()) {
      await prisma.loginCode.update({ where: { id: live.id }, data: { usedAt: new Date() } });
      throw new ApiError(401, 'That code has expired. Ask for a new one.', 'otp_expired');
    }
    const expected = Buffer.from(live.codeHash, 'hex');
    const given = Buffer.from(otpHash(user.id, code), 'hex');
    if (!crypto.timingSafeEqual(expected, given)) {
      const attempts = live.attempts + 1;
      await prisma.loginCode.update({
        where: { id: live.id },
        data: { attempts, ...(attempts >= OTP_ATTEMPTS ? { usedAt: new Date() } : {}) },
      });
      throw new ApiError(
        401,
        attempts >= OTP_ATTEMPTS ? 'Too many wrong codes. Ask for a new one.' : `Incorrect code. ${OTP_ATTEMPTS - attempts} attempt(s) left.`,
        attempts >= OTP_ATTEMPTS ? 'otp_expired' : 'otp_wrong',
      );
    }
    if (!user.isActive || user.lockedAt) throw ApiError.forbidden('This account cannot sign in. Contact the IT cell.');

    await prisma.loginCode.update({ where: { id: live.id }, data: { usedAt: new Date() } });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedAttempts: 0 } });
    await record({ actorId: user.id, actorName: user.email, actorRole: user.role, module: 'Auth', action: 'Signed in with emailed code', target: user.email, ip: req.ip ?? null });

    const payload = await session(user.id, req.headers['user-agent']);
    res.cookie(refreshCookie(), payload.refreshToken, cookieOptions);
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
  rateLimit('register', { perIp: 5, windowMinutes: 60 }),
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
    res.cookie(refreshCookie(), payload.refreshToken, cookieOptions);
    res.status(201).json(payload);
  }),
);

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────

const RESET_TTL_MINUTES = 30;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Creates a single-use link to set a new password and emails it if mail is
 * configured. Returns the link either way, for a caller entitled to see it
 * (the IT Cell handing it over in person when there is no mail server).
 */
export async function issueResetLink(userId: string, email: string): Promise<{ link: string; emailed: boolean; expiresInMinutes: number }> {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordReset.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
  });
  // The app URL may already carry ?tenant=…; add the token either way.
  const base = appUrl().replace(/\/$/, '');
  const link = `${base}${base.includes('?') ? '&' : '/?'}reset=${token}`;
  const text =
    `A new password was requested for ${email} on ${PRODUCT}.\n\n` +
    `Set it here (the link works once, for ${RESET_TTL_MINUTES} minutes):\n${link}\n\n` +
    `If you did not ask for this, ignore this email; your password is unchanged.`;
  let emailed = false;
  try {
    emailed = await sendMail(email, `Set a new password — ${PRODUCT}`, text);
  } catch (err) {
    console.error('Password reset email failed:', err);
  }
  return { link, emailed, expiresInMinutes: RESET_TTL_MINUTES };
}

/**
 * Emails a single-use link to set a new password.
 *
 * Open to everyone, and the answer is the same whether or not the address
 * has an account, so it cannot be used to find out who is registered.
 */
authRouter.post(
  '/forgot-password',
  rateLimit('forgot', { perIp: 10, perAccount: 3, windowMinutes: 60 }),
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

    const { link, emailed } = await issueResetLink(user.id, user.email);
    if (!emailed && !env.isProd) {
      // No mail server locally: print the link so it can still be tested.
      console.log(`\n[password reset] ${user.email}\n  ${link}\n`);
    }

    res.json(generic);
  }),
);

// ─── POST /api/auth/reset-password ────────────────────────────────────────────

authRouter.post(
  '/reset-password',
  rateLimit('reset', { perIp: 10, windowMinutes: 15 }),
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
  rateLimit('change-password', { perIp: 10, windowMinutes: 15 }),
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


// ─── POST /api/auth/confirm-password ──────────────────────────────────────────

/**
 * Step-up check before a sensitive area (the confidential section): the
 * signed-in user types their own password again. Every attempt is on the
 * audit chain; a wrong one counts towards the account's failed attempts.
 */
authRouter.post(
  '/confirm-password',
  rateLimit('confirm-password', { perIp: 10, windowMinutes: 15 }),
  requireAuth,
  validate('body', z.object({ password: z.string().min(1), purpose: z.string().trim().min(2).max(60) })),
  asyncHandler(async (req, res) => {
    const { password, purpose } = req.body as { password: string; purpose: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, include: { faculty: { select: { name: true } }, office: { select: { name: true } } } });
    const ok = await bcrypt.compare(password, user.passwordHash);
    await record({
      actorId: user.id, actorName: user.faculty?.name ?? user.office?.name ?? user.email, actorRole: user.role,
      module: purpose, action: ok ? 'unlock' : 'unlock-denied', target: purpose,
      detail: ok ? 'Password confirmed' : 'Wrong password', ip: req.ip ?? null, outcome: ok ? 'OK' : 'DENIED',
    });
    if (!ok) {
      await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: { increment: 1 } } });
      throw ApiError.unauthorized('That password is not correct');
    }
    res.json({ ok: true, confirmedAt: new Date() });
  }),
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const supplied =
      (req.body as { refreshToken?: string } | undefined)?.refreshToken ??
      (req.cookies?.[refreshCookie()] as string | undefined);

    if (!supplied) throw ApiError.unauthorized('No refresh token supplied');

    const result = await rotateRefreshToken(supplied, req.headers['user-agent']);

    if (!result.ok) {
      res.clearCookie(refreshCookie(), clearOptions);
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
        office: OFFICE_SUMMARY,
        vendor: VENDOR_SUMMARY,
      },
    });

    // Locking or disabling an account must end its sessions, not just block
    // the next password sign-in.
    if (!user.isActive || user.lockedAt) {
      await revokeAllForUser(user.id);
      res.clearCookie(refreshCookie(), clearOptions);
      throw ApiError.forbidden(user.lockedAt ? 'This account is locked. Contact the IT cell.' : 'This account is disabled');
    }

    const accessToken = signAccessToken(claimsFor(user));

    res.cookie(refreshCookie(), result.token, cookieOptions);
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
        office: user.office,
        vendor: user.vendor,
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
      (req.cookies?.[refreshCookie()] as string | undefined);

    if (supplied) await revokeToken(supplied);
    res.clearCookie(refreshCookie(), clearOptions);
    res.status(204).end();
  }),
);

// ─── POST /api/auth/logout-all ────────────────────────────────────────────────

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllForUser(req.auth!.sub);
    res.clearCookie(refreshCookie(), clearOptions);
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
        office: OFFICE_SUMMARY,
        vendor: VENDOR_SUMMARY,
        wards: { select: { id: true, name: true, enrolmentNo: true } },
      },
    });
    res.json(user);
  }),
);
