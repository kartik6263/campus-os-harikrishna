// Student portal data — Priya Sharma, BCA V Sem, Model College Demo City

export const STUDENT = {
  id: 'RDU/2021/BCA/0342',
  rollNo: 'GMC/BCA/2021/0342',
  name: 'Priya Sharma',
  nameHi: 'प्रिया शर्मा',
  dob: '14-03-2003',
  category: 'OBC',
  gender: 'Female',
  programme: 'Bachelor of Computer Applications',
  programmeShort: 'BCA',
  semester: 5,
  year: 3,
  batch: '2021–24',
  college: 'Govt. Model College',
  collegeCode: 'RDU-AC-002',
  department: 'Computer Science & Applications',
  mobile: '+91 94250 33127',
  email: 'priya.sharma.2021@demo.resolion.edu',
  altMobile: '+91 98930 11204',
  address: '23, Sector 4, Demo City — 100011',
  apaarId: 'APAAR2021MP1042867',
  abcId: 'ABC-2021-DC-08423',
  abcCredits: 84,
  abcTarget: 120,
  digilockerLinked: true,
  digilockerLinkedDate: '22-07-2023',
  photo: null,
};

export interface Subject {
  code: string;
  name: string;
  faculty: string;
  room: string;
  credits: number;
  total: number;
  present: number;
}

export const SUBJECTS: Subject[] = [
  { code: 'BCA501', name: 'Software Engineering', faculty: 'Dr. R.K. Mishra', room: 'CS-201', credits: 4, total: 42, present: 34 },
  { code: 'BCA502', name: 'Database Management', faculty: 'Prof. Sunita Yadav', room: 'CS-203', credits: 4, total: 40, present: 28 },
  { code: 'BCA503', name: 'Computer Networks', faculty: 'Dr. Anil Sharma', room: 'CS-101', credits: 4, total: 38, present: 26 },
  { code: 'BCA504', name: 'Operating Systems', faculty: 'Prof. M.L. Gupta', room: 'CS-202', credits: 3, total: 44, present: 35 },
  { code: 'BCA505', name: 'Web Technologies Lab', faculty: 'Ms. Kavita Jain', room: 'Lab-3', credits: 2, total: 36, present: 30 },
  { code: 'BCA506', name: 'Mini Project', faculty: 'Dr. R.K. Mishra', room: 'Lab-2', credits: 3, total: 20, present: 18 },
];

