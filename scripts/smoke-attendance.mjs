/**
 * End-to-end test of attendance administration against a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-attendance.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };
async function call(path, { method = 'GET', token, body, raw, type } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = type ?? 'application/octet-stream';
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (email) => { const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`); return r.body.accessToken; };
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;
const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

const registrar = await login('registrar@demo.resolion.edu');
const office = await login('pushpa.sharma@demo.resolion.edu');
const mentor = await login('rk.mishra@demo.resolion.edu');
const hod = await login('ml.gupta@demo.resolion.edu');
const priya = await login('priya.sharma.2021@demo.resolion.edu');
const rahul = await login('rahul.verma.2021@demo.resolion.edu');
const ravi = await login('ravi.chouhan.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

console.log('\nPolicy');
let r = await call('/api/attendance-admin/policy', { token: office });
check('the policy is readable', r.status === 200 && r.body.threshold === 75 && r.body.condonationFloor === 65, msg(r));
const policy = r.body;
r = await call('/api/attendance-admin/policy', { method: 'PUT', token: office, body: { ...policy, threshold: 70 } });
check('the office cannot change it', r.status === 403, msg(r));
r = await call('/api/attendance-admin/policy', { method: 'PUT', token: registrar, body: { threshold: 75, condonationFloor: 80, warnBelow: 85, lateCountsAsPresent: true, leaveBackdateDays: 15 } });
check('a floor above the threshold is refused', r.status === 400, msg(r));
r = await call('/api/attendance-admin/policy', { method: 'PUT', token: registrar, body: { threshold: 75, condonationFloor: 65, warnBelow: 82, lateCountsAsPresent: true, leaveBackdateDays: 15 } });
check('the registrar changes the warning line', r.status === 200 && r.body.warnBelow === 82, msg(r));

console.log('\nOne rule everywhere');
let mine = await call('/api/student/attendance', { token: priya });
check('the student sees her attendance under the policy', mine.status === 200 && mine.body.policy?.warnBelow === 82, msg(mine));
check('overall is the sum of her subjects', mine.body.overall.total === mine.body.subjects.reduce((t, s) => t + s.total, 0) && mine.body.overall.present === mine.body.subjects.reduce((t, s) => t + s.present, 0));
const subj = mine.body.subjects.find((s) => s.total > 0);
const subjects = (await call('/api/faculty/subjects', { token: mentor })).body;
const list = Array.isArray(subjects) ? subjects : Object.values(subjects).find(Array.isArray);
const assignment = list.find((a) => a.code === subj.code) ?? list[0];
const sheet = await call(`/api/faculty/subjects/${assignment.assignmentId}/sheet`, { token: mentor });
const onSheet = sheet.body?.students?.find((s) => s.name === 'Priya Sharma');
if (assignment.code === subj.code && onSheet) check("the lecturer's roster shows the same percentage as the student's own screen", onSheet.runningPercent === subj.percent, `${onSheet.runningPercent} vs ${subj.percent}`);
const parentView = await call('/api/student/attendance', { token: parent });
check('the parent sees the same figures', parentView.body.overall.percent === mine.body.overall.percent);

console.log('\nLeave');
r = await call('/api/attendance/leaves', { method: 'POST', token: priya, body: { kind: 'ON_DUTY', fromDate: istDay(0), toDate: istDay(0), reason: 'NSS camp at the district headquarters' } });
check('college duty needs the organiser\'s letter', r.status === 400, msg(r));
r = await call('/api/attendance/leaves', { method: 'POST', token: priya, body: { kind: 'PERSONAL', fromDate: istDay(-30), toDate: istDay(-29), reason: 'Family function back home' } });
check('leave too far back is refused', r.status === 400, msg(r));
const up = await call(`/api/files?name=${encodeURIComponent('nss-letter.pdf')}&context=attendance-leave`, { method: 'POST', token: priya, raw: Buffer.from('%PDF-1.4 letter from the NSS programme officer'), type: 'application/pdf' });
check('the student uploads the letter', up.status === 201, msg(up));
// Find a recent class of this lecturer that has not been marked yet, to test the roll-call hook.
let target = null;
for (let back = 0; back <= 12 && !target; back++) {
  const d = istDay(-back);
  const s = await call(`/api/faculty/subjects/${assignment.assignmentId}/sheet?date=${d}`, { token: mentor });
  if (s.status === 200 && s.body.scheduled && !s.body.cancelled && !s.body.markedAt && !s.body.future) target = { date: d, sheet: s.body };
}
check('there is an unmarked recent class to test with', !!target);
const fromDate = target ? target.date : istDay(-2);
r = await call('/api/attendance/leaves', { method: 'POST', token: priya, body: { kind: 'ON_DUTY', fromDate, toDate: fromDate, reason: 'NSS camp at the district headquarters', proofFileId: up.body.id } });
check('the student applies for on-duty leave with the letter', r.status === 201 && r.body.status === 'PENDING', msg(r));
const leave = r.body;
r = await call('/api/attendance/leaves', { method: 'POST', token: priya, body: { kind: 'PERSONAL', fromDate, toDate: fromDate, reason: 'Second leave for the same day' } });
check('overlapping leave is refused', r.status === 409, msg(r));
r = await call(`/api/attendance-admin/leaves/${leave.id}/decide`, { method: 'POST', token: await login('kavita.jain.2021@demo.resolion.edu'), body: { approve: true } });
check('a student cannot approve leave', r.status === 403, msg(r));
r = await call('/api/attendance-admin/leaves?status=PENDING', { token: mentor });
check("the mentor sees the mentee's leave, with its proof", r.status === 200 && r.body.some((l) => l.id === leave.id && l.proof?.name === 'nss-letter.pdf'), msg(r));
r = await call(`/api/attendance-admin/leaves/${leave.id}/decide`, { method: 'POST', token: mentor, body: { approve: true, note: 'Letter verified with the NSS officer' } });
check('the mentor approves', r.status === 200 && r.body.status === 'APPROVED', msg(r));
if (target) {
  const records = target.sheet.students.map((s) => ({ studentId: s.id, status: s.name === 'Priya Sharma' ? 'ABSENT' : 'PRESENT' }));
  r = await call(`/api/faculty/subjects/${assignment.assignmentId}/sheet`, { method: 'POST', token: mentor, body: { date: target.date, slotId: target.sheet.slotId, records } });
  check('the lecturer submits the roll call with her absent', r.status === 201, msg(r));
  const after = await call(`/api/faculty/subjects/${assignment.assignmentId}/sheet?date=${target.date}&slotId=${target.sheet.slotId}`, { token: mentor });
  const her = after.body.students.find((s) => s.name === 'Priya Sharma');
  check('her absence that day is excused by the approved leave', her.status === 'EXCUSED' && her.source === `LEAVE:${leave.leaveNo}`, JSON.stringify(her));
}
r = await call('/api/attendance/leaves', { token: priya });
check('the leave shows how many absences it excused', r.body.leaves.find((l) => l.id === leave.id)?.excused >= (target ? 1 : 0), JSON.stringify(r.body.leaves[0]));
r = await call(`/api/attendance-admin/leaves/${leave.id}/revoke`, { method: 'POST', token: mentor, body: { note: 'Found not to have attended the camp' } });
check('a mentor cannot revoke approved leave', r.status === 403, msg(r));
r = await call(`/api/attendance-admin/leaves/${leave.id}/revoke`, { method: 'POST', token: hod, body: { note: 'Found not to have attended the camp' } });
check('the head of department revokes it and the absences count again', r.status === 200 && r.body.restored >= (target ? 1 : 0), msg(r));
r = await call('/api/attendance/leaves', { method: 'POST', token: priya, body: { kind: 'PERSONAL', fromDate: istDay(1), toDate: istDay(1), reason: 'Passport appointment in the city' } });
const toCancel = r.body;
r = await call(`/api/attendance/leaves/${toCancel.id}/cancel`, { method: 'POST', token: priya });
check('the student withdraws a pending leave', r.status === 200 && r.body.status === 'CANCELLED', msg(r));

console.log('\nCondonation');
r = await call('/api/attendance/condonation', { token: rahul });
const rahulCase = r.body;
check('the student sees where he stands', r.status === 200 && Array.isArray(r.body.short), msg(r));
if (rahulCase.eligible) {
  r = await call('/api/attendance/condonation', { method: 'POST', token: rahul, body: { kind: 'MEDICAL', reason: 'I was hospitalised with dengue for two weeks in September.' } });
  check('a medical condonation needs the certificate', r.status === 400, msg(r));
  r = await call('/api/attendance/condonation', { method: 'POST', token: rahul, body: { kind: 'OTHER', reason: 'My father was unwell and I had to look after the shop for three weeks.' } });
  check('the student asks for condonation', r.status === 201 && r.body.status === 'PENDING', msg(r));
  const c = r.body;
  r = await call('/api/attendance/condonation', { method: 'POST', token: rahul, body: { kind: 'OTHER', reason: 'Asking a second time in the same term.' } });
  check('only once a term', r.status === 409, msg(r));
  r = await call(`/api/attendance-admin/condonations/${c.id}/decide`, { method: 'POST', token: office, body: { approve: true, note: 'Genuine hardship', fee: 500 } });
  check('the office cannot grant condonation', r.status === 403, msg(r));
  r = await call(`/api/attendance-admin/condonations/${c.id}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'Genuine hardship; verified with the mentor', fee: 500 } });
  check('the registrar grants it with a fee', r.status === 200, msg(r));
  const fees = await call('/api/student/fees', { token: rahul });
  check('the condonation fee is on his account', fees.body.items.some((i) => i.head.startsWith('Attendance condonation fee')), msg(fees));
} else {
  check(`Rahul is not condonable in the seed (${rahulCase.reason}) — condonation flow skipped`, true);
}
r = await call('/api/attendance/condonation', { token: ravi });
if (r.body.lowest !== null && r.body.lowest < 65) {
  const rr = await call('/api/attendance/condonation', { method: 'POST', token: ravi, body: { kind: 'OTHER', reason: 'Please condone my attendance this term.' } });
  check('a shortage below the floor cannot be condoned', rr.status === 409 && /cannot be condoned/.test(rr.body.error.message), msg(rr));
}

console.log('\nReports');
r = await call('/api/attendance-admin/summary', { token: registrar });
check('the class-wise summary loads', r.status === 200 && r.body.classes.length > 0 && r.body.classes[0].subjects.length > 0, msg(r));
r = await call('/api/attendance-admin/summary', { token: mentor });
check('a lecturer who is not a head cannot see institution reports', r.status === 403, msg(r));
r = await call('/api/attendance-admin/summary', { token: hod });
check('a head of department can', r.status === 200, msg(r));
r = await call('/api/attendance-admin/defaulters', { token: office });
check('the shortage list loads', r.status === 200 && r.body.students.length > 0 && r.body.students.every((s) => s.lowest < 75), msg(r));
const short = r.body.students;
if (rahulCase.eligible) check('a condoned student shows as condoned', short.find((s) => s.name === 'Rahul Verma')?.condonation?.status === 'APPROVED');
r = await call('/api/attendance-admin/defaulters/notify', { method: 'POST', token: office, body: { studentIds: short.map((s) => s.id), message: 'Your attendance is below 75%. Meet your mentor this week.' } });
check('the office notifies every short student', r.status === 200 && r.body.sent === short.length, msg(r));

console.log('\nRoll-call compliance and holidays');
r = await call(`/api/attendance-admin/compliance?from=${istDay(-13)}&to=${istDay(0)}`, { token: mentor });
check("a lecturer sees their own roll calls", r.status === 200 && r.body.own === true && r.body.faculty.length <= 1, msg(r));
const before = r.body.expected;
r = await call(`/api/attendance-admin/compliance?from=${istDay(-13)}&to=${istDay(0)}`, { token: registrar });
check('the registrar sees every lecturer', r.status === 200 && r.body.faculty.length >= 1 && r.body.expected >= before, msg(r));
const busy = r.body.faculty.flatMap((f) => f.missing).find((m) => m.date < istDay(0));
r = await call('/api/attendance-admin/holidays', { method: 'POST', token: office, body: { date: istDay(-1), name: 'Local holiday' } });
check('the office cannot declare a holiday', r.status === 403, msg(r));
const hdate = busy?.date ?? istDay(-1);
r = await call('/api/attendance-admin/holidays', { method: 'POST', token: registrar, body: { date: hdate, name: 'Gandhi Jayanti (observed)' } });
check('the registrar declares a holiday', r.status === 201, msg(r));
const hol = r.body;
r = await call('/api/attendance-admin/holidays', { method: 'POST', token: registrar, body: { date: hdate, name: 'Again' } });
check('the same day twice is refused', r.status === 409, msg(r));
r = await call(`/api/attendance-admin/compliance?from=${istDay(-13)}&to=${istDay(0)}`, { token: registrar });
check('classes on a holiday are no longer expected', busy ? !r.body.faculty.flatMap((f) => f.missing).some((m) => m.date === hdate) : true);
r = await call(`/api/attendance-admin/holidays/${hol.id}`, { method: 'DELETE', token: registrar });
check('the holiday is removed', r.status === 204, msg(r));
r = await call(`/api/attendance-admin/compliance?from=${istDay(-90)}&to=${istDay(0)}`, { token: registrar });
check('more than two months at once is refused', r.status === 400, msg(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
