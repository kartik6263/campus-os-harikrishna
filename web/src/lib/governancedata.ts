// Governance data (demo data)

// ─── AFFILIATION ──────────────────────────────────────────────────────────────

export type AffiliationType = 'new' | 'renewal' | 'additional_programme' | 'increased_intake';
export type AffiliationStatus =
  | 'draft' | 'submitted' | 'fee_pending' | 'fee_paid'
  | 'scrutiny' | 'objection_raised' | 'reply_received'
  | 'inspection_scheduled' | 'inspection_done'
  | 'committee_review' | 'loi_issued' | 'affiliated' | 'conditional'
  | 'rejected' | 'lapsed';

export interface AffiliationApplication {
  id: string;
  collegeCode: string;
  collegeName: string;
  district: string;
  applicationType: AffiliationType;
  programme?: string;
  intakeRequested?: number;
  intakeExisting?: number;
  submittedOn: string;
  status: AffiliationStatus;
  feePaid: boolean;
  feeAmount: number;
  expiryDate?: string;
  conditions?: string[];
  scrutinyOfficer?: string;
  objections?: Array<{ id: string; document: string; remark: string; status: 'open' | 'replied' | 'resolved' }>;
  inspectionDate?: string;
  inspectionCommittee?: string[];
  recommendation?: 'recommend' | 'conditionally_recommend' | 'not_recommend';
}

export const AFFILIATION_APPLICATIONS: AffiliationApplication[] = [
  {
    id: 'AFF/2024/001',
    collegeCode: 'RDU-AC-047',
    collegeName: 'Shri Ram College of Commerce, Northfield',
    district: 'Northfield',
    applicationType: 'renewal',
    submittedOn: '01-08-2024',
    status: 'inspection_scheduled',
    feePaid: true,
    feeAmount: 25000,
    expiryDate: '30-09-2024',
    scrutinyOfficer: 'Sh. R.K. Mishra',
    objections: [
      { id: 'OBJ-001', document: 'Fire Safety Certificate', remark: 'Certificate expired on 12-Mar-2024. Renew and resubmit.', status: 'replied' },
      { id: 'OBJ-002', document: 'Laboratory Equipment List', remark: 'List does not match physical inventory. Discrepancy in computer count (stated 40, found 28).', status: 'open' },
    ],
    inspectionDate: '25-09-2024',
    inspectionCommittee: ['Prof. S.L. Pandey (Convener)', 'Dr. A.K. Srivastava', 'Sh. P.K. Gupta (Finance)', 'Dr. N. Singh (Subject Expert)'],
  },
  {
    id: 'AFF/2024/002',
    collegeCode: 'RDU-AC-089',
    collegeName: 'Indira Gandhi Women’s College, Westfield',
    district: 'Westfield',
    applicationType: 'additional_programme',
    programme: 'B.Sc. Computer Science',
    intakeRequested: 60,
    submittedOn: '15-07-2024',
    status: 'loi_issued',
    feePaid: true,
    feeAmount: 35000,
    scrutinyOfficer: 'Dr. M.L. Sharma',
    objections: [],
    inspectionDate: '10-09-2024',
    inspectionCommittee: ['Prof. K.D. Verma (Convener)', 'Dr. S.P. Singh', 'Dr. A.R. Jain'],
    recommendation: 'recommend',
  },
  {
    id: 'AFF/2024/003',
    collegeCode: 'RDU-AC-203',
    collegeName: 'Vivekananda Degree College, Eastwood',
    district: 'Eastwood',
    applicationType: 'new',
    programme: 'B.A. / B.Com.',
    submittedOn: '20-06-2024',
    status: 'conditional',
    feePaid: true,
    feeAmount: 50000,
    expiryDate: '31-03-2025',
    conditions: [
      'Appoint minimum 5 full-time permanent faculty before 31-Dec-2024',
      'Complete library with minimum 2000 books before 31-Dec-2024',
      'Submit fire safety clearance within 60 days',
    ],
    inspectionDate: '05-08-2024',
    recommendation: 'conditionally_recommend',
  },
  {
    id: 'AFF/2024/004',
    collegeCode: 'RDU-AC-312',
    collegeName: 'Maharshi Mahesh Yogi College, Guna',
    district: 'Guna',
    applicationType: 'increased_intake',
    programme: 'BBA',
    intakeExisting: 60,
    intakeRequested: 120,
    submittedOn: '10-09-2024',
    status: 'scrutiny',
    feePaid: true,
    feeAmount: 15000,
    scrutinyOfficer: 'Dr. P.K. Verma',
    objections: [],
  },
  {
    id: 'AFF/2024/005',
    collegeCode: 'RDU-AC-156',
    collegeName: 'Subhash Chandra Bose College, Southgate',
    district: 'Southgate',
    applicationType: 'renewal',
    submittedOn: '25-09-2024',
    status: 'fee_pending',
    feePaid: false,
    feeAmount: 25000,
  },
];

