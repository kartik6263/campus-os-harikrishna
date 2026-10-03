// Intelligence layer fixtures (demo data)
//
// What is left here has no endpoint behind it. The risk scores and the term
// projection moved to `intelligencequeries.ts` when Phase 10 was built, and
// the fixtures they used are gone rather than left lying around to be read by
// accident. These remain: the chat transcripts and the reading list, which
// nothing on the server can produce, and the parent-portal figures.

// ─── AI CHAT DATA ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentHi?: string;
  timestamp: string;
  sourceRecord?: { type: string; value: string; module: string };
  actionSuggestion?: { label: string; screen: string };
  state: 'answer' | 'clarifying' | 'escalated' | 'boundary';
}

export const SAMPLE_CONVERSATIONS: ChatMessage[][] = [
  // Conversation 1: attendance query
  [
    { id: 'm1', role: 'user', content: 'kitni attendance chahiye exam ke liye', timestamp: '10:24', state: 'answer' },
    {
      id: 'm2', role: 'assistant',
      content: 'Exam form bharne ke liye minimum 75% attendance chahiye. Aapki abhi current semester mein 68.4% attendance hai — yeh threshold se neeche hai.',
      contentHi: 'Exam form bharne ke liye minimum 75% attendance chahiye. Aapki abhi current semester mein 68.4% attendance hai — yeh threshold se neeche hai.',
      timestamp: '10:24',
      sourceRecord: { type: 'Attendance record', value: '68.4% (32/47 classes attended)', module: 'Attendance module — BCA V Sem' },
      actionSuggestion: { label: 'View attendance details', screen: 'attendance' },
      state: 'answer',
    },
    { id: 'm3', role: 'user', content: 'kya override milega', timestamp: '10:25', state: 'answer' },
    {
      id: 'm4', role: 'assistant',
      content: 'Medical grounds pe override apply kar sakte hain — uske liye college principal ko application deni hogi, saath mein valid medical certificate. Final decision HOD aur Principal ka hoga. Kya main aapko Certificate form khol ke dun?',
      timestamp: '10:25',
      state: 'answer',
      actionSuggestion: { label: 'Apply for attendance condonation', screen: 'certificates' },
    },
  ],
  // Conversation 2: fee query
  [
    { id: 'm1', role: 'user', content: 'Mera fee due kab tak pay karna hai?', timestamp: '14:02', state: 'answer' },
    {
      id: 'm2', role: 'assistant',
      content: 'Aapka ₹3,300 outstanding fee hai — yeh 2nd instalment ka balance hai. Due date 15-October-2024 hai. UPI ya net banking se directly portal se pay kar sakte hain.',
      timestamp: '14:02',
      sourceRecord: { type: 'Fee record', value: '₹3,300 outstanding — Instalment 2', module: 'Fee module' },
      actionSuggestion: { label: 'Pay now', screen: 'fee' },
      state: 'answer',
    },
  ],
  // Conversation 3: boundary case
  [
    { id: 'm1', role: 'user', content: 'Tell me Rahul Verma ki attendance kitni hai', timestamp: '11:30', state: 'boundary' },
    {
      id: 'm2', role: 'assistant',
      content: 'I can only show attendance for your own account. Data of other students is not accessible here — that protects everyone\'s privacy. For official queries, contact the college office.',
      timestamp: '11:30',
      state: 'boundary',
    },
  ],
];

// ─── LEARNING RECOMMENDATIONS ─────────────────────────────────────────────────

