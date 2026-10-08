/**
 * End-to-end test of fee administration and the examination upgrades against
 * a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-fees-exams.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };
async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (email) => { const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`); return r.body.accessToken; };
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;
const istDay = (o = 0) => new Date(Date.now() + 5.5 * 3_600_000 + o * 86_400_000).toISOString().slice(0, 10);

const registrar = await login('registrar@demo.resolion.edu');
const office = await login('pushpa.sharma@demo.resolion.edu');
const priya = await login('priya.sharma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

// ═══ Fees ════════════════════════════════════════════════════════════════════

console.log('\nStatement');
let fees = (await call('/api/student/fees', { token: priya })).body;
let st = await call('/api/student/fees/statement', { token: priya });
check('the student has a statement', st.status === 200 && st.body.lines.length > 0, msg(st));
check('its totals match the fee screen', st.body.totals.due === fees.summary.due, `${st.body.totals.due} vs ${fees.summary.due}`);
check('the parent reads the same statement', (await call('/api/student/fees/statement', { token: parent })).body?.totals?.due === fees.summary.due);
const lookup = await call('/api/office/counter/student?q=Priya Sharma', { token: office });
const priyaId = lookup.body?.id;
const head = (name) => lookup.body.heads.find((h) => h.head === name);

console.log('\nCounter');
let r = await call('/api/office/counter/student?q=ra', { token: office });
check('a name that matches several students is not guessed', r.status === 409 && /enrolment number/.test(r.body?.error?.message ?? ''), msg(r));
const univ = head('University Development');
r = await call('/api/office/counter', { method: 'POST', token: office, body: { studentId: priyaId, head: 'University Development', amount: 500, mode: 'CASH', feeItemId: univ.id } });
check('cash taken against one chosen head', r.status === 201 && r.body.appliedTo.length === 1 && r.body.appliedTo[0].head === 'University Development' && r.body.appliedTo[0].amount === 500, msg(r));
const cashReceipt = r.body;
r = await call('/api/office/counter', { method: 'POST', token: office, body: { studentId: priyaId, head: 'University Development', amount: 200, mode: 'CASH', feeItemId: univ.id } });
check('receipt numbers run in sequence', Number(r.body.receiptNo.split('/').pop()) === Number(cashReceipt.receiptNo.split('/').pop()) + 1, `${cashReceipt.receiptNo} then ${r.body.receiptNo}`);
const second = r.body;
st = (await call('/api/student/fees/statement', { token: priya })).body;
const rcpt = st.receipts.find((x) => x.receiptNo === cashReceipt.receiptNo);
check('the statement shows what the receipt paid', rcpt?.appliedTo?.[0]?.head === 'University Development' && rcpt.appliedTo[0].amount === 500, JSON.stringify(rcpt?.appliedTo));
const dueBefore = st.totals.due;

console.log('\nCancelling a receipt');
const payments = (await call(`/api/office/finance/payments?from=${istDay(0)}&to=${istDay(0)}`, { token: office })).body.payments;
const secondPay = payments.find((p) => p.receiptNo === second.receiptNo);
r = await call(`/api/fee-admin/receipts/${secondPay.id}/cancel`, { method: 'POST', token: office, body: { reason: 'short' } });
check('a cancellation needs a real reason', r.status === 400, msg(r));
r = await call(`/api/fee-admin/receipts/${secondPay.id}/cancel`, { method: 'POST', token: office, body: { reason: 'Entered twice by mistake at the window' } });
check('the office cancels today\'s receipt', r.status === 200 && r.body.reversed === 200, msg(r));
st = (await call('/api/student/fees/statement', { token: priya })).body;
check('and the head is owed again', st.totals.due === dueBefore + 200, `${dueBefore} → ${st.totals.due}`);
r = await call(`/api/fee-admin/receipts/${secondPay.id}/cancel`, { method: 'POST', token: office, body: { reason: 'Entered twice by mistake at the window' } });
check('it cannot be cancelled twice', r.status === 409, msg(r));
r = await call('/api/student/notifications?unreadOnly=true', { token: priya });
check('the student is told', JSON.stringify(r.body).includes('cancelled'));

console.log('\nCheques');
r = await call('/api/office/counter', { method: 'POST', token: office, body: { studentId: priyaId, head: 'University Development', amount: 300, mode: 'CHEQUE', instrument: '004512', feeItemId: univ.id } });
check('a cheque waits for clearance', r.status === 201 && r.body.status === 'PENDING_CLEARANCE' && r.body.appliedTo.length === 0, msg(r));
const cheque = r.body;
r = await call(`/api/office/counter/${cheque.id}/settle`, { method: 'POST', token: office, body: { outcome: 'CLEARED' } });
check('clearing it pays the dues', r.status === 200 && r.body.appliedTo.reduce((t, a) => t + a.amount, 0) === 300, msg(r));

console.log('\nConcessions');
const exam = head('Examination Fee');
r = await call('/api/fee-admin/concessions', { method: 'POST', token: office, body: { studentId: priyaId, feeItemId: exam.id, kind: 'NEED_BASED', amount: 999999, reason: 'Father lost his job this year' } });
check('a concession cannot exceed what is unpaid', r.status === 400, msg(r));
r = await call('/api/fee-admin/concessions', { method: 'POST', token: office, body: { studentId: priyaId, feeItemId: exam.id, kind: 'NEED_BASED', amount: 300, reason: 'Father lost his job this year' } });
check('the office proposes a concession', r.status === 201 && /^CON\//.test(r.body.concessionNo), msg(r));
const con = r.body;
r = await call(`/api/fee-admin/concessions/${con.id}/decide`, { method: 'POST', token: office, body: { approve: true, note: 'Approve' } });
check('the office cannot approve its own proposal', r.status === 403, msg(r));
const due0 = (await call('/api/student/fees', { token: priya })).body.summary.due;
r = await call(`/api/fee-admin/concessions/${con.id}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'Granted under the need-based scheme' } });
check('the registrar grants it', r.status === 200 && r.body.amount === 300, msg(r));
fees = (await call('/api/student/fees', { token: priya })).body;
check('the dues come down by the concession', fees.summary.due === due0 - 300, `${due0} → ${fees.summary.due}`);
check('the student sees the concession', fees.concessions.some((c) => c.no === con.concessionNo && c.status === 'APPROVED'));
const today = (await call(`/api/office/finance/payments?from=${istDay(0)}&to=${istDay(0)}`, { token: office })).body;
check('a concession is not counted as money collected', !today.payments.some((p) => p.kind === 'CONCESSION' && p.status === 'SUCCESS' && today.totals.collected === p.amount) && today.payments.some((p) => p.kind === 'CONCESSION'));

console.log('\nRefunds');
const caution = head('Caution Deposit');
r = await call('/api/fee-admin/refunds', { method: 'POST', token: office, body: { studentId: priyaId, feeItemId: caution.id, amount: 5000, reason: 'Caution deposit on leaving the hostel' } });
check('more than was paid cannot be refunded', r.status === 400, msg(r));
r = await call('/api/fee-admin/refunds', { method: 'POST', token: office, body: { studentId: priyaId, feeItemId: caution.id, amount: 1000, reason: 'Caution deposit on leaving the hostel' } });
check('the office raises a refund', r.status === 201 && /^RF\//.test(r.body.refundNo), msg(r));
const rf = r.body;
r = await call(`/api/fee-admin/refunds/${rf.id}/pay`, { method: 'POST', token: office, body: { mode: 'NEFT', reference: 'UTR998877' } });
check('it cannot be paid before approval', r.status === 409, msg(r));
r = await call(`/api/fee-admin/refunds/${rf.id}/decide`, { method: 'POST', token: registrar, body: { approve: true, note: 'No dues against the hostel' } });
check('the registrar approves it', r.status === 200, msg(r));
const dueR = (await call('/api/student/fees', { token: priya })).body.summary.due;
r = await call(`/api/fee-admin/refunds/${rf.id}/pay`, { method: 'POST', token: office, body: { mode: 'NEFT', reference: 'UTR998877' } });
check('and it is paid out', r.status === 200 && r.body.status === 'PAID', msg(r));
fees = (await call('/api/student/fees', { token: priya })).body;
check('the refund leaves the dues as they were', fees.summary.due === dueR, `${dueR} → ${fees.summary.due}`);
check('the caution deposit now shows nothing paid or charged', fees.items.find((i) => i.head === 'Caution Deposit')?.amount === 0);
st = (await call('/api/student/fees/statement', { token: priya })).body;
check('the statement balance still equals the dues', st.lines.at(-1)?.balance === st.totals.due || st.lines.length === 0, `${st.lines.at(-1)?.balance} vs ${st.totals.due}`);

console.log('\nOnline receipt numbers');
const onlineHead = fees.items.find((i) => i.outstanding > 0);
r = await call('/api/student/fees/pay', { method: 'POST', token: priya, body: { feeItemId: onlineHead.id, mode: 'UPI' } });
check('an online payment gets a receipt in the series', r.status === 201 && /^RCT\/[^/]+\/\d{4}\/\d{6}$/.test(r.body.receipt), msg(r) + ' ' + r.body?.receipt);
const onlinePay = (await call(`/api/office/finance/payments?from=${istDay(0)}&to=${istDay(0)}`, { token: office })).body.payments.find((p) => p.receiptNo === r.body.receipt);
r = await call(`/api/fee-admin/receipts/${onlinePay.id}/cancel`, { method: 'POST', token: registrar, body: { reason: 'Trying to cancel an online payment' } });
check('an online payment cannot be cancelled — it is refunded', r.status === 409, msg(r));

console.log('\nFee structures');
const progs = (await call('/api/office/finance/programmes', { token: registrar })).body;
const bca = progs.find((p) => p.semesters.some((s) => s.semester === 5)) ?? progs[0];
const structure = { name: 'BCA V — test term', programmeId: bca.id, semester: 5, term: 'TEST-2026', heads: [{ head: 'Tuition Fee', category: 'TUITION', amount: 6000, dueDate: istDay(10) }, { head: 'Library Fee', category: 'OTHER', amount: 500, dueDate: istDay(10) }], instalments: [{ percent: 60, dueDate: istDay(10) }, { percent: 40, dueDate: istDay(40) }] };
r = await call('/api/fee-admin/structures', { method: 'POST', token: office, body: structure });
check('the office cannot set fee structures', r.status === 403, msg(r));
r = await call('/api/fee-admin/structures', { method: 'POST', token: registrar, body: { ...structure, instalments: [{ percent: 60, dueDate: istDay(10) }, { percent: 30, dueDate: istDay(40) }] } });
check('instalments must add up to 100%', r.status === 400, msg(r));
r = await call('/api/fee-admin/structures', { method: 'POST', token: registrar, body: structure });
check('the registrar sets a structure', r.status === 201, msg(r));
const sid = r.body.id;
r = await call(`/api/fee-admin/structures/${sid}/apply`, { method: 'POST', token: registrar, body: { dryRun: true } });
check('a dry run says what it would charge', r.status === 200 && r.body.charges > 0 && r.body.instalments === r.body.students * 2, JSON.stringify(r.body));
const wouldCharge = r.body.charges;
r = await call(`/api/fee-admin/structures/${sid}/apply`, { method: 'POST', token: registrar, body: { dryRun: false } });
check('applying charges the class', r.status === 201 && r.body.charges === wouldCharge, JSON.stringify(r.body));
r = await call(`/api/fee-admin/structures/${sid}/apply`, { method: 'POST', token: registrar, body: { dryRun: false } });
check('applying again bills no one twice', r.status === 201 && r.body.charges === 0 && r.body.instalments === 0, JSON.stringify(r.body));
fees = (await call('/api/student/fees', { token: priya })).body;
const plan = fees.instalments.filter((i) => i.amount === 3900 || i.amount === 2600);
check('the student has the instalment plan', plan.length === 2, JSON.stringify(fees.instalments.map((i) => i.amount)));
r = await call(`/api/fee-admin/structures/${sid}`, { method: 'DELETE', token: registrar });
check('an applied structure stays on record', r.status === 409, msg(r));

console.log('\nInstalment plan for one student');
const term = 'TEST-2026';
const owing = (await call(`/api/fee-admin/students/${priyaId}/statement`, { token: office })).body.items.filter((i) => i.term === term).reduce((t, i) => t + i.due, 0);
r = await call('/api/fee-admin/instalments', { method: 'POST', token: office, body: { studentId: priyaId, term, parts: [{ amount: 100, dueDate: istDay(5) }] } });
check('a plan that does not add up is refused', r.status === 400, msg(r));
r = await call('/api/fee-admin/instalments', { method: 'POST', token: office, body: { studentId: priyaId, term, parts: [{ amount: owing - 1000, dueDate: istDay(5) }, { amount: 1000, dueDate: istDay(35) }] } });
check('a plan is redrawn for one student', r.status === 201 && r.body.parts === 2, msg(r));

console.log('\nLate fines');
// A mess bill that fell due three weeks ago and is still unpaid.
await call('/api/office/finance/charge-students', { method: 'POST', token: registrar, body: { studentIds: [priyaId], head: 'Hostel Mess Bill (Sept)', category: 'OTHER', amount: 2400, term: 'TEST-2026', dueDate: istDay(-20) } });
r = await call('/api/fee-admin/late-fines', { method: 'POST', token: office, body: { perDay: 10, cap: 500, graceDays: 0 } });
check('the office cannot levy fines', r.status === 403, msg(r));
r = await call('/api/fee-admin/late-fines', { method: 'POST', token: registrar, body: { perDay: 10, cap: 500, graceDays: 0, dryRun: true } });
check('a dry run finds overdue heads', r.status === 200 && r.body.overdue > 0 && r.body.created > 0, JSON.stringify(r.body));
const firstRun = r.body;
r = await call('/api/fee-admin/late-fines', { method: 'POST', token: registrar, body: { perDay: 10, cap: 500, graceDays: 0 } });
check('fines are levied', r.status === 200 && r.body.created === firstRun.created, JSON.stringify(r.body));
r = await call('/api/fee-admin/late-fines', { method: 'POST', token: registrar, body: { perDay: 10, cap: 500, graceDays: 0 } });
check('running again adds no second fine', r.status === 200 && r.body.created === 0, JSON.stringify(r.body));

console.log('\nDay book');
r = await call('/api/fee-admin/daybook', { token: office });
check('today\'s day book', r.status === 200 && r.body.cash >= 500 && r.body.cancelled.length >= 1 && r.body.byClerk.length > 0, msg(r));
const book = r.body;
r = await call('/api/fee-admin/daybook/close', { method: 'POST', token: office, body: { date: istDay(0), countedCash: book.cash + 50 } });
check('a cash difference must be explained', r.status === 400, msg(r));
r = await call('/api/fee-admin/daybook/close', { method: 'POST', token: office, body: { date: istDay(0), countedCash: book.cash } });
check('the day is closed', r.status === 201 && r.body.difference === 0, msg(r));
const firstPay = (await call(`/api/office/finance/payments?from=${istDay(0)}&to=${istDay(0)}`, { token: office })).body.payments.find((p) => p.receiptNo === cashReceipt.receiptNo);
r = await call(`/api/fee-admin/receipts/${firstPay.id}/cancel`, { method: 'POST', token: registrar, body: { reason: 'Trying after the day was closed' } });
check('a receipt of a closed day cannot be cancelled', r.status === 409, msg(r));

// ═══ Examinations ════════════════════════════════════════════════════════════

console.log('\nExaminer panel');
r = await call('/api/exam/examiners', { token: registrar });
check('the panel is listed', r.status === 200 && r.body.length >= 5, msg(r));
const examiners = r.body;
r = await call('/api/exam/examiners', { method: 'POST', token: registrar, body: { name: 'Dr. Meera Joshi', designation: 'Professor', institution: 'JU Department of CS', subjects: 'BCA502', mobile: '9876500000', email: 'meera@example.in' } });
check('an examiner is added', r.status === 201, msg(r));
r = await call(`/api/exam/examiners/${r.body.id}`, { method: 'PATCH', token: registrar, body: { active: false } });
check('and can be taken off the panel', r.status === 200 && r.body.active === false, msg(r));
const inactive = r.body.id;
r = await call('/api/exam/examiners', { token: office });
check('the college office cannot see the panel', r.status === 403, msg(r));

console.log('\nBacklogs');
const sessions = (await call('/api/exam/sessions', { token: registrar })).body;
const ses = sessions.find((s) => s.status === 'FORM_WINDOW_CLOSED');
const deepak = await login('deepak.singh.2021@demo.resolion.edu').catch(() => null);
if (deepak) {
  r = await call('/api/student/exam', { token: deepak });
  check('a student with a failed paper sees it as a backlog', r.body?.backlogs?.some((b) => b.code === 'BCA402'), JSON.stringify(r.body?.backlogs));
  check('the form carries it as a backlog paper', r.body?.form?.subjects?.some((s) => s.code === 'BCA402' && s.kind === 'BACKLOG'));
  check('and the date sheet lists it', r.body?.dateSheet?.some((p) => p.code === 'BCA402'));
}

// Clear the class and seat it, as the office and the examination wing do.
const forms = (await call('/api/office/exam-forms', { token: office })).body.forms;
for (const f of forms) if (f.eligibility !== 'CLEARED') await call(`/api/office/exam-forms/${f.id}/decide`, { method: 'POST', token: office, body: { decision: 'CLEAR', remarks: 'Cleared for the sitting.' } });
await call(`/api/exam/sessions/${ses.id}/allocate`, { method: 'POST', token: registrar, body: { centreCode: 'DC-04' } });
r = await call(`/api/exam/sessions/${ses.id}/status`, { method: 'POST', token: registrar, body: { status: 'IN_PROGRESS' } });
check('the sitting starts', r.status === 200, msg(r));
const detail = (await call(`/api/exam/sessions/${ses.id}`, { token: registrar })).body;
const paperOf = (code) => detail.papers.find((p) => (p.code ?? p.subject?.code) === code);

console.log('\nHall attendance');
const p501 = paperOf('BCA501');
r = await call(`/api/exam/papers/${p501.id}/attendance`, { token: registrar });
check('the invigilator\'s list for a paper', r.status === 200 && r.body.candidates.length >= 10, msg(r));
const absentee = r.body.candidates.find((c) => c.name === 'Rahul Verma') ?? r.body.candidates[1];
r = await call(`/api/exam/papers/${p501.id}/attendance`, { method: 'POST', token: registrar, body: { absent: ['nobody-at-all'] } });
check('a stranger cannot be marked absent', r.status === 400, msg(r));
r = await call(`/api/exam/papers/${p501.id}/attendance`, { method: 'POST', token: registrar, body: { absent: [absentee.studentId] } });
check('an absentee is recorded', r.status === 200 && r.body.absent === 1, msg(r));
const p402 = paperOf('BCA402');
r = await call(`/api/exam/papers/${p402.id}/attendance`, { token: registrar });
check('backlog candidates are on their paper\'s list', r.body?.candidates?.some((c) => c.kind === 'BACKLOG'), JSON.stringify(r.body?.candidates?.map((c) => c.name)));

console.log('\nUnfair means');
const p502 = paperOf('BCA502');
const list502 = (await call(`/api/exam/papers/${p502.id}/attendance`, { token: registrar })).body.candidates;
const culprit = list502.find((c) => c.name !== 'Priya Sharma' && c.studentId !== absentee.studentId);
r = await call(`/api/exam/papers/${p502.id}/malpractice`, { method: 'POST', token: registrar, body: { studentId: culprit.studentId, description: 'Found with handwritten notes inside the calculator cover', reportedBy: 'Invigilator, Hall 3' } });
check('a case is reported', r.status === 201 && /^UFM\//.test(r.body.caseNo), msg(r));
const ufm = r.body;
r = await call(`/api/exam/papers/${p502.id}/malpractice`, { method: 'POST', token: registrar, body: { studentId: culprit.studentId, description: 'Found with handwritten notes inside the calculator cover', reportedBy: 'Invigilator, Hall 3' } });
check('the same case cannot be filed twice', r.status === 409, msg(r));

console.log('\nEvaluation');
r = await call(`/api/exam/sessions/${ses.id}/status`, { method: 'POST', token: registrar, body: { status: 'EVALUATION' } });
check('evaluation begins', r.status === 200, msg(r));
r = await call(`/api/exam/papers/${p501.id}/bundles`, { method: 'POST', token: registrar, body: { centreCode: 'DC-04', examinerId: inactive, examinerRole: 'E1' } });
check('an examiner off the panel cannot be given a bundle', r.status === 400, msg(r));
for (const p of detail.papers) {
  const b = await call(`/api/exam/papers/${p.id}/bundles`, { method: 'POST', token: registrar, body: { centreCode: 'DC-04', examinerId: examiners[0].id, examinerRole: 'E1' } });
  if (b.status !== 201) continue;
  const f = (await call(`/api/exam/bundles/${b.body.id}`, { token: registrar })).body;
  if (p.id === p501.id) check('an absentee gets no script in the bundle', !f.scripts.some((s) => s.studentId === absentee.studentId));
  await call(`/api/exam/bundles/${b.body.id}/marks`, { method: 'POST', token: registrar, body: { marks: f.scripts.map((s) => ({ studentId: s.studentId, mark: 50 })), submit: true } });
}
r = await call(`/api/exam/sessions/${ses.id}/bundles`, { token: registrar });
check('bundle tracking shows every bundle and its progress', r.status === 200 && r.body.length >= detail.papers.length && r.body.every((b) => b.marked === b.scripts && b.examinerName === examiners[0].name), msg(r));

console.log('\nResults');
r = await call(`/api/exam/sessions/${ses.id}/status`, { method: 'POST', token: registrar, body: { status: 'RESULT_PROCESSING' } });
check('results cannot be processed with a case undecided', r.status === 400 && r.body?.error?.details?.openCases === 1, msg(r));
r = await call(`/api/exam/malpractice/${ufm.id}/decide`, { method: 'POST', token: registrar, body: { decision: 'PAPER_CANCELLED', note: 'Admitted the notes were his; paper cancelled' } });
check('the committee decides the case', r.status === 200, msg(r));
r = await call(`/api/exam/sessions/${ses.id}/malpractice`, { token: registrar });
check('the case register shows the decision', r.body?.[0]?.decision === 'PAPER_CANCELLED');
r = await call(`/api/exam/sessions/${ses.id}/status`, { method: 'POST', token: registrar, body: { status: 'RESULT_PROCESSING' } });
check('now evaluation can close', r.status === 200, msg(r));
r = await call(`/api/exam/sessions/${ses.id}/process`, { method: 'POST', token: registrar });
check('results process', r.status === 201, msg(r));
check('backlog papers are kept apart for their own semester', r.body?.backlogs === 2, `backlogs ${r.body?.backlogs}`);
const res = (await call(`/api/exam/sessions/${ses.id}/results`, { token: registrar })).body.results;
const culpritRow = res.find((x) => x.studentId === culprit.studentId)?.subjects.find((s) => s.code === 'BCA502');
check('the cancelled paper is failed with no marks', culpritRow?.passed === false && culpritRow?.external === 0 && culpritRow?.grade === 'F', JSON.stringify(culpritRow));
const absRow = res.find((x) => x.studentId === absentee.studentId)?.subjects.find((s) => s.code === 'BCA501');
check('the absentee fails the paper they missed', absRow?.passed === false && absRow?.external === 0, JSON.stringify(absRow));
check('no current marksheet carries the backlog paper', !res.some((x) => x.subjects.some((s) => s.code === 'BCA402')));
r = await call(`/api/exam/sessions/${ses.id}/status`, { method: 'POST', token: registrar, body: { status: 'RESULT_PUBLISHED' } });
check('the sitting is published', r.status === 200, msg(r));
if (deepak) {
  const results = (await call('/api/student/results', { token: deepak })).body;
  const sem4 = results.find((x) => x.semester === 4);
  const row = sem4?.subjects?.find((s) => s.code === 'BCA402');
  check('the cleared backlog is written into the semester-4 marksheet', row?.passed === true && row?.external === 50, JSON.stringify(row));
  check('and that semester now reads as passed', sem4?.outcome === 'PASS' || sem4?.result === 'PASS', JSON.stringify({ outcome: sem4?.outcome, result: sem4?.result }));
  r = await call('/api/student/exam', { token: deepak });
  check('it is no longer a backlog', !r.body?.backlogs?.some((b) => b.code === 'BCA402'), JSON.stringify(r.body?.backlogs));
}

console.log('\nRevaluation fee through the ledger');
r = await call('/api/student/revaluations', { method: 'POST', token: priya, body: { subjectCode: 'BCA503' } });
check('a revaluation is applied for', r.status === 201, msg(r));
const app = r.body;
fees = (await call('/api/student/fees', { token: priya })).body;
const rvItem = fees.items.find((i) => i.head.startsWith(`Revaluation fee — ${app.applicationNo}`));
r = await call('/api/student/fees/pay', { method: 'POST', token: priya, body: { feeItemId: rvItem.id, mode: 'UPI' } });
check('the student pays it online', r.status === 201, msg(r));
r = await call('/api/exam/revaluations', { token: registrar });
check('the re-reading starts once the fee is paid, without anyone ticking it', r.body.find((a) => a.id === app.id)?.status === 'UNDER_REVALUATION', JSON.stringify(r.body.find((a) => a.id === app.id)));
r = await call(`/api/exam/revaluations/${app.id}/complete`, { method: 'POST', token: registrar, body: { revisedMark: 60, remarks: 'Re-totalled' } });
check('the revaluation completes', r.status === 200, msg(r));
const after = (await call(`/api/exam/sessions/${ses.id}/results`, { token: registrar })).body.results.find((x) => x.name === 'Priya Sharma');
check('the SGPA follows the revised mark', after && after.subjects.find((s) => s.code === 'BCA503')?.external === 60, JSON.stringify(after?.subjects?.find((s) => s.code === 'BCA503')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