export interface AffiliationRegisterEntry {
  collegeCode: string;
  collegeName: string;
  district: string;
  type: 'government' | 'private_aided' | 'private_unaided' | 'autonomous';
  gender: 'co-ed' | 'women' | 'men';
  affiliatedSince: string;
  validUpto: string;
  status: 'affiliated' | 'conditional' | 'lapsed' | 'de-affiliated';
  programmes: string[];
  sanctionedIntake: number;
  pendingConditions: number;
  contactPrincipal: string;
  district_code: string;
  lat?: number;
  lng?: number;
}

export const AFFILIATION_REGISTER: AffiliationRegisterEntry[] = [
  { collegeCode: 'RDU-AC-001', collegeName: 'Govt. Science College, Riverside', district: 'Riverside', type: 'government', gender: 'co-ed', affiliatedSince: '1952', validUpto: '31-03-2025', status: 'affiliated', programmes: ['B.Sc.', 'M.Sc. Chemistry', 'M.Sc. Physics'], sanctionedIntake: 480, pendingConditions: 0, contactPrincipal: 'Dr. S.K. Awasthi', district_code: 'UJN', lat: 23.1765, lng: 75.7885 },
  { collegeCode: 'RDU-AC-002', collegeName: 'Govt. Model College, Demo City', district: 'Demo City', type: 'government', gender: 'co-ed', affiliatedSince: '1964', validUpto: '31-03-2025', status: 'affiliated', programmes: ['B.A.', 'B.Com.', 'BCA', 'M.A.'], sanctionedIntake: 720, pendingConditions: 0, contactPrincipal: 'Dr. R.P. Singh', district_code: 'GWL', lat: 26.2183, lng: 78.1828 },
  { collegeCode: 'RDU-AC-047', collegeName: 'Shri Ram College of Commerce, Northfield', district: 'Northfield', type: 'private_unaided', gender: 'co-ed', affiliatedSince: '1998', validUpto: '30-09-2024', status: 'conditional', programmes: ['B.Com.', 'BBA'], sanctionedIntake: 240, pendingConditions: 2, contactPrincipal: 'Sh. A.K. Sharma', district_code: 'MOR', lat: 26.4979, lng: 78.0008 },
  { collegeCode: 'RDU-AC-089', collegeName: 'Indira Gandhi Mahila MV, Westfield', district: 'Westfield', type: 'private_aided', gender: 'women', affiliatedSince: '2003', validUpto: '31-03-2025', status: 'affiliated', programmes: ['B.A.', 'B.Sc.', 'B.Sc. CS'], sanctionedIntake: 360, pendingConditions: 0, contactPrincipal: 'Dr. S. Mishra', district_code: 'SHP', lat: 25.4338, lng: 77.6588 },
  { collegeCode: 'RDU-AC-203', collegeName: 'Vivekananda Degree College, Eastwood', district: 'Eastwood', type: 'private_unaided', gender: 'co-ed', affiliatedSince: '2024', validUpto: '31-03-2025', status: 'conditional', programmes: ['B.A.', 'B.Com.'], sanctionedIntake: 120, pendingConditions: 3, contactPrincipal: 'Sh. R.K. Tomar', district_code: 'BHD', lat: 26.5615, lng: 78.7792 },
];

export const DISTRICT_STATS: Record<string, { total: number; affiliated: number; conditional: number; lapsed: number }> = {
  'Demo City': { total: 92, affiliated: 88, conditional: 3, lapsed: 1 },
  Northfield: { total: 48, affiliated: 43, conditional: 4, lapsed: 1 },
  Eastwood: { total: 41, affiliated: 36, conditional: 4, lapsed: 1 },
  Westfield: { total: 37, affiliated: 34, conditional: 2, lapsed: 1 },
  Guna: { total: 29, affiliated: 26, conditional: 2, lapsed: 1 },
  Southgate: { total: 24, affiliated: 22, conditional: 2, lapsed: 0 },
  Riverside: { total: 68, affiliated: 65, conditional: 3, lapsed: 0 },
  Other: { total: 181, affiliated: 170, conditional: 9, lapsed: 2 },
};

// ─── ACCREDITATION ────────────────────────────────────────────────────────────

export interface NAACCriterion {
  criterion: string;
  title: string;
  metrics: Array<{
    metric: string;
    description: string;
    source: 'live_data' | 'manual' | 'partial';
    liveValue?: string;
    targetValue?: string;
    manualValue?: string;
    evidenceRequired: string;
    evidenceAttached: boolean;
    gapNote?: string;
  }>;
}

