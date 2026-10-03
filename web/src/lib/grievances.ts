/**
 * Grievances, shared by the student who raises one and the grievance cell
 * that resolves it — one register (`student:grievance`), so a complaint filed
 * on the phone is the same row the cell works and the student watches move.
 *
 * The levels follow the UGC (Redressal of Grievances of Students)
 * Regulations, 2023: the college's grievance officer first, then the
 * Students' Grievance Redressal Committee, then the Ombudsperson.
 */
import type { StoredFileInfo } from './records';

export type GrievanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';
export type GrievanceLevel = 'College grievance officer' | 'Grievance Redressal Committee' | 'Ombudsperson';

export interface TrailEntry { actor: string; action: string; date: string; note?: string }

export interface GrievanceDoc {
  id: string;
  category: string;
  subject: string;
  description: string;
  raisedOn: string;
  status: GrievanceStatus;
  slaDeadline: string;
  trail: TrailEntry[];
  comments?: Array<{ by: string; role: 'student' | 'staff'; at: string; text: string }>;
  attachments?: StoredFileInfo[];
  level?: GrievanceLevel;
  assignedTo?: string;
  priority?: 'normal' | 'high' | 'critical';
  resolution?: string;
  resolvedOn?: string;
  rating?: number;
  /** For grievances filed on someone's behalf (or sample rows): who raised it. */
  raisedByName?: string;
  raisedById?: string;
  college?: string;
  /** Staff-only: never sent to the student (the server strips internal… fields). */
  internalNotes?: Array<{ by: string; note: string; at: string }>;
}

export const GRIEVANCE_CATEGORIES = [
  'Examination', 'Fees & Finance', 'Attendance', 'Scholarship',
  'Hostel', 'Transport', 'Faculty Conduct', 'Infrastructure', 'Academic', 'Ragging / Harassment', 'Other',
];

/** Working days allowed before a grievance is overdue, by level. */
export const SLA_DAYS: Record<GrievanceLevel, number> = {
  'College grievance officer': 7,
  'Grievance Redressal Committee': 15,
  Ombudsperson: 30,
};

export const NEXT_LEVEL: Record<GrievanceLevel, GrievanceLevel | null> = {
  'College grievance officer': 'Grievance Redressal Committee',
  'Grievance Redressal Committee': 'Ombudsperson',
  Ombudsperson: null,
};

const pad = (n: number) => String(n).padStart(2, '0');
export const dmy = (d = new Date()) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
export const parseDmy = (s: string) => { const [d, m, y] = s.split('-').map(Number); return new Date(y!, m! - 1, d!); };
export const addDays = (days: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); return d; };
export const daysUntil = (s: string) => Math.ceil((parseDmy(s).getTime() - Date.now()) / 86_400_000);
export const daysSince = (s: string) => Math.floor((Date.now() - parseDmy(s).getTime()) / 86_400_000);

export const grievanceNumber = () => `GRV/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;

export function pillFor(status: GrievanceStatus): 'pending' | 'approved' | 'rejected' | 'under-review' {
  if (status === 'resolved' || status === 'closed') return 'approved';
  if (status === 'escalated') return 'rejected';
  if (status === 'in_progress') return 'under-review';
  return 'pending';
}
