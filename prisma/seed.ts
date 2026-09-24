/**
 * Seeds the same demo record both clients already display — Priya Sharma,
 * BCA V Sem, MVM College Gwalior — so the API is a drop-in replacement for
 * the mock modules rather than a different dataset.
 *
 * Idempotent: re-running resets the demo rows without duplicating them.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Weekday } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TERM = '2024-25-ODD';
const PASSWORD = 'campus123';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  console.log('Seeding Campus OS …');

  // Wipe demo data in dependency order.
  await prisma.$transaction([
    // Phase 10 first: these hang off students and faculty.
    prisma.riskFactorSnapshot.deleteMany(),
    prisma.riskAssessment.deleteMany(),
    prisma.intervention.deleteMany(),
    // Phase 9 next: the audit chain and the matrix stand on their own.
    prisma.auditEntry.deleteMany(),
    prisma.permissionRule.deleteMany(),
    // Phase 8 next: these hang off the college and its office staff.
    prisma.rtiAppeal.deleteMany(),
    prisma.rtiApplication.deleteMany(),
    // Phase 7 next: these hang off the college, its vendors and its tenders.
    prisma.pOItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.tenderBid.deleteMany(),
    prisma.tenderCorrigendum.deleteMany(),
    prisma.tender.deleteMany(),
    prisma.vendor.deleteMany(),
    // Phase 6 next: these hang off the college and its frameworks.
    prisma.statutoryReturn.deleteMany(),
    prisma.accreditationMetric.deleteMany(),
    prisma.accreditationFramework.deleteMany(),
    // Phase 5 next: these hang off the college and its faculty.
    prisma.governanceRequest.deleteMany(),
    prisma.complianceItem.deleteMany(),
    // Phase 4 next: these hang off students, subjects and sessions.
    prisma.revaluationApplication.deleteMany(),
    prisma.answerScript.deleteMany(),
    prisma.answerBundle.deleteMany(),
    prisma.seatAllocation.deleteMany(),
    prisma.examPaper.deleteMany(),
    // Phase 3 next: these hang off students, subjects, payments and users.
    prisma.examFormSubject.deleteMany(),
    prisma.examForm.deleteMany(),
    prisma.certificateRequest.deleteMany(),
    prisma.counterReceipt.deleteMany(),
    prisma.admissionDocument.deleteMany(),
    prisma.admissionApplication.deleteMany(),
    // Phase 2 next: these hang off sessions, subjects and users below.
    prisma.markEntry.deleteMany(),
    prisma.marksComponent.deleteMany(),
    prisma.marksSheet.deleteMany(),
    prisma.subjectAssignment.deleteMany(),
    prisma.mentorNote.deleteMany(),
    prisma.mentorship.deleteMany(),
    prisma.attendanceCorrection.deleteMany(),
    prisma.facultyLeave.deleteMany(),
    prisma.studyMaterial.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.classSession.deleteMany(),
    prisma.timetableSlot.deleteMany(),
    prisma.subjectResult.deleteMany(),
    prisma.semesterResult.deleteMany(),
    prisma.examSession.deleteMany(),
    prisma.examCentre.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.instalment.deleteMany(),
    prisma.feeItem.deleteMany(),
    prisma.scholarshipAward.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.busPass.deleteMany(),
    prisma.routeStop.deleteMany(),
    prisma.transportRoute.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.enrolment.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.student.deleteMany(),
    prisma.faculty.deleteMany(),
    prisma.officeStaff.deleteMany(),
    prisma.programme.deleteMany(),
    prisma.college.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ── Institution ────────────────────────────────────────────────────────────

  const college = await prisma.college.create({
    data: {
      code: 'JU-AC-002',
      name: 'Govt. Maharani Laxmi Bai M.V.M. College',
      district: 'Gwalior',
    },
  });

  const programme = await prisma.programme.create({
    data: {
      code: 'BCA',
      name: 'Bachelor of Computer Applications',
      shortName: 'BCA',
      years: 3,
      collegeId: college.id,
    },
  });

  // ── Users ──────────────────────────────────────────────────────────────────

  const studentUser = await prisma.user.create({
    data: { email: 'priya.sharma.2021@mvmgwl.ac.in', passwordHash, role: 'STUDENT' },
  });

  const parentUser = await prisma.user.create({
    data: { email: 'parent.sharma@example.in', passwordHash, role: 'PARENT' },
  });

  const facultyUser = await prisma.user.create({
    data: { email: 'rk.mishra@mvmgwl.ac.in', passwordHash, role: 'FACULTY' },
  });

  // The head of department, who approves what the lecturer submits.
  const hodUser = await prisma.user.create({
    data: { email: 'ml.gupta@mvmgwl.ac.in', passwordHash, role: 'FACULTY' },
  });

  await prisma.user.create({
    data: { email: 'admin@jiwaji.ac.in', passwordHash, role: 'ADMIN' },
  });

  const student = await prisma.student.create({
    data: {
      enrolmentNo: 'JU/2021/BCA/0342',
      rollNo: 'MVM/BCA/2021/0342',
      name: 'Priya Sharma',
      nameHi: 'प्रिया शर्मा',
      dob: d('2003-03-14'),
      gender: 'Female',
      category: 'OBC',
      semester: 5,
      year: 3,
      batch: '2021–24',
      mobile: '+91 94250 33127',
      address: '23, Vinay Nagar, Thatipur, Gwalior — 474011',
      apaarId: 'APAAR2021MP1042867',
      abcId: 'ABC-2021-GWL-08423',
      abcCredits: 84,
      abcTarget: 120,
      digilockerLinked: true,
      validUpto: d('2024-06-30'),
      userId: studentUser.id,
      collegeId: college.id,
      programmeId: programme.id,
      guardianId: parentUser.id,
    },
  });

  // ── Subjects and enrolment ─────────────────────────────────────────────────

  const SUBJECTS = [
    { code: 'BCA501', name: 'Software Engineering', faculty: 'Dr. R.K. Mishra', room: 'CS-201', credits: 4, total: 42, present: 34 },
    { code: 'BCA502', name: 'Database Management', faculty: 'Prof. Sunita Yadav', room: 'CS-203', credits: 4, total: 40, present: 28 },
    { code: 'BCA503', name: 'Computer Networks', faculty: 'Dr. Anil Sharma', room: 'CS-101', credits: 4, total: 38, present: 26 },
    { code: 'BCA504', name: 'Operating Systems', faculty: 'Prof. M.L. Gupta', room: 'CS-202', credits: 3, total: 44, present: 35 },
    { code: 'BCA505', name: 'Web Technologies Lab', faculty: 'Ms. Kavita Jain', room: 'Lab-3', credits: 2, total: 36, present: 30 },
    { code: 'BCA506', name: 'Mini Project', faculty: 'Dr. R.K. Mishra', room: 'Lab-2', credits: 3, total: 20, present: 18 },
  ];

  const subjectByCode = new Map<string, string>();

  for (const s of SUBJECTS) {
    const subject = await prisma.subject.create({
      data: {
        code: s.code,
        name: s.name,
        credits: s.credits,
        semester: 5,
        programmeId: programme.id,
      },
    });
    subjectByCode.set(s.code, subject.id);

    await prisma.enrolment.create({
      data: {
        studentId: student.id,
        subjectId: subject.id,
        faculty: s.faculty,
        room: s.room,
        term: TERM,
      },
    });

    // Materialise one ClassSession per class held, and an attendance row for
    // each one attended, so the percentages are derived from real rows rather
    // than stored totals.
    const sessions = Array.from({ length: s.total }, (_, i) => ({
      subjectId: subject.id,
      date: new Date(Date.UTC(2024, 6, 15 + i)),
      startTime: '09:00',
      endTime: '10:00',
      room: s.room,
      faculty: s.faculty,
    }));
    await prisma.classSession.createMany({ data: sessions });

    const created = await prisma.classSession.findMany({
      where: { subjectId: subject.id },
      orderBy: { date: 'asc' },
      select: { id: true },
    });

    await prisma.attendanceRecord.createMany({
      data: created.slice(0, s.present).map((c) => ({
        studentId: student.id,
        sessionId: c.id,
        status: 'PRESENT' as const,
        source: 'SEED',
      })),
    });
  }

  // ── Timetable ──────────────────────────────────────────────────────────────

  const TIMETABLE: Array<[Weekday, string, string, string, string, string, boolean?, string?, string?]> = [
    ['MON', '09:00', '10:00', 'BCA501', 'Dr. R.K. Mishra', 'CS-201'],
    ['MON', '10:00', '11:00', 'BCA502', 'Prof. Sunita Yadav', 'CS-203'],
    ['MON', '11:15', '12:15', 'BCA503', 'Dr. Anil Sharma', 'CS-101', true, 'Faculty on duty leave', '08:42 AM'],
    ['MON', '01:00', '02:00', 'BCA504', 'Prof. M.L. Gupta', 'CS-202'],
    ['TUE', '09:00', '10:00', 'BCA502', 'Prof. Sunita Yadav', 'CS-203'],
    ['TUE', '10:00', '12:00', 'BCA505', 'Ms. Kavita Jain', 'Lab-3'],
    ['TUE', '01:00', '03:00', 'BCA506', 'Dr. R.K. Mishra', 'Lab-2'],
    ['WED', '09:00', '10:00', 'BCA504', 'Prof. M.L. Gupta', 'CS-202'],
    ['WED', '10:00', '11:00', 'BCA501', 'Dr. R.K. Mishra', 'CS-201'],
    ['WED', '11:15', '12:15', 'BCA503', 'Dr. Anil Sharma', 'CS-101'],
    ['THU', '09:00', '10:00', 'BCA501', 'Dr. R.K. Mishra', 'CS-201'],
    ['THU', '10:00', '11:00', 'BCA502', 'Prof. Sunita Yadav', 'CS-203'],
    ['THU', '11:15', '01:15', 'BCA505', 'Ms. Kavita Jain', 'Lab-3'],
    ['FRI', '09:00', '10:00', 'BCA503', 'Dr. Anil Sharma', 'CS-101'],
    ['FRI', '10:00', '11:00', 'BCA504', 'Prof. M.L. Gupta', 'CS-202'],
    ['FRI', '11:15', '12:15', 'BCA502', 'Prof. Sunita Yadav', 'CS-203'],
    ['FRI', '01:00', '02:00', 'BCA501', 'Dr. R.K. Mishra', 'CS-201'],
    ['SAT', '09:00', '11:00', 'BCA506', 'Dr. R.K. Mishra', 'Lab-2'],
    ['SAT', '11:15', '12:15', 'BCA503', 'Dr. Anil Sharma', 'CS-101'],
  ];

  for (const [day, startTime, endTime, code, faculty, room, cancelled, reason, at] of TIMETABLE) {
    await prisma.timetableSlot.create({
      data: {
        subjectId: subjectByCode.get(code)!,
        day,
        startTime,
        endTime,
        room,
        faculty,
        term: TERM,
        cancelled: cancelled ?? false,
        cancelReason: reason ?? null,
        cancelledAt: at ? new Date(`2024-09-16T03:12:00.000Z`) : null,
      },
    });
  }

  // ── Fees ───────────────────────────────────────────────────────────────────

  await prisma.feeItem.createMany({
    data: [
      { studentId: student.id, head: 'Caution Deposit', amount: 1000, paid: 1000, category: 'OTHER', term: TERM },
      { studentId: student.id, head: 'Development Fee', amount: 2000, paid: 2000, category: 'DEVELOPMENT', term: TERM },
      { studentId: student.id, head: 'Examination Fee', amount: 1800, paid: 0, category: 'EXAM', term: TERM },
      { studentId: student.id, head: 'Library Fee', amount: 500, paid: 500, category: 'OTHER', term: TERM },
      { studentId: student.id, head: 'Sports Fee', amount: 300, paid: 300, category: 'OTHER', term: TERM },
      { studentId: student.id, head: 'Tuition Fee', amount: 7500, paid: 7500, category: 'TUITION', term: TERM },
      { studentId: student.id, head: 'University Development', amount: 1500, paid: 0, category: 'DEVELOPMENT', term: TERM },
    ],
  });

  const inst1 = await prisma.instalment.create({
    data: { studentId: student.id, number: 1, amount: 5800, dueDate: d('2024-07-18'), paidAt: d('2024-07-18'), term: TERM },
  });
  const inst2 = await prisma.instalment.create({
    data: { studentId: student.id, number: 2, amount: 5000, dueDate: d('2024-09-18'), paidAt: d('2024-09-15'), term: TERM },
  });
  await prisma.instalment.create({
    data: { studentId: student.id, number: 3, amount: 3300, dueDate: d('2024-11-18'), term: TERM },
  });

  await prisma.payment.createMany({
    data: [
      { studentId: student.id, head: 'Semester V Fees (Part)', amount: 10800, mode: 'UPI', txnId: 'UPI2024071812345678', receiptNo: 'RCT/JU/2024/044521', status: 'SUCCESS', paidAt: d('2024-07-18'), instalmentId: inst1.id },
      { studentId: student.id, head: 'Scholarship Adjustment', amount: -5200, mode: 'System', txnId: 'SCH/MP/OBC/2024/08/9912', receiptNo: 'ADJ/JU/2024/009123', status: 'SUCCESS', paidAt: d('2024-08-22') },
      { studentId: student.id, head: 'Library Fine', amount: 40, mode: 'UPI', txnId: 'UPI2024090100987654', receiptNo: 'RCT/JU/2024/049001', status: 'SUCCESS', paidAt: d('2024-09-01'), instalmentId: inst2.id },
    ],
  });

  await prisma.scholarshipAward.create({
    data: {
      studentId: student.id,
      name: 'MP Post Matric OBC Scholarship',
      amount: 5200,
      adjusted: true,
      adjustedAt: d('2024-08-12'),
      term: TERM,
    },
  });

  // ── Results ────────────────────────────────────────────────────────────────

  const RESULTS = [
    { sem: 1, year: 'Nov 2021', sgpa: 7.8, cgpa: 7.8, credits: 22, subs: [
      ['BCA101', 'Fundamentals of Computers', 22, 54, 76, 'B+'],
      ['BCA102', 'Mathematics I', 19, 48, 67, 'B'],
      ['BCA103', 'C Programming', 23, 60, 83, 'A'],
    ] },
    { sem: 2, year: 'May 2022', sgpa: 8.1, cgpa: 7.95, credits: 44, subs: [
      ['BCA201', 'Data Structures', 24, 62, 86, 'A'],
      ['BCA202', 'Mathematics II', 20, 55, 75, 'B+'],
      ['BCA203', 'OOP with C++', 25, 65, 90, 'A+'],
    ] },
    { sem: 3, year: 'Nov 2022', sgpa: 7.5, cgpa: 7.8, credits: 66, subs: [
      ['BCA301', 'Java Programming', 21, 52, 73, 'B+'],
      ['BCA302', 'RDBMS', 18, 44, 62, 'B'],
      ['BCA303', 'System Analysis', 22, 50, 72, 'B+'],
    ] },
    { sem: 4, year: 'May 2023', sgpa: 8.3, cgpa: 7.93, credits: 84, subs: [
      ['BCA401', 'Python Programming', 25, 68, 93, 'A+'],
      ['BCA402', 'Computer Architecture', 22, 58, 80, 'A'],
      ['BCA403', 'Software Testing', 23, 55, 78, 'B+'],
    ] },
  ] as const;

  for (const r of RESULTS) {
    const result = await prisma.semesterResult.create({
      data: {
        studentId: student.id,
        semester: r.sem,
        declaredOn: r.year,
        sgpa: r.sgpa,
        cgpa: r.cgpa,
        totalCredits: r.credits,
        outcome: 'PASS',
      },
    });

    for (const [code, name, internal, external, total, grade] of r.subs) {
      // Past-semester subjects are not in the current enrolment set, so they
      // are created here on first use.
      let subjectId = subjectByCode.get(code);
      if (!subjectId) {
        const created = await prisma.subject.create({
          data: { code, name, credits: 4, semester: r.sem, programmeId: programme.id },
        });
        subjectId = created.id;
        subjectByCode.set(code, subjectId);
      }

      await prisma.subjectResult.create({
        data: { resultId: result.id, subjectId, internal, external, total, grade, passed: true },
      });
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  await prisma.notification.createMany({
    data: [
      { studentId: student.id, kind: 'ATTENDANCE', title: 'Attendance warning — BCA503', titleHi: 'उपस्थिति चेतावनी — BCA503', body: 'Your attendance is 68.4%. A minimum of 75% is required to sit the examination.', bodyHi: 'आपकी उपस्थिति 68.4% है। परीक्षा के लिए 75% आवश्यक है।', urgent: true, href: '/(tabs)/attendance', createdAt: new Date(Date.now() - 60_000) },
      { studentId: student.id, kind: 'FEE', title: 'Fee reminder — ₹3,300 due', titleHi: 'शुल्क अनुस्मारक — ₹3,300 बकाया', body: 'Instalment 3 is due on 18-11-2024. Pay now to avoid a late fee of ₹500.', bodyHi: 'तीसरी किस्त 18-11-2024 को देय है। ₹500 विलंब शुल्क से बचने के लिए अभी भुगतान करें।', urgent: true, href: '/(tabs)/fee', createdAt: new Date(Date.now() - 7_200_000) },
      { studentId: student.id, kind: 'RESULT', title: 'Semester IV result declared', titleHi: 'सेमेस्टर IV का परिणाम घोषित', body: 'SGPA 8.30 · CGPA 7.93 · Result: Pass', bodyHi: 'SGPA 8.30 · CGPA 7.93 · परिणाम: उत्तीर्ण', href: '/results', createdAt: new Date(Date.now() - 86_400_000) },
      { studentId: student.id, kind: 'EXAM', title: 'Exam form last date: 30 September', titleHi: 'परीक्षा फॉर्म अंतिम तिथि: 30 सितम्बर', body: 'V Semester examination form must be submitted online by 30-09-2024.', bodyHi: 'पंचम सेमेस्टर परीक्षा फॉर्म 30-09-2024 तक ऑनलाइन जमा करें।', readAt: new Date(), createdAt: new Date(Date.now() - 172_800_000) },
      { studentId: student.id, kind: 'GENERAL', title: 'Mini Project viva — 28 September', titleHi: 'मिनी प्रोजेक्ट वाइवा — 28 सितम्बर', body: 'BCA V Semester presentations in Lab-2. Submit documentation three days prior.', bodyHi: 'BCA पंचम सेमेस्टर प्रस्तुतियाँ Lab-2 में। दस्तावेज़ तीन दिन पहले जमा करें।', readAt: new Date(), createdAt: new Date(Date.now() - 345_600_000) },
      { studentId: student.id, kind: 'GENERAL', title: 'NAAC peer team visit — 24–26 September', titleHi: 'NAAC पीयर टीम दौरा — 24–26 सितम्बर', body: 'All students are requested to be present on campus during the visit.', bodyHi: 'दौरे के दौरान सभी छात्रों को परिसर में उपस्थित रहने का अनुरोध है।', readAt: new Date(), createdAt: new Date(Date.now() - 604_800_000) },
    ],
  });

  // ── Transport ──────────────────────────────────────────────────────────────

  const route = await prisma.transportRoute.create({
    data: {
      routeNo: 'R-07',
      name: 'Thatipur — MVM College',
      busNo: 'MP07-GC-4892',
      driver: 'Shri Ramesh Yadav',
      driverPhone: '+91 94066 21188',
      currentStop: 2,
      stops: {
        create: [
          { name: 'Thatipur Crossing', time: '08:05 AM', order: 0 },
          { name: 'Vinay Nagar', time: '08:12 AM', order: 1 },
          { name: 'Gandhi Road', time: '08:20 AM', order: 2 },
          { name: 'Company Bagh', time: '08:28 AM', order: 3 },
          { name: 'MVM College Gate', time: '08:40 AM', order: 4 },
        ],
      },
    },
  });

  await prisma.busPass.create({
    data: { studentId: student.id, routeId: route.id, valid: true, validTill: d('2024-10-31') },
  });

  // ── Announcements ──────────────────────────────────────────────────────────

  await prisma.announcement.createMany({
    data: [
      { scope: 'UNIVERSITY', title: 'NAAC Peer Team Visit — 24–26 September 2024', body: 'All students are requested to be present on campus during the NAAC peer team visit.', urgent: true, publishedAt: d('2024-09-13') },
      { scope: 'COLLEGE', title: 'Exam Form Last Date: 30 September 2024', body: 'V Semester examination form must be filled online and fee paid by 30-09-2024. Late fee of ₹500 applies after this date.', urgent: true, publishedAt: d('2024-09-10') },
      { scope: 'DEPARTMENT', title: 'Mini Project Viva — 28 September 2024', body: 'BCA V Semester Mini Project presentations will be held on 28-09-2024 in Lab-2.', publishedAt: d('2024-09-09') },
      { scope: 'BATCH', title: 'Library Book Return Deadline Extended', body: 'Due date for Semester IV issued books extended to 30 September 2024.', publishedAt: d('2024-09-07') },
      { scope: 'UNIVERSITY', title: 'Convocation 2024 — Registration Open', body: 'Students who completed their degree (2022 & 2023 batch) can register for the Annual Convocation on 15-11-2024.', publishedAt: d('2024-09-05') },
    ],
  });


  // ══ Phase 2 — the faculty domain ═════════════════════════════════════════

  // ── Teaching staff ─────────────────────────────────────────────────────────

  const DEPARTMENT = 'Computer Science & Applications';

  const mishra = await prisma.faculty.create({
    data: {
      employeeId: 'MVM/FAC/CS/0047',
      teacherCode: 'EMP/JU/TC/0247',
      name: 'Dr. Rajesh Kumar Mishra',
      nameHi: 'डॉ. राजेश कुमार मिश्रा',
      designation: 'Assistant Professor',
      department: DEPARTMENT,
      mobile: '+91 94131 55247',
      joinDate: d('2015-08-01'),
      specialization: 'Software Engineering, Data Structures',
      maxWeeklyLoad: 18,
      userId: facultyUser.id,
      collegeId: college.id,
    },
  });

  const gupta = await prisma.faculty.create({
    data: {
      employeeId: 'MVM/FAC/CS/0012',
      teacherCode: 'EMP/JU/TC/0112',
      name: 'Prof. M.L. Gupta',
      nameHi: 'प्रो. एम.एल. गुप्ता',
      designation: 'Professor & Head',
      department: DEPARTMENT,
      mobile: '+91 94250 11204',
      joinDate: d('2004-07-12'),
      specialization: 'Operating Systems, Computer Architecture',
      maxWeeklyLoad: 14,
      isHod: true,
      userId: hodUser.id,
      collegeId: college.id,
    },
  });

  // The other lecturers on the timetable exist as records so every slot and
  // enrolment resolves to a person rather than a loose string.
  const OTHER_STAFF = [
    { name: 'Prof. Sunita Yadav', employeeId: 'MVM/FAC/CS/0021', designation: 'Associate Professor', email: 'sunita.yadav@mvmgwl.ac.in' },
    { name: 'Dr. Anil Sharma', employeeId: 'MVM/FAC/CS/0033', designation: 'Assistant Professor', email: 'anil.sharma@mvmgwl.ac.in' },
    { name: 'Ms. Kavita Jain', employeeId: 'MVM/FAC/CS/0058', designation: 'Guest Lecturer', email: 'kavita.jain@mvmgwl.ac.in' },
  ];

  const facultyByName = new Map<string, string>([
    ['Dr. R.K. Mishra', mishra.id],
    ['Prof. M.L. Gupta', gupta.id],
  ]);

  for (const staff of OTHER_STAFF) {
    const user = await prisma.user.create({
      data: { email: staff.email, passwordHash, role: 'FACULTY' },
    });
    const record = await prisma.faculty.create({
      data: {
        employeeId: staff.employeeId,
        name: staff.name,
        designation: staff.designation,
        department: DEPARTMENT,
        joinDate: d('2018-07-01'),
        userId: user.id,
        collegeId: college.id,
      },
    });
    facultyByName.set(staff.name, record.id);
  }

  // Back-fill the foreign keys on rows the Phase 1 seed wrote as plain names.
  for (const [name, id] of facultyByName) {
    await prisma.enrolment.updateMany({ where: { faculty: name }, data: { facultyId: id } });
    await prisma.timetableSlot.updateMany({ where: { faculty: name }, data: { facultyId: id } });
    await prisma.classSession.updateMany({
      where: { faculty: name },
      data: {
        facultyId: id,
        markedById: id,
        // Every class in the term already happened and was marked at the time,
        // so these sheets are long past the 24-hour window. Changing one now
        // requires an approved correction, which is the point of the lock.
        markedAt: d('2024-09-18'),
      },
    });
  }

  // ── Classmates ─────────────────────────────────────────────────────────────

  // A roster, a marks sheet and a mentee list are all list-shaped: with one
  // student they demonstrate nothing. These are the names the mock roster used.
  const CLASSMATES = [
    { roll: '0343', name: 'Rahul Verma', nameHi: 'राहुल वर्मा', attendance: 68, cgpa: 6.1, backlog: false },
    { roll: '0344', name: 'Anjali Patel', nameHi: 'अंजली पटेल', attendance: 92, cgpa: 8.7, backlog: false },
    { roll: '0345', name: 'Deepak Singh', nameHi: 'दीपक सिंह', attendance: 54, cgpa: 5.2, backlog: true },
    { roll: '0346', name: 'Sunita Yadav', nameHi: null, attendance: 76, cgpa: 7.1, backlog: false },
    { roll: '0347', name: 'Arun Kumar', nameHi: null, attendance: 88, cgpa: 8.2, backlog: false },
    { roll: '0348', name: 'Neha Gupta', nameHi: null, attendance: 71, cgpa: 6.9, backlog: false },
    { roll: '0349', name: 'Vikram Tiwari', nameHi: null, attendance: 65, cgpa: 6.3, backlog: false },
    { roll: '0350', name: 'Pooja Sharma', nameHi: null, attendance: 84, cgpa: 7.7, backlog: false },
    { roll: '0351', name: 'Mohit Dubey', nameHi: null, attendance: 59, cgpa: 5.6, backlog: false },
    { roll: '0352', name: 'Kavita Jain', nameHi: null, attendance: 95, cgpa: 9.1, backlog: false },
    { roll: '0353', name: 'Sanjay Mishra', nameHi: null, attendance: 62, cgpa: 6.0, backlog: false },
    { roll: '0357', name: 'Ravi Chouhan', nameHi: null, attendance: 48, cgpa: 4.8, backlog: true },
  ];

  /** The two who have not settled this term. */
  const OWING = ['Vikram Tiwari', 'Sanjay Mishra'];

  const classmateIds = new Map<string, string>();

  // Session ids per subject, reused for every classmate's attendance.
  const sessionsBySubject = new Map<string, string[]>();
  for (const [code, subjectId] of subjectByCode) {
    const rows = await prisma.classSession.findMany({
      where: { subjectId },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    if (rows.length > 0) sessionsBySubject.set(code, rows.map((r) => r.id));
  }

  for (const mate of CLASSMATES) {
    const slug = mate.name.toLowerCase().replace(/[^a-z]+/g, '.');
    const user = await prisma.user.create({
      data: { email: `${slug}.2021@mvmgwl.ac.in`, passwordHash, role: 'STUDENT' },
    });

    const record = await prisma.student.create({
      data: {
        enrolmentNo: `JU/2021/BCA/${mate.roll}`,
        rollNo: `MVM/BCA/2021/${mate.roll}`,
        name: mate.name,
        nameHi: mate.nameHi,
        dob: d('2003-06-01'),
        semester: 5,
        year: 3,
        batch: '2021–24',
        userId: user.id,
        collegeId: college.id,
        programmeId: programme.id,
      },
    });
    classmateIds.set(mate.name, record.id);

    for (const s of SUBJECTS) {
      const subjectId = subjectByCode.get(s.code)!;
      await prisma.enrolment.create({
        data: {
          studentId: record.id,
          subjectId,
          faculty: s.faculty,
          facultyId: facultyByName.get(s.faculty) ?? null,
          room: s.room,
          term: TERM,
        },
      });

      // Their headline percentage, applied to the classes actually held.
      const sessions = sessionsBySubject.get(s.code) ?? [];
      const present = Math.round((mate.attendance / 100) * sessions.length);
      await prisma.attendanceRecord.createMany({
        data: sessions.slice(0, present).map((id) => ({
          studentId: record.id,
          sessionId: id,
          status: 'PRESENT' as const,
          source: 'SEED',
        })),
      });
    }

    // Most of the class has settled; two have not, which is what gives the
    // counter something to take and scrutiny a fee case to hold.
    const owes = OWING.includes(mate.name);
    await prisma.feeItem.createMany({
      data: [
        { studentId: record.id, head: 'Tuition Fee', amount: 7500, paid: 7500, category: 'TUITION', term: TERM },
        { studentId: record.id, head: 'Development Fee', amount: 2000, paid: owes ? 0 : 2000, category: 'DEVELOPMENT', term: TERM },
        { studentId: record.id, head: 'Examination Fee', amount: 1800, paid: owes ? 0 : 1800, category: 'EXAM', term: TERM },
      ],
    });

    // One declared result, so the mentoring view has a CGPA to flag on.
    const result = await prisma.semesterResult.create({
      data: {
        studentId: record.id,
        semester: 4,
        declaredOn: 'May 2023',
        sgpa: mate.cgpa,
        cgpa: mate.cgpa,
        totalCredits: 84,
        outcome: 'PASS',
      },
    });

    if (mate.backlog) {
      await prisma.subjectResult.create({
        data: {
          resultId: result.id,
          subjectId: subjectByCode.get('BCA402')!,
          internal: 12,
          external: 18,
          total: 30,
          grade: 'F',
          passed: false,
        },
      });
    }
  }

  // ── Teaching load ──────────────────────────────────────────────────────────

  const ASSIGNMENTS = [
    { code: 'BCA501', faculty: mishra.id, kind: 'THEORY' as const, room: 'CS-201' },
    { code: 'BCA506', faculty: mishra.id, kind: 'PROJECT' as const, room: 'Lab-2' },
    { code: 'BCA504', faculty: gupta.id, kind: 'THEORY' as const, room: 'CS-202' },
    { code: 'BCA502', faculty: facultyByName.get('Prof. Sunita Yadav')!, kind: 'THEORY' as const, room: 'CS-203' },
    { code: 'BCA503', faculty: facultyByName.get('Dr. Anil Sharma')!, kind: 'THEORY' as const, room: 'CS-101' },
    { code: 'BCA505', faculty: facultyByName.get('Ms. Kavita Jain')!, kind: 'LAB' as const, room: 'Lab-3' },
  ];

  for (const a of ASSIGNMENTS) {
    await prisma.subjectAssignment.create({
      data: {
        facultyId: a.faculty,
        subjectId: subjectByCode.get(a.code)!,
        term: TERM,
        section: 'A',
        classLabel: 'BCA V Sem A',
        room: a.room,
        kind: a.kind,
      },
    });
  }

  // ── Mentoring ──────────────────────────────────────────────────────────────

  const MENTEES = ['Rahul Verma', 'Deepak Singh', 'Ravi Chouhan', 'Anjali Patel'];

  await prisma.mentorship.create({
    data: {
      facultyId: mishra.id,
      studentId: student.id,
      lastInteractionAt: d('2024-09-12'),
    },
  });

  for (const name of MENTEES) {
    await prisma.mentorship.create({
      data: {
        facultyId: mishra.id,
        studentId: classmateIds.get(name)!,
        lastInteractionAt: d('2024-09-05'),
      },
    });
  }

  // ── Correction requests waiting on the lecturer ───────────────────────────

  const seSessions = sessionsBySubject.get('BCA501') ?? [];
  // Classes late in the term, which the weaker students missed.
  const disputed = seSessions.slice(-2);

  if (disputed.length === 2) {
    await prisma.attendanceCorrection.create({
      data: {
        studentId: classmateIds.get('Rahul Verma')!,
        sessionId: disputed[0]!,
        markedAs: 'ABSENT',
        requestedStatus: 'PRESENT',
        reason:
          'I was present but entered class five minutes late, after attendance had been taken.',
        raisedAt: d('2024-09-17'),
      },
    });

    await prisma.attendanceCorrection.create({
      data: {
        studentId: classmateIds.get('Mohit Dubey')!,
        sessionId: disputed[1]!,
        markedAs: 'ABSENT',
        requestedStatus: 'EXCUSED',
        reason: 'Medical emergency — OPD slip attached.',
        attachment: 'OPD_Slip_12Sep.pdf',
        raisedAt: d('2024-09-13'),
      },
    });
  }

  // ── Leave ──────────────────────────────────────────────────────────────────

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

  await prisma.facultyLeave.create({
    data: {
      facultyId: mishra.id,
      kind: 'CASUAL',
      fromDate: d('2024-09-20'),
      toDate: d('2024-09-21'),
      days: 2,
      reason: 'Personal work — family function',
      substitute: 'Prof. Sunita Yadav',
      status: 'APPROVED',
      appliedAt: d('2024-09-15'),
      decidedAt: d('2024-09-16'),
      decidedById: gupta.id,
    },
  });

  // Dated against today, not 2024: a pending application is the principal's
  // inbox item, and one that reads as two years overdue demonstrates nothing.
  const LEAVE_FROM = 5;
  await prisma.facultyLeave.create({
    data: {
      facultyId: mishra.id,
      kind: 'MEDICAL',
      fromDate: daysAhead(LEAVE_FROM),
      toDate: daysAhead(LEAVE_FROM + 2),
      days: 3,
      reason: 'Scheduled medical examination',
      appliedAt: daysAgo(1),
    },
  });

  // ── Study material ─────────────────────────────────────────────────────────

  await prisma.studyMaterial.createMany({
    data: [
      { facultyId: mishra.id, subjectId: subjectByCode.get('BCA501')!, unit: 1, unitTitle: 'Introduction to SE & Process Models', filename: 'Unit1_SE_ProcessModels.pdf', type: 'PDF', sizeLabel: '2.4 MB', uploadedAt: d('2024-07-25') },
      { facultyId: mishra.id, subjectId: subjectByCode.get('BCA501')!, unit: 2, unitTitle: 'Requirements Engineering', filename: 'Unit2_Requirements.pdf', type: 'PDF', sizeLabel: '1.8 MB', uploadedAt: d('2024-08-12') },
      { facultyId: mishra.id, subjectId: subjectByCode.get('BCA501')!, unit: 3, unitTitle: 'Software Design', filename: 'Unit3_Design_Patterns.ppt', type: 'PPT', sizeLabel: '5.1 MB', uploadedAt: d('2024-09-02') },
      { facultyId: mishra.id, subjectId: subjectByCode.get('BCA506')!, unit: 1, unitTitle: 'Project Guidelines & Synopsis Format', filename: 'MiniProject_Guidelines.pdf', type: 'PDF', sizeLabel: '0.9 MB', visibleToStudents: false, uploadedAt: d('2024-08-01') },
    ],
  });


  // ══ Phase 3 — the college office ═════════════════════════════════════════

  // ── Counter staff ──────────────────────────────────────────────────────────

  const clerkUser = await prisma.user.create({
    data: { email: 'pushpa.sharma@mvmgwl.ac.in', passwordHash, role: 'OFFICE' },
  });

  const clerk = await prisma.officeStaff.create({
    data: {
      employeeId: 'MVM/OFF/0009',
      name: 'Smt. Pushpa Sharma',
      nameHi: 'श्रीमती पुष्पा शर्मा',
      designation: 'Head Clerk',
      counter: 'Counter 1 — Admissions & Fees',
      mobile: '+91 94250 77310',
      userId: clerkUser.id,
      collegeId: college.id,
    },
  });

  const registrarUser = await prisma.user.create({
    data: { email: 'registrar@mvmgwl.ac.in', passwordHash, role: 'REGISTRAR' },
  });

  await prisma.officeStaff.create({
    data: {
      employeeId: 'MVM/OFF/0001',
      name: 'Sri Ravi Sharma',
      designation: 'Registrar',
      counter: 'Counter 2 — Certificates',
      userId: registrarUser.id,
      collegeId: college.id,
    },
  });

  // ── Admission queue ────────────────────────────────────────────────────────

  const DOCS = [
    { name: '10th Marksheet', required: true },
    { name: '12th Marksheet', required: true },
    { name: 'Transfer Certificate', required: true },
    { name: 'Character Certificate', required: true },
    { name: 'Caste Certificate (if applicable)', required: false },
    { name: 'Income Certificate', required: false },
    { name: 'Domicile Certificate', required: true },
    { name: 'Aadhaar Card', required: true },
    { name: 'Passport Photo (6 copies)', required: true },
    { name: 'Medical Fitness Certificate', required: true },
  ];

  const APPLICANTS = [
    {
      no: 'ADM/2024/BCA/0001', name: 'Shivani Rajput', nameHi: 'शिवानी राजपूत',
      dob: '2006-05-22', gender: 'Female', category: 'OBC', meritRank: 12,
      mobile: '+91 98765 12345', email: 'shivani.rajput24@gmail.com',
      // Two papers still outstanding, which is why she sits at pending.
      unverified: ['Transfer Certificate', 'Character Certificate', 'Domicile Certificate'],
      missing: ['Medical Fitness Certificate', 'Income Certificate'],
    },
    {
      no: 'ADM/2024/BCA/0002', name: 'Dinesh Yadav', dob: '2005-11-08',
      gender: 'Male', category: 'SC', meritRank: 23,
      mobile: '+91 94254 67891', email: 'dinesh.yadav24@gmail.com',
      unverified: [], missing: [],
    },
    {
      no: 'ADM/2024/BCA/0003', name: 'Kirti Agrawal', dob: '2002-03-15',
      gender: 'Female', category: 'General', meritRank: 4,
      mobile: '+91 70249 33456', email: 'kirti.agrawal24@gmail.com',
      unverified: ['Character Certificate'], missing: ['Medical Fitness Certificate'],
    },
  ];

  for (const a of APPLICANTS) {
    const claimsCategory = !!a.category && a.category.toLowerCase() !== 'general';
    await prisma.admissionApplication.create({
      data: {
        applicationNo: a.no,
        name: a.name,
        nameHi: a.nameHi ?? null,
        dob: d(a.dob),
        gender: a.gender,
        category: a.category,
        mobile: a.mobile,
        email: a.email,
        meritRank: a.meritRank,
        admissionDate: d('2024-09-17'),
        status: a.unverified.length === 0 && a.missing.length === 0 ? 'VERIFIED' : 'PENDING_DOCS',
        collegeId: college.id,
        programmeId: programme.id,
        documents: {
          create: DOCS.map((doc) => {
            const required = doc.name.startsWith('Caste Certificate')
              ? claimsCategory
              : doc.required;
            const absent = a.missing.includes(doc.name);
            const pending = a.unverified.includes(doc.name);
            return {
              name: doc.name,
              required,
              uploaded: !absent,
              verified: !absent && !pending,
              verifiedById: !absent && !pending ? clerk.id : null,
              verifiedAt: !absent && !pending ? d('2024-09-17') : null,
              remarks: absent ? 'To submit within 7 days' : null,
            };
          }),
        },
      },
    });
  }

  // ── Counter takings ────────────────────────────────────────────────────────

  // Each receipt is backed by a real ledger row, the same way the API writes
  // them — a payment at the window is a payment on the student's own screen.
  const COUNTER = [
    { no: 'CNT/JU/2024/001141', student: classmateIds.get('Arun Kumar')!, head: 'Examination Fee', amount: 1800, mode: 'UPI', instrument: 'UPI2024091800112233', at: '2024-09-18', status: 'COMPLETE' as const },
    { no: 'CNT/JU/2024/001142', student: classmateIds.get('Pooja Sharma')!, head: 'Semester Fee (Late)', amount: 9500, mode: 'CASH', instrument: null, at: '2024-09-18', status: 'COMPLETE' as const },
    { no: 'CNT/JU/2024/001143', student: classmateIds.get('Mohit Dubey')!, head: 'Examination Fee', amount: 1800, mode: 'CHEQUE', instrument: '004421', at: '2024-09-17', status: 'PENDING_CLEARANCE' as const },
  ];

  for (const c of COUNTER) {
    const payment = await prisma.payment.create({
      data: {
        studentId: c.student,
        head: c.head,
        amount: c.amount,
        mode: c.mode,
        txnId: `CNT-SEED-${c.no.slice(-6)}`,
        receiptNo: c.no,
        status: c.status === 'COMPLETE' ? 'SUCCESS' : 'PENDING',
        paidAt: d(c.at),
      },
    });

    await prisma.counterReceipt.create({
      data: {
        receiptNo: c.no,
        studentId: c.student,
        head: c.head,
        amount: c.amount,
        mode: c.mode,
        instrument: c.instrument,
        status: c.status,
        settledAt: c.status === 'COMPLETE' ? d(c.at) : null,
        receivedAt: d(c.at),
        receivedById: clerk.id,
        paymentId: payment.id,
      },
    });
  }

  // ── Certificate queue ──────────────────────────────────────────────────────

  // Dated relative to today, for the same reason the leave above is: the
  // queue's whole point is the clock running against each request.

  const CERTS = [
    { no: 'CR/2024/00892', type: 'Bonafide Certificate', student: student.id, purpose: 'Bank account opening', raised: 4, due: 10, priority: 'NORMAL' as const, stage: 'COLLEGE_OFFICE' as const, fee: 0, paid: true },
    { no: 'CR/2024/00901', type: 'Character Certificate', student: classmateIds.get('Vikram Tiwari')!, purpose: 'Job application', raised: 12, due: 2, priority: 'NORMAL' as const, stage: 'COLLEGE_OFFICE' as const, fee: 50, paid: true },
    // Urgent, and already past its promise — the row the queue should lead on.
    { no: 'CR/2024/00912', type: 'Bonafide Certificate', student: classmateIds.get('Anjali Patel')!, purpose: 'Passport application — urgent', raised: 9, due: -2, priority: 'URGENT' as const, stage: 'COLLEGE_OFFICE' as const, fee: 0, paid: true },
    { no: 'CR/2024/00876', type: 'Migration Certificate', student: classmateIds.get('Rahul Verma')!, purpose: 'Transfer to another university', raised: 6, due: 2, priority: 'URGENT' as const, stage: 'READY' as const, fee: 200, paid: true },
  ];

  for (const c of CERTS) {
    await prisma.certificateRequest.create({
      data: {
        requestNo: c.no,
        studentId: c.student,
        type: c.type,
        purpose: c.purpose,
        priority: c.priority,
        stage: c.stage,
        fee: c.fee,
        feePaid: c.paid,
        requestedAt: daysAgo(c.raised),
        slaDeadline: daysAhead(c.due),
        ...(c.stage === 'READY'
          ? { issuedById: clerk.id, issuedAt: daysAgo(1), notes: 'Ready for pickup — student notified' }
          : {}),
      },
    });
  }

  // ── Examination forms ──────────────────────────────────────────────────────

  // Everyone in BCA V, so scrutiny has both clean forms and real shortfalls.
  const FORM_STUDENTS = [student.id, ...classmateIds.values()];
  let formSerial = 0;

  for (const studentId of FORM_STUDENTS) {
    const enrolled = await prisma.enrolment.findMany({
      where: { studentId, term: TERM },
      select: { subjectId: true },
    });
    if (enrolled.length === 0) continue;

    formSerial += 1;
    await prisma.examForm.create({
      data: {
        formNo: `EF/2024/V/${String(formSerial).padStart(4, '0')}`,
        studentId,
        semester: 5,
        term: TERM,
        submittedAt: d('2024-09-15'),
        eligibility: 'PENDING',
        subjects: {
          create: enrolled.map((e) => ({ subjectId: e.subjectId, kind: 'REGULAR' as const })),
        },
      },
    });
  }


  // ══ Phase 4 — the examination back-office ════════════════════════════════

  const CENTRES = [
    { code: 'GWL-01', name: 'Govt. M.L.B. Girls College', city: 'Gwalior', district: 'Gwalior', capacity: 1200, pincode: '474001' },
    { code: 'GWL-02', name: 'Govt. Madhav Science College', city: 'Gwalior', district: 'Gwalior', capacity: 1000, pincode: '474002' },
    { code: 'GWL-03', name: 'Govt. Commerce College', city: 'Gwalior', district: 'Gwalior', capacity: 800, pincode: '474001' },
    { code: 'GWL-04', name: 'Govt. MVM College', city: 'Gwalior', district: 'Gwalior', capacity: 900, pincode: '474011' },
    { code: 'MRN-01', name: 'Govt. Degree College, Morena', city: 'Morena', district: 'Morena', capacity: 600, pincode: '476001' },
    { code: 'BHD-01', name: 'Govt. Degree College, Bhind', city: 'Bhind', district: 'Bhind', capacity: 500, pincode: '477001' },
    // Deliberately tiny, so the allocation screen has a hall that fills up.
    { code: 'DTA-01', name: 'Govt. Degree College, Datia', city: 'Datia', district: 'Datia', capacity: 8, pincode: '475661' },
  ];

  await prisma.examCentre.createMany({ data: CENTRES });

  // The sitting the back-office is working on. It starts with the form window
  // closed, which is the point at which centres are allocated.
  const examSession = await prisma.examSession.create({
    data: {
      code: 'SES/JU/2024/ODD',
      name: 'Nov–Dec 2024 (Odd Semester)',
      academicYear: '2024–25',
      status: 'FORM_WINDOW_CLOSED',
      formOpensOn: d('2024-09-01'),
      formClosesOn: d('2024-09-30'),
      lateClosesOn: d('2024-10-15'),
      examStartsOn: d('2024-11-04'),
      examEndsOn: d('2024-11-28'),
      resultTargetOn: d('2025-01-31'),
      regularFee: 1800,
      lateFee: 500,
      backlogFee: 300,
    },
  });

  // A paper per current subject, sat on consecutive days.
  const EXAM_DATES = ['2024-11-04', '2024-11-06', '2024-11-08', '2024-11-11', '2024-11-13', '2024-11-15'];
  let paperIndex = 0;
  for (const s of SUBJECTS) {
    await prisma.examPaper.create({
      data: {
        sessionId: examSession.id,
        subjectId: subjectByCode.get(s.code)!,
        examDate: d(EXAM_DATES[paperIndex % EXAM_DATES.length]!),
        examTime: '10:00–13:00',
        maxExternal: 70,
        maxInternal: 30,
      },
    });
    paperIndex += 1;
  }

  // A previous sitting, already published, so the student portal has history
  // that did not come from Phase 1's hand-written results.
  await prisma.examSession.create({
    data: {
      code: 'SES/JU/2024/EVEN',
      name: 'Apr–May 2024 (Even Semester)',
      academicYear: '2023–24',
      status: 'RESULT_PUBLISHED',
      formOpensOn: d('2024-02-01'),
      formClosesOn: d('2024-02-28'),
      lateClosesOn: d('2024-03-10'),
      examStartsOn: d('2024-04-08'),
      examEndsOn: d('2024-04-30'),
      resultTargetOn: d('2024-06-30'),
      publishedAt: d('2024-06-21'),
    },
  });


  // ══ Phase 5 — governance ═════════════════════════════════════════════════

  const principalUser = await prisma.user.create({
    data: { email: 'principal@mvmgwl.ac.in', passwordHash, role: 'PRINCIPAL' },
  });

  const principal = await prisma.faculty.create({
    data: {
      employeeId: 'MVM/FAC/CS/0001',
      teacherCode: 'EMP/JU/TC/0018',
      name: 'Dr. Nirmala Verma',
      nameHi: 'डॉ. निर्मला वर्मा',
      designation: 'Principal',
      department: DEPARTMENT,
      mobile: '+91 94250 10018',
      joinDate: d('1998-06-15'),
      specialization: 'Higher Education Administration',
      // A principal carries a teaching post, but not a teaching load.
      maxWeeklyLoad: 4,
      userId: principalUser.id,
      collegeId: college.id,
    },
  });

  // ── The affiliation file ───────────────────────────────────────────────────

  const COMPLIANCE = [
    { code: 'UGC-2F', category: 'Statutory', authority: 'UGC', requirement: 'Recognition under Section 2(f) of the UGC Act', status: 'COMPLIANT' as const, evidence: 'UGC letter F.8-42/2009(CPP-I) dated 14-08-2009', due: null },
    { code: 'UGC-12B', category: 'Statutory', authority: 'UGC', requirement: 'Eligibility under Section 12(B) for central assistance', status: 'COMPLIANT' as const, evidence: 'UGC 12(B) certificate dated 02-02-2011', due: null },
    { code: 'JU-AFF-01', category: 'Affiliation', authority: 'Jiwaji University', requirement: 'Annual affiliation renewal for all running programmes', status: 'PARTIAL' as const, evidence: 'Application submitted; inspection pending', due: 45 },
    { code: 'JU-AFF-02', category: 'Affiliation', authority: 'Jiwaji University', requirement: 'Sanctioned intake not exceeded in any programme', status: 'COMPLIANT' as const, evidence: 'Admission register, verified 17-09-2024', due: null },
    { code: 'NAAC-SSR', category: 'Accreditation', authority: 'NAAC', requirement: 'Self Study Report submitted for the current cycle', status: 'PARTIAL' as const, evidence: 'Draft SSR circulated to IQAC', due: 30 },
    { code: 'NAAC-AQAR', category: 'Accreditation', authority: 'NAAC', requirement: 'Annual Quality Assurance Report filed for the preceding year', status: 'NON_COMPLIANT' as const, evidence: null, due: -12 },
    { code: 'FAC-RATIO', category: 'Faculty', authority: 'UGC', requirement: 'Student–teacher ratio within the prescribed norm', status: 'COMPLIANT' as const, evidence: 'Workload statement, current term', due: null },
    { code: 'FAC-QUAL', category: 'Faculty', authority: 'UGC', requirement: 'All teaching posts held by qualified staff (NET/SET/PhD)', status: 'PARTIAL' as const, evidence: 'Two guest lecturers pending NET', due: 90 },
    { code: 'INF-LIB', category: 'Infrastructure', authority: 'Jiwaji University', requirement: 'Library holdings and reading space per the affiliation norms', status: 'COMPLIANT' as const, evidence: 'Library stock register, audited 30-06-2024', due: null },
    { code: 'INF-LAB', category: 'Infrastructure', authority: 'AICTE', requirement: 'Computer laboratory ratio of one terminal per two students', status: 'NON_COMPLIANT' as const, evidence: null, due: 20 },
    { code: 'GOV-IQAC', category: 'Governance', authority: 'NAAC', requirement: 'IQAC constituted and meeting quarterly', status: 'COMPLIANT' as const, evidence: 'Minutes of four meetings, 2023–24', due: null },
    { code: 'GOV-GRIEV', category: 'Governance', authority: 'UGC', requirement: 'Grievance redressal and anti-ragging committees notified', status: 'COMPLIANT' as const, evidence: 'Notification dated 01-07-2024', due: null },
  ];

  for (const c of COMPLIANCE) {
    await prisma.complianceItem.create({
      data: {
        code: c.code,
        category: c.category,
        authority: c.authority,
        requirement: c.requirement,
        status: c.status,
        evidence: c.evidence,
        dueOn: c.due === null ? null : new Date(Date.now() + c.due * 86_400_000),
        lastReviewedAt: c.status === 'COMPLIANT' ? d('2024-09-10') : null,
        reviewedById: c.status === 'COMPLIANT' ? principal.id : null,
        collegeId: college.id,
      },
    });
  }

  // ── Things waiting on the principal ────────────────────────────────────────

  const REQUESTS = [
    { no: 'GR/2024/0001', kind: 'BUDGET' as const, subject: 'Computer laboratory upgrade — 20 terminals', details: 'The AICTE terminal ratio is not met. Quotation attached from three vendors; lowest is ₹8,40,000 inclusive of installation.', amount: 840000, priority: 'HIGH' as const, sla: 5 },
    { no: 'GR/2024/0002', kind: 'EVENT' as const, subject: 'National seminar on Software Engineering practice', details: 'Two-day seminar proposed for 12–13 December, with eight external speakers. Department of Computer Science & Applications.', amount: 125000, priority: 'NORMAL' as const, sla: 14 },
    { no: 'GR/2024/0003', kind: 'INFRASTRUCTURE' as const, subject: 'Repair of the east block roof before the monsoon', details: 'Water ingress reported in three classrooms. PWD estimate attached.', amount: 310000, priority: 'HIGH' as const, sla: -2 },
    { no: 'GR/2024/0004', kind: 'POLICY' as const, subject: 'Revised attendance condonation policy', details: 'Proposal to formalise medical condonation up to 10% on documentary evidence, replacing case-by-case decisions.', amount: null, priority: 'LOW' as const, sla: 30 },
  ];

  for (const r of REQUESTS) {
    await prisma.governanceRequest.create({
      data: {
        requestNo: r.no,
        kind: r.kind,
        subject: r.subject,
        details: r.details,
        amount: r.amount,
        priority: r.priority,
        raisedAt: new Date(Date.now() - 6 * 86_400_000),
        slaDeadline: new Date(Date.now() + r.sla * 86_400_000),
        collegeId: college.id,
        raisedById: mishra.id,
      },
    });
  }


  // ══ Phase 6 — accreditation ══════════════════════════════════════════════

  const naac = await prisma.accreditationFramework.create({
    data: {
      code: 'NAAC',
      name: 'National Assessment and Accreditation Council',
      description: 'Seven criteria, assessed on a four-point scale over a five-year cycle.',
    },
  });

  const nirf = await prisma.accreditationFramework.create({
    data: {
      code: 'NIRF',
      name: 'National Institutional Ranking Framework',
      description: 'Annual ranking scored out of 100 across five heads.',
      maxScore: 100,
    },
  });

  const aishe = await prisma.accreditationFramework.create({
    data: {
      code: 'AISHE',
      name: 'All India Survey on Higher Education',
      description: 'Annual statistical return filed by every recognised institution.',
    },
  });

  const ugc = await prisma.accreditationFramework.create({
    data: { code: 'UGC', name: 'University Grants Commission', description: 'Statutory returns.' },
  });

  // Each metric names the computation that answers it, or says nothing does.
  const METRICS: Array<{
    fw: string; code: string; crit?: number; critTitle?: string; title: string;
    description?: string; target?: string; max?: number;
    derived?: string; entered?: string; score?: number; evidence?: string; remarks?: string;
  }> = [
    // ── NAAC ────────────────────────────────────────────────────────────────
    { fw: 'NAAC', code: '1.1.1', crit: 1, critTitle: 'Curricular Aspects', title: 'Programmes offered', description: 'Number of programmes on offer at the college', target: 'As sanctioned', derived: 'programmes_offered', evidence: 'Affiliation order, current session' },
    { fw: 'NAAC', code: '1.3.2', crit: 1, critTitle: 'Curricular Aspects', title: 'Project, field work or internship', description: 'Share of programmes carrying a project or internship component', target: '≥80%', remarks: 'Needs a cross-check with each department' },
    { fw: 'NAAC', code: '2.1.1', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Student–teacher ratio', description: 'Students on the roll against sanctioned teaching posts', target: '≤30:1', derived: 'student_teacher_ratio', evidence: 'Employee master and admission register' },
    { fw: 'NAAC', code: '2.1.2', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Seats filled against reserved categories', description: 'Share of the roll in SC, ST, OBC or another reserved category', target: '100% of sanctioned', derived: 'reserved_category_students' },
    { fw: 'NAAC', code: '2.4.1', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Full-time teachers with a doctorate', description: 'Share of teaching staff holding a PhD', target: '≥50%', entered: '58%', evidence: 'Service records, verified 10-09-2024' },
    { fw: 'NAAC', code: '2.5.1', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Internal assessment completed and approved', description: 'Share of internal marks sheets approved by a head of department', target: '100%', derived: 'internal_marks_approved' },
    { fw: 'NAAC', code: '2.6.3', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Pass percentage', description: 'Candidates passing their most recent published examination', target: '≥80%', derived: 'pass_percentage', evidence: 'Result registers of the published sitting' },
    { fw: 'NAAC', code: '2.7.1', crit: 2, critTitle: 'Teaching-Learning & Evaluation', title: 'Average attendance', description: 'Mean attendance across the roll, from marked class sessions', target: '≥75%', derived: 'average_attendance' },
    { fw: 'NAAC', code: '3.1.1', crit: 3, critTitle: 'Research, Innovations & Extension', title: 'Research grants received', description: 'Grants from government and other agencies for research', target: 'Documentary evidence' },
    { fw: 'NAAC', code: '3.3.1', crit: 3, critTitle: 'Research, Innovations & Extension', title: 'Research papers published', description: 'Papers in UGC-CARE listed journals per teacher', target: '≥0.3 per teacher', remarks: 'Departmental returns still being collected' },
    { fw: 'NAAC', code: '4.1.1', crit: 4, critTitle: 'Infrastructure & Learning Resources', title: 'Classrooms and seminar halls', description: 'Adequacy of teaching infrastructure', target: 'Self-assessment', entered: 'Adequate', evidence: 'Building plan and room register' },
    { fw: 'NAAC', code: '5.1.1', crit: 5, critTitle: 'Student Support & Progression', title: 'Scholarships and freeships', description: 'Share of the roll holding a scholarship award', target: '≥20%', derived: 'scholarship_beneficiaries' },
    { fw: 'NAAC', code: '5.1.4', crit: 5, critTitle: 'Student Support & Progression', title: 'Student services answered within the service standard', description: 'Certificates issued on or before the promised date', target: '≥90%', derived: 'certificates_within_sla' },
    { fw: 'NAAC', code: '5.2.1', crit: 5, critTitle: 'Student Support & Progression', title: 'Placement and higher studies', description: 'Share of outgoing students placed or progressing', target: '≥30%' },
    { fw: 'NAAC', code: '6.2.1', crit: 6, critTitle: 'Governance, Leadership & Management', title: 'Statutory requirements met', description: 'Share of the affiliation file recorded as compliant', target: '100%', derived: 'compliance_met' },
    { fw: 'NAAC', code: '6.3.1', crit: 6, critTitle: 'Governance, Leadership & Management', title: 'Teaching load against sanction', description: 'Sanctioned weekly hours actually allotted on the timetable', target: '≥80%', derived: 'teaching_load_utilisation' },
    { fw: 'NAAC', code: '7.1.2', crit: 7, critTitle: 'Institutional Values & Best Practices', title: 'Facilities for differently-abled students', description: 'Facilities available against the prescribed list', target: '4 of 8 minimum', entered: '5 of 8', evidence: 'Access audit, March 2024' },

    // ── NIRF ────────────────────────────────────────────────────────────────
    { fw: 'NIRF', code: 'TLR-1', crit: 1, critTitle: 'Teaching, Learning & Resources', title: 'Student strength', description: 'Total students on the roll', max: 20, derived: 'enrolment_total' },
    { fw: 'NIRF', code: 'TLR-2', crit: 1, critTitle: 'Teaching, Learning & Resources', title: 'Faculty–student ratio', description: 'Emphasis on permanent faculty', max: 30, derived: 'student_teacher_ratio' },
    { fw: 'NIRF', code: 'TLR-3', crit: 1, critTitle: 'Teaching, Learning & Resources', title: 'Faculty with a doctorate and experience', description: 'Combined metric', max: 20, entered: '58% with PhD', score: 14.2 },
    { fw: 'NIRF', code: 'TLR-4', crit: 1, critTitle: 'Teaching, Learning & Resources', title: 'Financial resources and their use', description: 'Budget utilisation', max: 30 },
    { fw: 'NIRF', code: 'RPC-1', crit: 2, critTitle: 'Research and Professional Practice', title: 'Publications', description: 'Combined metric for publications', max: 35, remarks: 'Scopus and Web of Science pull not set up' },
    { fw: 'NIRF', code: 'GO-1', crit: 3, critTitle: 'Graduation Outcomes', title: 'Placement and higher studies', description: 'Combined metric', max: 40 },
    { fw: 'NIRF', code: 'GO-2', crit: 3, critTitle: 'Graduation Outcomes', title: 'Examination results', description: 'Candidates passing their most recent published examination', max: 15, derived: 'pass_percentage' },
    { fw: 'NIRF', code: 'OI-2', crit: 4, critTitle: 'Outreach and Inclusivity', title: 'Women, SC, ST and OBC students', description: 'Share of the roll', max: 30, derived: 'reserved_category_students' },
    { fw: 'NIRF', code: 'OI-3', crit: 4, critTitle: 'Outreach and Inclusivity', title: 'Women students', description: 'Share of the roll recorded as female', max: 15, derived: 'women_students' },
    { fw: 'NIRF', code: 'PR-1', crit: 5, critTitle: 'Peer Perception', title: 'Peer perception', description: 'Survey based, submitted separately', max: 100, remarks: 'Survey conducted by the ranking agency' },

    // ── AISHE ───────────────────────────────────────────────────────────────
    { fw: 'AISHE', code: 'B', crit: 2, critTitle: 'Enrolment', title: 'Enrolment by programme', description: 'Students on the roll, by programme', derived: 'enrolment_total' },
    { fw: 'AISHE', code: 'C', crit: 3, critTitle: 'Enrolment', title: 'Enrolment by gender and social group', description: 'Share of the roll recorded as female', derived: 'women_students' },
    { fw: 'AISHE', code: 'E', crit: 5, critTitle: 'Infrastructure', title: 'Infrastructure', description: 'Land, buildings, library and laboratories' },
    { fw: 'AISHE', code: 'F', crit: 6, critTitle: 'Finance', title: 'Finance and expenditure', description: 'Receipts and expenditure for the year', derived: 'fee_collection_rate' },
    { fw: 'AISHE', code: 'G', crit: 7, critTitle: 'Results', title: 'Examination results', description: 'Candidates passing their most recent published examination', derived: 'pass_percentage' },
  ];

  for (const m of METRICS) {
    const fwId = m.fw === 'NAAC' ? naac.id : m.fw === 'NIRF' ? nirf.id : m.fw === 'AISHE' ? aishe.id : ugc.id;
    await prisma.accreditationMetric.create({
      data: {
        frameworkId: fwId,
        code: m.code,
        criterion: m.crit ?? null,
        criterionTitle: m.critTitle ?? null,
        title: m.title,
        description: m.description ?? null,
        target: m.target ?? null,
        maxScore: m.max ?? null,
        source: m.derived ? 'DERIVED' : m.entered ? 'ENTERED' : 'UNAVAILABLE',
        derivedFrom: m.derived ?? null,
        enteredValue: m.entered ?? null,
        enteredScore: m.score ?? null,
        evidence: m.evidence ?? null,
        remarks: m.remarks ?? null,
        updatedById: m.entered ? principal.id : null,
      },
    });
  }

  // ── The statutory calendar ─────────────────────────────────────────────────

  const RETURNS = [
    { code: 'UGC-R-01', fw: ugc.id, name: 'Annual Return of Enrolment', due: -40, filed: -55, ref: 'UGC/ENR/2024/88213' },
    { code: 'UGC-R-02', fw: ugc.id, name: 'Annual Return of Results', due: 28, filed: null, ref: null },
    { code: 'UGC-R-03', fw: ugc.id, name: 'Annual Return of Expenditure', due: -9, filed: null, ref: null },
    { code: 'UGC-R-04', fw: ugc.id, name: 'Faculty Data Return', due: -20, filed: -25, ref: 'UGC/FAC/2024/41190' },
    { code: 'AISHE-2425', fw: aishe.id, name: 'AISHE annual survey 2024–25', due: 62, filed: null, ref: null },
    { code: 'NIRF-2025', fw: nirf.id, name: 'NIRF submission 2025', due: 95, filed: null, ref: null },
    { code: 'NAAC-AQAR-2324', fw: naac.id, name: 'AQAR for 2023–24', due: -12, filed: null, ref: null },
  ];

  for (const r of RETURNS) {
    await prisma.statutoryReturn.create({
      data: {
        code: r.code,
        frameworkId: r.fw,
        name: r.name,
        dueOn: new Date(Date.now() + r.due * 86_400_000),
        submittedOn: r.filed === null ? null : new Date(Date.now() + r.filed * 86_400_000),
        reference: r.ref,
        collegeId: college.id,
      },
    });
  }


  // ══ Phase 7 — procurement ════════════════════════════════════════════════

  const VENDORS = [
    { code: 'VND/001', name: 'Technocraft IT Solutions Pvt. Ltd.', gstin: '23AABCT1234D1ZQ', pan: 'AABCT1234D', cats: ['IT Equipment', 'Software'], contact: 'Ajay Trivedi', mobile: '98264 78901', email: 'ajay@technocraft.in', status: 'EMPANELLED' as const, verified: true, upto: 400 },
    { code: 'VND/002', name: 'Shree Stationers & Publishers', gstin: '23AAQPS5678E1ZR', pan: 'AAQPS5678E', cats: ['Stationery', 'Printing'], contact: 'Pradeep Sharma', mobile: '94250 34512', email: 'pradeep@shreestationer.co.in', status: 'EMPANELLED' as const, verified: true, upto: 180 },
    { code: 'VND/003', name: 'Gwalior Scientific Instruments', gstin: '23AAVGS9012F1ZS', pan: 'AAVGS9012F', cats: ['Lab Equipment', 'IT Equipment'], contact: 'Suresh Gupta', mobile: '70491 22334', email: 'suresh@gsi.co.in', status: 'EMPANELLED' as const, verified: true, upto: 400 },
    { code: 'VND/004', name: 'Madhya Pradesh Construction Co.', gstin: '23AAAPM3456G1ZT', pan: 'AAAPM3456G', cats: ['Civil Works'], contact: 'Vinod Kumar', mobile: '88175 67890', email: 'mpcc.gwl@gmail.com', status: 'EMPANELLED' as const, verified: true, upto: 180 },
    // Papers not yet checked, so not yet allowed to bid.
    { code: 'VND/005', name: 'Sunrise Furniture Works', gstin: '23AABSF7890H1ZU', pan: 'AABSF7890H', cats: ['Furniture'], contact: 'Ram Kishore', mobile: '97551 89012', email: 'sunrise.furniture@gmail.com', status: 'PENDING' as const, verified: false, upto: null },
    // Struck off, and the register says why.
    { code: 'VND/006', name: 'Apex Traders', gstin: '23AACAT2345J1ZV', pan: 'AACAT2345J', cats: ['IT Equipment'], contact: 'Mohan Lal', mobile: '99812 45670', email: 'apex.traders@gmail.com', status: 'BLACKLISTED' as const, verified: true, upto: null, reason: 'Supplied goods below specification on PO/JU/2023/0042; recovery pending.' },
    // Empanelment lapsed, which is as good as none.
    { code: 'VND/007', name: 'Chambal Electricals', gstin: '23AADCE6789K1ZW', pan: 'AADCE6789K', cats: ['Electrical'], contact: 'Kailash Rathore', mobile: '93005 11223', email: 'chambal.elec@gmail.com', status: 'EMPANELLED' as const, verified: true, upto: -30 },
  ];

  const vendorByCode = new Map<string, string>();
  for (const v of VENDORS) {
    const created = await prisma.vendor.create({
      data: {
        code: v.code,
        name: v.name,
        gstin: v.gstin,
        pan: v.pan,
        categories: v.cats,
        contactName: v.contact,
        contactMobile: v.mobile,
        email: v.email,
        status: v.status,
        documentsVerified: v.verified,
        registeredOn: daysAgo(500),
        empanelledUpto: v.upto === null ? null : daysAhead(v.upto),
        statusReason: v.reason ?? null,
        collegeId: college.id,
      },
    });
    vendorByCode.set(v.code, created.id);
  }

  // The lab-terminal tender, sanctioned by the budget request the principal
  // has in their inbox — a tender cannot be floated without one.
  const labRequest = await prisma.governanceRequest.findUnique({
    where: { requestNo: 'GR/2024/0001' },
  });

  const tender = await prisma.tender.create({
    data: {
      refNo: 'JU/PROC/2024/001',
      title: 'Supply and installation of 20 computer terminals',
      description:
        'Supply, delivery and installation of twenty desktop terminals for the computer laboratory, ' +
        'to meet the AICTE terminal ratio recorded as non-compliant in the affiliation file.',
      department: 'Computer Science & Applications',
      category: 'IT Equipment',
      estimatedValue: 840000,
      status: 'PUBLISHED',
      publishedOn: daysAgo(20),
      submissionDeadline: daysAgo(3),
      openingDate: daysAgo(2),
      collegeId: college.id,
      createdById: mishra.id,
      requestId: labRequest?.id ?? null,
    },
  });

  // Two sealed bids, lodged before the deadline. Neither quote is readable
  // until the technical stage closes.
  await prisma.tenderBid.create({
    data: {
      tenderId: tender.id,
      vendorId: vendorByCode.get('VND/001')!,
      financialQuote: 812000,
      submittedAt: daysAgo(5),
    },
  });
  await prisma.tenderBid.create({
    data: {
      tenderId: tender.id,
      vendorId: vendorByCode.get('VND/003')!,
      financialQuote: 798500,
      submittedAt: daysAgo(4),
    },
  });

  // A second tender, already awarded, with its order part-way through.
  const furnitureTender = await prisma.tender.create({
    data: {
      refNo: 'JU/PROC/2024/002',
      title: 'Supply of reading room furniture',
      description: 'Forty reading tables and one hundred and sixty chairs for the library reading room.',
      department: 'Library',
      category: 'Furniture',
      estimatedValue: 460000,
      status: 'AWARDED',
      publishedOn: daysAgo(70),
      submissionDeadline: daysAgo(50),
      openingDate: daysAgo(49),
      technicalClosedAt: daysAgo(45),
      collegeId: college.id,
      createdById: gupta.id,
    },
  });

  const winningBid = await prisma.tenderBid.create({
    data: {
      tenderId: furnitureTender.id,
      vendorId: vendorByCode.get('VND/002')!,
      financialQuote: 441000,
      submittedAt: daysAgo(55),
      technicalScore: 82,
      status: 'RECOMMENDED',
      financialOpenedAt: daysAgo(45),
    },
  });

  await prisma.tender.update({
    where: { id: furnitureTender.id },
    data: { awardedBidId: winningBid.id },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNo: 'PO/JU/2024/0001',
      tenderId: furnitureTender.id,
      vendorId: vendorByCode.get('VND/002')!,
      totalAmount: 441000,
      issueDate: daysAgo(44),
      deliveryDeadline: daysAhead(10),
      status: 'ACKNOWLEDGED',
      items: {
        create: [
          { description: 'Reading table, 1800x900mm, teak finish', unit: 'No.', quantity: 40, unitRate: 6200, amount: 248000, deliveredQty: 40 },
          { description: 'Reading chair, cushioned', unit: 'No.', quantity: 160, unitRate: 1206, amount: 192960, deliveredQty: 96 },
        ],
      },
    },
  });


  // ══ Phase 8 — right to information ═══════════════════════════════════════

  // Dated against today so the statutory clock reads sensibly: one comfortably
  // inside the period, one close to running out, one already past it.
  const RTI = [
    {
      no: 'RTI/2024/0891', name: 'Sh. Dinesh Kumar',
      subject: 'Details of faculty appointments made in 2022-23',
      particulars: 'Certified copies of the appointment orders, the selection committee minutes and the advertisement for every teaching post filled in the academic year 2022-23.',
      category: 'HR', received: 12, bpl: false, fee: true,
      status: 'UNDER_PROCESS' as const, pio: true,
    },
    {
      no: 'RTI/2024/0934', name: 'Anonymous',
      subject: 'Number of complaints received against examiners',
      particulars: 'The number of complaints received against examiners in the last three years, and the action taken on each.',
      category: 'Examination', received: 26, bpl: true, fee: false,
      status: 'ASSIGNED' as const, pio: true,
    },
    {
      // Past the thirty days with nothing sent: a deemed refusal in law.
      no: 'RTI/2024/0812', name: 'Sh. Pradeep Tiwari',
      subject: 'Budget utilisation for the examination section, FY 2023-24',
      particulars: 'Head-wise budget allotted and spent by the examination section in the financial year 2023-24, with sanction orders above one lakh rupees.',
      category: 'Finance', received: 41, bpl: false, fee: true,
      status: 'UNDER_PROCESS' as const, pio: true,
    },
    {
      no: 'RTI/2024/0876', name: 'Ms. Anjali Rawat',
      subject: 'Affiliation status of Vivekananda College, Bhind',
      particulars: 'The current affiliation status of Vivekananda College, Bhind, and copies of the last two inspection reports.',
      category: 'Affiliation', received: 34, bpl: false, fee: true,
      status: 'REPLIED' as const, pio: true, repliedDaysAgo: 6, pages: 14,
    },
  ];

  for (const r of RTI) {
    await prisma.rtiApplication.create({
      data: {
        applicationNo: r.no,
        applicantName: r.name,
        applicantAddress: r.name === 'Anonymous' ? null : 'Gwalior, Madhya Pradesh',
        subject: r.subject,
        particulars: r.particulars,
        category: r.category,
        receivedOn: daysAgo(r.received),
        bplExempt: r.bpl,
        feePaid: r.fee,
        status: r.status,
        pioId: r.pio ? clerk.id : null,
        assignedAt: r.pio ? daysAgo(r.received - 1) : null,
        repliedOn: r.repliedDaysAgo ? daysAgo(r.repliedDaysAgo) : null,
        replyText: r.repliedDaysAgo
          ? 'The college is affiliated to Jiwaji University for the programmes listed in the enclosed order. Copies of the last two inspection reports are supplied.'
          : null,
        pagesSupplied: r.pages ?? null,
        additionalFee: r.pages ? r.pages * 2 : null,
        collegeId: college.id,
      },
    });
  }


  // ══ Phase 9 — the IT console ═════════════════════════════════════════════

  // The matrix withholds rather than grants: a module with no rule is open,
  // so these are the deliberate exceptions.
  await prisma.permissionRule.createMany({
    data: [
      { role: 'OFFICE', module: 'System Config', action: 'view', effect: 'DENY', note: 'The counter has no business in system configuration.' },
      { role: 'OFFICE', module: 'Audit Log', action: 'view', effect: 'DENY', note: 'Audit is read by the registrar and the IT cell only.' },
      { role: 'PRINCIPAL', module: 'System Config', action: 'edit', effect: 'DENY', note: 'Configuration belongs to the IT cell, not to a college.' },
      { role: 'FACULTY', module: 'Procurement', action: 'view', effect: 'DENY', note: 'Teaching staff do not see the tender file.' },
      { role: 'REGISTRAR', module: 'System Config', action: 'edit', effect: 'ALLOW', note: 'The registrar may configure alongside the IT cell.' },
    ],
  });

  // One account locked, so the console has something to unlock and the
  // sign-in path has something to refuse.
  await prisma.user.update({
    // Deliberately a lecturer the smoke suite never signs in as: locking an
    // account the tests authenticate with would break them, which is exactly
    // the point of the lock working.
    where: { email: 'sunita.yadav@mvmgwl.ac.in' },
    data: {
      lockedAt: daysAgo(2),
      lockReason: 'Five failed sign-in attempts from an unrecognised address.',
      failedAttempts: 5,
    },
  });



  // An approved marks sheet, so the projection has something to extrapolate
  // from on a fresh database. Deliberately the project paper, not BCA501:
  // the faculty tests assert that BCA501 starts unopened.
  const projectAssignment = await prisma.subjectAssignment.findFirst({
    where: { facultyId: mishra.id, subject: { code: 'BCA506' } },
  });

  if (projectAssignment) {
    const COMPONENTS = [
      { key: 'synopsis', label: 'Synopsis / Proposal', max: 20, share: 0.8 },
      { key: 'progress', label: 'Progress Presentation', max: 20, share: 0.7 },
      { key: 'final_viva', label: 'Final Viva', max: 60, share: 0.65 },
    ];

    const sheet = await prisma.marksSheet.create({
      data: {
        assignmentId: projectAssignment.id,
        status: 'APPROVED',
        submittedAt: daysAgo(20),
        decidedAt: daysAgo(16),
        decidedById: gupta.id,
      },
    });

    const created = [];
    let order = 0;
    for (const c of COMPONENTS) {
      created.push(
        await prisma.marksComponent.create({
          data: {
            assignmentId: projectAssignment.id,
            key: c.key,
            label: c.label,
            maxMarks: c.max,
            order: order++,
          },
        }),
      );
    }

    const enrolled = await prisma.enrolment.findMany({
      where: { subjectId: projectAssignment.subjectId, term: TERM },
      select: { studentId: true },
    });

    // Marks that track each student's attendance, so the projection and the
    // risk score tell a consistent story rather than contradicting it.
    const attendanceByName = new Map(CLASSMATES.map((m) => [classmateIds.get(m.name)!, m.attendance]));

    for (const e of enrolled) {
      const standing = (attendanceByName.get(e.studentId) ?? 80) / 100;
      for (let i = 0; i < created.length; i += 1) {
        const c = COMPONENTS[i]!;
        await prisma.markEntry.create({
          data: {
            sheetId: sheet.id,
            studentId: e.studentId,
            componentId: created[i]!.id,
            value: Math.round(c.max * c.share * Math.min(1, standing + 0.15)),
          },
        });
      }
    }
  }

  // ══ Phase 10 — the intelligence layer ════════════════════════════════════

  // One snapshot from a month ago, so the console has something to compare
  // today's score against. Scores are computed live; a snapshot is only ever
  // the answer as it stood.
  const RISK_HISTORY = [
    { name: 'Ravi Chouhan', score: 78, band: 'CRITICAL' as const, basis: 'Driven by attendance, results, backlogs', points: 120 },
    { name: 'Deepak Singh', score: 54, band: 'HIGH' as const, basis: 'Driven by attendance, backlogs', points: 128 },
    { name: 'Rahul Verma', score: 21, band: 'LOW' as const, basis: 'Driven by attendance', points: 160 },
  ];

  for (const r of RISK_HISTORY) {
    const studentId = classmateIds.get(r.name);
    if (!studentId) continue;
    await prisma.riskAssessment.create({
      data: {
        studentId,
        assessedAt: daysAgo(30),
        score: r.score,
        band: r.band,
        basis: r.basis,
        dataPoints: r.points,
        factors: {
          create: [
            { factor: 'Attendance', value: 'below the threshold', direction: 'negative', weight: 0.4, contribution: Math.round(r.score * 0.5) },
            { factor: 'Results', value: 'CGPA on file', direction: r.score > 50 ? 'negative' : 'positive', weight: 0.25, contribution: Math.round(r.score * 0.3) },
          ],
        },
      },
    });
  }

  // An intervention already under way, so the loop has a middle as well as
  // two ends: the score that opened it is kept for comparison.
  const ravi = classmateIds.get('Ravi Chouhan');
  if (ravi) {
    await prisma.intervention.create({
      data: {
        studentId: ravi,
        raisedById: mishra.id,
        kind: 'COUNSELLING',
        note: 'Met after class. Attendance has been falling since the second month; agreed a weekly check-in and a catch-up plan for the two papers furthest behind.',
        dueOn: daysAhead(14),
        raisedAt: daysAgo(21),
        scoreAtRaise: 78,
      },
    });

    await prisma.intervention.create({
      data: {
        studentId: ravi,
        raisedById: mishra.id,
        kind: 'PARENT_CONTACT',
        note: 'Spoke to the father by telephone about the attendance shortfall and the risk of debarment.',
        raisedAt: daysAgo(18),
        scoreAtRaise: 78,
        outcome: 'NO_CHANGE',
        outcomeNote: 'Family aware; the student has been travelling for work and attendance has not recovered.',
        closedAt: daysAgo(4),
      },
    });
  }

  // ── An open QR window, so the scanner has something to read ────────────────

  const seSubject = subjectByCode.get('BCA501')!;
  const todaySession = await prisma.classSession.create({
    data: {
      subjectId: seSubject,
      // Midnight UTC, the same key the faculty day view looks sessions up by.
      date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())),
      startTime: '09:00',
      endTime: '10:00',
      room: 'CS-201',
      faculty: 'Dr. R.K. Mishra',
      qrToken: 'JU-ATT-DEMO-BCA501',
      // Long-lived on purpose: a 30-second demo token would always be dead.
      qrExpiresAt: new Date(Date.now() + 365 * 86_400_000),
    },
  });

  console.log(`
Seed complete.

  Students   ${1 + CLASSMATES.length} (Priya Sharma + BCA V Sem A)
  Faculty    ${facultyByName.size}
  Exam       ${examSession.code}, ${SUBJECTS.length} papers, ${CENTRES.length} centres
  Subjects   ${subjectByCode.size}
  Sessions   ${SUBJECTS.reduce((a, s) => a + s.total, 0) + 1}
  Password   ${PASSWORD}  (all demo accounts)

  student  ${studentUser.email}
  parent   ${parentUser.email}
  faculty  ${facultyUser.email}
  hod      ${hodUser.email}
  principal ${principalUser.email}
  office   ${clerkUser.email}
  registrar ${registrarUser.email}
  admin    admin@jiwaji.ac.in

  Demo QR token: ${todaySession.qrToken}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