export const NAAC_CRITERIA: NAACCriterion[] = [
  {
    criterion: '1',
    title: 'Curricular Aspects',
    metrics: [
      { metric: '1.1.1', description: 'Programmes aligned with NEP 2020', source: 'manual', targetValue: '100%', evidenceRequired: 'BOS minutes, curriculum documents', evidenceAttached: true },
      { metric: '1.2.1', description: 'Certificate/Diploma/Add-on programmes offered', source: 'live_data', liveValue: '47 programmes across 94 departments', targetValue: '≥ 30', evidenceRequired: 'Programme list from academic module', evidenceAttached: true },
      { metric: '1.3.2', description: 'Students undertaking project work / field work', source: 'live_data', liveValue: '18,240 students (38%)', evidenceRequired: 'Enrolment data + project registration', evidenceAttached: false, gapNote: 'Project registration module data not yet tagged' },
    ],
  },
  {
    criterion: '2',
    title: 'Teaching-Learning and Evaluation',
    metrics: [
      { metric: '2.1.1', description: 'Enrolment percentage', source: 'live_data', liveValue: '48,240 / 52,000 sanctioned = 92.8%', targetValue: '≥ 80%', evidenceRequired: 'Admission module data', evidenceAttached: true },
      { metric: '2.2.1', description: 'Student-teacher ratio', source: 'live_data', liveValue: '32:1 (UG), 18:1 (PG)', targetValue: '≤ 30:1', evidenceRequired: 'HR module + enrolment', evidenceAttached: true },
      { metric: '2.6.3', description: 'Pass percentage of students', source: 'live_data', liveValue: '86.0% (Nov 2023)', targetValue: '≥ 80%', evidenceRequired: 'Result processing module', evidenceAttached: true },
    ],
  },
  {
    criterion: '3',
    title: 'Research, Innovations and Extension',
    metrics: [
      { metric: '3.1.1', description: 'Grants received from Govt./non-Govt.', source: 'manual', manualValue: '₹4.2 crore (2023-24)', evidenceRequired: 'Grant sanction letters, UC', evidenceAttached: false, gapNote: 'MoU/Grants module data to be pulled once wired' },
      { metric: '3.3.1', description: 'Sanctioned posts of teaching staff filled', source: 'live_data', liveValue: '1,842 / 2,100 sanctioned = 87.7%', evidenceRequired: 'HR module roster', evidenceAttached: true },
    ],
  },
  {
    criterion: '5',
    title: 'Student Support and Progression',
    metrics: [
      { metric: '5.1.1', description: 'Students benefited by scholarships', source: 'live_data', liveValue: '14,820 students (MP OBC + NSP + SC)', targetValue: '≥ 20%', evidenceRequired: 'Scholarship module disbursement data', evidenceAttached: true },
      { metric: '5.2.1', description: 'Placement percentage', source: 'live_data', liveValue: '62% (placed / eligible)', evidenceRequired: 'Placement module statistics', evidenceAttached: false, gapNote: 'Placement module NIRF export not yet configured' },
    ],
  },
];

export interface NIRFSubParam { code: string; label: string; source: string; value: string | null; note?: string }
export interface NIRFParameter { param: string; title: string; subParams: NIRFSubParam[] }
export const NIRF_PARAMETERS: NIRFParameter[] = [
  { param: 'TLR', title: 'Teaching, Learning & Resources', subParams: [
    { code: 'SS', label: 'Student Strength', source: 'live_data', value: '48,240' },
    { code: 'FSR', label: 'Faculty-Student Ratio', source: 'live_data', value: '1:32' },
    { code: 'FQE', label: 'Combined Metric for Faculty Qualification', source: 'manual', value: null, note: 'Needs PhD percentage entry' },
    { code: 'FRU', label: 'Financial Resources and Utilisation', source: 'manual', value: null, note: 'Budget utilisation data needed' },
  ]},
  { param: 'RPC', title: 'Research and Professional Practice', subParams: [
    { code: 'PU', label: 'Publications', source: 'manual', value: '428', note: 'Manually entered from Scopus/WoS' },
    { code: 'QP', label: 'Quality of Publications', source: 'manual', value: null, note: 'h-index data pending' },
    { code: 'IPR', label: 'IPR and Patents', source: 'manual', value: '12 patents filed', note: '' },
    { code: 'FPPP', label: 'Footprint of Projects & Professional Practice', source: 'manual', value: null, note: 'Grant data to be updated from finance module' },
  ]},
  { param: 'GO', title: 'Graduation Outcomes', subParams: [
    { code: 'GPH', label: 'PhD Students Graduated', source: 'live_data', value: '84' },
    { code: 'GUE', label: 'Undergrad Exam Pass Rate', source: 'live_data', value: '86%' },
    { code: 'GPHD', label: 'Placement & Higher Studies', source: 'live_data', value: '62%' },
  ]},
];

