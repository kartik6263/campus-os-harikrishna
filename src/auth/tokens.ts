import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../env.js';
import { currentTenant, prisma } from '../db.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  /** Present only for STUDENT users; saves a lookup on every student route. */
  studentId?: string;
  /** Present only for FACULTY users, for the same reason. */
  facultyId?: string;
  /** Heads of department approve marks and leave, so it rides in the token. */
  isHod?: boolean;
  /** On a shared pool: the institute the token was issued by. */
  tid?: string;
}

export function signAccessToken(claims: AccessClaims): string {
  const tenant = currentTenant();
  return jwt.sign(tenant ? { ...claims, tid: tenant.slug } : claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'campus-os',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'campus-os' }) as AccessClaims;
}

/**
 * Refresh tokens are random opaque strings, stored only as SHA-256 hashes.
 * A leaked database therefore does not yield usable tokens.
 */
function newRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function issueRefreshToken(
  userId: string,
  family = crypto.randomUUID(),
  userAgent?: string,
) {
  const token = newRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash(token), family, expiresAt, userAgent: userAgent ?? null },
  });

  return { token, family, expiresAt };
}

export type RotateResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' };

/**
 * Consumes a refresh token and issues its replacement.
 *
 * If a token that was already rotated comes back, the whole family is revoked:
 * either it leaked, or a client is replaying. Either way every session in that
 * chain should die rather than silently continue.
 */
export async function rotateRefreshToken(token: string, userAgent?: string): Promise<RotateResult> {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } });

  if (!existing) return { ok: false, reason: 'invalid' };

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: existing.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: 'revoked' };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const replacement = newRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  // Revoke-and-replace atomically. The `revokedAt: null` guard means a
  // concurrent rotation of the same token updates zero rows and its
  // transaction fails, so only one replacement is ever issued.
  const [revoked] = await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hash(replacement),
        family: existing.family,
        expiresAt,
        userAgent: userAgent ?? null,
      },
    }),
  ]);

  if (revoked.count === 0) return { ok: false, reason: 'revoked' };

  return { ok: true, userId: existing.userId, token: replacement, expiresAt };
}

export async function revokeToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
