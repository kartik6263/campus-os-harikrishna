// Campus services back-office data — fee, scholarship, grievance

// ---- FEE & FINANCE ----
export interface FeeStructure {
  id: string; programme: string; semester: number; category: string; effectiveFrom: string;
  heads: Array<{ head: string; amount: number; isRefundable: boolean; concessionAllowed: boolean }>;
  totalAmount: number;
}

export const FEE_STRUCTURES: FeeStructure[] = [
  {
    id: 'FS/BCA/UR/2024',
    programme: 'BCA', semester: 1, category: 'UR', effectiveFrom: '2024-25',
    heads: [
      { head: 'Tuition Fee', amount: 7500, isRefundable: false, concessionAllowed: true },
      { head: 'Development Fee', amount: 2000, isRefundable: false, concessionAllowed: false },
      { head: 'Library Fee', amount: 500, isRefundable: false, concessionAllowed: false },
      { head: 'Sports & Cultural', amount: 300, isRefundable: false, concessionAllowed: false },
      { head: 'Caution Deposit', amount: 1000, isRefundable: true, concessionAllowed: false },
      { head: 'University Development', amount: 1500, isRefundable: false, concessionAllowed: false },
      { head: 'Examination Fee', amount: 1800, isRefundable: false, concessionAllowed: false },
    ],
    totalAmount: 14600,
  },
  {
    id: 'FS/BCA/SC/2024',
    programme: 'BCA', semester: 1, category: 'SC',
    effectiveFrom: '2024-25',
    heads: [
      { head: 'Tuition Fee', amount: 0, isRefundable: false, concessionAllowed: false },
      { head: 'Development Fee', amount: 2000, isRefundable: false, concessionAllowed: false },
      { head: 'Library Fee', amount: 500, isRefundable: false, concessionAllowed: false },
      { head: 'Sports & Cultural', amount: 300, isRefundable: false, concessionAllowed: false },
      { head: 'Caution Deposit', amount: 1000, isRefundable: true, concessionAllowed: false },
      { head: 'University Development', amount: 1500, isRefundable: false, concessionAllowed: false },
      { head: 'Examination Fee', amount: 1800, isRefundable: false, concessionAllowed: false },
    ],
    totalAmount: 7100,
  },
];

export const CONCESSION_RULES = [
  { id: 'CON001', name: 'SC/ST Tuition Fee Waiver', applicableTo: ['SC', 'ST'], concessionType: 'full_waiver', applicableHeads: ['Tuition Fee'], authority: 'State Govt.' },
  { id: 'CON002', name: 'OBC 50% Tuition Concession', applicableTo: ['OBC'], concessionType: 'percentage', percentage: 50, applicableHeads: ['Tuition Fee'], authority: 'State Govt.' },
  { id: 'CON003', name: 'Merit Scholarship (Top 3 rank)', applicableTo: ['UR', 'OBC', 'SC', 'ST'], concessionType: 'fixed', amount: 5000, applicableHeads: ['Tuition Fee'], authority: 'JU Academic Office' },
  { id: 'CON004', name: 'Sports Achievement Fee Waiver', applicableTo: ['All'], concessionType: 'full_waiver', applicableHeads: ['Sports & Cultural'], authority: 'Sports In-charge' },
];

export const DUES_REGISTER = [
  { studentId: 'RDU/2021/BCA/0357', name: 'Ravi Chouhan', programme: 'BCA V', totalDue: 4800, oldest: '18-07-2024', buckets: [{ period: '0-30 days', amount: 1800 }, { period: '31-60 days', amount: 1500 }, { period: '61-90 days', amount: 1500 }], lastReminder: '10-09-2024', reminderCount: 3 },
  { studentId: 'RDU/2021/BCA/0360', name: 'Suresh Prajapati', programme: 'BCA V', totalDue: 1800, oldest: '15-08-2024', buckets: [{ period: '31-60 days', amount: 1800 }], lastReminder: '15-09-2024', reminderCount: 2 },
  { studentId: 'RDU/2022/BCA/0119', name: 'Naresh Jatav', programme: 'BCA III', totalDue: 3500, oldest: '18-07-2024', buckets: [{ period: '61-90 days', amount: 3500 }], lastReminder: '01-09-2024', reminderCount: 4 },
];

export const GATEWAY_SETTLEMENTS = [
  { date: '18-09-2024', gateway: 'Online Payment Gateway', totalCollected: 284500, totalSettled: 284500, pendingCount: 0, settlementRef: 'MPON/2024/09/18/00441' },
  { date: '17-09-2024', gateway: 'Online Payment Gateway', totalCollected: 196800, totalSettled: 194200, pendingCount: 2, settlementRef: 'MPON/2024/09/17/00398', pendingAmount: 2600 },
  { date: '16-09-2024', gateway: 'Razorpay', totalCollected: 45000, totalSettled: 45000, pendingCount: 0, settlementRef: 'RZP/2024/09/16/7891' },
];