// ─── PROCUREMENT ──────────────────────────────────────────────────────────────

export type TenderStatus = 'draft' | 'published' | 'corrigendum' | 'bid_open' | 'evaluation' | 'awarded' | 'cancelled';

export interface Tender {
  id: string;
  title: string;
  category: 'works' | 'goods' | 'services' | 'consulting';
  estimatedValue: number;
  publishedOn?: string;
  bidDeadline?: string;
  openingDate?: string;
  status: TenderStatus;
  bidsReceived: number;
  awardedTo?: string;
  awardedValue?: number;
  corrigendumCount: number;
}

export const TENDERS: Tender[] = [
  { id: 'RDU/TND/2024/089', title: 'Supply and installation of 200 desktop computers for computer labs', category: 'goods', estimatedValue: 4800000, publishedOn: '01-09-2024', bidDeadline: '25-09-2024', openingDate: '26-09-2024', status: 'bid_open', bidsReceived: 7, corrigendumCount: 1 },
  { id: 'RDU/TND/2024/072', title: 'Construction of new examination hall — Block B extension', category: 'works', estimatedValue: 18500000, publishedOn: '10-08-2024', bidDeadline: '10-09-2024', openingDate: '11-09-2024', status: 'evaluation', bidsReceived: 4, corrigendumCount: 0 },
  { id: 'RDU/TND/2024/054', title: 'Annual maintenance contract — CCTV and access control systems', category: 'services', estimatedValue: 850000, publishedOn: '15-07-2024', bidDeadline: '05-08-2024', status: 'awarded', bidsReceived: 6, awardedTo: 'Secure Systems Pvt Ltd, Demo City', awardedValue: 742000, corrigendumCount: 0 },
  { id: 'RDU/TND/2024/041', title: 'Supply of library books (2024-25) — all departments', category: 'goods', estimatedValue: 2200000, publishedOn: '20-06-2024', bidDeadline: '15-07-2024', status: 'awarded', bidsReceived: 9, awardedTo: 'Academic Book Suppliers, New Delhi', awardedValue: 1986000, corrigendumCount: 2 },
  { id: 'RDU/TND/2024/095', title: 'Cloud hosting and bandwidth upgrade — 5-year contract', category: 'services', estimatedValue: 12000000, publishedOn: undefined, bidDeadline: undefined, status: 'draft', bidsReceived: 0, corrigendumCount: 0 },
];

export interface Vendor {
  id: string;
  name: string;
  gst: string;
  pan: string;
  category: string[];
  status: 'applied' | 'under_review' | 'empanelled' | 'blacklisted' | 'expired';
  empanelledOn?: string;
  validUpto?: string;
  documentsVerified: boolean;
  performanceRating?: number; // out of 5
}

export const VENDORS: Vendor[] = [
  { id: 'VND/001', name: 'Secure Systems Pvt Ltd', gst: '23AAACS1234A1Z5', pan: 'AAACS1234A', category: ['IT Services', 'Security Systems'], status: 'empanelled', empanelledOn: '01-04-2022', validUpto: '31-03-2025', documentsVerified: true, performanceRating: 4.2 },
  { id: 'VND/002', name: 'Academic Book Suppliers', gst: '07AAACA5678B2Z1', pan: 'AAACA5678B', category: ['Books & Publications'], status: 'empanelled', empanelledOn: '01-04-2023', validUpto: '31-03-2026', documentsVerified: true, performanceRating: 4.7 },
  { id: 'VND/003', name: 'TechEdge Solutions, Demo City', gst: '23AAACT9012C3Z8', pan: 'AAACT9012C', category: ['Computer Hardware', 'Networking'], status: 'under_review', documentsVerified: false },
  { id: 'VND/004', name: 'Sunrise Construction', gst: '23AAACS3456D4Z2', pan: 'AAACS3456D', category: ['Civil Works'], status: 'blacklisted', documentsVerified: true, performanceRating: 1.8 },
];

// ─── FINANCE ──────────────────────────────────────────────────────────────────

export interface BudgetHead {
  code: string;
  title: string;
  category: 'revenue' | 'capital';
  allocation: number;
  sanctioned: number;
  spent: number;
  committed: number;
}

