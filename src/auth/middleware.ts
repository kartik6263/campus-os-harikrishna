import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../lib/http.js';
import { verifyAccessToken, type AccessClaims } from './tokens.js';
import { currentTenant, prisma } from '../db.js';
import { env } from '../env.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims;
    }
  }
}

/** The only API paths a VENDOR token may reach. */
const VENDOR_REACHABLE = ['/api/vendor', '/api/auth', '/api/institution'];

/** Roles that may name any student by id: the campus's own staff. */
const STAFF_ROLES: Role[] = ['FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'];

/** Rejects the request unless a valid, unexpired access token is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Missing Bearer token'));
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice(7));
    // On a shared pool, a token only works at the institute that issued it.
    if (env.POOL_MODE && claims.tid !== currentTenant()?.slug) {
      next(ApiError.unauthorized('This sign-in belongs to a different institute'));
      return;
    }
    // A supplier is an outsider. Many campus routes only ask "signed in?" and
    // then trust the role to be a student, parent or staff member, so a vendor
    // token is refused everywhere except the routes written for it.
    if (claims.role === 'VENDOR' && !VENDOR_REACHABLE.some((p) => req.originalUrl.startsWith(p))) {
      next(ApiError.forbidden('Vendor accounts can use the vendor portal only'));
      return;
    }
    req.auth = claims;
    next();
  } catch (err) {
    const expired = err instanceof Error && err.name === 'TokenExpiredError';
    next(
      new ApiError(
        401,
        expired ? 'Access token expired' : 'Invalid access token',
        expired ? 'token_expired' : 'unauthorized',
      ),
    );
  }
}

/** Allows the request only for the listed roles. Use after `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(ApiError.forbidden(`This endpoint requires one of: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

/**
 * Resolves which faculty record the caller is acting as.
 *
 * A lecturer always resolves to themselves, so no faculty endpoint can be
 * pointed at a colleague by editing the URL. ADMIN may act on behalf of one by
 * passing `?facultyId=`, which is how the console reads a staff member's
 * load without borrowing their session.
 */
export async function resolveFacultyId(req: Request): Promise<string> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  if (auth.role === 'FACULTY') {
    if (!auth.facultyId) throw ApiError.forbidden('This account has no faculty record');
    return auth.facultyId;
  }

  if (auth.role !== 'ADMIN') {
    throw ApiError.forbidden('This endpoint is for teaching staff');
  }

  const requested =
    (req.params.facultyId as string | undefined) ??
    (typeof req.query.facultyId === 'string' ? req.query.facultyId : undefined);

  if (!requested) {
    throw ApiError.badRequest('facultyId is required for administrator accounts');
  }

  const exists = await prisma.faculty.findUnique({
    where: { id: requested },
    select: { id: true },
  });
  if (!exists) throw ApiError.notFound('No such faculty record');

  return exists.id;
}

/**
 * Restricts a route to a head of department (or an administrator).
 *
 * Approving marks and leave is the one thing a lecturer may not do for their
 * own department, so it is a separate check from `requireRole('FACULTY')`.
 */
export function requireHod(req: Request, _res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth) {
    next(ApiError.unauthorized());
    return;
  }
  if (auth.role === 'ADMIN' || auth.isHod === true) {
    next();
    return;
  }
  next(ApiError.forbidden('Only a head of department can approve this'));
}

/**
 * Resolves which student record the caller may read.
 *
 * A student always resolves to themselves — the id is never taken from the
 * URL, so one student cannot read another by guessing an id. Staff and
 * parents may pass `?studentId=`, and a parent is checked against guardianship.
 */
export async function resolveStudentId(req: Request): Promise<string> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  if (auth.role === 'STUDENT') {
    if (!auth.studentId) throw ApiError.forbidden('This account has no student record');
    return auth.studentId;
  }

  const requested =
    (req.params.studentId as string | undefined) ??
    (typeof req.query.studentId === 'string' ? req.query.studentId : undefined);

  // A parent who names no student means their own ward (the first, if several).
  if (!requested && auth.role === 'PARENT') {
    const ward = await prisma.student.findFirst({
      where: { guardianId: auth.sub },
      orderBy: { enrolmentNo: 'asc' },
      select: { id: true },
    });
    if (!ward) throw ApiError.forbidden('No student is linked to this parent account');
    return ward.id;
  }

  if (!requested) {
    throw ApiError.badRequest('studentId is required for non-student accounts');
  }

  if (auth.role === 'PARENT') {
    const ward = await prisma.student.findFirst({
      where: { id: requested, guardianId: auth.sub },
      select: { id: true },
    });
    if (!ward) throw ApiError.forbidden('That student is not linked to this parent account');
    return ward.id;
  }

  if (!STAFF_ROLES.includes(auth.role)) throw ApiError.forbidden('This account cannot read student records');
  return requested;
}
