// University Examination Back Office data (demo data)

export const CURRENT_SESSION = {
  id: 'SES/RDU/2024/ODD',
  name: 'Nov–Dec 2024 (Odd Semester)',
  academicYear: '2024–25',
  formWindowOpen: '01-09-2024',
  formWindowClose: '30-09-2024',
  lateWindowClose: '15-10-2024',
  examStartDate: '04-11-2024',
  examEndDate: '28-11-2024',
  resultTarget: '31-01-2025',
  status: 'form_window_open' as const,
  regularFee: 1800,
  lateFee: 500,
  backlogFee: 300,
};

export const EXAM_SESSIONS = [
  CURRENT_SESSION,
  { id: 'SES/RDU/2024/EVEN', name: 'Apr–May 2024 (Even Semester)', status: 'result_published' as const, academicYear: '2023–24' },
  { id: 'SES/RDU/2023/ODD', name: 'Nov–Dec 2023 (Odd Semester)', status: 'result_published' as const, academicYear: '2023–24' },
];

export const PROGRAMMES = [
  { code: 'BCA', name: 'Bachelor of Computer Applications', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'MCA', name: 'Master of Computer Applications', semesters: 4, duration: '2 years', type: 'PG' },
  { code: 'BSCCS', name: 'B.Sc. Computer Science', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'MSCCS', name: 'M.Sc. Computer Science', semesters: 4, duration: '2 years', type: 'PG' },
  { code: 'BCOM', name: 'B.Com. (General)', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'MCOM', name: 'M.Com.', semesters: 4, duration: '2 years', type: 'PG' },
  { code: 'BA', name: 'B.A. (General)', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'MA', name: 'M.A. (General)', semesters: 4, duration: '2 years', type: 'PG' },
  { code: 'BSC', name: 'B.Sc. (General)', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'MBA', name: 'M.B.A.', semesters: 4, duration: '2 years', type: 'PG' },
  { code: 'LLB', name: 'L.L.B.', semesters: 6, duration: '3 years', type: 'UG' },
  { code: 'BPHARM', name: 'B.Pharma.', semesters: 8, duration: '4 years', type: 'UG' },
];

export const EXAM_CENTRES = [
  { code: 'DC-01', name: 'Govt. Girls College', city: 'Demo City', district: 'Demo City', capacity: 1200, assigned: 1180, pincode: '100001' },
  { code: 'DC-02', name: 'Govt. Science College', city: 'Demo City', district: 'Demo City', capacity: 1000, assigned: 980, pincode: '100002' },
  { code: 'DC-03', name: 'Govt. Commerce College', city: 'Demo City', district: 'Demo City', capacity: 800, assigned: 820, pincode: '100001' },
  { code: 'DC-04', name: 'Govt. Model College', city: 'Demo City', district: 'Demo City', capacity: 900, assigned: 870, pincode: '100011' },
  { code: 'MRN-01', name: 'Govt. Degree College, Northfield', city: 'Northfield', district: 'Northfield', capacity: 600, assigned: 540, pincode: '476001' },
  { code: 'BHD-01', name: 'Govt. Degree College, Eastwood', city: 'Eastwood', district: 'Eastwood', capacity: 500, assigned: 480, pincode: '477001' },
  { code: 'SVP-01', name: 'Govt. Degree College, Westfield', city: 'Westfield', district: 'Westfield', capacity: 450, assigned: 390, pincode: '473551' },
  { code: 'DTA-01', name: 'Govt. Degree College, Southgate', city: 'Southgate', district: 'Southgate', capacity: 400, assigned: 360, pincode: '475661' },
  { code: 'GNA-01', name: 'Govt. Degree College, Guna', city: 'Guna', district: 'Guna', capacity: 350, assigned: 310, pincode: '473001' },
];

// College–Centre mapping (sample)
export const COLLEGE_CENTRE_MAP: Record<string, string> = {
  'RDU-AC-001': 'DC-01',
  'RDU-AC-002': 'DC-04',
  'RDU-AC-003': 'DC-02',
  'RDU-AC-004': 'DC-03',
  'RDU-AC-005': 'MRN-01',
  'RDU-AC-006': 'BHD-01',
};

export interface EligibilityCheck {
  studentId: string;
  studentName: string;
  rollNo: string;
  programme: string;
  college: string;
  semester: number;
  eligible: boolean;
  overridden?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  overrideOn?: string;
  rules: EligibilityRule[];
}

export interface EligibilityRule {
  rule: string;
  required: string;
  actual: string;
  passed: boolean;
  detail?: string;
}