export const BUDGET_HEADS: BudgetHead[] = [
  { code: 'A01-SAL', title: 'Salaries — Teaching Staff', category: 'revenue', allocation: 125000000, sanctioned: 125000000, spent: 74280000, committed: 50720000 },
  { code: 'A02-SAL', title: 'Salaries — Non-Teaching Staff', category: 'revenue', allocation: 48000000, sanctioned: 48000000, spent: 28800000, committed: 19200000 },
  { code: 'B01-INFRA', title: 'Infrastructure — New Construction', category: 'capital', allocation: 85000000, sanctioned: 62000000, spent: 18500000, committed: 43500000 },
  { code: 'B02-EQUIP', title: 'Equipment — Computers & Labs', category: 'capital', allocation: 22000000, sanctioned: 18000000, spent: 4800000, committed: 13200000 },
  { code: 'A03-LIB', title: 'Library & Books', category: 'revenue', allocation: 5000000, sanctioned: 5000000, spent: 1986000, committed: 3014000 },
  { code: 'A04-EXAM', title: 'Examination Expenses', category: 'revenue', allocation: 12000000, sanctioned: 12000000, spent: 7200000, committed: 4800000 },
  { code: 'A05-MISC', title: 'Miscellaneous & Contingency', category: 'revenue', allocation: 8000000, sanctioned: 6000000, spent: 2400000, committed: 3600000 },
];

// ─── HR & PAYROLL ─────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  designation: string;
  department: string;
  employeeType: 'teaching' | 'non_teaching' | 'contractual';
  joiningDate: string;
  dob: string;
  category: string;
  payScale: string;
  basicPay: number;
  pf: number;
  hra: number;
  da: number;
  grossPay: number;
  status: 'active' | 'on_leave' | 'retired' | 'terminated';
  leaveBalance: { el: number; cl: number; sl: number; ml: number };
}

export const EMPLOYEES: Employee[] = [
  { id: 'EMP/001', name: 'Prof. K.D. Verma', designation: 'Professor', department: 'Computer Science', employeeType: 'teaching', joiningDate: '01-08-1998', dob: '15-06-1965', category: 'General', payScale: '7th CPC — Level 14', basicPay: 144200, pf: 17304, hra: 28840, da: 50470, grossPay: 223510, status: 'active', leaveBalance: { el: 180, cl: 8, sl: 14, ml: 0 } },
  { id: 'EMP/002', name: 'Dr. Sunita Saxena', designation: 'Associate Professor', department: 'Mathematics', employeeType: 'teaching', joiningDate: '15-03-2005', dob: '22-09-1978', category: 'OBC', payScale: '7th CPC — Level 13A', basicPay: 131400, pf: 15768, hra: 26280, da: 45990, grossPay: 203670, status: 'active', leaveBalance: { el: 120, cl: 10, sl: 20, ml: 180 } },
  { id: 'EMP/003', name: 'Sh. Ramesh Patel', designation: 'Office Superintendent', department: 'Administration', employeeType: 'non_teaching', joiningDate: '01-01-2002', dob: '10-03-1972', category: 'OBC', payScale: '7th CPC — Level 8', basicPay: 47600, pf: 5712, hra: 9520, da: 16660, grossPay: 73780, status: 'active', leaveBalance: { el: 290, cl: 12, sl: 18, ml: 0 } },
];

// The RTI register moved to the API in Phase 8; see src/lib/rtiqueries.ts.

// ─── ASSETS ───────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  category: 'furniture' | 'it_equipment' | 'lab_equipment' | 'vehicle' | 'building' | 'other';
  department: string;
  purchaseDate: string;
  purchaseValue: number;
  currentValue: number;
  depreciationRate: number;
  condition: 'good' | 'fair' | 'poor' | 'condemned';
  amcExpiry?: string;
  location: string;
  tagNo: string;
}

export const ASSETS: Asset[] = [
  { id: 'AST/001', name: 'Dell OptiPlex 7090 Desktop', category: 'it_equipment', department: 'Computer Science', purchaseDate: '15-03-2022', purchaseValue: 52000, currentValue: 32000, depreciationRate: 20, condition: 'good', amcExpiry: '14-03-2025', location: 'Lab 1, CS Block', tagNo: 'RDU/IT/2022/0147' },
  { id: 'AST/002', name: 'Tata Safari (GJ-27-BA-1234)', category: 'vehicle', department: 'VC Office', purchaseDate: '01-07-2020', purchaseValue: 1850000, currentValue: 850000, depreciationRate: 15, condition: 'good', amcExpiry: '30-06-2025', location: 'VC Garage', tagNo: 'RDU/VEH/2020/003' },
  { id: 'AST/003', name: 'Projector — Epson EB-X51', category: 'it_equipment', department: 'Examination', purchaseDate: '10-08-2019', purchaseValue: 35000, currentValue: 8000, depreciationRate: 25, condition: 'fair', location: 'Examination Hall B', tagNo: 'RDU/IT/2019/0089' },
  { id: 'AST/004', name: 'Spectrophotometer — Shimadzu UV-1800', category: 'lab_equipment', department: 'Chemistry', purchaseDate: '20-11-2021', purchaseValue: 420000, currentValue: 280000, depreciationRate: 10, condition: 'good', amcExpiry: '19-11-2024', location: 'Chemistry Lab 3', tagNo: 'RDU/LAB/2021/0234' },
];

