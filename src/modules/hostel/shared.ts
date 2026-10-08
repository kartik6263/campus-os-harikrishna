import type { Request } from 'express';
import type { HostelGender, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';
import { nextInSeries } from '../office/shared.js';

/** Who may set hostels up, run them day to day, and read them. */
export const SETUP = ['REGISTRAR', 'ADMIN'] as const;
export const OPS = ['OFFICE', 'REGISTRAR', 'ADMIN'] as const;
export const READ = ['OFFICE', 'REGISTRAR', 'ADMIN', 'PRINCIPAL'] as const;

/** The academic year a date falls in: July to June, e.g. "2026-27". */
export function academicYear(d = new Date()): string {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Today's date in India, yyyy-mm-dd — a night roll call belongs to the IST date. */
export const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** The next number in a series: GP/2026/000123. Read from the highest, never counted. */
export async function nextNo(
  find: (prefix: string) => Promise<Array<Record<string, string>>>,
  field: string,
  prefix: string,
  width = 6,
) {
  const rows = await find(prefix);
  return nextInSeries(prefix, rows.map((r) => r[field]!), width);
}

/** Beds are lettered A, B, C… within a room. */
export const bedLabels = (capacity: number) => Array.from({ length: capacity }, (_, i) => String.fromCharCode(65 + i));

/** Whether a student of this gender may live in this hostel. */
export function genderFits(hostel: HostelGender, gender: string | null): { ok: boolean; why?: string } {
  if (hostel === 'CO_ED') return { ok: true };
  if (!gender) return { ok: false, why: "The student's gender is not on record; correct the record first" };
  if (hostel === 'BOYS' && gender !== 'Male') return { ok: false, why: 'This is a boys\' hostel' };
  if (hostel === 'GIRLS' && gender !== 'Female') return { ok: false, why: 'This is a girls\' hostel' };
  return { ok: true };
}

/** The person acting, for the record: their staff name, or their sign-in. */
export async function actorName(req: Request): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { email: true, office: { select: { name: true } }, faculty: { select: { name: true } }, student: { select: { name: true } } },
  });
  return u?.office?.name ?? u?.faculty?.name ?? u?.student?.name ?? u?.email ?? 'Staff';
}

/**
 * The allotment policy's score: how far home is, the reserved categories,
 * and any medical or disability need. Stored on the application when it is
 * made, so a later change to the policy does not reorder a queue silently.
 */
export function priorityScore(a: { distanceKm: number; category: string | null; specialNeeds: string | null; semester: number }) {
  const distance = a.distanceKm > 100 ? 40 : a.distanceKm > 50 ? 30 : a.distanceKm > 25 ? 20 : 10;
  const cat = (a.category ?? '').toUpperCase();
  const category = cat === 'SC' || cat === 'ST' ? 25 : cat === 'OBC' || cat === 'EWS' ? 15 : 0;
  const needs = a.specialNeeds ? 30 : 0;
  const fresher = a.semester <= 2 ? 5 : 0;
  return distance + category + needs + fresher;
}

/** The active allotment a student holds, with where it is. */
export const activeAllotmentOf = (studentId: string, tx: Prisma.TransactionClient = prisma) =>
  tx.hostelAllotment.findUnique({
    where: { activeStudent: studentId },
    include: { room: { include: { hostel: true } } },
  });

export function conflictOnUnique(err: unknown, message: string): never {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') throw ApiError.conflict(message);
  throw err;
}