export const ELIGIBILITY_CHECKS: EligibilityCheck[] = [
  {
    studentId: 'RDU/2021/BCA/0342', studentName: 'Priya Sharma', rollNo: '0342',
    programme: 'BCA', college: 'Model College, Demo City', semester: 5,
    eligible: true,
    rules: [
      { rule: 'Minimum Attendance', required: '75%', actual: '74.8%', passed: true, detail: 'Grace of 1% applied (medical leave)' },
      { rule: 'Semester Fee Cleared', required: 'Paid', actual: 'Paid (₹10,800 on 18-Jul-2024)', passed: true },
      { rule: 'No Active Registration Hold', required: 'None', actual: 'None', passed: true },
      { rule: 'Exam Form Submitted', required: 'Yes', actual: 'Submitted (EF/2024/V/0342)', passed: true },
      { rule: 'Exam Fee Paid', required: '₹1,800', actual: '₹1,800 paid on 18-Sep-2024', passed: true },
      { rule: 'No Pending Backlog (>2)', required: 'Backlogs ≤ 2', actual: '0 backlogs', passed: true },
    ],
  },
  {
    studentId: 'RDU/2021/BCA/0357', studentName: 'Ravi Chouhan', rollNo: '0357',
    programme: 'BCA', college: 'Model College, Demo City', semester: 5,
    eligible: false,
    rules: [
      { rule: 'Minimum Attendance', required: '75%', actual: '48%', passed: false, detail: 'Shortfall: 27% — needs 63 more classes' },
      { rule: 'Semester Fee Cleared', required: 'Paid', actual: 'Paid', passed: true },
      { rule: 'No Active Registration Hold', required: 'None', actual: 'None', passed: true },
      { rule: 'Exam Form Submitted', required: 'Yes', actual: 'Submitted', passed: true },
      { rule: 'Exam Fee Paid', required: '₹1,800', actual: 'Paid', passed: true },
      { rule: 'No Pending Backlog (>2)', required: 'Backlogs ≤ 2', actual: '3 backlogs', passed: false, detail: 'BCA301, BCA302, BCA303 pending clearance' },
    ],
  },
  {
    studentId: 'RDU/2021/BCA/0349', studentName: 'Vikram Tiwari', rollNo: '0349',
    programme: 'BCA', college: 'Model College, Demo City', semester: 5,
    eligible: false,
    rules: [
      { rule: 'Minimum Attendance', required: '75%', actual: '65%', passed: false, detail: 'Shortfall: 10%' },
      { rule: 'Semester Fee Cleared', required: 'Paid', actual: 'Unpaid — ₹1,800 exam fee pending', passed: false },
      { rule: 'No Active Registration Hold', required: 'None', actual: 'None', passed: true },
      { rule: 'Exam Form Submitted', required: 'Yes', actual: 'Submitted', passed: true },
      { rule: 'Exam Fee Paid', required: '₹1,800', actual: 'Unpaid', passed: false },
      { rule: 'No Pending Backlog (>2)', required: 'Backlogs ≤ 2', actual: '1 backlog', passed: true },
    ],
  },
];

// University-level college scrutiny stats (520 colleges)
export const COLLEGE_SCRUTINY_STATS = {
  totalColleges: 520,
  formsReceivedColleges: 498,
  clearingColleges: 442,
  pendingColleges: 56,
  totalFormsSubmitted: 187420,
  totalEligible: 171834,
  totalIneligible: 12891,
  totalOverridden: 2695,
};

export const COLLEGE_SCRUTINY_SAMPLE = [
  { code: 'RDU-AC-002', name: 'Govt. Model College, Demo City', district: 'Demo City', programme: 'BCA', semester: 5, total: 42, eligible: 38, ineligible: 3, overridden: 1, status: 'cleared' as const },
  { code: 'RDU-AC-007', name: 'Govt. Degree College, Northfield', district: 'Northfield', programme: 'BCA', semester: 5, total: 36, eligible: 31, ineligible: 5, overridden: 0, status: 'pending' as const },
  { code: 'RDU-AC-012', name: 'Saraswati College, Demo City', district: 'Demo City', programme: 'BCA', semester: 5, total: 58, eligible: 52, ineligible: 4, overridden: 2, status: 'cleared' as const },
  { code: 'RDU-AC-023', name: 'Maharishi Dayanand College, Eastwood', district: 'Eastwood', programme: 'BCA', semester: 5, total: 24, eligible: 22, ineligible: 2, overridden: 0, status: 'pending' as const },
  { code: 'RDU-AC-031', name: 'Rani Durgavati PG College, Westfield', district: 'Westfield', programme: 'BCA', semester: 5, total: 19, eligible: 17, ineligible: 2, overridden: 0, status: 'cleared' as const },
];