// ─── PLACEMENT ────────────────────────────────────────────────────────────────

export interface PlacementDrive {
  id: string;
  company: string;
  sector: string;
  role: string;
  package: string; // e.g., "4.5 LPA"
  packageValue: number; // in LPA
  location: string;
  driveDate: string;
  eligibilityCriteria: string;
  minCGPA: number;
  backlogsAllowed: number;
  programmes: string[];
  eligibleCount: number;
  appliedCount: number;
  shortlistedCount: number;
  selectedCount: number;
  offerAccepted: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
}

export const PLACEMENT_DRIVES: PlacementDrive[] = [
  { id: 'PLC/2024/001', company: 'Infosys Ltd', sector: 'IT/Software', role: 'Systems Engineer', package: '4.5 LPA', packageValue: 4.5, location: 'Pune / Bengaluru', driveDate: '15-10-2024', eligibilityCriteria: 'BCA/B.Sc. CS/IT, CGPA ≥ 6.5, No active backlogs', minCGPA: 6.5, backlogsAllowed: 0, programmes: ['BCA', 'B.Sc. CS', 'B.Sc. IT'], eligibleCount: 1240, appliedCount: 892, shortlistedCount: 412, selectedCount: 0, offerAccepted: 0, status: 'upcoming' },
  { id: 'PLC/2024/002', company: 'HDFC Bank', sector: 'BFSI', role: 'Relationship Manager — Retail', package: '3.8 LPA', packageValue: 3.8, location: 'Demo City / Parkview', driveDate: '22-09-2024', eligibilityCriteria: 'B.Com./BBA, CGPA ≥ 5.5', minCGPA: 5.5, backlogsAllowed: 2, programmes: ['B.Com.', 'BBA', 'MBA'], eligibleCount: 3420, appliedCount: 1280, shortlistedCount: 340, selectedCount: 87, offerAccepted: 72, status: 'completed' },
  { id: 'PLC/2024/003', company: 'Wipro Technologies', sector: 'IT/Software', role: 'Project Engineer', package: '5.0 LPA', packageValue: 5.0, location: 'Hyderabad / Chennai', driveDate: '30-09-2024', eligibilityCriteria: 'BCA/MCA/B.Sc. CS, CGPA ≥ 7.0, No backlogs', minCGPA: 7.0, backlogsAllowed: 0, programmes: ['BCA', 'MCA', 'B.Sc. CS'], eligibleCount: 680, appliedCount: 540, shortlistedCount: 210, selectedCount: 62, offerAccepted: 58, status: 'active' },
];

export const PLACEMENT_STATS = {
  totalStudents: 48240,
  eligible: 32180,
  registered: 18420,
  placed: 11240,
  avgPackage: 4.2,
  highestPackage: 18.5,
  companiesVisited: 124,
  byProgramme: [
    { programme: 'MCA', eligible: 620, placed: 504, avgPkg: 6.8 },
    { programme: 'MBA', eligible: 480, placed: 384, avgPkg: 5.4 },
    { programme: 'BCA', eligible: 1840, placed: 1288, avgPkg: 4.5 },
    { programme: 'B.Com.', eligible: 4200, placed: 2310, avgPkg: 3.2 },
    { programme: 'B.Sc. CS', eligible: 2100, placed: 1260, avgPkg: 4.1 },
  ],
  packageBands: [
    { band: '< 3 LPA', count: 1840 },
    { band: '3–5 LPA', count: 6420 },
    { band: '5–8 LPA', count: 2480 },
    { band: '8–12 LPA', count: 420 },
    { band: '> 12 LPA', count: 80 },
  ],
};

// ─── ALUMNI ───────────────────────────────────────────────────────────────────

export interface AlumniProfile {
  id: string;
  name: string;
  rollNo: string;
  programme: string;
  passoutYear: number;
  college: string;
  currentRole: string;
  currentOrg: string;
  location: string;
  linkedin?: string;
  mentorshipAvailable: boolean;
  donationTotal: number;
}

