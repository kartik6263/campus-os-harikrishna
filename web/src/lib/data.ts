import { inst } from './institution';
export type Screen =
  | 'landing'
  | 'login'
  | 'login-student'
  | 'login-staff'
  | 'login-admin'
  | 'login-parent'
  | 'login-vendor'
  | 'cert-verify'
  | 'component-index'
  | 'student-portal'
  | 'it-console'
  | 'staff-portal'
  | 'admin-console'
  | 'faculty-portal'
  | 'college-office'
  | 'principal-portal'
  | 'academic-back-office'
  | 'acad-ops'
  | 'governance'
  | 'intelligence'
  | 'parent-portal'
  | 'vendor-portal'
  | 'mobile-app';

export const COLLEGES = [
  'Govt. Science College, Riverside',
  'Govt. Women’s College, Demo City',
  'Govt. Girls College of Excellence, Demo City',
  'Govt. Arts College, Demo City',
  'Govt. Degree College, Northfield',
  'Govt. Degree College, Eastwood',
  'Govt. Degree College, Westfield',
  'Govt. Degree College, Southgate',
  'Govt. Degree College, Guna',
  'Jankibai Bajaj Women’s College, Demo City',
  'Heritage Girls School, Demo City',
  'Maharaja Institute of Technology, Demo City',
  'Institute of Commerce & Management, Demo City',
];

export const STUDENTS = [
  { id: 'JU2021CS0234', name: 'Priya Sharma', nameHi: 'प्रिया शर्मा', college: COLLEGES[1], programme: 'B.Sc. Computer Science', year: 2021, semester: 6, mobile: '98264 43178', dob: '12-03-2002', category: 'OBC' },
  { id: 'JU2022BA0891', name: 'Rahul Verma', nameHi: 'राहुल वर्मा', college: COLLEGES[4], programme: 'B.A. Hindi Literature', year: 2022, semester: 4, mobile: '94251 78023', dob: '05-07-2003', category: 'SC' },
  { id: 'JU2020CO0045', name: 'Sunita Patel', nameHi: 'सुनीता पटेल', college: COLLEGES[2], programme: 'B.Com. (Hons.)', year: 2020, semester: 8, mobile: '70490 12345', dob: '22-11-2001', category: 'General' },
  { id: 'JU2023SC0567', name: 'Amit Kushwaha', nameHi: 'अमित कुशवाह', college: COLLEGES[3], programme: 'B.Sc. Mathematics', year: 2023, semester: 2, mobile: '88175 30291', dob: '14-09-2004', category: 'OBC' },
  { id: 'JU2021MA0112', name: 'Deepika Jain', nameHi: 'दीपिका जैन', college: COLLEGES[0], programme: 'M.A. Economics', year: 2021, semester: 4, mobile: '99773 22014', dob: '30-01-2000', category: 'General' },
];

export const CERTIFICATES = [
  { id: 'RDU/CERT/2024/00891', hash: 'a3f7b2c1d4e5f6a7b8c9d0e1f2a3b4c5', student: STUDENTS[0], type: 'Migration Certificate', issueDate: '15-04-2024', authority: `Registrar, ${inst().name}`, status: 'valid' },
  { id: 'RDU/CERT/2024/00234', hash: 'b4c8d1e2f3a4b5c6d7e8f9a0b1c2d3e4', student: STUDENTS[2], type: 'Degree Certificate', issueDate: '22-06-2024', authority: `Exam Controller, ${inst().name}`, status: 'valid' },
  { id: 'RDU/CERT/2023/04567', hash: 'c5d9e2f3a4b5c6d7e8f9a0b1c2d3e4f5', student: STUDENTS[1], type: 'Provisional Marksheet', issueDate: '10-11-2023', authority: `Exam Controller, ${inst().name}`, status: 'revoked' },
];

