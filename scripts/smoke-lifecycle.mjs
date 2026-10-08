/**
 * End-to-end test of the student lifecycle against a running, freshly seeded API.
 *
 *   npm run db:start && npx tsx prisma/seed.ts
 *   npm run dev
 *   node scripts/smoke-lifecycle.mjs
 *
 * Walks one student through a break in study and back, suspension and
 * reinstatement, promotion, no-dues clearance, a transfer out (which closes
 * the sign-in and raises the certificates) and readmission — and checks the
 * moves that must be refused: the office deciding, leaving with dues, applying
 * twice, graduating early, promoting the same sheet twice.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';
let pass = 0;
let fail = 0;

function check(name, condition, detail = '') {
  if (condition) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function login(email) {
  const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } });
  if (r.status !== 200) throw new Error(`Could not sign in as ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;

const registrar = await login('registrar@demo.resolion.edu');
const office = await login('pushpa.sharma@demo.resolion.edu');
let student = await login('priya.sharma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

console.log('\nOverview and register');
const ov = await call('/api/lifecycle/overview', { token: office });
check('office reads the overview', ov.status === 200 && ov.body.counts.ACTIVE > 0, msg(ov));
check('student cannot read the overview', (await call('/api/lifecycle/overview', { token: student })).status === 403);
const reg = await call('/api/lifecycle/students?q=Priya', { token: registrar });
const priya = reg.body?.students?.find((s) => s.name === 'Priya Sharma');
check('register search finds the student', !!priya, msg(reg));
const id = priya.id;

let d = await call(`/api/lifecycle/students/${id}`, { token: registrar });
check('record shows ACTIVE with actions', d.status === 200 && d.body.status === 'ACTIVE' && d.body.actions.some((a) => a.action === 'SUSPEND'), msg(d));
check('history begins with admission', d.body.history.some((h) => h.kind === 'ADMITTED'));
check('fees outstanding block accounts clearance', d.body.clearance.items.find((i) => i.department === 'Accounts')?.cleared === false);
const startSemester = d.body.semester;
const programmeId = ov.body.programmes.find((p) => p.shortName === d.body.programme.shortName)?.id;

console.log('\nPermissions and blocked exits');
let r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: office, body: { action: 'SUSPEND', reason: 'Testing the office cannot' } });
check('office cannot change standing', r.status === 403, msg(r));
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'WITHDRAW', reason: 'Leaving with dues' } });
check('withdrawal refused while no-dues are pending', r.status === 409 && /clearance/i.test(r.body?.error?.message), msg(r));
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'GRADUATE', reason: 'Too early to graduate' } });
check('graduation refused before the final semester', r.status === 409, msg(r));
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'REINSTATE', reason: 'Not suspended' } });
check('reinstating an active student is refused', r.status === 409, msg(r));

console.log('\nBreak in study, by application');
let me = await call('/api/lifecycle/me', { token: student });
check('student sees own standing', me.status === 200 && me.body.status === 'ACTIVE' && me.body.canApply.includes('BREAK_OF_STUDY'), msg(me));
check('parent sees the ward\'s standing', (await call('/api/lifecycle/me', { token: parent })).status === 200);
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: parent, body: { kind: 'WITHDRAWAL', reason: 'Parent cannot apply for this' } });
check('parent cannot apply on the student\'s behalf', r.status === 403, msg(r));
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'BREAK_OF_STUDY', reason: 'Medical treatment for three months' } });
check('break without a return date is refused', r.status === 400, msg(r));
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'BREAK_OF_STUDY', reason: 'Medical treatment for three months', returnBy: '2027-01-15' } });
check('student applies for a break', r.status === 201 && r.body.status === 'PENDING', msg(r));
const breakReq = r.body.id;
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'WITHDRAWAL', reason: 'A second application at once' } });
check('a second open application is refused', r.status === 409, msg(r));
const q = await call('/api/lifecycle/requests?status=PENDING', { token: registrar });
check('application reaches the registrar\'s queue', q.body.some((x) => x.id === breakReq));
r = await call(`/api/lifecycle/requests/${breakReq}/decide`, { method: 'POST', token: office, body: { approve: true, note: 'Office cannot decide' } });
check('office cannot decide applications', r.status === 403, msg(r));
r = await call(`/api/lifecycle/requests/${breakReq}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'Approved on medical grounds' } });
check('registrar approves the break', r.status === 200 && r.body.status === 'APPROVED', msg(r));
me = await call('/api/lifecycle/me', { token: student });
check('student is now on a break', me.body.status === 'ON_LEAVE' && me.body.canApply.includes('RESUME'), JSON.stringify(me.body.status));
r = await call('/api/student/exam/form', { method: 'POST', token: student, body: { declaration: true } });
check('a student on a break cannot file an exam form', r.status === 409, msg(r));
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'RESUME', reason: 'Treatment complete, ready to rejoin' } });
check('student applies to resume', r.status === 201, msg(r));
r = await call(`/api/lifecycle/requests/${r.body.id}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'Welcome back' } });
check('registrar approves the return', r.status === 200, msg(r));
d = await call(`/api/lifecycle/students/${id}`, { token: registrar });
check('student is active again', d.body.status === 'ACTIVE', d.body.status);

console.log('\nSuspension');
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'SUSPEND', reason: 'Pending disciplinary inquiry', reference: 'DC/2026/14' } });
check('registrar suspends', r.status === 200 && r.body.to === 'SUSPENDED', msg(r));
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'REINSTATE', reason: 'Inquiry closed without penalty' } });
check('registrar reinstates', r.status === 200 && r.body.to === 'ACTIVE', msg(r));

console.log('\nPromotion');
const sheet = await call(`/api/lifecycle/promotion?programmeId=${programmeId}&semester=${startSemester}`, { token: registrar });
check('promotion sheet lists the class', sheet.status === 200 && sheet.body.students.some((s) => s.id === id), msg(sheet));
const decisions = sheet.body.students.map((s) => ({ studentId: s.id, decision: s.id === id ? 'PROMOTE' : 'HOLD' }));
r = await call('/api/lifecycle/promotion', { method: 'POST', token: registrar, body: { programmeId, semester: startSemester, term: '2030-31-ODD', decisions } });
const parityOk = (startSemester + 1) % 2 === 1;
if (!parityOk) check('a term of the wrong parity is refused', r.status === 400, msg(r));
r = await call('/api/lifecycle/promotion', { method: 'POST', token: registrar, body: { programmeId, semester: startSemester, term: sheet.body.suggestedTerm, decisions: [{ studentId: id, decision: 'DETAIN' }] } });
check('a detention without a reason is refused', r.status === 400, msg(r));
if (sheet.body.nextSemesterSubjects === 0) {
  r = await call('/api/lifecycle/promotion', { method: 'POST', token: registrar, body: { programmeId, semester: startSemester, term: sheet.body.suggestedTerm, decisions } });
  check('promotion into a semester with no curriculum is refused', r.status === 409 && /curriculum/i.test(r.body?.error?.message), msg(r));
  for (const [i, name] of ['Cloud Computing', 'Major Project'].entries()) {
    r = await call('/api/office/curriculum/subjects', { method: 'POST', token: registrar, body: { programmeId, code: `LC${startSemester + 1}0${i + 1}`, name, credits: 4, semester: startSemester + 1 } });
    check(`registrar adds ${name} to semester ${startSemester + 1}`, r.status === 201, msg(r));
  }
}
r = await call('/api/lifecycle/promotion', { method: 'POST', token: registrar, body: { programmeId, semester: startSemester, term: sheet.body.suggestedTerm, reference: 'AC/2026/7', decisions } });
check('registrar commits the sheet', r.status === 200 && r.body.promoted === 1 && r.body.subjects > 0, msg(r));
d = await call(`/api/lifecycle/students/${id}`, { token: registrar });
check('student moved up a semester', d.body.semester === startSemester + 1, `${d.body.semester}`);
check('student enrolled for the new term', d.body.currentTerm === sheet.body.suggestedTerm, d.body.currentTerm);
r = await call('/api/lifecycle/promotion', { method: 'POST', token: registrar, body: { programmeId, semester: startSemester, term: sheet.body.suggestedTerm, decisions: [{ studentId: id, decision: 'PROMOTE' }] } });
check('committing the same sheet again promotes no one', r.status === 200 && r.body.promoted === 0 && r.body.skipped.length === 1, msg(r));

console.log('\nNo-dues clearance');
r = await call(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', token: office, body: { department: 'Accounts', cleared: true, remarks: 'Office waiving fees' } });
check('office cannot waive the fee ledger', r.status === 403, msg(r));
r = await call(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', token: registrar, body: { department: 'Accounts', cleared: true } });
check('a waiver without a reason is refused', r.status === 400, msg(r));
r = await call(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', token: registrar, body: { department: 'Accounts', cleared: true, remarks: 'Fee waived under order FW/2026/3' } });
check('registrar waives fee dues', r.status === 200 && r.body.items.find((i) => i.department === 'Accounts').waived, msg(r));
for (const dept of ['Laboratory', 'Department']) {
  r = await call(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', token: office, body: { department: dept, cleared: true, remarks: 'No dues' } });
  check(`office signs off ${dept}`, r.status === 200, msg(r));
}
let c = r.body;
if (!c.items.find((i) => i.department === 'Hostel').cleared) {
  const res_ = await call(`/api/hostel/residents?q=${encodeURIComponent(priya.enrolmentNo)}`, { token: office });
  r = await call(`/api/hostel/allotments/${res_.body[0].id}/vacate`, { method: 'POST', token: office, body: { reason: 'Leaving the institution' } });
  check('the hostel office vacates the room', r.status === 200, msg(r));
  c = (await call(`/api/lifecycle/students/${id}`, { token: registrar })).body.clearance;
  check('which clears the hostel by itself', c.items.find((i) => i.department === 'Hostel').cleared === true);
}
if (!c.items.find((i) => i.department === 'Transport').cleared) {
  r = await call(`/api/lifecycle/students/${id}/clearance/surrender-pass`, { method: 'POST', token: office });
  check('office takes back the bus pass', r.status === 200 && r.body.items.find((i) => i.department === 'Transport').cleared, msg(r));
  c = r.body;
}
const lib = c.items.find((i) => i.department === 'Library');
if (!lib.cleared) {
  r = await call(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', token: registrar, body: { department: 'Library', cleared: true, remarks: 'Books written off, order LB/2026/2' } });
  c = r.body;
}
check('clearance complete', c.complete === true, JSON.stringify(c.pending));

console.log('\nTransfer out, and back');
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'TRANSFER', reason: 'Family relocating to another state' } });
check('transfer without a destination is refused', r.status === 400, msg(r));
r = await call('/api/lifecycle/me/requests', { method: 'POST', token: student, body: { kind: 'TRANSFER', reason: 'Family relocating to another state', destination: 'Govt. College, Indore' } });
check('student applies to transfer', r.status === 201, msg(r));
r = await call(`/api/lifecycle/requests/${r.body.id}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'Transfer approved; collect TC from the office' } });
check('registrar approves the transfer', r.status === 200, msg(r));
d = await call(`/api/lifecycle/students/${id}`, { token: registrar });
check('student is transferred and sign-in closed', d.body.status === 'TRANSFERRED' && d.body.signInOpen === false, `${d.body.status} ${d.body.signInOpen}`);
const certs = await call('/api/office/certificates', { token: office });
const mine = (certs.body?.requests ?? []).filter((x) => x.enrolmentNo === priya.enrolmentNo).map((x) => x.type);
check('transfer and migration certificates raised', mine.includes('Transfer Certificate') && mine.includes('Migration Certificate'), mine.join(', '));
r = await call('/api/auth/login', { method: 'POST', body: { email: 'priya.sharma.2021@demo.resolion.edu', password: 'campus123' } });
check('transferred student cannot sign in', r.status === 403, msg(r));
const sem = d.body.semester;
const term = sem % 2 ? '2031-32-ODD' : '2031-32-EVEN';
r = await call(`/api/lifecycle/students/${id}/transition`, { method: 'POST', token: registrar, body: { action: 'READMIT', reason: 'Transfer cancelled by the other college', semester: sem, term, reference: 'RA/2026/1' } });
// Readmission is from WITHDRAWN, DETAINED or ON_LEAVE; a transfer is final unless it is reversed by withdrawing first.
check('readmission straight from a transfer is refused', r.status === 409, msg(r));

console.log('\nDetention and readmission');
const other = sheet.body.students.find((s) => s.id !== id);
if (other) {
  r = await call(`/api/lifecycle/students/${other.id}/transition`, { method: 'POST', token: registrar, body: { action: 'DETAIN', reason: 'Attendance below 75% in the semester' } });
  check('registrar detains a student', r.status === 200 && r.body.to === 'DETAINED', msg(r));
  r = await call(`/api/lifecycle/students/${other.id}/transition`, { method: 'POST', token: registrar, body: { action: 'READMIT', reason: 'Readmitted to repeat the semester' } });
  check('readmission without a semester is refused', r.status === 400, msg(r));
  r = await call(`/api/lifecycle/students/${other.id}/transition`, { method: 'POST', token: registrar, body: { action: 'READMIT', reason: 'Readmitted to repeat the semester', semester: startSemester, term: startSemester % 2 ? '2031-32-EVEN' : '2031-32-ODD' } });
  check('a term of the wrong parity is refused', r.status === 400, msg(r));
  r = await call(`/api/lifecycle/students/${other.id}/transition`, { method: 'POST', token: registrar, body: { action: 'READMIT', reason: 'Readmitted to repeat the semester', semester: startSemester, term: startSemester % 2 ? '2031-32-ODD' : '2031-32-EVEN' } });
  check('detained student readmitted and enrolled', r.status === 200 && r.body.to === 'ACTIVE' && r.body.enrolled > 0, msg(r));
}

console.log('\nGraduation and history');
const grad = await call(`/api/lifecycle/graduation?programmeId=${programmeId}`, { token: registrar });
check('graduation sheet loads', grad.status === 200 && Array.isArray(grad.body.students), msg(grad));
d = await call(`/api/lifecycle/students/${id}`, { token: registrar });
const kinds = d.body.history.map((h) => h.kind);
check('history records every move', ['LEAVE_STARTED', 'RESUMED', 'SUSPENDED', 'REINSTATED', 'PROMOTED', 'TRANSFERRED'].every((k) => kinds.includes(k)), kinds.join(','));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
