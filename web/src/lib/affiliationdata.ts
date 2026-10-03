// Affiliation Management data (demo data)

export type AffiliationType = 'new' | 'renewal' | 'additional_programme' | 'intake_increase';
export type AffiliationStatus = 'draft' | 'submitted' | 'fee_paid' | 'under_scrutiny' | 'objection_raised' | 'reply_received' | 'inspection_scheduled' | 'inspected' | 'committee_review' | 'loi_issued' | 'affiliated' | 'conditional' | 'rejected' | 'expired';

export interface AffiliationApplication {
  id: string;
  collegeCode: string;
  collegeName: string;
  district: string;
  type: AffiliationType;
  programme?: string;
  currentIntake?: number;
  proposedIntake?: number;
  academicYear: string;
  submittedOn: string;
  status: AffiliationStatus;
  feeAmount: number;
  feePaid: boolean;
  feeReceiptNo?: string;
  scrutinyOfficer?: string;
  objectionCount: number;
  inspectionDate?: string;
  committeeRecommendation?: 'approve' | 'conditional' | 'reject';
  conditions?: string[];
  affiliationOrderNo?: string;
  validUpto?: string;
}

export const AFFILIATION_APPLICATIONS: AffiliationApplication[] = [
  {
    id: 'AFF/2024/001',
    collegeCode: 'RDU-AC-042',
    collegeName: 'Shri Vinayak Mahavidyalaya, Dabra',
    district: 'Demo City',
    type: 'renewal',
    academicYear: '2025-26',
    submittedOn: '15-10-2024',
    status: 'inspection_scheduled',
    feeAmount: 15000,
    feePaid: true,
    feeReceiptNo: 'RDU/AFFL/FEE/2024/00891',
    scrutinyOfficer: 'Dr. R.K. Mishra',
    objectionCount: 2,
    inspectionDate: '28-11-2024',
  },
  {
    id: 'AFF/2024/002',
    collegeCode: 'RDU-AC-178',
    collegeName: 'the State College of Commerce, Northfield',
    district: 'Northfield',
    type: 'additional_programme',
    programme: 'B.Com. (Hons.)',
    academicYear: '2025-26',
    submittedOn: '01-11-2024',
    status: 'objection_raised',
    feeAmount: 12000,
    feePaid: true,
    feeReceiptNo: 'RDU/AFFL/FEE/2024/00934',
    scrutinyOfficer: 'Prof. S. Agarwal',
    objectionCount: 3,
  },
  {
    id: 'AFF/2024/003',
    collegeCode: 'RDU-AC-312',
    collegeName: 'Saraswati Shiksha Mahavidyalaya, Eastwood',
    district: 'Eastwood',
    type: 'new',
    programme: 'B.Sc. (Computer Science)',
    academicYear: '2025-26',
    submittedOn: '10-11-2024',
    status: 'fee_paid',
    feeAmount: 25000,
    feePaid: true,
    feeReceiptNo: 'RDU/AFFL/FEE/2024/00967',
    scrutinyOfficer: undefined,
    objectionCount: 0,
  },
  {
    id: 'AFF/2024/004',
    collegeCode: 'RDU-AC-089',
    collegeName: 'Govt. Degree College, Westfield',
    district: 'Westfield',
    type: 'intake_increase',
    programme: 'B.A.',
    currentIntake: 240,
    proposedIntake: 360,
    academicYear: '2025-26',
    submittedOn: '20-10-2024',
    status: 'committee_review',
    feeAmount: 8000,
    feePaid: true,
    feeReceiptNo: 'RDU/AFFL/FEE/2024/00812',
    scrutinyOfficer: 'Dr. V. Sharma',
    objectionCount: 1,
    inspectionDate: '10-11-2024',
    committeeRecommendation: 'conditional',
    conditions: [
      'Minimum 8 additional classrooms with seating for 40 each to be constructed within 6 months',
      'Additional library books: minimum 500 titles relevant to B.A. programme',
      'Compliance proof to be submitted by 30-04-2025',
    ],
  },
  {
    id: 'AFF/2023/287',
    collegeCode: 'RDU-AC-055',
    collegeName: 'Jankibai Bajaj Women’s College, Demo City',
    district: 'Demo City',
    type: 'renewal',
    academicYear: '2024-25',
    submittedOn: '12-09-2023',
    status: 'affiliated',
    feeAmount: 15000,
    feePaid: true,
    feeReceiptNo: 'RDU/AFFL/FEE/2023/00432',
    scrutinyOfficer: 'Dr. R.K. Mishra',
    objectionCount: 0,
    inspectionDate: '05-11-2023',
    committeeRecommendation: 'approve',
    affiliationOrderNo: 'RDU/AFFL/ORD/2024/0055',
    validUpto: '31-03-2026',
  },
];