export const MODULES_BY_ROLE = {
  student: [
    { group: 'Academics', groupHi: 'शैक्षणिक', items: ['Marksheet & Results', 'Enrolment & Registration', 'Academic Calendar', 'APAAR ID'] },
    { group: 'Finance', groupHi: 'वित्त', items: ['Fee Payment', 'Scholarship', 'Receipts'] },
    { group: 'Certificates', groupHi: 'प्रमाण-पत्र', items: ['Migration Certificate', 'Character Certificate', 'Degree Download'] },
    { group: 'Hostel', groupHi: 'छात्रावास', items: ['Hostel Application', 'Room Allotment', 'Mess Fee'] },
    { group: 'Grievance', groupHi: 'शिकायत', items: ['Submit Grievance', 'Track Status'] },
  ],
  staff: [
    { group: 'Students', groupHi: 'छात्र', items: ['Student Records', 'Attendance', 'Internal Marks'] },
    { group: 'Examinations', groupHi: 'परीक्षा', items: ['Question Paper', 'Invigilation Duty', 'Result Entry'] },
    { group: 'Leave & Payroll', groupHi: 'अवकाश व वेतन', items: ['Leave Application', 'Salary Slip', 'GPF Statement'] },
    { group: 'Reports', groupHi: 'रिपोर्ट', items: ['AISHE Data', 'NAAC SSR', 'NIRF'] },
  ],
  admin: [
    { group: 'University', groupHi: 'विश्वविद्यालय', items: ['College Management', 'Department Setup', 'Academic Year'] },
    { group: 'Examination', groupHi: 'परीक्षा', items: ['Exam Schedule', 'Result Processing', 'Certificate Issue'] },
    { group: 'Finance', groupHi: 'वित्त', items: ['Fee Structure', 'Budget', 'Audit Trail'] },
    { group: 'Compliance', groupHi: 'अनुपालन', items: ['NAAC SSR', 'NIRF Ranking', 'AISHE Report'] },
    { group: 'IT Cell', groupHi: 'आईटी सेल', items: ['Institution Profile', 'Users & Accounts', 'Roles & Permissions', 'Audit Log'] },
  ],
};

