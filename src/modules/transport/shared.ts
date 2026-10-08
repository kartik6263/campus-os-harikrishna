import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/** Who may run the transport desk; the registrar and administrator also remove things. */
export const OPS = ['OFFICE', 'REGISTRAR', 'ADMIN'] as const;
export const READ = ['OFFICE', 'REGISTRAR', 'ADMIN', 'PRINCIPAL'] as const;
export const SENIOR = ['REGISTRAR', 'ADMIN'] as const;

/** Minutes after midnight for "07:45", "7:45 AM" or "08:05 PM"; null if unreadable. */
export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(time.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toUpperCase() === 'PM';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Minutes after midnight in India for an instant. */
export const istMinutes = (d: Date) => {
  const t = new Date(d.getTime() + 5.5 * 3_600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};

/** The IST date, yyyy-mm-dd. */
export const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** "07:45" for minutes after midnight. */
export const clock = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;

/** When a term's pass runs out: an ODD term at the end of December, an EVEN term at the end of June. */
export function termEnd(term: string, now = new Date()): Date {
  // The half-year we are in: a pass issued today runs at least to its end,
  // even where the institution's enrolments still carry last year's term.
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const halfEnd = ist.getUTCMonth() >= 6 ? new Date(`${ist.getUTCFullYear()}-12-31T23:59:59+05:30`) : new Date(`${ist.getUTCFullYear()}-06-30T23:59:59+05:30`);
  const m = /^(\d{4})-\d{2}-(ODD|EVEN)$/.exec(term);
  if (!m) return halfEnd;
  const y = Number(m[1]);
  const end = m[2] === 'ODD' ? new Date(`${y}-12-31T23:59:59+05:30`) : new Date(`${y + 1}-06-30T23:59:59+05:30`);
  return end > halfEnd ? end : halfEnd;
}

/** The fee head a pass is charged under, so a payment can be matched to it. */
export const feeHeadFor = (term: string, routeNo: string, stop: string) => `Transport fee — ${term} (${routeNo} / ${stop})`;

/**
 * A pass waiting for its fee becomes valid the moment the fee is paid —
 * online or at the counter — without anyone at the desk having to notice.
 * Called before every read of passes.
 */
export async function activatePaid(where: Prisma.BusPassWhereInput = {}) {
  const waiting = await prisma.busPass.findMany({ where: { ...where, status: 'PENDING_PAYMENT', feeHead: { not: null } }, select: { id: true, studentId: true, feeHead: true, fee: true, passNo: true } });
  for (const p of waiting) {
    const item = await prisma.feeItem.findFirst({ where: { studentId: p.studentId, head: p.feeHead! }, select: { amount: true, paid: true } });
    if (item && item.paid >= item.amount) {
      await prisma.$transaction([
        prisma.busPass.update({ where: { id: p.id }, data: { status: 'ACTIVE', valid: true } }),
        prisma.notification.create({ data: { studentId: p.studentId, kind: 'GENERAL', title: `Bus pass ${p.passNo} is active`, body: 'Your transport fee is paid. Show the pass number to the bus attendant.', href: '/bus-track' } }),
      ]);
    }
  }
}

/** Passes that hold a seat: active, or approved and waiting for payment, and not past their date. */
export const seatHolding = (routeId: string): Prisma.BusPassWhereInput => ({ routeId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, validTill: { gte: new Date() } });

interface Papers { fitnessValidTill: Date | null; insuranceValidTill: Date | null; permitValidTill: Date | null; pucValidTill: Date | null }

/** Each paper a vehicle must carry, and whether it is missing, expired or about to be. */
export function paperState(v: Papers, now = new Date()) {
  const soon = new Date(now.getTime() + 30 * 86_400_000);
  return ([['Fitness certificate', v.fitnessValidTill], ['Insurance', v.insuranceValidTill], ['Permit', v.permitValidTill], ['PUC', v.pucValidTill]] as const).map(([name, till]) => ({
    name, till, state: !till ? 'missing' as const : till < now ? 'expired' as const : till < soon ? 'expiring' as const : 'ok' as const,
  }));
}

/** Why this vehicle and driver may not take students out today; empty when they may. */
export function tripBlockers(vehicle: (Papers & { regNo: string; status: string }) | null, driver: { name: string; active: boolean; licenceNo: string | null; licenceValidTill: Date | null } | null): string[] {
  const out: string[] = [];
  if (!vehicle) out.push('No vehicle is assigned to this route');
  else {
    if (vehicle.status !== 'ACTIVE') out.push(`${vehicle.regNo} is ${vehicle.status.toLowerCase()}`);
    for (const p of paperState(vehicle)) if (p.state === 'missing' || p.state === 'expired') out.push(`${vehicle.regNo}: ${p.name} ${p.state}`);
  }
  if (!driver) out.push('No driver is assigned to this route');
  else {
    if (!driver.active) out.push(`${driver.name} is not on active duty`);
    if (!driver.licenceNo || !driver.licenceValidTill) out.push(`${driver.name}'s driving licence is not on record`);
    else if (driver.licenceValidTill < new Date()) out.push(`${driver.name}'s driving licence has expired`);
  }
  return out;
}

export async function nextNo(find: (prefix: string) => Promise<Array<Record<string, string>>>, field: string, prefix: string, width = 6) {
  const rows = await find(prefix);
  const highest = rows.reduce((m, r) => Math.max(m, Number(r[field]!.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}
