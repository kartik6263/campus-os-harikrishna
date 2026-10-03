// Admission & Counselling, Syllabus, Academic Records, Library data (demo data)

// ---- ADMISSION & COUNSELLING ----

export const ADMISSION_SESSION = {
  id: 'ADM/RDU/2024-25',
  name: 'Academic Session 2024–25',
  applicationOpen: '01-06-2024',
  applicationClose: '30-06-2024',
  meritListDate: '10-07-2024',
  round1Date: '15-07-2024',
  round2Date: '25-07-2024',
  round3Date: '05-08-2024',
  currentRound: 3 as 1 | 2 | 3,
  status: 'round3_open' as const,
};

export const SEAT_MATRIX = [
  { collegeCode: 'RDU-AC-002', collegeName: 'Govt. Model College, Demo City', programme: 'BCA', totalSeats: 60, general: 28, obc: 16, sc: 10, st: 4, ews: 2, filled: 58, vacant: 2 },
  { collegeCode: 'RDU-AC-002', collegeName: 'Govt. Model College, Demo City', programme: 'MCA', totalSeats: 30, general: 14, obc: 8, sc: 5, st: 2, ews: 1, filled: 30, vacant: 0 },
  { collegeCode: 'RDU-AC-003', collegeName: 'Govt. Girls College, Demo City', programme: 'BCA', totalSeats: 60, general: 28, obc: 16, sc: 10, st: 4, ews: 2, filled: 55, vacant: 5 },
  { collegeCode: 'RDU-AC-007', collegeName: 'Govt. Degree College, Northfield', programme: 'BCA', totalSeats: 40, general: 18, obc: 11, sc: 7, st: 3, ews: 1, filled: 38, vacant: 2 },
  { collegeCode: 'RDU-AC-012', collegeName: 'Saraswati College, Demo City', programme: 'BCA', totalSeats: 60, general: 28, obc: 16, sc: 10, st: 4, ews: 2, filled: 60, vacant: 0 },
];

export interface Applicant {
  id: string;
  name: string;
  dob: string;
  category: 'General' | 'OBC' | 'SC' | 'ST' | 'EWS';
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  email: string;
  programme: string;
  qualifyingExam: string;
  qualifyingMarks: number;
  qualifyingMaxMarks: number;
  qualifyingPercentage: number;
  domicile: 'MP' | 'Other';
  appliedOn: string;
  status: 'applied' | 'merit_listed' | 'allotted' | 'accepted' | 'enrolled' | 'withdrawn' | 'cancelled';
  allottedCollege?: string;
  allottedRound?: 1 | 2 | 3;
  documents: Record<string, boolean>;
  meritRank?: number;
}

export const APPLICANTS: Applicant[] = [
  { id: 'APP/2024/BCA/00001', name: 'Shivani Rajput', dob: '22-05-2006', category: 'OBC', gender: 'Female', mobile: '+91 98765 12345', email: 'shivani.rajput24@gmail.com', programme: 'BCA', qualifyingExam: '12th (State Board)', qualifyingMarks: 412, qualifyingMaxMarks: 500, qualifyingPercentage: 82.4, domicile: 'MP', appliedOn: '18-06-2024', status: 'enrolled', allottedCollege: 'Govt. Model College, Demo City', allottedRound: 1, meritRank: 12, documents: { marksheet12: true, tc: true, caste: true, domicile: true, aadhaar: true, photo: true } },
  { id: 'APP/2024/BCA/00002', name: 'Rahul Sharma', dob: '14-08-2006', category: 'General', gender: 'Male', mobile: '+91 94250 54321', email: 'rahul.s24@gmail.com', programme: 'BCA', qualifyingExam: '12th (State Board)', qualifyingMarks: 405, qualifyingMaxMarks: 500, qualifyingPercentage: 81.0, domicile: 'MP', appliedOn: '22-06-2024', status: 'enrolled', allottedCollege: 'Govt. Model College, Demo City', allottedRound: 1, meritRank: 18, documents: { marksheet12: true, tc: true, caste: false, domicile: true, aadhaar: true, photo: true } },
  { id: 'APP/2024/BCA/00003', name: 'Priti Jain', dob: '02-12-2005', category: 'General', gender: 'Female', mobile: '+91 76547 89012', email: 'pritij@gmail.com', programme: 'BCA', qualifyingExam: '12th (CBSE)', qualifyingMarks: 440, qualifyingMaxMarks: 500, qualifyingPercentage: 88.0, domicile: 'MP', appliedOn: '15-06-2024', status: 'accepted', allottedCollege: 'Govt. Girls College, Demo City', allottedRound: 2, meritRank: 5, documents: { marksheet12: true, tc: false, caste: false, domicile: true, aadhaar: true, photo: true } },
  { id: 'APP/2024/BCA/00004', name: 'Deepak Prajapati', dob: '30-03-2006', category: 'SC', gender: 'Male', mobile: '+91 90123 45678', email: 'deepakp@gmail.com', programme: 'BCA', qualifyingExam: '12th (State Board)', qualifyingMarks: 365, qualifyingMaxMarks: 500, qualifyingPercentage: 73.0, domicile: 'MP', appliedOn: '25-06-2024', status: 'allotted', allottedCollege: 'Govt. Model College, Demo City', allottedRound: 3, meritRank: 2, documents: { marksheet12: true, tc: true, caste: true, domicile: true, aadhaar: true, photo: true } },
  { id: 'APP/2024/BCA/00005', name: 'Sunita Verma', dob: '11-07-2006', category: 'OBC', gender: 'Female', mobile: '+91 94523 11111', email: 'sunitav@gmail.com', programme: 'BCA', qualifyingExam: '12th (State Board)', qualifyingMarks: 378, qualifyingMaxMarks: 500, qualifyingPercentage: 75.6, domicile: 'MP', appliedOn: '28-06-2024', status: 'withdrawn', meritRank: 31, documents: { marksheet12: true, tc: true, caste: true, domicile: false, aadhaar: true, photo: true } },
];

