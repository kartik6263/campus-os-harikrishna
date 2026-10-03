// Campus services back-office data — hostel, transport, fee, scholarship, grievance

// ---- HOSTEL ----
export interface HostelBlock {
  id: string; code: string; name: string; gender: 'Boys' | 'Girls' | 'Mixed';
  floors: number; totalRooms: number; capacity: number; occupied: number;
  warden: string; wardenMobile: string;
}

export const HOSTEL_BLOCKS: HostelBlock[] = [
  { id: 'BLK-A', code: 'A', name: 'Block A (Boys)', gender: 'Boys', floors: 3, totalRooms: 40, capacity: 120, occupied: 118, warden: 'Sri Mahesh Kumar', wardenMobile: '+91 94130 22134' },
  { id: 'BLK-B', code: 'B', name: 'Block B (Boys)', gender: 'Boys', floors: 3, totalRooms: 40, capacity: 120, occupied: 102, warden: 'Sri Mahesh Kumar', wardenMobile: '+91 94130 22134' },
  { id: 'BLK-C', code: 'C', name: 'Block C (Girls)', gender: 'Girls', floors: 3, totalRooms: 48, capacity: 144, occupied: 141, warden: 'Smt. Anita Rai', wardenMobile: '+91 94252 11789' },
  { id: 'BLK-D', code: 'D', name: 'Block D (Girls)', gender: 'Girls', floors: 2, totalRooms: 30, capacity: 90, occupied: 87, warden: 'Smt. Anita Rai', wardenMobile: '+91 94252 11789' },
];

export interface Room {
  id: string; blockCode: string; roomNo: string; floor: number;
  type: 'Single' | 'Double' | 'Triple'; capacity: number; occupied: number;
  occupants: string[]; amenities: string[]; status: 'available' | 'full' | 'maintenance';
}

export const ROOMS: Room[] = [
  { id: 'R-C-214', blockCode: 'C', roomNo: 'C-214', floor: 2, type: 'Triple', capacity: 3, occupied: 3, occupants: ['Priya Sharma', 'Neha Verma', 'Anjali Patel'], amenities: ['Fan', 'Wardrobe', 'Study Table'], status: 'full' },
  { id: 'R-C-215', blockCode: 'C', roomNo: 'C-215', floor: 2, type: 'Triple', capacity: 3, occupied: 2, occupants: ['Kavita Jain', 'Sunita Yadav'], amenities: ['Fan', 'Wardrobe', 'Study Table'], status: 'available' },
  { id: 'R-A-104', blockCode: 'A', roomNo: 'A-104', floor: 1, type: 'Double', capacity: 2, occupied: 2, occupants: ['Rahul Verma', 'Arun Kumar'], amenities: ['Fan', 'Wardrobe', 'Study Table', 'Attached Bath'], status: 'full' },
  { id: 'R-A-201', blockCode: 'A', roomNo: 'A-201', floor: 2, type: 'Single', capacity: 1, occupied: 0, occupants: [], amenities: ['Fan', 'Wardrobe', 'Study Table', 'Attached Bath', 'AC'], status: 'available' },
];

export const HOSTEL_ALLOTMENT_POLICY = {
  priority: ['Differently-abled students', 'SC/ST students', 'Students from other districts', 'Students from other states', 'General students by merit'],
  distanceCriteria: 'Preference to students residing >30 km from college',
  feeStructure: [
    { type: 'Single', annual: 28000, monthly: 2800 },
    { type: 'Double', annual: 22000, monthly: 2200 },
    { type: 'Triple', annual: 18000, monthly: 1800 },
  ],
  messFee: { monthly: 2850, deposit: 1000 },
};

export interface HostelApplication {
  id: string; studentId: string; name: string; programme: string; semester: number;
  category: string; gender: string; distanceKm: number; preferredBlock?: string;
  status: 'pending' | 'allotted' | 'rejected' | 'waitlisted'; allottedRoom?: string;
  appliedOn: string; allottedOn?: string;
}

export const HOSTEL_APPLICATIONS: HostelApplication[] = [
  { id: 'HA/2024/00341', studentId: 'RDU/2024/BCA/0089', name: 'Dinesh Yadav', programme: 'BCA', semester: 1, category: 'SC', gender: 'Male', distanceKm: 45, status: 'allotted', allottedRoom: 'A-301', appliedOn: '20-07-2024', allottedOn: '01-08-2024' },
  { id: 'HA/2024/00342', studentId: 'RDU/2024/BCA/0124', name: 'Shivani Rajput', programme: 'BCA', semester: 1, category: 'OBC', gender: 'Female', distanceKm: 12, status: 'waitlisted', appliedOn: '22-07-2024' },
  { id: 'HA/2024/00343', studentId: 'RDU/2024/MSC/0021', name: 'Kirti Agarwal', programme: 'M.Sc. CS', semester: 1, category: 'UR', gender: 'Female', distanceKm: 55, status: 'pending', appliedOn: '24-07-2024' },
];