export const ALUMNI_PROFILES: AlumniProfile[] = [
  { id: 'ALU/001', name: 'Ashish Mittal', rollNo: 'JU2010CS0045', programme: 'B.Sc. CS', passoutYear: 2013, college: 'Govt. Model College, GWL', currentRole: 'Engineering Manager', currentOrg: 'Microsoft India', location: 'Hyderabad', linkedin: 'linkedin.com/in/ashishmittal', mentorshipAvailable: true, donationTotal: 50000 },
  { id: 'ALU/002', name: 'Prerna Singh', rollNo: 'JU2008BA0189', programme: 'M.A. Hindi', passoutYear: 2012, college: 'Govt. Girls College, GWL', currentRole: 'IAS Officer (2015 Batch)', currentOrg: 'MP Government', location: 'Lakeside', mentorshipAvailable: false, donationTotal: 0 },
  { id: 'ALU/003', name: 'Sanjay Agarwal', rollNo: 'JU2005CO0078', programme: 'M.Com.', passoutYear: 2009, college: 'Govt. Madhav College, Riverside', currentRole: 'CFO', currentOrg: 'Ruchi Soya Industries', location: 'Mumbai', mentorshipAvailable: true, donationTotal: 200000 },
];

// ─── INCUBATION ───────────────────────────────────────────────────────────────

export interface Startup {
  id: string;
  name: string;
  founders: string[];
  sector: string;
  cohort: string;
  stage: 'ideation' | 'prototype' | 'pilot' | 'market' | 'growth';
  seatsAllocated: number;
  mentors: string[];
  grantReceived: number;
  lastMilestone: string;
  nextMilestone: string;
  demoDay?: string;
}

export const STARTUPS: Startup[] = [
  { id: 'INC/2023/04', name: 'KisanLink', founders: ['Arvind Patel (BCA 2022)', 'Sumit Yadav (MCA 2022)'], sector: 'AgriTech', cohort: 'Cohort 3 (2023)', stage: 'pilot', seatsAllocated: 3, mentors: ['Dr. A.K. Srivastava (IIT GWL)', 'Sh. V. Mehta (FICCI)'], grantReceived: 500000, lastMilestone: 'Signed MoU with 3 FPOs in Northfield district', nextMilestone: 'DPIIT startup recognition — due 30-Oct-2024', demoDay: '15-11-2024' },
  { id: 'INC/2024/02', name: 'EduSpark AI', founders: ['Neha Sharma (M.Sc. CS 2024)'], sector: 'EdTech', cohort: 'Cohort 4 (2024)', stage: 'prototype', seatsAllocated: 2, mentors: ['Prof. K.D. Verma (JU)', 'Ms. A. Joshi (Google India)'], grantReceived: 200000, lastMilestone: 'Working prototype of adaptive quiz engine', nextMilestone: 'Pilot with 500 BCA students — Nov 2024' },
];

// ─── MoU & GRANTS ─────────────────────────────────────────────────────────────

export interface MoU {
  id: string;
  partner: string;
  type: 'industry' | 'academic' | 'government' | 'international';
  purpose: string;
  signedOn: string;
  validUpto: string;
  status: 'active' | 'expiring_soon' | 'expired' | 'under_renewal';
  deliverables: Array<{ item: string; due: string; status: 'pending' | 'completed' | 'overdue' }>;
  nodal: string;
}

export const MOUS: MoU[] = [
  { id: 'MOU/2023/012', partner: 'Infosys Ltd', type: 'industry', purpose: 'Industry 4.0 curriculum development, internships, campus placement', signedOn: '15-03-2023', validUpto: '14-03-2026', status: 'active', nodal: 'Prof. K.D. Verma', deliverables: [
    { item: 'Industry-integrated curriculum for 3 programmes', due: '31-12-2023', status: 'completed' },
    { item: 'Faculty training workshop', due: '30-06-2024', status: 'completed' },
    { item: '100 internship placements', due: '31-12-2024', status: 'pending' },
  ]},
  { id: 'MOU/2022/007', partner: 'NIT (Demo)', type: 'academic', purpose: 'Joint research, PhD co-guidance, library resource sharing', signedOn: '01-07-2022', validUpto: '30-06-2025', status: 'active', nodal: 'Dr. S.P. Singh', deliverables: [
    { item: '5 joint research papers', due: '30-06-2024', status: 'overdue' },
    { item: 'Library access integration', due: '31-12-2023', status: 'completed' },
  ]},
  { id: 'MOU/2021/003', partner: 'MP Council of Science & Technology', type: 'government', purpose: 'Research grants, state-priority projects, STEM outreach', signedOn: '10-04-2021', validUpto: '09-04-2024', status: 'expired', nodal: 'Registrar', deliverables: [] },
];

export const RESEARCH_GRANTS = [
  { id: 'GRT/2024/001', title: 'AI-based crop disease detection for Bundelkhand region', agency: 'DST-SERB', piName: 'Dr. A.R. Jain', sanctionedAmount: 3500000, utilised: 1240000, ucDue: '31-03-2025', status: 'ongoing' },
  { id: 'GRT/2023/008', title: 'Groundwater quality assessment — river basin', agency: 'ICSSR', piName: 'Dr. N.K. Sharma', sanctionedAmount: 1200000, utilised: 1200000, ucDue: '30-09-2024', status: 'uc_pending' },
];