export interface TimetableSlot {
  time: string;
  subject: string;
  code: string;
  faculty: string;
  room: string;
  cancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const TIMETABLE: Record<string, TimetableSlot[]> = {
  Mon: [
    { time: '09:00–10:00', subject: 'Software Engineering', code: 'BCA501', faculty: 'Dr. R.K. Mishra', room: 'CS-201' },
    { time: '10:00–11:00', subject: 'Database Management', code: 'BCA502', faculty: 'Prof. Sunita Yadav', room: 'CS-203' },
    { time: '11:15–12:15', subject: 'Computer Networks', code: 'BCA503', faculty: 'Dr. Anil Sharma', room: 'CS-101', cancelled: true, cancelReason: 'Faculty on duty leave', cancelledAt: '08:42 AM' },
    { time: '01:00–02:00', subject: 'Operating Systems', code: 'BCA504', faculty: 'Prof. M.L. Gupta', room: 'CS-202' },
  ],
  Tue: [
    { time: '09:00–10:00', subject: 'Database Management', code: 'BCA502', faculty: 'Prof. Sunita Yadav', room: 'CS-203' },
    { time: '10:00–12:00', subject: 'Web Technologies Lab', code: 'BCA505', faculty: 'Ms. Kavita Jain', room: 'Lab-3' },
    { time: '01:00–03:00', subject: 'Mini Project', code: 'BCA506', faculty: 'Dr. R.K. Mishra', room: 'Lab-2' },
  ],
  Wed: [
    { time: '09:00–10:00', subject: 'Operating Systems', code: 'BCA504', faculty: 'Prof. M.L. Gupta', room: 'CS-202' },
    { time: '10:00–11:00', subject: 'Software Engineering', code: 'BCA501', faculty: 'Dr. R.K. Mishra', room: 'CS-201' },
    { time: '11:15–12:15', subject: 'Computer Networks', code: 'BCA503', faculty: 'Dr. Anil Sharma', room: 'CS-101' },
  ],
  Thu: [
    { time: '09:00–10:00', subject: 'Software Engineering', code: 'BCA501', faculty: 'Dr. R.K. Mishra', room: 'CS-201' },
    { time: '10:00–11:00', subject: 'Database Management', code: 'BCA502', faculty: 'Prof. Sunita Yadav', room: 'CS-203' },
    { time: '11:15–01:15', subject: 'Web Technologies Lab', code: 'BCA505', faculty: 'Ms. Kavita Jain', room: 'Lab-3' },
  ],
  Fri: [
    { time: '09:00–10:00', subject: 'Computer Networks', code: 'BCA503', faculty: 'Dr. Anil Sharma', room: 'CS-101' },
    { time: '10:00–11:00', subject: 'Operating Systems', code: 'BCA504', faculty: 'Prof. M.L. Gupta', room: 'CS-202' },
    { time: '11:15–12:15', subject: 'Database Management', code: 'BCA502', faculty: 'Prof. Sunita Yadav', room: 'CS-203' },
    { time: '01:00–02:00', subject: 'Software Engineering', code: 'BCA501', faculty: 'Dr. R.K. Mishra', room: 'CS-201' },
  ],
  Sat: [
    { time: '09:00–11:00', subject: 'Mini Project', code: 'BCA506', faculty: 'Dr. R.K. Mishra', room: 'Lab-2' },
    { time: '11:15–12:15', subject: 'Computer Networks', code: 'BCA503', faculty: 'Dr. Anil Sharma', room: 'CS-101' },
  ],
};
export { DAYS };

export interface FeeHead {
  head: string;
  amount: number;
  category: 'tuition' | 'development' | 'exam' | 'other';
  paid?: number;
}

export const FEE_STRUCTURE: FeeHead[] = [
  { head: 'Tuition Fee', amount: 7500, category: 'tuition', paid: 7500 },
  { head: 'Development Fee', amount: 2000, category: 'development', paid: 2000 },
  { head: 'Library Fee', amount: 500, category: 'other', paid: 500 },
  { head: 'Sports Fee', amount: 300, category: 'other', paid: 300 },
  { head: 'Examination Fee', amount: 1800, category: 'exam', paid: 0 },
  { head: 'University Development', amount: 1500, category: 'development', paid: 0 },
  { head: 'Caution Deposit', amount: 1000, category: 'other', paid: 1000 },
];

export const SCHOLARSHIP = { name: 'State Post Matric OBC Scholarship', amount: 5200, adjusted: true, adjustedDate: '12-08-2024' };

export interface Payment {
  id: string;
  date: string;
  head: string;
  amount: number;
  mode: string;
  txnId: string;
  receipt: string;
  status: 'success' | 'failed' | 'pending';
}

export const PAYMENTS: Payment[] = [
  { id: 'P001', date: '18-07-2024', head: 'Semester V Fees (Part)', amount: 10800, mode: 'UPI', txnId: 'UPI2024071812345678', receipt: 'RCT/RDU/2024/044521', status: 'success' },
  { id: 'P002', date: '22-08-2024', head: 'Scholarship Adjustment', amount: -5200, mode: 'System', txnId: 'SCH/ST/OBC/2024/08/9912', receipt: 'ADJ/RDU/2024/009123', status: 'success' },
  { id: 'P003', date: '01-09-2024', head: 'Library Fine', amount: 40, mode: 'UPI', txnId: 'UPI2024090100987654', receipt: 'RCT/RDU/2024/049001', status: 'success' },
];

export const INSTALMENT_PLAN = {
  opted: true,
  plan: [
    { instalment: 1, amount: 5800, due: '18-07-2024', paid: true, paidDate: '18-07-2024' },
    { instalment: 2, amount: 5000, due: '18-09-2024', paid: true, paidDate: '15-09-2024' },
    { instalment: 3, amount: 3300, due: '18-11-2024', paid: false },
  ],
};

export interface CertRequest {
  id: string;
  type: string;
  requestedOn: string;
  purpose: string;
  fee: number;
  feePaid: boolean;
  stage: 'submitted' | 'dept_hod' | 'college_office' | 'registry' | 'issued';
  slaDeadline: string;
  issuedOn?: string;
  refNo?: string;
}

export const CERT_REQUESTS: CertRequest[] = [
  {
    id: 'CR/2024/00892',
    type: 'Bonafide Certificate',
    requestedOn: '08-09-2024',
    purpose: 'Bank account opening',
    fee: 0,
    feePaid: true,
    stage: 'college_office',
    slaDeadline: '22-09-2024',
  },
  {
    id: 'CR/2024/00741',
    type: 'Character Certificate',
    requestedOn: '14-08-2024',
    purpose: 'Job application',
    fee: 50,
    feePaid: true,
    stage: 'issued',
    slaDeadline: '28-08-2024',
    issuedOn: '24-08-2024',
    refNo: 'GMC/CHAR/2024/0147',
  },
];

export const CERT_STAGES = [
  { key: 'submitted', label: 'Request Submitted', officer: 'Student Self' },
  { key: 'dept_hod', label: 'Dept. HOD Review', officer: 'Prof. M.L. Gupta (HOD)' },
  { key: 'college_office', label: 'College Office', officer: 'College Administration' },
  { key: 'registry', label: 'Registrar Office', officer: 'University Registry' },
  { key: 'issued', label: 'Issued / Ready', officer: '' },
];

export interface Book {
  id: string;
  title: string;
  author: string;
  accession: string;
  issuedOn: string;
  dueDate: string;
  renewed: number;
  fine: number;
}

export const ISSUED_BOOKS: Book[] = [
  { id: 'B001', title: 'Operating System Concepts', author: 'Silberschatz, Galvin', accession: 'CS/4512', issuedOn: '01-09-2024', dueDate: '22-09-2024', renewed: 1, fine: 0 },
  { id: 'B002', title: 'Computer Networks', author: 'Tanenbaum A.S.', accession: 'CS/3891', issuedOn: '25-08-2024', dueDate: '15-09-2024', renewed: 0, fine: 20 },
];

export const CATALOGUE_SAMPLE = [
  { title: 'Database System Concepts', author: 'Korth, Silberschatz', available: 2 },
  { title: 'Software Engineering', author: 'Sommerville Ian', available: 0 },
  { title: 'Introduction to Algorithms', author: 'CLRS', available: 1 },
  { title: 'Web Technologies', author: 'Uttam Kumar Roy', available: 3 },
  { title: 'Computer Graphics', author: 'Donald Hearn', available: 1 },
];

export interface Grievance {
  id: string;
  category: string;
  subject: string;
  description: string;
  raisedOn: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';
  slaDeadline: string;
  trail: Array<{ actor: string; action: string; date: string; note?: string }>;
}

export const GRIEVANCES: Grievance[] = [
  {
    id: 'GRV/2024/1834',
    category: 'Examination',
    subject: 'Marks not updated in portal for BCA503 internal',
    description: 'Internal exam marks for BCA503 Paper II (Unit Test, 18-Aug-2024) have not been uploaded to the portal. Faculty confirmed marks were submitted to college office on 25-Aug-2024.',
    raisedOn: '02-09-2024',
    status: 'in_progress',
    slaDeadline: '12-09-2024',
    trail: [
      { actor: 'Student Portal', action: 'Grievance registered', date: '02-09-2024' },
      { actor: 'College Nodal Officer', action: 'Acknowledged — forwarded to exam section', date: '03-09-2024', note: 'Will check with faculty within 2 working days' },
      { actor: 'Exam Section', action: 'Under investigation', date: '05-09-2024' },
    ],
  },
];

export interface ExamForm {
  sem: number;
  examDate: string;
  lastDateFill: string;
  lastDateLateFee: string;
  regularFee: number;
  lateFee: number;
  eligibleSubjects: string[];
  backlogSubjects: string[];
  status: 'open' | 'submitted' | 'approved';
  formNo?: string;
}

export const EXAM_FORM: ExamForm = {
  sem: 5,
  examDate: 'Nov 2024',
  lastDateFill: '30-09-2024',
  lastDateLateFee: '15-10-2024',
  regularFee: 1800,
  lateFee: 500,
  eligibleSubjects: ['BCA501', 'BCA502', 'BCA503', 'BCA504', 'BCA505', 'BCA506'],
  backlogSubjects: [],
  status: 'open',
};

export interface HallTicket {
  examName: string;
  centre: string;
  centreCode: string;
  centreAddress: string;
  seatNo: string;
  reportingTime: string;
  subjects: Array<{ code: string; name: string; date: string; time: string }>;
}

export const HALL_TICKET: HallTicket = {
  examName: 'B.C.A. III Year (V Semester) Examination Nov–Dec 2024',
  centre: 'Govt. Girls College, Demo City',
  centreCode: 'GWL-EXM-07',
  centreAddress: 'Old Town, Demo City — 100001',
  seatNo: 'GWL07/2024/0342',
  reportingTime: '08:30 AM (30 min before exam)',
  subjects: [
    { code: 'BCA501', name: 'Software Engineering', date: '04-11-2024', time: '09:00–12:00' },
    { code: 'BCA502', name: 'Database Management', date: '06-11-2024', time: '09:00–12:00' },
    { code: 'BCA503', name: 'Computer Networks', date: '08-11-2024', time: '09:00–12:00' },
    { code: 'BCA504', name: 'Operating Systems', date: '11-11-2024', time: '09:00–12:00' },
  ],
};

export interface SemResult {
  sem: number;
  year: string;
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  result: 'Pass' | 'Fail' | 'Withheld';
  subjects: Array<{ code: string; name: string; internal: number; external: number; total: number; grade: string; status: 'pass' | 'fail' }>;
}

export const RESULTS: SemResult[] = [
  {
    sem: 1, year: 'Nov 2021', sgpa: 7.8, cgpa: 7.8, totalCredits: 22, result: 'Pass',
    subjects: [
      { code: 'BCA101', name: 'Fundamentals of Computers', internal: 22, external: 54, total: 76, grade: 'B+', status: 'pass' },
      { code: 'BCA102', name: 'Mathematics I', internal: 19, external: 48, total: 67, grade: 'B', status: 'pass' },
      { code: 'BCA103', name: 'C Programming', internal: 23, external: 60, total: 83, grade: 'A', status: 'pass' },
    ],
  },
  {
    sem: 2, year: 'May 2022', sgpa: 8.1, cgpa: 7.95, totalCredits: 44, result: 'Pass',
    subjects: [
      { code: 'BCA201', name: 'Data Structures', internal: 24, external: 62, total: 86, grade: 'A', status: 'pass' },
      { code: 'BCA202', name: 'Mathematics II', internal: 20, external: 55, total: 75, grade: 'B+', status: 'pass' },
      { code: 'BCA203', name: 'OOP with C++', internal: 25, external: 65, total: 90, grade: 'A+', status: 'pass' },
    ],
  },
  {
    sem: 3, year: 'Nov 2022', sgpa: 7.5, cgpa: 7.8, totalCredits: 66, result: 'Pass',
    subjects: [
      { code: 'BCA301', name: 'Java Programming', internal: 21, external: 52, total: 73, grade: 'B+', status: 'pass' },
      { code: 'BCA302', name: 'RDBMS', internal: 18, external: 44, total: 62, grade: 'B', status: 'pass' },
      { code: 'BCA303', name: 'System Analysis', internal: 22, external: 50, total: 72, grade: 'B+', status: 'pass' },
    ],
  },
  {
    sem: 4, year: 'May 2023', sgpa: 8.3, cgpa: 7.93, totalCredits: 84, result: 'Pass',
    subjects: [
      { code: 'BCA401', name: 'Python Programming', internal: 25, external: 68, total: 93, grade: 'A+', status: 'pass' },
      { code: 'BCA402', name: 'Computer Architecture', internal: 22, external: 58, total: 80, grade: 'A', status: 'pass' },
      { code: 'BCA403', name: 'Software Testing', internal: 23, external: 55, total: 78, grade: 'B+', status: 'pass' },
    ],
  },
];

export interface TransportRoute {
  routeNo: string;
  name: string;
  stops: Array<{ name: string; time: string }>;
  busNo: string;
  passValid: boolean;
  passDue: string;
  lastUpdated: string;
}

export const TRANSPORT: TransportRoute = {
  routeNo: 'R-07',
  name: 'Sector 4 — Model College',
  stops: [
    { name: 'Sector 4 Crossing', time: '08:05 AM' },
    { name: 'Sector 4', time: '08:12 AM' },
    { name: 'Gandhi Road', time: '08:20 AM' },
    { name: 'Company Bagh', time: '08:28 AM' },
    { name: 'Model College Gate', time: '08:40 AM' },
  ],
  busNo: 'MP07-GC-4892',
  passValid: true,
  passDue: '31-10-2024',
  lastUpdated: 'Today 08:35 AM',
};

export interface PlacementDrive {
  id: string;
  company: string;
  role: string;
  ctc: string;
  location: string;
  deadline: string;
  eligibility: string;
  status: 'eligible' | 'applied' | 'shortlisted' | 'rejected' | 'offered' | 'closed';
  rounds: Array<{ round: string; date: string; venue: string; result?: 'pass' | 'fail' | 'pending' }>;
}

export const PLACEMENTS: PlacementDrive[] = [
  {
    id: 'PL001', company: 'Infosys Ltd.', role: 'Systems Engineer', ctc: '3.6 LPA',
    location: 'Pune / Bangalore', deadline: '20-09-2024', eligibility: 'BCA/BSc IT, CGPA ≥ 6.5, No active backlog',
    status: 'applied',
    rounds: [
      { round: 'Online Assessment', date: '22-09-2024', venue: 'Online', result: 'pending' },
      { round: 'HR Interview', date: 'TBD', venue: 'TBD' },
    ],
  },
  {
    id: 'PL002', company: 'Wipro Technologies', role: 'Project Engineer', ctc: '3.5 LPA',
    location: 'Hyderabad', deadline: '05-10-2024', eligibility: 'BCA/BSc CS, CGPA ≥ 6.0',
    status: 'eligible',
    rounds: [
      { round: 'Written Test', date: '08-10-2024', venue: 'Demo City Campus', result: undefined },
      { round: 'Technical Interview', date: 'TBD', venue: 'TBD' },
    ],
  },
  {
    id: 'PL003', company: 'TCS iON', role: 'Digital Content Developer', ctc: '2.8 LPA',
    location: 'Remote / Demo City', deadline: '30-08-2024', eligibility: 'Any graduate',
    status: 'shortlisted',
    rounds: [
      { round: 'Written Test', date: '01-09-2024', venue: 'Model College', result: 'pass' },
      { round: 'Personal Interview', date: '18-09-2024', venue: 'TCS Demo City Office', result: 'pending' },
    ],
  },
];

export interface Scholarship {
  id: string;
  name: string;
  provider: string;
  type: 'state' | 'central' | 'university';
  amount: number;
  status: 'eligible' | 'applied' | 'under_review' | 'sanctioned' | 'disbursed' | 'rejected';
  appliedOn?: string;
  sanctionedAmount?: number;
  disbursedOn?: string;
  disbursedAmount?: number;
  documents: Array<{ name: string; uploaded: boolean; verified?: boolean }>;
  trail: Array<{ stage: string; date: string; note?: string }>;
}

export const SCHOLARSHIPS: Scholarship[] = [
  {
    id: 'SCH001',
    name: 'State Post Matric Scholarship (OBC)',
    provider: 'Resolion Campus OS, SC/ST/OBC Welfare Dept.',
    type: 'state',
    amount: 5200,
    status: 'disbursed',
    appliedOn: '15-07-2024',
    sanctionedAmount: 5200,
    disbursedOn: '12-08-2024',
    disbursedAmount: 5200,
    documents: [
      { name: 'Caste Certificate', uploaded: true, verified: true },
      { name: 'Income Certificate', uploaded: true, verified: true },
      { name: 'Marksheet (Prev Sem)', uploaded: true, verified: true },
      { name: 'Bank Passbook', uploaded: true, verified: true },
      { name: 'Aadhaar Card', uploaded: true, verified: true },
    ],
    trail: [
      { stage: 'Applied on MP Scholarship Portal', date: '15-07-2024' },
      { stage: 'Verified by College Nodal Officer', date: '22-07-2024', note: 'All documents verified' },
      { stage: 'Forwarded to Welfare Dept.', date: '28-07-2024' },
      { stage: 'Sanctioned', date: '05-08-2024', note: 'Amount: ₹5,200' },
      { stage: 'Disbursed to bank account', date: '12-08-2024', note: 'NEFT to XXXX5521' },
    ],
  },
  {
    id: 'SCH002',
    name: 'NSP Central Sector Scholarship',
    provider: 'Govt. of India, Ministry of Education',
    type: 'central',
    amount: 12000,
    status: 'under_review',
    appliedOn: '01-09-2024',
    documents: [
      { name: 'Aadhaar Card', uploaded: true, verified: true },
      { name: '12th Marksheet', uploaded: true, verified: false },
      { name: 'Income Certificate', uploaded: true, verified: false },
      { name: 'Bank Details', uploaded: true, verified: false },
      { name: 'Domicile Certificate', uploaded: false },
    ],
    trail: [
      { stage: 'Applied via NSP portal', date: '01-09-2024' },
      { stage: 'Pending college verification', date: '01-09-2024', note: 'Awaiting nodal officer action' },
    ],
  },
];

export const ANNOUNCEMENTS = [
  { id: 'A001', scope: 'university', title: 'NAAC Peer Team Visit — 24–26 September 2024', body: 'All students are requested to be present on campus during the NAAC peer team visit. Best academic dress expected.', date: '13-09-2024', urgent: true },
  { id: 'A002', scope: 'college', title: 'Exam Form Last Date: 30 September 2024', body: 'V Semester examination form must be filled online and fee paid at college counter by 30-09-2024. Late fee of ₹500 applicable after this date.', date: '10-09-2024', urgent: true },
  { id: 'A003', scope: 'department', title: 'Mini Project Viva — 28 September 2024', body: 'BCA V Semester Mini Project presentations will be held on 28-09-2024 in Lab-2. All groups must submit documentation 3 days prior.', date: '09-09-2024', urgent: false },
  { id: 'A004', scope: 'batch', title: 'Library Book Return Deadline Extended', body: 'Due date for Semester IV issued books extended to 30 September 2024. Fine waived for books returned before this date.', date: '07-09-2024', urgent: false },
  { id: 'A005', scope: 'university', title: 'Convocation 2024 — Registration Open', body: 'Students who have completed their degree (2022 & 2023 batch) can register for the Annual Convocation Ceremony on 15-11-2024.', date: '05-09-2024', urgent: false },
  { id: 'A006', scope: 'college', title: 'Annual Sports Meet Nominations', body: 'Students wishing to participate in Annual Sports Meet (Oct 10–12) must register with the Sports In-charge by 25-09-2024.', date: '04-09-2024', urgent: false },
];

export const SYLLABUS_UNITS: Record<string, Array<{ unit: number; title: string; topics: string; materials: Array<{ name: string; type: 'pdf' | 'link' }> }>> = {
  BCA501: [
    { unit: 1, title: 'Introduction to SE & Process Models', topics: 'Software development life cycle, Waterfall, Agile, Spiral models', materials: [{ name: 'Unit 1 Notes (Dr. Mishra)', type: 'pdf' }, { name: 'Previous Paper 2023', type: 'pdf' }] },
    { unit: 2, title: 'Requirements Engineering', topics: 'Functional/non-functional requirements, Use case diagrams, SRS document', materials: [{ name: 'Unit 2 Notes', type: 'pdf' }] },
    { unit: 3, title: 'Software Design', topics: 'Cohesion, coupling, architectural design, UML class diagrams', materials: [{ name: 'Unit 3 Slides', type: 'pdf' }] },
    { unit: 4, title: 'Testing & Maintenance', topics: 'Unit testing, Integration testing, Black/White box, Regression testing', materials: [{ name: 'Unit 4 Notes', type: 'pdf' }, { name: 'Previous Paper 2022', type: 'pdf' }] },
  ],
};

export const EDIT_REQUESTS = [
  {
    id: 'ER/2024/0291',
    field: 'Mobile Number',
    oldValue: '+91 94250 33127',
    newValue: '+91 98765 43210',
    reason: 'Number changed — old number lost',
    requestedOn: '05-09-2024',
    status: 'pending',
    trail: [
      { actor: 'Student', action: 'Edit request submitted', date: '05-09-2024' },
      { actor: 'College Office', action: 'Pending verification', date: '06-09-2024', note: 'Supporting document awaited' },
    ],
  },
];