// ---- SCHOLARSHIP (University Level) ----
export interface ScholarshipScheme {
  id: string; name: string; provider: 'State' | 'Central' | 'University';
  portalName: string; portalUrl: string;
  eligibleCategories: string[]; maxIncome: number; amountPerYear: number;
  applicationWindow: string; documentList: string[];
  currentBatch: { applied: number; verified: number; forwarded: number; sanctioned: number; disbursed: number };
}

export const SCHOLARSHIP_SCHEMES: ScholarshipScheme[] = [
  {
    id: 'SCH-MP-OBC', name: 'State Post Matric Scholarship (OBC)', provider: 'State',
    portalName: 'MP Scholarship Portal (scholarship.mp.gov.in)',
    portalUrl: 'https://scholarship.mp.gov.in',
    eligibleCategories: ['OBC'], maxIncome: 100000, amountPerYear: 5200,
    applicationWindow: '01-Jul to 31-Aug',
    documentList: ['Caste Certificate', 'Income Certificate', 'Aadhaar Card', 'Bank Passbook', 'Marksheet (prev sem)', '12th Marksheet'],
    currentBatch: { applied: 3420, verified: 3218, forwarded: 3218, sanctioned: 3100, disbursed: 2940 },
  },
  {
    id: 'SCH-NSP-CSC', name: 'NSP Central Sector Scholarship', provider: 'Central',
    portalName: 'National Scholarship Portal (scholarships.gov.in)',
    portalUrl: 'https://scholarships.gov.in',
    eligibleCategories: ['UR', 'OBC', 'SC', 'ST'], maxIncome: 450000, amountPerYear: 12000,
    applicationWindow: '01-Aug to 31-Oct',
    documentList: ['Aadhaar Card', '12th Marksheet', 'Income Certificate', 'Bank Details', 'Domicile Certificate'],
    currentBatch: { applied: 8901, verified: 5420, forwarded: 5420, sanctioned: 0, disbursed: 0 },
  },
  {
    id: 'SCH-MP-SC', name: 'State Post Matric Scholarship (SC)', provider: 'State',
    portalName: 'MP Scholarship Portal', portalUrl: 'https://scholarship.mp.gov.in',
    eligibleCategories: ['SC'], maxIncome: 100000, amountPerYear: 6000,
    applicationWindow: '01-Jul to 31-Aug',
    documentList: ['Caste Certificate', 'Income Certificate', 'Aadhaar Card', 'Bank Passbook', 'Marksheet'],
    currentBatch: { applied: 2100, verified: 2000, forwarded: 2000, sanctioned: 1950, disbursed: 1890 },
  },
];

// ---- GRIEVANCE (University Level) ----
export interface GrievanceCategory {
  id: string; name: string; nameHi: string; parent?: string;
  autoRoute: string; slaHours: number;
  escalationLadder: string[];
}

export const GRIEVANCE_CATEGORIES: GrievanceCategory[] = [
  { id: 'GC01', name: 'Examination', nameHi: 'परीक्षा', slaHours: 120, autoRoute: 'Controller of Examinations', escalationLadder: ['CoE Office', 'Dean Academics', 'Vice Chancellor'] },
  { id: 'GC01-01', name: 'Result Error', nameHi: 'परिणाम त्रुटि', parent: 'GC01', slaHours: 72, autoRoute: 'CoE — Result Section', escalationLadder: ['Result Section', 'CoE Office', 'Dean Academics'] },
  { id: 'GC01-02', name: 'Hall Ticket Issue', nameHi: 'प्रवेश-पत्र समस्या', parent: 'GC01', slaHours: 48, autoRoute: 'CoE — Exam Form Section', escalationLadder: ['Exam Form Section', 'CoE Office'] },
  { id: 'GC02', name: 'Fees & Finance', nameHi: 'शुल्क और वित्त', slaHours: 96, autoRoute: 'Finance Officer', escalationLadder: ['Finance Office', 'Registrar', 'Vice Chancellor'] },
  { id: 'GC03', name: 'Scholarship', nameHi: 'छात्रवृत्ति', slaHours: 120, autoRoute: 'Scholarship Section', escalationLadder: ['Scholarship Section', 'Dean Students Welfare', 'Registrar'] },
  { id: 'GC04', name: 'Hostel', nameHi: 'छात्रावास', slaHours: 48, autoRoute: 'Hostel Warden', escalationLadder: ['Chief Warden', 'Dean Students Welfare', 'Vice Chancellor'] },
  { id: 'GC05', name: 'Admission', nameHi: 'प्रवेश', slaHours: 72, autoRoute: 'Admission Cell', escalationLadder: ['Admission Cell', 'Dean Academics', 'Registrar'] },
  { id: 'GC06', name: 'Faculty Conduct', nameHi: 'शिक्षक आचरण', slaHours: 168, autoRoute: 'College Principal', escalationLadder: ['College Principal', 'Dean Academics', 'Registrar', 'VC'] },
  { id: 'GC07', name: 'Anti-Ragging', nameHi: 'रैगिंग विरोध', slaHours: 12, autoRoute: 'Anti-Ragging Committee', escalationLadder: ['Anti-Ragging Committee', 'Registrar', 'Vice Chancellor', 'Police'] },
  { id: 'GC08', name: 'Infrastructure', nameHi: 'बुनियादी ढाँचा', slaHours: 168, autoRoute: 'Estate Office', escalationLadder: ['Estate Office', 'Registrar'] },
];