export const VISITOR_LOG = [
  { date: '19-09-2024', time: '11:00 AM', studentName: 'Priya Sharma', room: 'C-214', visitorName: 'Smt. Rekha Sharma (Mother)', visitorMobile: '+91 94250 33100', purpose: 'Family visit', exitTime: '01:30 PM' },
  { date: '18-09-2024', time: '02:00 PM', studentName: 'Anjali Patel', room: 'C-214', visitorName: 'Sri Ramesh Patel (Father)', visitorMobile: '+91 98935 22411', purpose: 'Document delivery', exitTime: '03:00 PM' },
];

// ---- TRANSPORT ----
export interface Route {
  id: string; routeNo: string; name: string; from: string; to: string;
  distance: number; stops: Array<{ name: string; time: string; lat?: number; lng?: number }>;
  frequency: string; totalSeats: number; occupiedSeats: number;
  busId: string; driverId: string; fare: number;
  status: 'active' | 'inactive' | 'diverted';
  diversionNotice?: string;
}

export const ROUTES: Route[] = [
  { id: 'RT-07', routeNo: 'R-07', name: 'Sector 4 — Model College', from: 'Sector 4', to: 'Model College', distance: 12, stops: [{ name: 'Sector 4 Crossing', time: '08:05 AM' }, { name: 'Sector 4', time: '08:12 AM' }, { name: 'Gandhi Road', time: '08:20 AM' }, { name: 'Company Bagh', time: '08:28 AM' }, { name: 'Model College Gate', time: '08:40 AM' }], frequency: 'Morning (8AM) + Evening (5PM)', totalSeats: 52, occupiedSeats: 47, busId: 'BUS-004', driverId: 'DRV-008', fare: 1500, status: 'active' },
  { id: 'RT-12', routeNo: 'R-12', name: 'Morar — Model College', from: 'Morar', to: 'Model College', distance: 18, stops: [{ name: 'Morar Bus Stand', time: '07:50 AM' }, { name: 'Gole ka Mandir', time: '08:00 AM' }, { name: 'Phool Bagh', time: '08:10 AM' }, { name: 'City Centre', time: '08:20 AM' }, { name: 'Model College Gate', time: '08:35 AM' }], frequency: 'Morning + Evening', totalSeats: 52, occupiedSeats: 39, busId: 'BUS-007', driverId: 'DRV-011', fare: 2000, status: 'diverted', diversionNotice: 'Akhbar Chauraha flyover under repair — route via Phool Bagh alternate road until 30-Sep-2024' },
  { id: 'RT-03', routeNo: 'R-03', name: 'Hazira — Model College', from: 'Hazira', to: 'Model College', distance: 8, stops: [{ name: 'Hazira Colony', time: '08:15 AM' }, { name: 'Bada Gaon', time: '08:22 AM' }, { name: 'Model College Gate', time: '08:35 AM' }], frequency: 'Morning + Evening', totalSeats: 40, occupiedSeats: 40, busId: 'BUS-002', driverId: 'DRV-004', fare: 1200, status: 'active' },
];

export const BUSES = [
  { id: 'BUS-002', regNo: 'MP07-GC-2241', make: 'TATA Starbus', seats: 40, year: 2019, fitness: '31-12-2024', insurance: '31-01-2025', status: 'operational' },
  { id: 'BUS-004', regNo: 'MP07-GC-4892', make: 'Ashok Leyland', seats: 52, year: 2021, fitness: '30-06-2025', insurance: '31-08-2025', status: 'operational' },
  { id: 'BUS-007', regNo: 'MP07-GC-5514', make: 'TATA Starbus', seats: 52, year: 2022, fitness: '31-03-2026', insurance: '31-03-2026', status: 'diverted' },
  { id: 'BUS-009', regNo: 'MP07-GC-6001', make: 'Eicher', seats: 36, year: 2020, fitness: '31-10-2024', insurance: '31-12-2024', status: 'breakdown', breakdownNote: 'Engine overhaul — estimated 10 days' },
];

export const FARE_SLABS = [
  { distanceFrom: 0, distanceTo: 5, annualFare: 800 },
  { distanceFrom: 5, distanceTo: 10, annualFare: 1200 },
  { distanceFrom: 10, distanceTo: 15, annualFare: 1500 },
  { distanceFrom: 15, distanceTo: 20, annualFare: 2000 },
  { distanceFrom: 20, distanceTo: 30, annualFare: 2500 },
  { distanceFrom: 30, distanceTo: 999, annualFare: 3200 },
];

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