export interface LearningResource {
  id: string;
  topic: string;
  syllabusUnit: string;
  courseCode: string;
  resourceType: 'video' | 'notes' | 'practice_questions' | 'reference_book';
  title: string;
  source: string;
  url?: string;
  estimatedMinutes: number;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

export const LEARNING_RESOURCES: LearningResource[] = [
  { id: 'LR/001', topic: 'OSI Reference Model', syllabusUnit: 'Unit 2', courseCode: 'BCA503', resourceType: 'video', title: 'OSI Model Explained — 7 Layers in 12 minutes', source: 'NPTEL IIT Madras', estimatedMinutes: 12, difficulty: 'basic' },
  { id: 'LR/002', topic: 'TCP/IP Protocol Suite', syllabusUnit: 'Unit 2', courseCode: 'BCA503', resourceType: 'notes', title: 'TCP/IP vs OSI — Comparison and Protocol Stack', source: 'GeeksForGeeks (curated by JU CS Dept)', estimatedMinutes: 20, difficulty: 'intermediate' },
  { id: 'LR/003', topic: 'TCP/IP Protocol Suite', syllabusUnit: 'Unit 2', courseCode: 'BCA503', resourceType: 'practice_questions', title: '25 Practice Questions — Networking Protocols', source: 'JU Question Bank', estimatedMinutes: 45, difficulty: 'intermediate' },
  { id: 'LR/004', topic: 'Subnetting', syllabusUnit: 'Unit 3', courseCode: 'BCA503', resourceType: 'video', title: 'Subnetting Masterclass — IP Address Division', source: 'NPTEL', estimatedMinutes: 35, difficulty: 'advanced' },
];

// ─── PARENT PORTAL DATA ───────────────────────────────────────────────────────

export const PARENT_STUDENT = {
  name: 'Priya Sharma',
  nameHi: 'प्रिया शर्मा',
  enrolmentNo: 'JU2022BCA0145',
  programme: 'BCA — Semester V',
  college: 'Govt. Model College, Demo City',
  photo: null,
  parentName: 'Sh. Mohan Lal Sharma',
  parentNameHi: 'श्री मोहन लाल शर्मा',
};

export const PARENT_ATTENDANCE = {
  overall: 68.4,
  threshold: 75,
  atRisk: true,
  subjects: [
    { code: 'BCA501', name: 'Software Engineering', attended: 40, total: 52, pct: 76.9 },
    { code: 'BCA502', name: 'Operating Systems', attended: 38, total: 52, pct: 73.1 },
    { code: 'BCA503', name: 'Computer Networks', attended: 28, total: 52, pct: 53.8 },
    { code: 'BCA504', name: 'Python Programming', attended: 44, total: 52, pct: 84.6 },
    { code: 'BCA505', name: 'Web Technologies', attended: 46, total: 52, pct: 88.5 },
  ],
};

export const PARENT_FEE = {
  totalDue: 12500,
  paid: 9200,
  outstanding: 3300,
  nextDueDate: '15-Oct-2024',
  instalments: [
    { no: 1, amount: 6200, dueDate: '15-Jul-2024', paidOn: '12-Jul-2024', status: 'paid' as const },
    { no: 2, amount: 3000, dueDate: '15-Sep-2024', paidOn: '14-Sep-2024', status: 'paid' as const },
    { no: 3, amount: 3300, dueDate: '15-Oct-2024', paidOn: null, status: 'pending' as const },
  ],
};

export const PARENT_RESULTS = [
  { semester: 'I', sgpa: 7.8, cgpa: 7.8, result: 'Pass' },
  { semester: 'II', sgpa: 8.1, cgpa: 7.95, result: 'Pass' },
  { semester: 'III', sgpa: 7.6, cgpa: 7.83, result: 'Pass' },
  { semester: 'IV', sgpa: 8.4, cgpa: 7.98, result: 'Pass' },
];

export const PARENT_GATE_PASS_REQUESTS = [
  { id: 'GP/2024/0234', purpose: 'Medical appointment — AIIMS Lakeside', fromDate: '20-09-2024', toDate: '22-09-2024', status: 'approved' as const, approvedBy: 'Dr. S.K. Warden', submittedOn: '18-09-2024' },
  { id: 'GP/2024/0198', purpose: 'Family function — Northfield', fromDate: '14-09-2024', toDate: '15-09-2024', status: 'returned' as const, submittedOn: '12-09-2024' },
];

export const PARENT_ANNOUNCEMENTS = [
  { id: 'PA/001', title: 'Parent-Teacher Meet — 28 September 2024', body: 'Sabhi abhibhavakon se nivedan hai ki 28 September 2024 ko subah 10 baje college mein aayein. Semester 5 progress par charcha hogi.', date: '18-09-2024', isNew: true },
  { id: 'PA/002', title: 'November 2024 Pariksha Prarup — last date 25 September', body: 'Exam form ki antim tarikh 25 September 2024 hai. Fees ka bhugtan portal par karein.', date: '18-09-2024', isNew: true },
  { id: 'PA/003', title: 'Diwali Chhuti — 31 Oct se 5 Nov', body: 'Diwali ki chhutti 31 October se 5 November 2024 rahegi. Classes 6 November se shuru hongi.', date: '10-09-2024', isNew: false },
];