export interface MarksEntry {
  subjectCode: string;
  subjectName: string;
  examDate: string;
  maxExternal: number;
  maxInternal: number;
  bundles: BundleEntry[];
}

export interface BundleEntry {
  bundleId: string;
  centreCode: string;
  examinerName: string;
  examinerType: 'E1' | 'E2' | 'moderator';
  students: StudentMark[];
  status: 'unassigned' | 'received' | 'under_eval' | 'submitted' | 'double_val' | 'moderated';
}

export interface StudentMark {
  studentId: string;
  rollNo: string;
  name: string;
  E1?: number;
  E2?: number;
  moderatorMark?: number;
  finalMark?: number;
  flagged: boolean;
  flagReason?: string;
}

export const MARKS_FOIL: MarksEntry[] = [
  {
    subjectCode: 'BCA501',
    subjectName: 'Software Engineering',
    examDate: '04-11-2024',
    maxExternal: 70,
    maxInternal: 30,
    bundles: [
      {
        bundleId: 'BDL/GWL04/BCA501/001',
        centreCode: 'DC-04',
        examinerName: 'Dr. S.K. Pandey',
        examinerType: 'E1',
        status: 'submitted',
        students: [
          { studentId: 'RDU/2021/BCA/0342', rollNo: '0342', name: 'Priya Sharma', E1: 52, flagged: false },
          { studentId: 'RDU/2021/BCA/0343', rollNo: '0343', name: 'Rahul Verma', E1: 38, flagged: false },
          { studentId: 'RDU/2021/BCA/0344', rollNo: '0344', name: 'Anjali Patel', E1: 64, flagged: false },
          { studentId: 'RDU/2021/BCA/0345', rollNo: '0345', name: 'Deepak Singh', E1: 28, flagged: false },
        ],
      },
    ],
  },
];

export interface ResultData {
  studentId: string;
  rollNo: string;
  name: string;
  programme: string;
  semester: number;
  college: string;
  subjects: ResultSubject[];
  sgpa: number;
  cgpa: number;
  result: 'Pass' | 'Fail' | 'Compartment' | 'Withheld';
  graceApplied: boolean;
  graceMarks?: number;
  divisionProvisional: 'Distinction' | 'First Class' | 'Second Class' | 'Pass' | 'Fail';
}

export interface ResultSubject {
  code: string;
  name: string;
  internal: number;
  external: number;
  total: number;
  maxTotal: number;
  grade: string;
  graceGiven?: number;
  status: 'pass' | 'fail' | 'compartment';
}

export const PROVISIONAL_RESULTS: ResultData[] = [
  {
    studentId: 'RDU/2021/BCA/0342', rollNo: '0342', name: 'Priya Sharma',
    programme: 'BCA', semester: 5, college: 'Model College, Demo City',
    subjects: [
      { code: 'BCA501', name: 'Software Engineering', internal: 24, external: 52, total: 76, maxTotal: 100, grade: 'B+', status: 'pass' },
      { code: 'BCA502', name: 'Database Management', internal: 22, external: 48, total: 70, maxTotal: 100, grade: 'B', status: 'pass' },
      { code: 'BCA503', name: 'Computer Networks', internal: 20, external: 44, total: 64, maxTotal: 100, grade: 'B', status: 'pass' },
      { code: 'BCA504', name: 'Operating Systems', internal: 25, external: 55, total: 80, maxTotal: 100, grade: 'A', status: 'pass' },
    ],
    sgpa: 7.8, cgpa: 7.93, result: 'Pass', graceApplied: false,
    divisionProvisional: 'First Class',
  },
];

export const GRACE_RULES = {
  maxPerSubject: 5,
  maxTotal: 10,
  eligibleIfFailByLessThan: 4,
  minPassMarks: 33,
  description: 'Grace marks up to 5 per subject and 10 total may be applied to students who fail by ≤4 marks in any subject. Not applicable in aggregate shortfall.',
};

// Question paper dispatch tracking
export interface PaperDispatch {
  centreCode: string;
  centreName: string;
  subjectCode: string;
  subjectName: string;
  examDate: string;
  examTime: string;
  packetsSent: number;
  packetsReceived: number;
  dispatchedOn?: string;
  courier?: string;
  trackingId?: string;
  sealStatus: 'sealed' | 'opened' | 'not_dispatched';
  receivedBy?: string;
  receivedOn?: string;
  openedAt?: string;
  remarks?: string;
}