export const TIE_BREAK_RULES = [
  { priority: 1, rule: 'Higher qualifying exam percentage (×100 of total)' },
  { priority: 2, rule: 'Higher marks in Mathematics / relevant core subject' },
  { priority: 3, rule: 'Date of Birth — older candidate ranked higher' },
  { priority: 4, rule: 'Alphabetical order of first name' },
];

export const ALLOTMENT_ROUNDS = [
  { round: 1, date: '15-07-2024', applicants: 4820, allotted: 3240, accepted: 2891, surrendered: 349, status: 'complete' as const },
  { round: 2, date: '25-07-2024', applicants: 1229, allotted: 896, accepted: 801, surrendered: 95, status: 'complete' as const },
  { round: 3, date: '05-08-2024', applicants: 423, allotted: 312, accepted: 0, surrendered: 0, status: 'accepting' as const },
];

// ---- SYLLABUS & CURRICULUM ----

export interface Programme {
  code: string;
  name: string;
  type: 'UG' | 'PG';
  semesters: number;
  totalCredits: number;
  bosChairman: string;
  lastRevision: string;
  nextRevisionDue: string;
  status: 'published' | 'under_revision' | 'pending_bos' | 'pending_vc';
}

export const PROGRAMMES_CURRICULUM: Programme[] = [
  { code: 'BCA', name: 'Bachelor of Computer Applications', type: 'UG', semesters: 6, totalCredits: 132, bosChairman: 'Prof. M.L. Gupta', lastRevision: '2023', nextRevisionDue: '2026', status: 'published' },
  { code: 'MCA', name: 'Master of Computer Applications', type: 'PG', semesters: 4, totalCredits: 96, bosChairman: 'Prof. A.K. Sharma', lastRevision: '2022', nextRevisionDue: '2025', status: 'under_revision' },
  { code: 'BSCCS', name: 'B.Sc. Computer Science', type: 'UG', semesters: 6, totalCredits: 120, bosChairman: 'Dr. S.R. Tripathi', lastRevision: '2023', nextRevisionDue: '2026', status: 'published' },
  { code: 'BCOM', name: 'B.Com. (General)', type: 'UG', semesters: 6, totalCredits: 120, bosChairman: 'Prof. P.K. Jain', lastRevision: '2021', nextRevisionDue: '2024', status: 'pending_bos' },
];

export const BOS_MEETINGS = [
  { id: 'BOS/BCA/2023/02', programme: 'BCA', date: '22-09-2023', quorum: 7, total: 9, resolutions: 8, status: 'approved' as const, minutesId: 'MIN/BCA/2023/02', vcApproved: true, vcApprovedOn: '15-10-2023' },
  { id: 'BOS/MCA/2024/01', programme: 'MCA', date: '14-08-2024', quorum: 6, total: 9, resolutions: 5, status: 'pending_vc' as const, minutesId: 'MIN/MCA/2024/01', vcApproved: false },
  { id: 'BOS/BCOM/2024/01', programme: 'B.Com.', date: '25-09-2024', quorum: 0, total: 9, resolutions: 0, status: 'scheduled' as const, minutesId: undefined, vcApproved: false },
];

// ---- ACADEMIC RECORDS ----

export interface RecordRequest {
  id: string;
  type: 'transcript' | 'migration' | 'tc' | 'name_correction' | 'dob_correction' | 'duplicate_marksheet';
  typeLabel: string;
  studentId: string;
  studentName: string;
  programme: string;
  passedYear?: string;
  requestedOn: string;
  fee: number;
  feePaid: boolean;
  status: 'pending' | 'under_process' | 'ready' | 'dispatched' | 'rejected';
  priority: 'normal' | 'urgent';
  purpose?: string;
  correctionDetails?: { field: string; oldValue: string; newValue: string; evidence: string[] };
  trail: Array<{ actor: string; action: string; date: string; note?: string }>;
  slaDeadline: string;
}

