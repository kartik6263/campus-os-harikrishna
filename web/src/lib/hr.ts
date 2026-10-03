/**
 * HR & payroll, kept by the governance office.
 *
 * - People come from the system's own staff records (GET /api/governance/hr/staff);
 *   contract staff with no sign-in can be added by hand.
 * - `gov:hr-profiles`     pay, bank and service book for each person, keyed by employee id.
 * - `gov:payroll-settings` the institution's DA / HRA / PF / professional tax rates.
 * - `gov:payroll-runs`     one run per month: drafted, checked, then finalised and locked.
 * - `gov:vacancies`        recruitment.
 *
 * Unpaid leave approved in the system is counted as loss of pay automatically.
 */

export interface StaffMember {
  id: string; employeeId: string; name: string; designation: string; department: string;
  type: 'teaching' | 'non_teaching' | 'contractual'; mobile: string | null; email: string; active: boolean;
  joinedOn: string; college: string; isHod: boolean;
}

export interface ServiceEntry { date: string; kind: string; detail: string; orderNo?: string }

export interface HrProfile {
  /** The employee id. */
  id: string;
  /** Only for contract staff entered by hand. */
  manual?: { name: string; designation: string; department: string; joinedOn: string };
  payLevel?: string;
  basicPay: number;
  /** Fixed monthly allowances beyond DA and HRA (transport, special…). */
  allowances: Array<{ name: string; amount: number }>;
  /** Fixed monthly deductions beyond PF and professional tax (LIC, society…). */
  deductions: Array<{ name: string; amount: number }>;
  pf: boolean;
  /** Consolidated pay: no DA, HRA or PF (typical of contract staff). */
  consolidated?: boolean;
  bankName?: string; accountLast4?: string; ifsc?: string; panLast4?: string;
  status: 'active' | 'on_leave' | 'retired' | 'relieved';
  serviceBook: ServiceEntry[];
}

export interface PayrollSettings { id: string; daPercent: number; hraPercent: number; pfPercent: number; professionalTax: number }
export const DEFAULT_SETTINGS: PayrollSettings = { id: 'doc', daPercent: 53, hraPercent: 20, pfPercent: 12, professionalTax: 200 };

export interface PayLine {
  employeeId: string; name: string; designation: string; department: string;
  basic: number; da: number; hra: number; allowances: number; gross: number;
  lopDays: number; lop: number;
  pf: number; pt: number; tds: number; otherDeductions: number; totalDeductions: number; net: number;
  bank?: string; accountLast4?: string; ifsc?: string;
}

export interface PayrollRun {
  id: string; month: string; status: 'draft' | 'final';
  createdAt: string; finalisedAt?: string; finalisedBy?: string;
  settings: PayrollSettings; lines: PayLine[];
}

export interface Vacancy {
  id: string; title: string; department: string; type: 'teaching' | 'non_teaching' | 'contractual';
  posts: number; qualification: string; lastDate: string; status: 'draft' | 'open' | 'shortlisting' | 'interview' | 'filled' | 'cancelled';
  applications: number; notes?: string; createdAt: string;
}

const r = (n: number) => Math.round(n);

/** Days in a yyyy-mm month. */
export const daysIn = (month: string) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();

/** One person's pay for a month. `lopDays` are unpaid days; TDS is entered by HR. */
export function computeLine(person: { employeeId: string; name: string; designation: string; department: string }, p: HrProfile, s: PayrollSettings, month: string, lopDays: number, tds = 0): PayLine {
  const basic = p.basicPay;
  const da = p.consolidated ? 0 : r((basic * s.daPercent) / 100);
  const hra = p.consolidated ? 0 : r((basic * s.hraPercent) / 100);
  const allowances = p.allowances.reduce((n, a) => n + a.amount, 0);
  const gross = basic + da + hra + allowances;
  const days = daysIn(month);
  const lop = r(((basic + da) / days) * Math.min(lopDays, days));
  const pf = p.pf && !p.consolidated ? r(((basic + da) * s.pfPercent) / 100) : 0;
  const pt = gross - lop > 0 ? s.professionalTax : 0;
  const otherDeductions = p.deductions.reduce((n, d) => n + d.amount, 0);
  const totalDeductions = lop + pf + pt + tds + otherDeductions;
  return {
    ...person, basic, da, hra, allowances, gross, lopDays, lop, pf, pt, tds, otherDeductions, totalDeductions,
    net: Math.max(0, gross - totalDeductions), bank: p.bankName, accountLast4: p.accountLast4, ifsc: p.ifsc,
  };
}

/** Unpaid-leave days of one leave that fall inside a month. */
export function daysWithin(fromIso: string, toIso: string, month: string): number {
  const start = new Date(`${month}-01T00:00:00Z`).getTime();
  const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getTime();
  const a = Math.max(new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime(), start);
  const b = Math.min(new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime(), end);
  return b < a ? 0 : Math.round((b - a) / 86_400_000) + 1;
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const blankProfile = (id: string): HrProfile => ({ id, basicPay: 0, allowances: [], deductions: [], pf: true, status: 'active', serviceBook: [] });
