/**
 * Demo scale: fills the demo deployment out to the size of a real affiliating
 * university — four more colleges, their programmes and staff, a few hundred
 * students with a term of classes, attendance, fees and payments spread over
 * the last six months, published results, and a risk snapshot over all of it.
 *
 * Runs after prisma/seed.ts on the demo deployment only (SEED_DEMO=true). It
 * adds to the seeded data without touching it, so the smoke suite — which
 * runs the base seed alone — is unaffected. Running it twice does nothing the
 * second time.
 *
 * The numbers are generated, but every figure the app shows from them is
 * computed from these rows exactly as it would be from real ones.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { assess } from '../src/modules/intelligence/scoring.js';

// A fixed seed, so the demo looks the same on every deployment.
let state = 20261011;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST_F = ['Aanya', 'Aditi', 'Ananya', 'Bhavna', 'Diya', 'Divya', 'Isha', 'Kavya', 'Khushi', 'Meera', 'Neha', 'Nikita', 'Pooja', 'Prachi', 'Riya', 'Sakshi', 'Sanya', 'Shreya', 'Simran', 'Sneha', 'Tanvi', 'Vaishnavi'];
const FIRST_M = ['Aarav', 'Aditya', 'Akash', 'Aman', 'Arjun', 'Ayush', 'Dev', 'Harsh', 'Ishaan', 'Karan', 'Kunal', 'Manish', 'Mohit', 'Nikhil', 'Pranav', 'Rahul', 'Rohan', 'Sahil', 'Shivam', 'Tushar', 'Vikas', 'Yash'];
const LAST = ['Agarwal', 'Bansal', 'Chauhan', 'Dubey', 'Gupta', 'Jain', 'Joshi', 'Kushwaha', 'Mishra', 'Patel', 'Rajput', 'Rathore', 'Saxena', 'Sharma', 'Shrivastava', 'Singh', 'Soni', 'Tiwari', 'Tomar', 'Verma', 'Yadav'];
const CATEGORIES = ['GEN', 'OBC', 'SC', 'ST', 'EWS'];

const COLLEGES = [
  { code: 'RDU-AC-011', name: 'Govt. Science College', district: 'Northfield' },
  { code: 'RDU-AC-024', name: 'Kamla Nehru Girls College', district: 'Demo City' },
  { code: 'RDU-AC-037', name: 'Swami Vivekananda Commerce College', district: 'Eastwood' },
  { code: 'RDU-AC-052', name: 'Tribal Area Degree College', district: 'Westfield' },
];

const PROGRAMMES = [
  { key: 'BSC', name: 'Bachelor of Science (PCM)', shortName: 'B.Sc.', dept: 'Physics', subjects: ['Mechanics', 'Organic Chemistry', 'Calculus', 'Electronics Lab'] },
  { key: 'BCOM', name: 'Bachelor of Commerce', shortName: 'B.Com.', dept: 'Commerce', subjects: ['Financial Accounting', 'Business Law', 'Income Tax', 'Corporate Accounting'] },
  { key: 'BA', name: 'Bachelor of Arts', shortName: 'B.A.', dept: 'Humanities', subjects: ['Indian Polity', 'Hindi Literature', 'Economics', 'History of India'] },
];

const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Assistant Professor', 'Guest Lecturer'];

async function main() {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('seed-scale: SEED_DEMO is not true; this is not the demo deployment. Nothing done.');
    return;
  }
  if (await prisma.college.findUnique({ where: { code: COLLEGES[0]!.code } })) {
    console.log('seed-scale: already applied.');
    return;
  }

  const passwordHash = await bcrypt.hash('campus123', 10);
  const now = new Date();
  const termStart = new Date(now.getTime() - 120 * 86_400_000);
  const studentIds: string[] = [];
  let serial = 1000;

  for (const [ci, c] of COLLEGES.entries()) {
    const college = await prisma.college.create({ data: { code: c.code, name: c.name, district: c.district } });
    console.log(`seed-scale: ${c.name}`);

    // Staff: a head and four teachers per programme.
    for (const p of PROGRAMMES) {
      const programme = await prisma.programme.create({
        data: { code: `${p.key}-${c.code}`, name: p.name, shortName: p.shortName, years: 3, collegeId: college.id },
      });

      const teachers: Array<{ id: string; name: string }> = [];
      for (let f = 0; f < 5; f++) {
        const female = rand() < 0.45;
        const name = `${f === 0 ? 'Dr.' : pick(['Dr.', 'Prof.', 'Ms.', 'Mr.'])} ${female ? pick(FIRST_F) : pick(FIRST_M)} ${pick(LAST)}`;
        const emp = `EMP${c.code.slice(-3)}${p.key}${f}`;
        const user = await prisma.user.create({
          data: { email: `${emp.toLowerCase()}@demo.resolion.edu`, passwordHash, role: 'FACULTY', lastLoginAt: new Date(now.getTime() - between(0, 20) * 86_400_000) },
        });
        const fac = await prisma.faculty.create({
          data: {
            employeeId: emp, name, designation: f === 0 ? 'Professor & Head' : pick(DESIGNATIONS), department: p.dept,
            joinDate: new Date(Date.UTC(between(2004, 2022), between(0, 11), between(1, 28))), isHod: f === 0,
            userId: user.id, collegeId: college.id,
          },
        });
        teachers.push({ id: fac.id, name });
      }

      // A term of classes: four subjects, two lectures a week each.
      const subjects: Array<{ id: string; teacher: { id: string; name: string }; sessions: Array<{ id: string; date: Date }> }> = [];
      for (const [si, sname] of p.subjects.entries()) {
        const subject = await prisma.subject.create({
          data: { code: `${p.key}${c.code.slice(-3)}${si + 1}`, name: sname, credits: si === 3 ? 2 : 4, semester: 3, programmeId: programme.id },
        });
        const teacher = teachers[1 + (si % 4)]!;
        const dates: Date[] = [];
        for (let d = new Date(termStart); d < now; d = new Date(d.getTime() + 86_400_000)) {
          const day = d.getUTCDay();
          if ((si % 2 === 0 && (day === 1 || day === 4)) || (si % 2 === 1 && (day === 2 || day === 5))) dates.push(new Date(d));
        }
        await prisma.classSession.createMany({
          data: dates.map((date) => ({ subjectId: subject.id, date, startTime: `${9 + si}:00`, endTime: `${10 + si}:00`, room: `R-${100 + si}`, faculty: teacher.name, facultyId: teacher.id, markedAt: date })),
        });
        const sessions = await prisma.classSession.findMany({ where: { subjectId: subject.id }, select: { id: true, date: true }, orderBy: { date: 'asc' } });
        subjects.push({ id: subject.id, teacher, sessions });
      }

      // Students: a class of 25–40, each with their own habits.
      const size = between(25, 40) - (ci === 3 ? 8 : 0);
      for (let s = 0; s < size; s++) {
        serial++;
        const female = rand() < 0.52;
        const name = `${female ? pick(FIRST_F) : pick(FIRST_M)} ${pick(LAST)}`;
        const enrolmentNo = `RDU/2024/${p.key}/${serial}`;
        const user = await prisma.user.create({
          data: { email: `${p.key.toLowerCase()}.${serial}@demo.resolion.edu`, passwordHash, role: 'STUDENT', lastLoginAt: rand() < 0.8 ? new Date(now.getTime() - between(0, 30) * 86_400_000) : null },
        });
        const student = await prisma.student.create({
          data: {
            enrolmentNo, rollNo: `${c.code.slice(-3)}/${p.key}/2024/${serial}`, name, gender: female ? 'F' : 'M', category: pick(CATEGORIES),
            dob: new Date(Date.UTC(between(2004, 2006), between(0, 11), between(1, 28))), semester: 3, year: 2, batch: '2024–27',
            userId: user.id, collegeId: college.id, programmeId: programme.id,
          },
        });
        studentIds.push(student.id);

        // Habits: most attend well, some drift, a few have stopped coming.
        const r = rand();
        const attendRate = r < 0.08 ? 0.35 + rand() * 0.2 : r < 0.25 ? 0.6 + rand() * 0.12 : 0.76 + rand() * 0.22;
        const records: Array<{ studentId: string; sessionId: string; status: 'PRESENT' | 'LATE'; source: string; markedAt: Date }> = [];
        for (const sub of subjects) {
          await prisma.enrolment.create({ data: { studentId: student.id, subjectId: sub.id, faculty: sub.teacher.name, facultyId: sub.teacher.id, room: 'R-101', term: '2025–26 Odd' } });
          for (const sess of sub.sessions) {
            if (rand() < attendRate) records.push({ studentId: student.id, sessionId: sess.id, status: rand() < 0.06 ? 'LATE' : 'PRESENT', source: 'SEED', markedAt: sess.date });
          }
        }
        await prisma.attendanceRecord.createMany({ data: records });

        // Fees: tuition and development, paid in one or two instalments over the term.
        const tuition = p.key === 'BSC' ? 18_500 : p.key === 'BCOM' ? 15_200 : 11_800;
        const dev = 2_500;
        const payer = rand();
        const paidShare = payer < 0.1 ? 0 : payer < 0.28 ? 0.5 : 1;
        const paidTuition = Math.round(tuition * paidShare);
        await prisma.feeItem.createMany({
          data: [
            { studentId: student.id, head: 'Tuition Fee', amount: tuition, paid: paidTuition, category: 'TUITION', term: '2025–26', dueDate: new Date(termStart.getTime() + 45 * 86_400_000) },
            { studentId: student.id, head: 'Development Fee', amount: dev, paid: paidShare > 0 ? dev : 0, category: 'DEVELOPMENT', term: '2025–26', dueDate: new Date(termStart.getTime() + 45 * 86_400_000) },
          ],
        });
        if (paidShare > 0) {
          const first = new Date(now.getTime() - between(20, 175) * 86_400_000);
          const payments = paidShare === 1 && rand() < 0.4
            ? [{ amount: Math.round(paidTuition / 2) + dev, at: first }, { amount: paidTuition - Math.round(paidTuition / 2), at: new Date(Math.min(now.getTime() - 86_400_000, first.getTime() + between(25, 60) * 86_400_000)) }]
            : [{ amount: paidTuition + dev, at: first }];
          await prisma.payment.createMany({
            data: payments.map((pay, k) => ({
              studentId: student.id, head: 'Tuition & Development', amount: pay.amount, mode: pick(['UPI', 'UPI', 'Net Banking', 'Card', 'Counter']),
              txnId: `TXN${serial}${k}${Math.floor(rand() * 1e6)}`, receiptNo: `RDU/RCP/${serial}/${k + 1}`, status: 'SUCCESS' as const, paidAt: pay.at,
            })),
          });
        }

        // Last semester's published result, shaped by the same habits.
        const sgpa = Math.min(9.8, Math.max(3.2, 4 + attendRate * 5 + (rand() - 0.5) * 2));
        await prisma.semesterResult.create({
          data: {
            studentId: student.id, semester: 2, declaredOn: '15-07-2025', sgpa: Math.round(sgpa * 100) / 100, cgpa: Math.round((sgpa + (rand() - 0.5) * 0.6) * 100) / 100,
            totalCredits: 22, outcome: sgpa < 4.5 ? 'FAIL' : 'PASS', published: true, division: sgpa >= 7.5 ? 'First' : sgpa >= 6 ? 'Second' : 'Third',
          },
        });
      }
    }
  }

  // Score everyone, old and new, so the dashboards open on a current snapshot.
  const everyone = (await prisma.student.findMany({ select: { id: true } })).map((s) => s.id);
  const scores = await assess(everyone);
  const takenAt = new Date();
  for (const a of scores.values()) {
    await prisma.riskAssessment.create({
      data: {
        studentId: a.studentId, assessedAt: takenAt, score: a.score, band: a.band, basis: a.basis, dataPoints: a.dataPoints,
        factors: { create: a.factors.map((f) => ({ factor: f.factor, value: f.value, direction: f.direction, weight: f.weight, contribution: f.contribution })) },
      },
    });
  }

  console.log(`seed-scale: added ${studentIds.length} students across ${COLLEGES.length} colleges; scored ${scores.size}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