export interface DocChecklist {
  id: string;
  name: string;
  required: boolean;
  applicableFor: AffiliationType[];
  uploaded: boolean;
  uploadedOn?: string;
  uploadedBy?: string;
  verificationStatus: 'pending' | 'verified' | 'objection';
  objectionRemark?: string;
  objectionOn?: string;
  replySubmitted?: boolean;
  replyRemark?: string;
}

export const DOCUMENT_CHECKLIST: DocChecklist[] = [
  { id: 'D01', name: 'Application Form (duly signed)', required: true, applicableFor: ['new','renewal','additional_programme','intake_increase'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D02', name: 'Trust/Society Registration Certificate', required: true, applicableFor: ['new','renewal'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D03', name: 'Land Documents (ownership/lease)', required: true, applicableFor: ['new'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'objection', objectionRemark: 'Lease deed is more than 10 years old — please submit current lease agreement or renewal.', objectionOn: '22-10-2024', replySubmitted: false },
  { id: 'D04', name: 'Building Completion Certificate', required: true, applicableFor: ['new'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D05', name: 'Faculty Appointment Orders (programme-wise)', required: true, applicableFor: ['new','additional_programme'], uploaded: true, uploadedOn: '16-10-2024', verificationStatus: 'objection', objectionRemark: 'Only 3 of 5 required faculty appointment orders submitted for B.Sc. CS. Missing: Data Structures and Algorithms, and DBMS faculty.', objectionOn: '23-10-2024', replySubmitted: true, replyRemark: 'Appointment orders for remaining 2 faculty submitted herewith. Selection was completed on 28-10-2024.' },
  { id: 'D06', name: 'Laboratory Equipment List with Invoice', required: true, applicableFor: ['new','additional_programme'], uploaded: false, verificationStatus: 'pending' },
  { id: 'D07', name: 'Library Catalogue (last 3 years accession)', required: true, applicableFor: ['new','renewal'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D08', name: 'Fire NOC', required: true, applicableFor: ['new','renewal'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D09', name: 'Sanitation Compliance Certificate', required: true, applicableFor: ['new','renewal'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D10', name: 'Fee Concession Policy for SC/ST/OBC', required: true, applicableFor: ['new','renewal'], uploaded: false, verificationStatus: 'pending' },
  { id: 'D11', name: 'Annual Report (last year)', required: false, applicableFor: ['renewal'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
  { id: 'D12', name: 'Undertaking — No government dues pending', required: true, applicableFor: ['new','renewal','additional_programme','intake_increase'], uploaded: true, uploadedOn: '15-10-2024', verificationStatus: 'verified' },
];

export interface InspectionCommitteeMember {
  name: string;
  designation: string;
  department: string;
  role: 'chair' | 'member' | 'observer';
  mobile: string;
}

export interface InspectionReport {
  applicationId: string;
  inspectionDate: string;
  venue: string;
  committeeChair: string;
  members: InspectionCommitteeMember[];
  sections: InspectionSection[];
  photos: InspectionPhoto[];
  recommendation: 'approve' | 'conditional' | 'reject' | null;
  remarks: string;
  submittedOn?: string;
}

export interface InspectionSection {
  id: string;
  title: string;
  items: InspectionItem[];
}

export interface InspectionItem {
  id: string;
  label: string;
  type: 'yesno' | 'text' | 'number' | 'rating';
  value: string | number | boolean | null;
  remark?: string;
  required: boolean;
}

export interface InspectionPhoto {
  id: string;
  caption: string;
  section: string;
  url?: string;
  takenAt?: string;
}

export const INSPECTION_REPORT: InspectionReport = {
  applicationId: 'AFF/2024/001',
  inspectionDate: '28-11-2024',
  venue: 'Shri Vinayak Mahavidyalaya, Dabra',
  committeeChair: 'Prof. M.L. Gupta (HOD, Computer Science)',
  members: [
    { name: 'Dr. Sunita Tiwari', designation: 'Associate Professor', department: 'Physics', role: 'member', mobile: '98267 44123' },
    { name: 'Dr. Rakesh Verma', designation: 'Deputy Registrar', department: 'Affiliation Section', role: 'member', mobile: '94251 77891' },
    { name: 'Shri P.K. Joshi', designation: 'Section Officer', department: 'Affiliation Section', role: 'observer', mobile: '70499 33456' },
  ],
  sections: [
    {
      id: 'INFRA',
      title: 'Infrastructure',
      items: [
        { id: 'I01', label: 'Total built-up area (sq. ft.)', type: 'number', value: 18500, required: true },
        { id: 'I02', label: 'Number of classrooms', type: 'number', value: 14, required: true },
        { id: 'I03', label: 'Seating capacity per classroom (avg)', type: 'number', value: 40, required: true },
        { id: 'I04', label: 'Adequate lighting and ventilation in classrooms', type: 'yesno', value: true, required: true },
        { id: 'I05', label: 'Separate toilets for boys/girls/staff', type: 'yesno', value: true, required: true },
        { id: 'I06', label: 'Ramp or lift for differently-abled', type: 'yesno', value: false, remark: 'Ramp under construction — estimated completion Feb 2025', required: true },
        { id: 'I07', label: 'Principal\'s office, staff room, examination hall', type: 'yesno', value: true, required: true },
      ],
    },
    {
      id: 'LAB',
      title: 'Laboratory & Equipment',
      items: [
        { id: 'L01', label: 'Number of computer labs', type: 'number', value: 2, required: true },
        { id: 'L02', label: 'Computers available (total)', type: 'number', value: 62, required: true },
        { id: 'L03', label: 'Internet connectivity (Mbps)', type: 'number', value: 100, required: true },
        { id: 'L04', label: 'UPS backup in labs', type: 'yesno', value: true, required: true },
        { id: 'L05', label: 'Lab equipment condition', type: 'rating', value: 4, required: true },
      ],
    },
    {
      id: 'FACULTY',
      title: 'Faculty & Staff',
      items: [
        { id: 'F01', label: 'Sanctioned faculty positions', type: 'number', value: 12, required: true },
        { id: 'F02', label: 'Faculty in position (present during visit)', type: 'number', value: 10, required: true },
        { id: 'F03', label: 'PhD holders in faculty', type: 'number', value: 6, required: true },
        { id: 'F04', label: 'Faculty appointment orders verified', type: 'yesno', value: true, required: true },
        { id: 'F05', label: 'Service book maintained for all employees', type: 'yesno', value: true, required: true },
      ],
    },
    {
      id: 'LIBRARY',
      title: 'Library',
      items: [
        { id: 'LIB01', label: 'Total books in library', type: 'number', value: 14200, required: true },
        { id: 'LIB02', label: 'Journals subscribed (current year)', type: 'number', value: 18, required: true },
        { id: 'LIB03', label: 'Library software (OPAC)', type: 'yesno', value: true, required: true },
        { id: 'LIB04', label: 'Reading room capacity', type: 'number', value: 60, required: true },
        { id: 'LIB05', label: 'E-library / digital resources access', type: 'yesno', value: false, remark: 'NDLI registration pending', required: false },
      ],
    },
  ],
  photos: [
    { id: 'P01', caption: 'Main entrance and building facade', section: 'INFRA' },
    { id: 'P02', caption: 'Computer Laboratory 1', section: 'LAB' },
    { id: 'P03', caption: 'Library reading room', section: 'LIBRARY' },
    { id: 'P04', caption: 'Principal office', section: 'INFRA' },
  ],
  recommendation: 'conditional',
  remarks: 'The institution has adequate basic infrastructure. Ramp for differently-abled is under construction. E-library access needs to be established. Faculty strength is satisfactory. Recommend conditional affiliation with 6-month compliance window.',
  submittedOn: '29-11-2024',
};

// Affiliation Register — all 520 colleges summary
export interface AffiliatedCollege {
  code: string;
  name: string;
  district: string;
  type: 'govt' | 'aided' | 'private';
  gender: 'co-ed' | 'women' | 'men';
  status: 'affiliated' | 'conditional' | 'expired' | 'suspended';
  programmes: string[];
  totalIntake: number;
  validUpto: string;
  pendingConditions: number;
  lat: number;
  lng: number;
}

export const AFFILIATED_COLLEGES: AffiliatedCollege[] = [
  { code: 'RDU-AC-001', name: 'Govt. Science College, Riverside', district: 'Riverside', type: 'govt', gender: 'co-ed', status: 'affiliated', programmes: ['B.Sc.','M.Sc.','B.Com.'], totalIntake: 480, validUpto: '31-03-2026', pendingConditions: 0, lat: 23.182, lng: 75.784 },
  { code: 'RDU-AC-002', name: 'Govt. Women’s College, Demo City', district: 'Demo City', type: 'govt', gender: 'women', status: 'affiliated', programmes: ['B.A.','B.Sc.','B.Com.','M.A.'], totalIntake: 720, validUpto: '31-03-2026', pendingConditions: 0, lat: 26.228, lng: 78.182 },
  { code: 'RDU-AC-003', name: 'Govt. Girls College of Excellence, Demo City', district: 'Demo City', type: 'govt', gender: 'co-ed', status: 'affiliated', programmes: ['BCA','MCA','B.Sc.','M.Sc.'], totalIntake: 360, validUpto: '31-03-2026', pendingConditions: 0, lat: 26.221, lng: 78.195 },
  { code: 'RDU-AC-042', name: 'Shri Vinayak Mahavidyalaya, Dabra', district: 'Demo City', type: 'private', gender: 'co-ed', status: 'affiliated', programmes: ['B.A.','B.Com.'], totalIntake: 240, validUpto: '31-03-2025', pendingConditions: 0, lat: 25.887, lng: 78.332 },
  { code: 'RDU-AC-089', name: 'Govt. Degree College, Westfield', district: 'Westfield', type: 'govt', gender: 'co-ed', status: 'conditional', programmes: ['B.A.','B.Sc.','B.Com.'], totalIntake: 360, validUpto: '31-03-2025', pendingConditions: 3, lat: 25.424, lng: 77.658 },
  { code: 'RDU-AC-101', name: 'Samarth College, Guna', district: 'Guna', type: 'private', gender: 'co-ed', status: 'affiliated', programmes: ['B.A.','B.Com.'], totalIntake: 180, validUpto: '31-03-2026', pendingConditions: 0, lat: 24.647, lng: 77.316 },
  { code: 'RDU-AC-178', name: 'MP College of Commerce, Northfield', district: 'Northfield', type: 'aided', gender: 'co-ed', status: 'affiliated', programmes: ['B.Com.','M.Com.'], totalIntake: 240, validUpto: '31-03-2025', pendingConditions: 1, lat: 26.497, lng: 77.998 },
  { code: 'RDU-AC-210', name: 'Bharat Mata Women’s College, Southgate', district: 'Southgate', type: 'private', gender: 'women', status: 'conditional', programmes: ['B.A.','B.Sc.'], totalIntake: 180, validUpto: '31-03-2025', pendingConditions: 2, lat: 25.671, lng: 78.459 },
  { code: 'RDU-AC-312', name: 'Saraswati Shiksha MV, Eastwood', district: 'Eastwood', type: 'private', gender: 'co-ed', status: 'affiliated', programmes: ['B.A.','B.Com.'], totalIntake: 240, validUpto: '31-03-2026', pendingConditions: 0, lat: 26.561, lng: 78.787 },
  { code: 'RDU-AC-401', name: 'Dev Bhoomi College, Lakeview', district: 'Lakeview', type: 'private', gender: 'co-ed', status: 'expired', programmes: ['B.A.'], totalIntake: 120, validUpto: '31-03-2024', pendingConditions: 5, lat: 24.573, lng: 77.732 },
];

export const DISTRICTS = ['Demo City','Northfield','Eastwood','Westfield','Guna','Southgate','Lakeview','Riverside','Agar Malwa','Shajapur'];

export const AFFILIATION_FEES: Record<AffiliationType, number> = {
  new: 25000,
  renewal: 15000,
  additional_programme: 12000,
  intake_increase: 8000,
};