// ─── ADMISSION ENQUIRY ────────────────────────────────────────────────────────

export type EnquirySource = 'website' | 'walk_in' | 'phone' | 'campaign' | 'referral' | 'social';
export type EnquiryStatus = 'new' | 'contacted' | 'followup_scheduled' | 'application_started' | 'admitted' | 'not_interested' | 'unreachable';

export interface Enquiry {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  programme: string;
  source: EnquirySource;
  receivedOn: string;
  status: EnquiryStatus;
  counsellor?: string;
  nextFollowup?: string;
  notes?: string;
}

export const ENQUIRIES: Enquiry[] = [
  { id: 'ENQ/2024/04821', name: 'Harsh Rajput', mobile: '98260 34512', programme: 'BCA', source: 'website', receivedOn: '18-09-2024', status: 'followup_scheduled', counsellor: 'Ms. Rekha Sharma', nextFollowup: '21-09-2024', notes: 'Interested in fee waiver options. Father is a govt school teacher.' },
  { id: 'ENQ/2024/04809', name: 'Kavita Yadav', mobile: '94255 87621', programme: 'MBA', source: 'walk_in', receivedOn: '17-09-2024', status: 'application_started', counsellor: 'Sh. Ajay Tomar', notes: 'Has CAT score 82 percentile. Wants campus placement stats.' },
  { id: 'ENQ/2024/04756', name: 'Pradeep Kori', mobile: '70491 23456', programme: 'B.Sc. Physics', source: 'phone', receivedOn: '15-09-2024', status: 'contacted', counsellor: 'Ms. Rekha Sharma', nextFollowup: '22-09-2024' },
  { id: 'ENQ/2024/04712', name: 'Mamta Jatav', mobile: '88174 56789', programme: 'B.A.', source: 'campaign', receivedOn: '12-09-2024', status: 'admitted', counsellor: 'Sh. Ajay Tomar', notes: 'Admitted under SC category. Fee waiver applied.' },
];

export const ENQUIRY_CONVERSION = {
  total: 4821,
  contacted: 4102,
  applicationStarted: 2840,
  admitted: 1920,
  byCourse: [
    { programme: 'BCA', enquiries: 820, admitted: 388 },
    { programme: 'MBA', enquiries: 612, admitted: 241 },
    { programme: 'B.Com.', enquiries: 1240, admitted: 490 },
    { programme: 'B.A.', enquiries: 1850, admitted: 640 },
    { programme: 'M.Sc.', enquiries: 299, admitted: 161 },
  ],
  bySource: [
    { source: 'Website', count: 1842 },
    { source: 'Walk-in', count: 982 },
    { source: 'Campaign', count: 841 },
    { source: 'Phone', count: 720 },
    { source: 'Referral', count: 436 },
  ],
};

// ─── COMMUNICATION ────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  channels: string[];
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  scheduledFor?: string;
  sentAt?: string;
  deliveredCount?: number;
  readCount?: number;
  totalTargeted?: number;
}

export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'ANN/2024/0891', title: 'Nov 2024 Exam Forms — Last date extended to 25 September', body: 'In the interest of students, the last date for submission of examination forms for November 2024 Semester End Examination has been extended to 25-Sep-2024. No late fee will be charged. — Controller of Examinations', audience: 'All enrolled students — Nov 2024 Exam eligible', channels: ['in_app', 'email', 'sms', 'whatsapp'], status: 'sent', sentAt: '18-09-2024 09:00', deliveredCount: 46820, readCount: 38941, totalTargeted: 48240 },
  { id: 'ANN/2024/0876', title: 'Affiliation renewal documentation drive — all colleges', body: 'All affiliated colleges with renewal due before 31-Mar-2025 must submit complete documentation by 30-Oct-2024. Checklist available on portal.', audience: 'College Principals — renewal due ≤ 31-Mar-2025', channels: ['in_app', 'email'], status: 'sent', sentAt: '15-09-2024', deliveredCount: 184, readCount: 142, totalTargeted: 187 },
  { id: 'ANN/2024/0901', title: 'NIRF Data Submission deadline — 30 September 2024', body: 'All departments must complete manual NIRF data entry by 30-Sep-2024. Auto-populated fields have been pre-filled from live platform data.', audience: 'HODs + Registrar + Finance Office', channels: ['in_app', 'email'], status: 'scheduled', scheduledFor: '22-09-2024 08:00', totalTargeted: 97 },
];