export interface UniversityGrievance {
  id: string; category: string; categoryPath: string;
  raisedBy: { id: string; name: string; role: string; college?: string };
  subject: string; description: string;
  raisedOn: string; slaDeadline: string;
  status: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed' | 'cm_helpline';
  priority: 'critical' | 'high' | 'normal' | 'low';
  assignedTo: string;
  internalNotes: Array<{ by: string; note: string; timestamp: string }>;
  publicThread: Array<{ by: string; message: string; timestamp: string; isStaff: boolean }>;
  cmHelplineRef?: string;
  satisfactionRating?: 1 | 2 | 3 | 4 | 5;
  resolvedOn?: string;
  resolution?: string;
}

export const UNIVERSITY_GRIEVANCES: UniversityGrievance[] = [
  {
    id: 'GRV/2024/RDU/04421',
    category: 'GC01-01', categoryPath: 'Examination > Result Error',
    raisedBy: { id: 'RDU/2021/BCA/0351', name: 'Mohit Dubey', role: 'Student', college: 'Govt. Model College' },
    subject: 'BCA IV Semester result shows Fail but internal marks were 34/70 — should be ATKT not Fail',
    description: 'My BCA IV sem result (May 2024) shows Fail in BCA401 Python Programming. But my internal marks were 34 which with grace should make it ATKT not Fail. The computation appears incorrect.',
    raisedOn: '05-08-2024', slaDeadline: '08-08-2024',
    status: 'in_progress', priority: 'high',
    assignedTo: 'CoE — Result Section',
    internalNotes: [
      { by: 'Result Section Staff', note: 'Verified — external marks 34, total 68, pass mark 85. ATKT applicable under Rule 14.3. Correcting in system.', timestamp: '06-08-2024 11:30 AM' },
    ],
    publicThread: [
      { by: 'Mohit Dubey', message: 'My result shows Fail but based on marks it should be ATKT. Please check.', timestamp: '05-08-2024 09:00 AM', isStaff: false },
      { by: 'CoE Office', message: 'Your grievance has been registered and forwarded to the Result Section for verification. You will receive an update within 3 working days.', timestamp: '05-08-2024 02:00 PM', isStaff: true },
      { by: 'Result Section', message: 'We have verified your marks. A correction is being processed. Revised result will be updated within 2 working days.', timestamp: '06-08-2024 03:00 PM', isStaff: true },
    ],
  },
  {
    id: 'GRV/2024/RDU/04891',
    category: 'GC03', categoryPath: 'Scholarship',
    raisedBy: { id: 'RDU/2021/BCA/0349', name: 'Vikram Tiwari', role: 'Student', college: 'Govt. Model College' },
    subject: 'NSP scholarship not disbursed — 3 months pending',
    description: 'My NSP Central Sector Scholarship for 2023-24 was sanctioned in March 2024 but not disbursed to my bank account. Amount: ₹12,000.',
    raisedOn: '10-09-2024', slaDeadline: '15-09-2024',
    status: 'escalated', priority: 'high',
    assignedTo: 'Dean Students Welfare',
    cmHelplineRef: undefined,
    internalNotes: [
      { by: 'Scholarship Section', note: 'NSP portal shows disbursement pending at state level. Issue forwarded to State Higher Education Dept.', timestamp: '11-09-2024 02:00 PM' },
    ],
    publicThread: [
      { by: 'Vikram Tiwari', message: 'NSP scholarship sanctioned in March 2024 but ₹12,000 not received. Bank details are correct.', timestamp: '10-09-2024 10:00 AM', isStaff: false },
      { by: 'Scholarship Section', message: 'We have checked the NSP portal. Disbursement is pending at the state treasury level. We have escalated to the State Higher Education Department.', timestamp: '11-09-2024 03:00 PM', isStaff: true },
    ],
  },
];

export const GRIEVANCE_ANALYTICS = {
  totalThisMonth: 342,
  resolvedThisMonth: 287,
  breachedSLA: 38,
  slaComplianceRate: 88.9,
  avgResolutionDays: 4.2,
  repeatComplaints: 18,
  cmHelplineCount: 4,
  byCategory: [
    { category: 'Examination', count: 98, resolved: 82, breached: 12 },
    { category: 'Scholarship', count: 74, resolved: 58, breached: 9 },
    { category: 'Fees & Finance', count: 62, resolved: 55, breached: 5 },
    { category: 'Hostel', count: 48, resolved: 44, breached: 4 },
    { category: 'Admission', count: 34, resolved: 28, breached: 5 },
    { category: 'Infrastructure', count: 18, resolved: 14, breached: 2 },
    { category: 'Others', count: 8, resolved: 6, breached: 1 },
  ],
  byAgeing: [
    { bucket: '0–3 days', count: 142 },
    { bucket: '4–7 days', count: 78 },
    { bucket: '8–14 days', count: 41 },
    { bucket: '15–30 days', count: 23 },
    { bucket: '>30 days', count: 20 },
  ],
};
