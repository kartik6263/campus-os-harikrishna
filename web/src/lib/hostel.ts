/**
 * Hostel registers shared by the student, the warden and the parent:
 *
 *   student:hostel            the student's allotment and mess account (one document)
 *   student:hostel-requests   leave and gate-pass requests — the parent consents,
 *                             the warden decides, the student watches
 *   student:hostel-complaints maintenance and other complaints
 *   campus:mess-menu          the week's menu, kept by the hostel office
 */
export interface Allotment {
  id: 'doc';
  block: string;
  room: string;
  type: string;
  roommates: string[];
  allotmentDate: string;
  validTill: string;
  messBalance: number;
  messBill: number;
  messMonth?: string;
  payments?: Array<{ ref: string; amount: number; mode: string; at: string }>;
}

export type RequestStatus = 'awaiting_parent' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'returned';

export interface HostelRequest {
  id: string;
  kind: 'leave' | 'gatepass';
  /** Leave: dates (yyyy-mm-dd). Gate pass: the day, and times. */
  from: string;
  to?: string;
  outTime?: string;
  returnTime?: string;
  reason: string;
  status: RequestStatus;
  appliedAt: string;
  parentConsent?: 'pending' | 'given' | 'refused';
  parentNote?: string;
  wardenNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  returnedAt?: string;
}

export interface HostelComplaint {
  id: string;
  category: string;
  description: string;
  raisedOn: string;
  status: 'open' | 'in_progress' | 'resolved';
  response?: string;
  priority?: 'normal' | 'critical';
}

export type MessMenu = Record<string, { breakfast: string; lunch: string; dinner: string }> & { id?: string };

/** The demo's sample request, the same whichever portal opens the register first. */
export const DEMO_REQUESTS: HostelRequest[] = [
  { id: 'LV/2024/004812', kind: 'leave', from: '2024-09-21', to: '2024-09-23', reason: 'Family function at home', status: 'awaiting_parent', appliedAt: '2024-09-18T10:30:00.000Z', parentConsent: 'pending' },
];

export const REQUEST_LABEL: Record<RequestStatus, string> = {
  awaiting_parent: 'Awaiting parent',
  pending: 'With warden',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const requestPill = (s: RequestStatus): 'pending' | 'approved' | 'rejected' | 'under-review' | 'draft' =>
  s === 'approved' || s === 'returned' ? 'approved' : s === 'rejected' ? 'rejected' : s === 'cancelled' ? 'draft' : s === 'pending' ? 'under-review' : 'pending';

export const refNo = (prefix: string) => `${prefix}/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
