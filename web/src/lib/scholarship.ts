/**
 * Scholarships, shared by the student's Scholarship screen and the
 * university scholarship desk (Academic Operations).
 *
 * - `campus:scholarship-schemes`        schemes; everyone reads, staff keep them.
 * - `student:scholarship-applications`  what a student applies with: the scheme,
 *                                       declared income, bank details. Theirs.
 * - `desk:scholarship-decisions`        the desk's verdict on each application,
 *                                       keyed by the application id. The student
 *                                       reads it but cannot write it, so no one
 *                                       can mark their own application sanctioned.
 *
 * Supporting documents are uploaded files under `student:scholarship/<appId>`;
 * only the student, their parent and staff can open them.
 */

export interface SchemeRules {
  minCgpa?: number;
  minAttendance?: number;
  /** Annual family income ceiling, in rupees. */
  incomeCap?: number;
  /** Categories the scheme is limited to; empty means all. */
  categories?: string[];
}

export interface Scheme {
  id: string;
  name: string;
  provider: string;
  funding: 'Central' | 'State' | 'Institution' | 'Private';
  amount: number;
  perYear: boolean;
  description: string;
  rules: SchemeRules;
  docs: string[];
  windowOpen: boolean;
  closesOn?: string;
  /** The external portal the desk forwards verified applications to, if any. */
  portal?: string;
}

export interface Application {
  id: string;
  schemeId: string;
  schemeName: string;
  amount: number;
  academicYear: string;
  appliedAt: string;
  familyIncome: number;
  category: string;
  bankName: string;
  accountLast4: string;
  ifsc: string;
  withdrawn?: boolean;
  /** Set when the student answers a "returned for correction". */
  resubmittedAt?: string;
}

export type DecisionStatus = 'verified' | 'returned' | 'rejected' | 'dispatched' | 'sanctioned' | 'disbursed' | 'failed';

export interface Decision {
  /** The application's id. */
  id: string;
  status: DecisionStatus;
  at: string;
  by: string;
  note?: string;
  portalRef?: string;
  amountSanctioned?: number;
  utr?: string;
  disbursedOn?: string;
  history: Array<{ status: DecisionStatus; at: string; by: string; note?: string }>;
}

export type EffectiveStatus = 'submitted' | 'withdrawn' | DecisionStatus;

/** Where an application stands, from the student's record and the desk's. */
export function statusOf(app: Application, decision?: Decision | null): EffectiveStatus {
  if (app.withdrawn) return 'withdrawn';
  if (!decision) return 'submitted';
  // A correction answered after the desk returned it is back in the queue.
  if (decision.status === 'returned' && app.resubmittedAt && app.resubmittedAt > decision.at) return 'submitted';
  return decision.status;
}

export const STATUS_TEXT: Record<EffectiveStatus, string> = {
  submitted: 'Submitted — awaiting verification',
  withdrawn: 'Withdrawn',
  verified: 'Verified by the institution',
  returned: 'Returned for correction',
  rejected: 'Rejected',
  dispatched: 'Forwarded to the scheme portal',
  sanctioned: 'Sanctioned',
  disbursed: 'Disbursed to your bank account',
  failed: 'Payment failed — check bank details',
};

export const STATUS_TONE: Record<EffectiveStatus, string> = {
  submitted: 'bg-[#FEF9EC] text-[#8A6D1F]',
  withdrawn: 'bg-[#F1F5F9] text-[#5A6577]',
  verified: 'bg-[#EFF6FF] text-[#1D4ED8]',
  returned: 'bg-[#FEF3DC] text-[#9A5B00]',
  rejected: 'bg-[#FEE2E2] text-[#A8242C]',
  dispatched: 'bg-[#F5F3FF] text-[#6D28D9]',
  sanctioned: 'bg-[#D1FAE5] text-[#0E7A5F]',
  disbursed: 'bg-[#D1FAE5] text-[#0E7A5F]',
  failed: 'bg-[#FEE2E2] text-[#A8242C]',
};

export const ACTIVE: EffectiveStatus[] = ['submitted', 'verified', 'returned', 'dispatched', 'sanctioned'];

export interface Facts { cgpa?: number; attendance?: number; category?: string | null; income?: number }

/** Each rule of a scheme against a student's facts. `met` is null when a fact is not known yet. */
export function checkRules(rules: SchemeRules, f: Facts): Array<{ label: string; required: string; yours: string; met: boolean | null }> {
  const out: Array<{ label: string; required: string; yours: string; met: boolean | null }> = [];
  if (rules.minCgpa != null) out.push({ label: 'CGPA', required: `≥ ${rules.minCgpa}`, yours: f.cgpa != null ? f.cgpa.toFixed(2) : 'Not yet available', met: f.cgpa != null ? f.cgpa >= rules.minCgpa : null });
  if (rules.minAttendance != null) out.push({ label: 'Attendance', required: `≥ ${rules.minAttendance}%`, yours: f.attendance != null ? `${f.attendance.toFixed(1)}%` : '—', met: f.attendance != null ? f.attendance >= rules.minAttendance : null });
  if (rules.categories?.length) out.push({ label: 'Category', required: rules.categories.join(' / '), yours: f.category ?? 'Not on record', met: f.category ? rules.categories.map(c => c.toUpperCase()).includes(f.category.toUpperCase()) : null });
  if (rules.incomeCap != null) out.push({ label: 'Family income', required: `< ₹${rules.incomeCap.toLocaleString('en-IN')} / yr`, yours: f.income != null ? `₹${f.income.toLocaleString('en-IN')}` : 'You declare this when applying', met: f.income != null ? f.income < rules.incomeCap : null });
  return out;
}

export const academicYearNow = () => {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// ─── Samples, used only on the demo deployment ───────────────────────────────

export const SAMPLE_SCHEMES: Scheme[] = [
  {
    id: 'SCH-NSP-CSS', name: 'Central Sector Scheme of Scholarship', provider: 'Ministry of Education, Govt. of India', funding: 'Central',
    amount: 12000, perYear: true, description: 'For meritorious students from families with modest incomes, pursuing regular degree courses.',
    rules: { minCgpa: 6, incomeCap: 450000 }, docs: ['Income certificate', 'Previous year marksheet', 'Bank passbook (first page)'],
    windowOpen: true, closesOn: '2024-10-31', portal: 'National Scholarship Portal',
  },
  {
    id: 'SCH-STATE-PM', name: 'Post-Matric Scholarship (SC/ST/OBC)', provider: 'State Department of Social Justice', funding: 'State',
    amount: 6000, perYear: true, description: 'Tuition and maintenance support for reserved-category students after Class 10.',
    rules: { categories: ['SC', 'ST', 'OBC'], incomeCap: 250000, minAttendance: 75 }, docs: ['Caste certificate', 'Income certificate', 'Domicile certificate', 'Bank passbook (first page)'],
    windowOpen: true, closesOn: '2024-11-15', portal: 'State Scholarship Portal',
  },
  {
    id: 'SCH-INST-MERIT', name: 'Institution Merit Scholarship', provider: 'The institution', funding: 'Institution',
    amount: 5000, perYear: false, description: 'A one-time award for the top performers of each programme.',
    rules: { minCgpa: 7.5, minAttendance: 75 }, docs: ['Previous semester marksheet'],
    windowOpen: false,
  },
];