export const PAPER_DISPATCH: PaperDispatch[] = [
  { centreCode: 'DC-01', centreName: 'Govt. Govt. Girls College', subjectCode: 'BCA501', subjectName: 'Software Engineering', examDate: '04-11-2024', examTime: '09:00', packetsSent: 12, packetsReceived: 12, dispatchedOn: '01-11-2024', courier: 'India Post Speed Post', trackingId: 'EE001234567IN', sealStatus: 'sealed', receivedBy: 'Sri Ram Kumar (Centre Supdt.)', receivedOn: '02-11-2024' },
  { centreCode: 'DC-02', centreName: 'Govt. Science College', subjectCode: 'BCA501', subjectName: 'Software Engineering', examDate: '04-11-2024', examTime: '09:00', packetsSent: 10, packetsReceived: 10, dispatchedOn: '01-11-2024', courier: 'India Post Speed Post', trackingId: 'EE001234568IN', sealStatus: 'sealed', receivedBy: 'Smt. Priya Singh (Centre Supdt.)', receivedOn: '02-11-2024' },
  { centreCode: 'MRN-01', centreName: 'Govt. Degree College, Northfield', subjectCode: 'BCA501', subjectName: 'Software Engineering', examDate: '04-11-2024', examTime: '09:00', packetsSent: 6, packetsReceived: 0, dispatchedOn: '01-11-2024', courier: 'India Post Speed Post', trackingId: 'EE001234569IN', sealStatus: 'not_dispatched', receivedBy: undefined, receivedOn: undefined },
  { centreCode: 'BHD-01', centreName: 'Govt. Degree College, Eastwood', subjectCode: 'BCA501', subjectName: 'Software Engineering', examDate: '04-11-2024', examTime: '09:00', packetsSent: 5, packetsReceived: 5, dispatchedOn: '31-10-2024', courier: 'Special Messenger', trackingId: 'SM/RDU/2024/0041', sealStatus: 'sealed', receivedBy: 'Sri Dinesh Gupta (Centre Supdt.)', receivedOn: '01-11-2024' },
];

export const RESULT_EMBARGO = {
  scheduledAt: '2025-01-31T11:00:00+05:30',
  approvedBy: 'Prof. A.K. Sharma (Exam Controller)',
  approvedOn: '28-01-2025',
  committeeApproved: true,
  status: 'embargoed' as 'embargoed' | 'published' | 'overridden',
};

// Revaluation data
export const REVALUATION_APPLICATIONS = [
  { id: 'RV/2024/V/0441', studentId: 'RDU/2021/BCA/0349', studentName: 'Vikram Tiwari', subjectCode: 'BCA501', subjectName: 'Software Engineering', originalMark: 28, maxExternal: 70, fee: 500, feePaid: true, status: 'under_eval' as const, appliedOn: '20-12-2024', assignedTo: 'Dr. V.K. Srivastava (Sr. Examiner)', estimatedCompletion: '15-01-2025' },
  { id: 'RV/2024/V/0398', studentId: 'RDU/2021/BCA/0345', studentName: 'Deepak Singh', subjectCode: 'BCA502', subjectName: 'Database Management', originalMark: 24, maxExternal: 70, fee: 500, feePaid: true, status: 'revised' as const, appliedOn: '18-12-2024', assignedTo: 'Dr. S.R. Joshi (Sr. Examiner)', revisedMark: 31, revisedOn: '10-01-2025' },
];

// Degree & Convocation
export const CONVOCATION = {
  year: 2024,
  date: '15-11-2024',
  venue: 'Atal Bihari Vajpayee Stadium, Demo City',
  chiefGuest: 'Prof. A.K. Tiwari, Vice Chancellor, JU',
  eligibilityBatch: ['2021–24 (BCA)', '2022–24 (MCA)', '2021–24 (B.Sc.)'],
  registeredCount: 4821,
  degreeDispatchPending: 312,
  digilockerPushed: 4509,
};

export const DEGREE_APPLICATIONS = [
  { studentId: 'RDU/2021/BCA/0342', name: 'Priya Sharma', programme: 'BCA', passedOn: '2024', status: 'registered' as const, digilockerStatus: 'pushed' as const, dispatchStatus: 'pending' as const },
  { studentId: 'RDU/2021/BCA/0344', name: 'Anjali Patel', programme: 'BCA', passedOn: '2024', status: 'registered' as const, digilockerStatus: 'pushed' as const, dispatchStatus: 'dispatched' as const, trackingId: 'INDPOST/2024/GWL/00441' },
];