export const RECORD_REQUESTS: RecordRequest[] = [
  {
    id: 'REC/2024/TRS/0441', type: 'transcript', typeLabel: 'Official Transcript',
    studentId: 'RDU/2021/BCA/0342', studentName: 'Priya Sharma', programme: 'BCA', passedYear: '2024',
    requestedOn: '05-09-2024', fee: 500, feePaid: true, status: 'under_process', priority: 'normal',
    purpose: 'University application abroad (Canada)',
    slaDeadline: '25-09-2024',
    trail: [
      { actor: 'Student Portal', action: 'Request submitted', date: '05-09-2024' },
      { actor: 'Exam Section', action: 'Fee verified — processing started', date: '07-09-2024' },
      { actor: 'Result Compiler', action: 'Marks data compiled (Sem I–IV)', date: '12-09-2024' },
    ],
  },
  {
    id: 'REC/2024/NAM/0117', type: 'name_correction', typeLabel: 'Name Correction',
    studentId: 'RDU/2022/BCA/0119', studentName: 'Naresh Kumar Jatav', programme: 'BCA',
    requestedOn: '10-08-2024', fee: 200, feePaid: true, status: 'under_process', priority: 'normal',
    slaDeadline: '30-08-2024',
    correctionDetails: {
      field: 'Student Name',
      oldValue: 'Naresh Jatav',
      newValue: 'Naresh Kumar Jatav',
      evidence: ['Aadhaar Card', '10th Marksheet', 'Affidavit on stamp paper'],
    },
    trail: [
      { actor: 'Student Portal', action: 'Request submitted with affidavit', date: '10-08-2024' },
      { actor: 'College Office', action: 'Documents verified — forwarded to University', date: '14-08-2024' },
      { actor: 'University Records', action: 'Under legal scrutiny', date: '20-08-2024', note: 'Affidavit authenticity check pending' },
    ],
  },
];

// ---- LIBRARY ADMIN ----

export const LIBRARY_STATS = {
  totalTitles: 42180,
  totalVolumes: 89340,
  issuedToday: 48,
  returnedToday: 31,
  overdueBooks: 234,
  pendingFines: 18720,
  eResourcesActive: 7,
  pendingAcquisitions: 23,
  newArrivalsThisMonth: 87,
};

export const ACQUISITION_LIST = [
  { id: 'ACQ/2024/001', title: 'Artificial Intelligence: A Modern Approach (4th Ed.)', author: 'Russell & Norvig', publisher: 'Pearson', isbn: '978-0134610993', copies: 5, estimatedCost: 12500, status: 'ordered' as const, orderedOn: '15-09-2024', supplier: 'Academic Publishers India' },
  { id: 'ACQ/2024/002', title: 'Database System Concepts (7th Ed.)', author: 'Silberschatz et al.', publisher: 'McGraw Hill', isbn: '978-0078022159', copies: 8, estimatedCost: 9600, status: 'pending_approval' as const, requestedBy: 'Prof. Sunita Yadav (CS Dept.)' },
  { id: 'ACQ/2024/003', title: 'Operating System Concepts (10th Ed.)', author: 'Silberschatz, Galvin', publisher: 'Wiley', isbn: '978-1119800361', copies: 6, estimatedCost: 14400, status: 'received' as const, receivedOn: '10-09-2024' },
];

export const COLLEGE_LIBRARY_VIEW = [
  { collegeCode: 'RDU-AC-002', collegeName: 'Govt. Model College, Demo City', totalTitles: 12400, totalVolumes: 28000, overdueBooks: 34, pendingFines: 2840, lastAudit: '15-03-2024', status: 'active' as const },
  { collegeCode: 'RDU-AC-003', collegeName: 'Govt. Girls College, Demo City', totalTitles: 9800, totalVolumes: 22000, overdueBooks: 21, pendingFines: 1920, lastAudit: '22-03-2024', status: 'active' as const },
  { collegeCode: 'RDU-AC-007', collegeName: 'Govt. Degree College, Northfield', totalTitles: 4200, totalVolumes: 9100, overdueBooks: 12, pendingFines: 840, lastAudit: '01-04-2024', status: 'active' as const },
  { collegeCode: 'RDU-AC-023', collegeName: 'Maharishi Dayanand College, Eastwood', totalTitles: 3100, totalVolumes: 6800, overdueBooks: 8, pendingFines: 560, lastAudit: '10-11-2023', status: 'audit_due' as const },
];
