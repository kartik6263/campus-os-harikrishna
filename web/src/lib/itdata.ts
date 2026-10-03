import { inst, instPlace } from './institution';
// ─── Org Tree ─────────────────────────────────────────────────────────────────

export type OrgUnitType =
  | 'UNIVERSITY'
  | 'TEACHING_DEPARTMENT'
  | 'AFFILIATED_COLLEGE'
  | 'STUDY_CENTRE'
  | 'REGIONAL_CENTRE'
  | 'PROGRAMME'
  | 'SECTION'
  | 'BATCH';

export interface OrgNode {
  id: string;
  name: string;
  type: OrgUnitType;
  code: string;
  status: 'active' | 'inactive' | 'pending';
  head?: string;
  strength?: number;
  sanctioned?: number;
  children?: OrgNode[];
  district?: string;
  programmes?: number;
}

export const ORG_TREE: OrgNode = {
  id: 'JU',
  name: `${instPlace()}`,
  type: 'UNIVERSITY',
  code: 'RDU-0000',
  status: 'active',
  head: 'Prof. Suresh Kumar Sharma (Vice Chancellor)',
  strength: 482341,
  sanctioned: 500000,
  children: [
    {
      id: 'TD',
      name: 'Teaching Departments',
      type: 'TEACHING_DEPARTMENT',
      code: 'RDU-TD',
      status: 'active',
      strength: 18420,
      sanctioned: 20000,
      children: [
        { id: 'TD-PHY', name: 'Department of Physics', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-PHY', status: 'active', head: 'Dr. Ramesh Kumar Gupta', strength: 450, sanctioned: 480, programmes: 4 },
        { id: 'TD-CHE', name: 'Department of Chemistry', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-CHE', status: 'active', head: 'Dr. Sunita Mishra', strength: 380, sanctioned: 400, programmes: 3 },
        { id: 'TD-MAT', name: 'Department of Mathematics', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-MAT', status: 'active', head: 'Prof. Ajay Jain', strength: 620, sanctioned: 640, programmes: 5 },
        { id: 'TD-HIN', name: 'Department of Hindi', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-HIN', status: 'active', head: 'Prof. Radha Rani Verma', strength: 810, sanctioned: 900, programmes: 4 },
        { id: 'TD-ENG', name: 'Department of English', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-ENG', status: 'active', head: 'Dr. Pradeep Srivastava', strength: 540, sanctioned: 600, programmes: 3 },
        { id: 'TD-COM', name: 'Department of Commerce', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-COM', status: 'active', head: 'Dr. Meena Agarwal', strength: 920, sanctioned: 960, programmes: 4 },
        { id: 'TD-ECO', name: 'Department of Economics', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-ECO', status: 'active', head: 'Prof. K.L. Sharma', strength: 340, sanctioned: 360, programmes: 3 },
        { id: 'TD-LAW', name: 'School of Law', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-LAW', status: 'active', head: 'Dr. Anil Kumar Tiwari', strength: 290, sanctioned: 300, programmes: 2 },
        { id: 'TD-EDU', name: 'Department of Education', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-EDU', status: 'active', head: 'Dr. Poonam Gupta', strength: 480, sanctioned: 500, programmes: 3 },
        { id: 'TD-CS', name: 'Department of Computer Science', type: 'TEACHING_DEPARTMENT', code: 'RDU-TD-CS', status: 'active', head: 'Dr. Vivek Sharma', strength: 760, sanctioned: 800, programmes: 5 },
      ],
    },
    {
      id: 'AC',
      name: 'Affiliated Colleges',
      type: 'AFFILIATED_COLLEGE',
      code: 'RDU-AC',
      status: 'active',
      strength: 463921,
      sanctioned: 480000,
      children: [
        { id: 'AC-001', name: 'Govt. Science College, Riverside', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-001', status: 'active', head: 'Dr. S.K. Pathak', strength: 1240, sanctioned: 1400, district: 'Riverside', programmes: 8 },
        { id: 'AC-002', name: 'Govt. Women’s College, Demo City', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-002', status: 'active', head: 'Dr. Anita Kushwah', strength: 890, sanctioned: 1000, district: 'Demo City', programmes: 6 },
        { id: 'AC-003', name: 'Govt. Girls College of Excellence, Demo City', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-003', status: 'active', head: 'Dr. Rajesh Tomar', strength: 2100, sanctioned: 2400, district: 'Demo City', programmes: 12 },
        { id: 'AC-004', name: 'Govt. Arts College, Demo City', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-004', status: 'active', head: 'Dr. Preeti Sharma', strength: 760, sanctioned: 800, district: 'Demo City', programmes: 7 },
        { id: 'AC-005', name: 'Govt. Degree College, Northfield', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-005', status: 'active', head: 'Dr. H.S. Bhadoria', strength: 540, sanctioned: 600, district: 'Northfield', programmes: 5 },
        { id: 'AC-006', name: 'Govt. Degree College, Eastwood', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-006', status: 'pending', head: 'Dr. Ravi Sharma', strength: 480, sanctioned: 500, district: 'Eastwood', programmes: 4 },
        { id: 'AC-007', name: 'Govt. Degree College, Westfield', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-007', status: 'active', head: 'Dr. Meenakshi Jain', strength: 610, sanctioned: 640, district: 'Westfield', programmes: 5 },
        { id: 'AC-008', name: 'Govt. Degree College, Southgate', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-008', status: 'active', head: 'Dr. O.P. Verma', strength: 390, sanctioned: 400, district: 'Southgate', programmes: 3 },
        { id: 'AC-009', name: 'Govt. Degree College, Guna', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-009', status: 'inactive', head: '—', strength: 0, sanctioned: 400, district: 'Guna', programmes: 3 },
        { id: 'AC-010', name: 'Bajaj Women’s College, Demo City', type: 'AFFILIATED_COLLEGE', code: 'RDU-AC-010', status: 'active', head: 'Dr. Vandana Agarwal', strength: 980, sanctioned: 1000, district: 'Demo City', programmes: 6 },
      ],
    },
    {
      id: 'SC',
      name: 'Study Centres',
      type: 'STUDY_CENTRE',
      code: 'RDU-SC',
      status: 'active',
      strength: 0,
      sanctioned: 0,
      children: [
        { id: 'SC-001', name: 'Study Centre — Demo City East', type: 'STUDY_CENTRE', code: 'RDU-SC-001', status: 'active', strength: 120, sanctioned: 200, programmes: 2 },
        { id: 'SC-002', name: 'Study Centre — Eastwood District', type: 'STUDY_CENTRE', code: 'RDU-SC-002', status: 'active', strength: 85, sanctioned: 150, programmes: 1 },
      ],
    },
  ],
};

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'locked' | 'pending' | 'deactivated';
export type UserRole = 'Student' | 'Faculty' | 'HOD' | 'Principal' | 'Exam Controller' | 'Accounts Clerk' | 'Hostel Warden' | 'IT Cell Admin' | 'Registrar' | 'College Admin';

export interface ITUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  orgUnit: string;
  orgCode: string;
  status: UserStatus;
  lastLogin: string;
  createdAt: string;
  credentialSent: boolean;
  mfaEnabled: boolean;
  failedAttempts: number;
}

export const USERS: ITUser[] = [
  { id: 'USR-00001', name: 'Priya Sharma', email: 'priya.sharma.rdu2021cs0234@demo.resolion.edu', mobile: '98264 43178', role: 'Student', orgUnit: 'Govt. Women’s College, Demo City', orgCode: 'RDU-AC-002', status: 'active', lastLogin: '19-09-2024 09:14', createdAt: '12-08-2021', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00002', name: 'Rahul Verma', email: 'rahul.verma.rdu2022ba0891@demo.resolion.edu', mobile: '94251 78023', role: 'Student', orgUnit: 'Govt. DC, Northfield', orgCode: 'RDU-AC-005', status: 'active', lastLogin: '18-09-2024 17:32', createdAt: '10-08-2022', credentialSent: true, mfaEnabled: false, failedAttempts: 1 },
  { id: 'USR-00003', name: 'Dr. Ramesh Kumar Gupta', email: 'r.k.gupta@demo.resolion.edu', mobile: '94255 12034', role: 'Faculty', orgUnit: 'Govt. Girls College, GWL', orgCode: 'RDU-AC-003', status: 'active', lastLogin: '19-09-2024 08:45', createdAt: '12-08-2009', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00004', name: 'Dr. Anita Kushwah', email: 'principal.ac002@demo.resolion.edu', mobile: '98271 56012', role: 'Principal', orgUnit: 'Govt. Women’s College, Demo City', orgCode: 'RDU-AC-002', status: 'active', lastLogin: '19-09-2024 10:02', createdAt: '01-07-2018', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00005', name: 'Smt. Kavita Shrivastava', email: 'registrar@demo.resolion.edu', mobile: '94255 99001', role: 'Registrar', orgUnit: `${inst().name}`, orgCode: 'RDU-0000', status: 'active', lastLogin: '19-09-2024 11:15', createdAt: '15-01-2020', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00006', name: 'Vikram Singh Tomar', email: 'v.tomar.rdu2022ph0078@demo.resolion.edu', mobile: '88175 30291', role: 'Student', orgUnit: 'Govt. DC, Eastwood', orgCode: 'RDU-AC-006', status: 'locked', lastLogin: '10-09-2024 14:00', createdAt: '08-08-2022', credentialSent: true, mfaEnabled: false, failedAttempts: 5 },
  { id: 'USR-00007', name: 'Deepika Jain', email: 'deepika.jain.rdu2021ma0112@demo.resolion.edu', mobile: '99773 22014', role: 'Student', orgUnit: 'Govt. Madhav Sci, Riverside', orgCode: 'RDU-AC-001', status: 'active', lastLogin: '17-09-2024 16:44', createdAt: '05-08-2021', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00008', name: 'Suresh Patel', email: 'accounts.ac003@demo.resolion.edu', mobile: '70490 11200', role: 'Accounts Clerk', orgUnit: 'Govt. Girls College, GWL', orgCode: 'RDU-AC-003', status: 'active', lastLogin: '19-09-2024 09:30', createdAt: '22-03-2015', credentialSent: true, mfaEnabled: false, failedAttempts: 0 },
  { id: 'USR-00009', name: 'Neha Yadav', email: 'neha.yadav.rdu2023sc0412@demo.resolion.edu', mobile: '78011 34567', role: 'Student', orgUnit: 'Govt. DC, Westfield', orgCode: 'RDU-AC-007', status: 'pending', lastLogin: '—', createdAt: '11-08-2023', credentialSent: false, mfaEnabled: false, failedAttempts: 0 },
  { id: 'USR-00010', name: 'Prof. Ajay Jain', email: 'hod.maths@demo.resolion.edu', mobile: '94251 77890', role: 'HOD', orgUnit: 'Dept. of Mathematics', orgCode: 'RDU-TD-MAT', status: 'active', lastLogin: '18-09-2024 15:22', createdAt: '01-06-2010', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00011', name: 'Manish Dubey', email: 'warden.hostel1@demo.resolion.edu', mobile: '88175 00123', role: 'Hostel Warden', orgUnit: `${inst().name}`, orgCode: 'RDU-0000', status: 'active', lastLogin: '19-09-2024 07:15', createdAt: '14-09-2017', credentialSent: true, mfaEnabled: false, failedAttempts: 0 },
  { id: 'USR-00012', name: 'Ritu Soni', email: 'exam.ctrl@demo.resolion.edu', mobile: '94255 44320', role: 'Exam Controller', orgUnit: `${inst().name}`, orgCode: 'RDU-0000', status: 'active', lastLogin: '19-09-2024 10:45', createdAt: '22-07-2016', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00013', name: 'Amit Saxena', email: 'it.admin@demo.resolion.edu', mobile: '98264 00001', role: 'IT Cell Admin', orgUnit: `${inst().name}`, orgCode: 'RDU-0000', status: 'active', lastLogin: '19-09-2024 11:30', createdAt: '01-04-2019', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00014', name: 'Sunita Patel', email: 'sunita.patel.rdu2020co0045@demo.resolion.edu', mobile: '70490 12345', role: 'Student', orgUnit: 'Govt. Girls College, GWL', orgCode: 'RDU-AC-003', status: 'active', lastLogin: '19-09-2024 08:00', createdAt: '06-08-2020', credentialSent: true, mfaEnabled: true, failedAttempts: 0 },
  { id: 'USR-00015', name: 'College Admin — AC006', email: 'admin.ac006@demo.resolion.edu', mobile: '94251 99034', role: 'College Admin', orgUnit: 'Govt. DC, Eastwood', orgCode: 'RDU-AC-006', status: 'pending', lastLogin: '—', createdAt: '14-09-2024', credentialSent: false, mfaEnabled: false, failedAttempts: 0 },
];

// ─── Roles & Permissions ──────────────────────────────────────────────────────

export const ROLE_TEMPLATES = [
  { id: 'student', name: 'Student', desc: 'Read own academic, financial, and certificate records', users: 482341 },
  { id: 'faculty', name: 'Faculty', desc: 'Mark attendance, enter marks, view class lists', users: 14820 },
  { id: 'hod', name: 'HOD', desc: 'Department-level management, approve marks, leave', users: 310 },
  { id: 'principal', name: 'Principal', desc: 'College-level admin, staff management, compliance', users: 520 },
  { id: 'exam_ctrl', name: 'Exam Controller', desc: 'Schedule exams, publish results, issue certificates', users: 8 },
  { id: 'accounts', name: 'Accounts Clerk', desc: 'Fee entry, receipts, finance reports at college level', users: 620 },
  { id: 'warden', name: 'Hostel Warden', desc: 'Hostel allotment, mess, attendance', users: 42 },
  { id: 'college_admin', name: 'College Admin', desc: 'Provision students and staff for own college', users: 520 },
  { id: 'registrar', name: 'Registrar', desc: 'University-wide admin except system config', users: 3 },
  { id: 'it_admin', name: 'IT Cell Admin', desc: 'Full system access including config, audit, and impersonation', users: 6 },
];

export const MODULES = [
  'Admissions', 'Examinations', 'Fee Management', 'Hostel', 'Library',
  'Certificates', 'HR & Payroll', 'Reports & Compliance', 'System Config', 'Audit Log',
];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'publish', 'export'];

export type PermValue = 'allow' | 'deny' | 'inherit';

// Default matrix for each role template (simplified)
export const ROLE_DEFAULTS: Record<string, Record<string, Record<string, PermValue>>> = {
  student: Object.fromEntries(MODULES.map(m => [m, Object.fromEntries(ACTIONS.map(a => [a, m === 'Admissions' && a === 'view' ? 'allow' : m === 'Fee Management' && (a === 'view' || a === 'create') ? 'allow' : m === 'Certificates' && a === 'view' ? 'allow' : m === 'Examinations' && a === 'view' ? 'allow' : 'deny']))])),
  faculty: Object.fromEntries(MODULES.map(m => [m, Object.fromEntries(ACTIONS.map(a => [a, m === 'Examinations' && (a === 'view' || a === 'edit') ? 'allow' : m === 'Admissions' && a === 'view' ? 'allow' : 'deny']))])),
  it_admin: Object.fromEntries(MODULES.map(m => [m, Object.fromEntries(ACTIONS.map(a => [a, 'allow']))])),
  registrar: Object.fromEntries(MODULES.map(m => [m, Object.fromEntries(ACTIONS.map(a => [a, m === 'System Config' ? 'deny' : 'allow']))])),
};

// ─── Workflows ────────────────────────────────────────────────────────────────

export type WorkflowTrigger =
  | 'certificate_request'
  | 'hostel_application'
  | 'fee_waiver_request'
  | 'affiliation_renewal'
  | 'exam_form_correction'
  | 'leave_application'
  | 'result_publication';

export interface WorkflowStep {
  id: string;
  type: 'approver' | 'notification' | 'condition';
  role?: string;
  scope?: string;
  sla?: number;
  escalateTo?: string;
  notifyOn?: string[];
  condition?: string;
  label: string;
}

export interface Workflow {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  version: number;
  enabled: boolean;
  orgUnit: string;
  steps: WorkflowStep[];
  createdBy: string;
  updatedAt: string;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'WF-001',
    name: 'Migration Certificate Approval',
    trigger: 'certificate_request',
    version: 3,
    enabled: true,
    orgUnit: 'University-wide',
    createdBy: 'Smt. Kavita Shrivastava',
    updatedAt: '15-08-2024',
    steps: [
      { id: 's1', type: 'approver', role: 'College Admin', scope: 'OWN_COLLEGE', sla: 2, escalateTo: 'Principal', notifyOn: ['approve', 'reject', 'escalate'], label: 'College Verification' },
      { id: 's2', type: 'approver', role: 'Accounts Clerk', scope: 'OWN_COLLEGE', sla: 1, escalateTo: 'Principal', notifyOn: ['approve', 'reject'], label: 'Dues Clearance' },
      { id: 's3', type: 'approver', role: 'Exam Controller', scope: 'UNIVERSITY_WIDE', sla: 5, escalateTo: 'Registrar', notifyOn: ['approve', 'reject', 'escalate'], label: 'Exam Section Sign-off' },
      { id: 's4', type: 'notification', notifyOn: ['sms', 'email', 'portal'], label: 'Student Notification' },
    ],
  },
  {
    id: 'WF-002',
    name: 'Hostel Allotment',
    trigger: 'hostel_application',
    version: 1,
    enabled: true,
    orgUnit: 'University-wide',
    createdBy: 'Amit Saxena',
    updatedAt: '01-07-2024',
    steps: [
      { id: 's1', type: 'condition', condition: 'Category IN [SC, ST, OBC] → Priority queue', label: 'Category Check' },
      { id: 's2', type: 'approver', role: 'Hostel Warden', scope: 'UNIVERSITY_WIDE', sla: 3, escalateTo: 'Registrar', notifyOn: ['approve', 'reject'], label: 'Warden Allotment' },
      { id: 's3', type: 'approver', role: 'Accounts Clerk', scope: 'UNIVERSITY_WIDE', sla: 2, escalateTo: 'Registrar', notifyOn: ['approve'], label: 'Fee Confirmation' },
      { id: 's4', type: 'notification', notifyOn: ['sms', 'portal'], label: 'Allotment Notification' },
    ],
  },
  {
    id: 'WF-003',
    name: 'Result Publication',
    trigger: 'result_publication',
    version: 2,
    enabled: false,
    orgUnit: 'University-wide',
    createdBy: 'Ritu Soni',
    updatedAt: '30-06-2024',
    steps: [
      { id: 's1', type: 'approver', role: 'Exam Controller', scope: 'UNIVERSITY_WIDE', sla: 1, escalateTo: 'Registrar', notifyOn: ['approve', 'reject'], label: 'Controller Approval' },
      { id: 's2', type: 'approver', role: 'Registrar', scope: 'UNIVERSITY_WIDE', sla: 1, escalateTo: 'Registrar', notifyOn: ['approve'], label: 'Registrar Sign-off' },
      { id: 's3', type: 'notification', notifyOn: ['sms', 'email', 'portal', 'whatsapp'], label: 'Publish to All Students' },
    ],
  },
];

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  seq: number;
  timestamp: string;
  actor: string;
  actorId: string;
  module: string;
  action: string;
  target: string;
  orgUnit: string;
  ip: string;
  hash: string;
  prevHash: string;
  status: 'ok' | 'warn';
}

export const AUDIT_ENTRIES: AuditEntry[] = [
  { id: 'AU-00201', seq: 201, timestamp: '19-09-2024 11:32:44', actor: 'Smt. Kavita Shrivastava', actorId: 'USR-00005', module: 'Certificates', action: 'publish', target: 'RDU/CERT/2024/00891', orgUnit: 'RDU-0000', ip: '10.0.1.4', hash: 'a3f7b2c1d4e5f6a7', prevHash: '9e2d1b0c3f4a5e6d', status: 'ok' },
  { id: 'AU-00200', seq: 200, timestamp: '19-09-2024 11:15:22', actor: 'Amit Saxena', actorId: 'USR-00013', module: 'System Config', action: 'edit', target: 'Workflow WF-001 v3', orgUnit: 'RDU-0000', ip: '10.0.1.12', hash: '9e2d1b0c3f4a5e6d', prevHash: '7c1a8b4d2e3f9a0b', status: 'ok' },
  { id: 'AU-00199', seq: 199, timestamp: '19-09-2024 10:45:11', actor: 'Ritu Soni', actorId: 'USR-00012', module: 'Examinations', action: 'approve', target: 'B.Sc. Sem 5 Result — Physics', orgUnit: 'RDU-0000', ip: '10.0.1.8', hash: '7c1a8b4d2e3f9a0b', prevHash: '5d8e2c6b1f4a9e3d', status: 'ok' },
  { id: 'AU-00198', seq: 198, timestamp: '19-09-2024 09:30:05', actor: 'Dr. Anita Kushwah', actorId: 'USR-00004', module: 'HR & Payroll', action: 'approve', target: 'Leave LA/2024/0067', orgUnit: 'RDU-AC-002', ip: '10.0.2.5', hash: '5d8e2c6b1f4a9e3d', prevHash: '3b6c4a8f2e1d7c9e', status: 'ok' },
  { id: 'AU-00197', seq: 197, timestamp: '19-09-2024 09:14:33', actor: 'Amit Saxena', actorId: 'USR-00013', module: 'Audit Log', action: 'view', target: 'impersonation — USR-00006 (Vikram Singh Tomar)', orgUnit: 'RDU-0000', ip: '10.0.1.12', hash: '3b6c4a8f2e1d7c9e', prevHash: '1a4b8c2d6e0f3a5b', status: 'ok' },
  { id: 'AU-00196', seq: 196, timestamp: '19-09-2024 08:55:01', actor: 'Suresh Patel', actorId: 'USR-00008', module: 'Fee Management', action: 'create', target: 'Receipt FEE/2024/AC003/09123', orgUnit: 'RDU-AC-003', ip: '10.0.3.9', hash: '1a4b8c2d6e0f3a5b', prevHash: 'fe2a1b4c8d0e5f3a', status: 'ok' },
  { id: 'AU-00195', seq: 195, timestamp: '18-09-2024 17:55:12', actor: 'System', actorId: 'SYS', module: 'Admissions', action: 'export', target: 'AISHE 2024-25 Draft', orgUnit: 'RDU-0000', ip: '127.0.0.1', hash: 'fe2a1b4c8d0e5f3a', prevHash: 'dc0e9f3a2b4c8d1e', status: 'ok' },
  { id: 'AU-00194', seq: 194, timestamp: '18-09-2024 17:00:02', actor: 'Ritu Soni', actorId: 'USR-00012', module: 'Examinations', action: 'publish', target: 'B.Sc. Sem 5 — All Subjects', orgUnit: 'RDU-0000', ip: '10.0.1.8', hash: 'dc0e9f3a2b4c8d1e', prevHash: 'ba8c7d5e1f2a4b6c', status: 'ok' },
];

// ─── Platform Health ──────────────────────────────────────────────────────────

export const INTEGRATIONS = [
  { name: 'Online Payment Gateway Payment Gateway', status: 'operational', latency: '142ms', lastCheck: '2 min ago' },
  { name: 'MSG91 SMS Gateway', status: 'operational', latency: '88ms', lastCheck: '2 min ago' },
  { name: 'WhatsApp Business API', status: 'degraded', latency: '1.2s', lastCheck: '2 min ago' },
  { name: 'DigiLocker Push API', status: 'operational', latency: '234ms', lastCheck: '5 min ago' },
  { name: 'NSP Scholarship Portal', status: 'operational', latency: '310ms', lastCheck: '5 min ago' },
  { name: 'LDAP / AD Authentication', status: 'operational', latency: '12ms', lastCheck: '1 min ago' },
  { name: 'SMTP Mail Relay', status: 'operational', latency: '67ms', lastCheck: '3 min ago' },
];

export const BACKGROUND_JOBS = [
  { name: 'AISHE 2024-25 Export', status: 'running', progress: 64, started: '11:20:00', eta: '~4 min' },
  { name: 'DigiLocker Batch Push (Sem 5)', status: 'completed', progress: 100, started: '10:00:00', eta: 'Done' },
  { name: 'SMS Dispatch — Fee Reminders', status: 'queued', progress: 0, started: '—', eta: '—' },
  { name: 'Audit Log Integrity Check', status: 'completed', progress: 100, started: '06:00:00', eta: 'Done' },
  { name: 'NIRF Data Compilation', status: 'failed', progress: 38, started: '09:45:00', eta: 'Failed' },
];
