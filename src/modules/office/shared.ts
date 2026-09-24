import type { Request } from 'express';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';

/**
 * Resolves which office staff member the caller is acting as.
 *
 * Everything the counter does is signed — a verified document, a receipt, an
 * issued certificate — so a route that writes needs a person, not just a role.
 * ADMIN may act for one by passing `?staffId=`.
 */
export async function resolveStaffId(req: Request): Promise<string> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  if (auth.role === 'OFFICE' || auth.role === 'REGISTRAR') {
    const staff = await prisma.officeStaff.findUnique({
      where: { userId: auth.sub },
      select: { id: true },
    });
    if (!staff) throw ApiError.forbidden('This account has no office staff record');
    return staff.id;
  }

  if (auth.role !== 'ADMIN') throw ApiError.forbidden('This endpoint is for the college office');

  const requested = typeof req.query.staffId === 'string' ? req.query.staffId : undefined;
  if (!requested) throw ApiError.badRequest('staffId is required for administrator accounts');

  const staff = await prisma.officeStaff.findUnique({
    where: { id: requested },
    select: { id: true },
  });
  if (!staff) throw ApiError.notFound('No such office staff record');

  return staff.id;
}

/** The papers a candidate must produce, in the order the counter checks them. */
export const REQUIRED_DOCUMENTS = [
  { name: '10th Marksheet', required: true },
  { name: '12th Marksheet', required: true },
  { name: 'Transfer Certificate', required: true },
  { name: 'Character Certificate', required: true },
  { name: 'Caste Certificate (if applicable)', required: false },
  { name: 'Income Certificate', required: false },
  { name: 'Domicile Certificate', required: true },
  { name: 'Aadhaar Card', required: true },
  { name: 'Passport Photo (6 copies)', required: true },
  { name: 'Medical Fitness Certificate', required: true },
] as const;

/** Service standard, in days, per certificate type. */
export const CERTIFICATE_SLA: Record<string, { days: number; fee: number }> = {
  'Bonafide Certificate': { days: 14, fee: 0 },
  'Character Certificate': { days: 14, fee: 50 },
  'Migration Certificate': { days: 16, fee: 200 },
  'Transfer Certificate': { days: 16, fee: 200 },
  'Provisional Certificate': { days: 21, fee: 300 },
  'Duplicate Marksheet': { days: 30, fee: 500 },
};

/** An urgent request is promised in half the time, rounded up. */
export function slaDeadline(type: string, priority: 'NORMAL' | 'URGENT', from = new Date()) {
  const days = CERTIFICATE_SLA[type]?.days ?? 14;
  const effective = priority === 'URGENT' ? Math.ceil(days / 2) : days;
  return new Date(from.getTime() + effective * 86_400_000);
}

/**
 * Next number in a series, e.g. CNT/JU/2024/001142.
 *
 * Reads the highest existing number rather than counting rows, so deleting a
 * row cannot make the next receipt reuse a number that was already issued.
 */
export function nextInSeries(prefix: string, existing: string[], width = 6): string {
  const highest = existing.reduce((max, no) => {
    const tail = Number(no.slice(prefix.length));
    return Number.isFinite(tail) && tail > max ? tail : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}