export const HERO_TASKS = [
  {
    id: 'migration',
    label: 'Get a migration certificate',
    labelHi: 'माइग्रेशन प्रमाण-पत्र प्राप्त करें',
    offices: [
      { name: 'College Principal Office', nameHi: 'प्राचार्य कार्यालय', action: 'Obtain No Objection Certificate', days: 3 },
      { name: 'University Registrar', nameHi: 'कुलसचिव कार्यालय', action: 'Submit application with NOC', days: 7 },
      { name: 'Accounts Section', nameHi: 'लेखा अनुभाग', action: 'Clear all dues & pay certificate fee', days: 2 },
      { name: 'Examination Section', nameHi: 'परीक्षा अनुभाग', action: 'Verify academic records', days: 5 },
      { name: 'Registrar (Collection)', nameHi: 'कुलसचिव (संग्रह)', action: 'Collect certificate in person', days: 1 },
    ],
    campusAction: 'Apply online → Pay ₹250 → Download in 3 working days',
    campusActionHi: 'ऑनलाइन आवेदन करें → ₹250 भुगतान → 3 कार्यदिवसों में डाउनलोड करें',
    totalDays: 18,
    campusDays: 3,
  },
  {
    id: 'fee',
    label: 'Pay semester fee',
    labelHi: 'सेमेस्टर शुल्क भुगतान करें',
    offices: [
      { name: 'College Accounts Office', nameHi: 'कॉलेज लेखा कार्यालय', action: 'Get challan printed', days: 1 },
      { name: 'Bank Counter (SBI Branch)', nameHi: 'बैंक काउंटर (SBI शाखा)', action: 'Stand in queue, deposit cash', days: 1 },
      { name: 'College Accounts Office', nameHi: 'कॉलेज लेखा कार्यालय', action: 'Submit receipt, get stamp', days: 1 },
    ],
    campusAction: 'Pay via UPI / Net Banking in 2 minutes. Receipt auto-generated.',
    campusActionHi: 'UPI / नेट बैंकिंग से 2 मिनट में भुगतान। रसीद स्वतः जेनरेट होगी।',
    totalDays: 3,
    campusDays: 0,
  },
  {
    id: 'hostel',
    label: 'Apply for hostel',
    labelHi: 'छात्रावास के लिए आवेदन करें',
    offices: [
      { name: 'College Warden Office', nameHi: 'वार्डन कार्यालय', action: 'Obtain hostel application form', days: 1 },
      { name: 'College Principal Office', nameHi: 'प्राचार्य कार्यालय', action: 'Get principal recommendation', days: 2 },
      { name: 'University Hostel Branch', nameHi: 'विश्वविद्यालय छात्रावास शाखा', action: 'Submit form with documents', days: 4 },
      { name: 'Accounts Section', nameHi: 'लेखा अनुभाग', action: 'Pay hostel fee by DD', days: 2 },
    ],
    campusAction: 'Fill form online → Upload documents → Allotment in 5 days',
    campusActionHi: 'ऑनलाइन फ़ॉर्म भरें → दस्तावेज़ अपलोड करें → 5 दिन में आवंटन',
    totalDays: 9,
    campusDays: 5,
  },
  {
    id: 'marksheet',
    label: 'Download marksheet',
    labelHi: 'अंकसूची डाउनलोड करें',
    offices: [
      { name: 'Examination Section', nameHi: 'परीक्षा अनुभाग', action: 'Submit application for duplicate marksheet', days: 2 },
      { name: 'Accounts Section', nameHi: 'लेखा अनुभाग', action: 'Pay ₹100 fee by cash', days: 1 },
      { name: 'Examination Section', nameHi: 'परीक्षा अनुभाग', action: 'Collect signed marksheet copy', days: 10 },
    ],
    campusAction: 'Instant DigiLocker push. Download anytime, anywhere.',
    campusActionHi: 'तुरंत DigiLocker में उपलब्ध। कहीं से, कभी भी डाउनलोड करें।',
    totalDays: 13,
    campusDays: 0,
  },
];

export const RECENT_STUDENTS = [
  { id: 'JU2021CS0234', name: 'Priya Sharma', college: 'Govt. Women’s College, Demo City', programme: 'B.Sc. CS', semester: 6, fee: '₹12,500', feeStatus: 'paid', result: 'Pass', cgpa: '8.4' },
  { id: 'JU2022BA0891', name: 'Rahul Verma', college: 'Govt. DC, Northfield', programme: 'B.A. Hindi', semester: 4, fee: '₹8,200', feeStatus: 'pending', result: 'Pass', cgpa: '7.1' },
  { id: 'JU2020CO0045', name: 'Sunita Patel', college: 'Govt. Girls College, GWL', programme: 'B.Com. Hons.', semester: 8, fee: '₹10,000', feeStatus: 'paid', result: 'Distinction', cgpa: '9.1' },
  { id: 'JU2023SC0567', name: 'Amit Kushwaha', college: 'Govt. Arts College, GWL', programme: 'B.Sc. Maths', semester: 2, fee: '₹9,500', feeStatus: 'paid', result: 'Pass', cgpa: '6.8' },
  { id: 'JU2021MA0112', name: 'Deepika Jain', college: 'Govt. Madhav Sci, Riverside', programme: 'M.A. Economics', semester: 4, fee: '₹14,000', feeStatus: 'overdue', result: 'Pass', cgpa: '7.9' },
  { id: 'JU2022PH0078', name: 'Vikram Singh Tomar', college: 'Govt. DC, Eastwood', programme: 'B.Sc. Physics', semester: 3, fee: '₹9,500', feeStatus: 'paid', result: 'Pass', cgpa: '7.3' },
];
