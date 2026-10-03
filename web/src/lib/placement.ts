/**
 * Placements and internships, shared by the student's Placement screen and
 * the training & placement cell (Governance).
 *
 * - `campus:placement-drives`        drives; everyone reads, staff run them.
 * - `acad:placement-companies`       the recruiters the cell has empanelled.
 * - `student:placement-applications` a student's application to a drive, and
 *                                    their answer to an offer. Theirs.
 * - `desk:placement-outcomes`        the cell's verdict on each application
 *                                    (shortlist, interview, offer…), keyed by
 *                                    the application id; read-only to students.
 *
 * Résumés are uploaded files under `student:placement/<studentId>`.
 */

export interface Drive {
  id: string;
  company: string;
  role: string;
  kind: 'placement' | 'internship';
  /** Annual CTC in lakh, or monthly stipend in rupees for internships. */
  package: number;
  location: string;
  description: string;
  minCgpa?: number;
  /** Programme short names (BCA, MCA…); empty means all. */
  programmes: string[];
  deadline: string;
  driveDate?: string;
  rounds: string[];
  status: 'open' | 'closed' | 'completed' | 'cancelled';
}

export interface Company {
  id: string; name: string; sector: string; contactName: string; email: string; phone: string;
  status: 'pending' | 'empanelled' | 'blacklisted'; notes?: string; since: string;
}

export interface PlacementApp {
  /** The drive id: one application per drive per student. */
  id: string;
  driveId: string;
  company: string;
  role: string;
  kind: Drive['kind'];
  appliedAt: string;
  withdrawn?: boolean;
  offerResponse?: 'accepted' | 'declined';
  respondedAt?: string;
}

export type OutcomeStatus = 'shortlisted' | 'interview' | 'rejected' | 'offer';

export interface Outcome {
  id: string;
  status: OutcomeStatus;
  round?: string;
  package?: number;
  joiningDate?: string;
  note?: string;
  at: string;
  by: string;
  history: Array<{ status: OutcomeStatus; at: string; by: string; note?: string; round?: string }>;
}

export type AppStatus = 'applied' | 'withdrawn' | OutcomeStatus | 'accepted' | 'declined';

export function statusOf(app: PlacementApp, o?: Outcome | null): AppStatus {
  if (app.withdrawn) return 'withdrawn';
  if (o?.status === 'offer' && app.offerResponse) return app.offerResponse;
  return o?.status ?? 'applied';
}

export const STATUS_LABEL: Record<AppStatus, string> = {
  applied: 'Applied', withdrawn: 'Withdrawn', shortlisted: 'Shortlisted', interview: 'In interviews',
  rejected: 'Not selected', offer: 'Offer made', accepted: 'Offer accepted', declined: 'Offer declined',
};
export const STATUS_TONE: Record<AppStatus, string> = {
  applied: 'bg-[#EFF6FF] text-[#1D4ED8]', withdrawn: 'bg-[#F1F5F9] text-[#5A6577]', shortlisted: 'bg-[#F5F3FF] text-[#6D28D9]',
  interview: 'bg-[#FEF9EC] text-[#8A6D1F]', rejected: 'bg-[#FEE2E2] text-[#A8242C]', offer: 'bg-[#D1FAE5] text-[#0E7A5F]',
  accepted: 'bg-[#D1FAE5] text-[#0E7A5F]', declined: 'bg-[#F1F5F9] text-[#5A6577]',
};

export const pkg = (d: { kind: Drive['kind']; package: number }) => (d.kind === 'internship' ? `₹${d.package.toLocaleString('en-IN')}/month` : `₹${d.package} LPA`);

/** Why a student may not apply to a drive, or null if they may. */
export function eligibility(d: Drive, f: { cgpa?: number; programme?: string }): string | null {
  if (d.minCgpa != null && f.cgpa != null && f.cgpa < d.minCgpa) return `Needs CGPA ${d.minCgpa}`;
  if (d.programmes.length && f.programme && !d.programmes.map(p => p.toUpperCase()).includes(f.programme.toUpperCase())) return `Open to ${d.programmes.join(', ')}`;
  return null;
}

export const SAMPLE_DRIVES: Drive[] = [
  { id: 'DRV-TCS-24', company: 'Tata Consultancy Services', role: 'Assistant System Engineer', kind: 'placement', package: 3.6, location: 'Pune / Bengaluru', description: 'Mass recruitment for graduates in computing. Online test, technical and HR interviews.', minCgpa: 6, programmes: ['BCA', 'MCA', 'B.Sc. CS'], deadline: '2024-10-05', driveDate: '2024-10-12', rounds: ['Online test', 'Technical interview', 'HR interview'], status: 'open' },
  { id: 'DRV-INFY-24', company: 'Infosys', role: 'Systems Engineer', kind: 'placement', package: 3.6, location: 'Mysuru', description: 'Hiring through InfyTQ-style aptitude test followed by interviews.', minCgpa: 6.5, programmes: [], deadline: '2024-10-15', rounds: ['Aptitude test', 'Interview'], status: 'open' },
  { id: 'DRV-ZOHO-INT', company: 'Zoho Corporation', role: 'Software Intern', kind: 'internship', package: 15000, location: 'Chennai', description: 'Six-month internship with a pre-placement offer for strong performers.', minCgpa: 7.5, programmes: ['BCA', 'MCA'], deadline: '2024-10-20', rounds: ['Coding test', 'Technical interview'], status: 'open' },
];
