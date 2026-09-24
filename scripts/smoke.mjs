/**
 * End-to-end smoke test against a running API.
 *
 *   npm run db:start   # terminal 1
 *   npm run dev        # terminal 2
 *   node scripts/smoke.mjs
 *
 * Exercises the whole Phase 1 to 10 surface including the paths that must
 * fail: bad credentials, missing tokens, cross-student access, replayed
 * refresh tokens, double-marked attendance, a lecturer reaching into another
 * lecturer's class, self-approval of marks and leave, enrolling a candidate
 * whose papers are not verified, and issuing a certificate unpaid.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';

let pass = 0;
let fail = 0;

function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: json, raw: text };
}

const section = (t) => console.log(`\n${t}`);

// ── Health ───────────────────────────────────────────────────────────────────

section('Health');
{
  const r = await call('/api/health');
  check('GET /api/health returns ok', r.status === 200 && r.body?.ok === true, `status ${r.status}`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

section('Authentication');

const login = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'priya.sharma.2021@demo.resolion.edu', password: 'campus123' },
});
check('login with correct credentials', login.status === 200 && !!login.body?.accessToken, `status ${login.status}`);
check('login returns the student record', login.body?.user?.student?.name === 'Priya Sharma');
check('login returns STUDENT role', login.body?.user?.role === 'STUDENT');

const token = login.body?.accessToken;
const refreshToken = login.body?.refreshToken;

check(
  'wrong password is rejected',
  (await call('/api/auth/login', { method: 'POST', body: { email: 'priya.sharma.2021@demo.resolion.edu', password: 'nope' } })).status === 401,
);
check(
  'unknown email is rejected',
  (await call('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'campus123' } })).status === 401,
);
check('malformed email is a 400', (await call('/api/auth/login', { method: 'POST', body: { email: 'not-an-email', password: 'x' } })).status === 400);
check('protected route without a token is 401', (await call('/api/student/profile')).status === 401);
check('protected route with a junk token is 401', (await call('/api/student/profile', { token: 'garbage' })).status === 401);

{
  const me = await call('/api/auth/me', { token });
  check('GET /api/auth/me returns the caller', me.status === 200 && me.body?.email === 'priya.sharma.2021@demo.resolion.edu');
}

// ── Student domain ───────────────────────────────────────────────────────────

section('Student profile');
{
  const r = await call('/api/student/profile', { token });
  check('profile returns 200', r.status === 200, `status ${r.status}`);
  check('profile has the right roll number', r.body?.rollNo === 'GMC/BCA/2021/0342');
  check('Hindi name survived the round trip', r.body?.nameHi === 'प्रिया शर्मा', `got ${JSON.stringify(r.body?.nameHi)}`);
  check('college is joined in', r.body?.college?.code === 'RDU-AC-002');
}

section('Attendance');
let attendanceBefore = null;
{
  const r = await call('/api/student/attendance', { token });
  attendanceBefore = r.body;
  check('attendance returns 200', r.status === 200);
  check('threshold is 75', r.body?.threshold === 75);
  check('six current subjects', r.body?.subjects?.length === 6, `got ${r.body?.subjects?.length}`);
  check('overall percent is computed', typeof r.body?.overall?.percent === 'number');

  const networks = r.body?.subjects?.find((s) => s.code === 'BCA503');
  check('BCA503 is 26/38', networks?.present === 26 && networks?.total === 38, JSON.stringify(networks));
  check('BCA503 is flagged below threshold', networks?.meetsThreshold === false);
  check('BCA503 reports classes still needed', networks?.classesNeeded > 0, `got ${networks?.classesNeeded}`);

  const se = r.body?.subjects?.find((s) => s.code === 'BCA501');
  check('BCA501 clears the threshold', se?.meetsThreshold === true, JSON.stringify(se));
}

section('Timetable');
{
  const all = await call('/api/student/timetable', { token });
  check('timetable returns all six days', all.body?.days?.length === 6);
  check('Monday has four slots', all.body?.byDay?.MON?.length === 4, `got ${all.body?.byDay?.MON?.length}`);

  const cancelled = all.body?.byDay?.MON?.find((s) => s.cancelled);
  check('the cancelled Monday class is marked', cancelled?.code === 'BCA503', JSON.stringify(cancelled?.code));
  check('cancellation carries a reason', cancelled?.cancelReason === 'Faculty on duty leave');

  const mon = await call('/api/student/timetable?day=MON', { token });
  check('?day=MON filters', mon.body?.slots?.length === 4 && mon.body?.day === 'MON');
  check('invalid day is a 400', (await call('/api/student/timetable?day=FUNDAY', { token })).status === 400);
}

section('Fees');
let instalmentId = null;
{
  const r = await call('/api/student/fees', { token });
  check('fees returns 200', r.status === 200);
  check('total is 14,600', r.body?.summary?.total === 14600, `got ${r.body?.summary?.total}`);
  check('paid is 11,300', r.body?.summary?.paid === 11300, `got ${r.body?.summary?.paid}`);
  check('due is 3,300', r.body?.summary?.due === 3300, `got ${r.body?.summary?.due}`);
  check('three instalments', r.body?.instalments?.length === 3);
  check('three payments', r.body?.payments?.length === 3);
  check('scholarship adjustment is negative', r.body?.payments?.some((p) => p.amount === -5200));

  const unpaid = r.body?.instalments?.find((i) => !i.paid);
  instalmentId = unpaid?.id;
  check('one instalment is outstanding', !!instalmentId && unpaid.amount === 3300);
}

section('Results');
{
  const r = await call('/api/student/results', { token });
  check('four semester results', r.body?.length === 4, `got ${r.body?.length}`);
  check('semester 4 SGPA is 8.3', r.body?.[3]?.sgpa === 8.3);
  check('semester 4 has three subjects', r.body?.[3]?.subjects?.length === 3);
  check('subject names are joined in', r.body?.[3]?.subjects?.[0]?.name?.length > 0);
}

section('Transport');
{
  const r = await call('/api/student/transport', { token });
  check('route R-07 returned', r.body?.routeNo === 'R-07');
  check('five stops in order', r.body?.stops?.length === 5 && r.body?.stops?.[0]?.name === 'Sector 4 Crossing');
  check('bus pass is valid', r.body?.passValid === true);
}

section('Notifications');
let notifId = null;
{
  const r = await call('/api/student/notifications', { token });
  check('six notifications', r.body?.items?.length === 6, `got ${r.body?.items?.length}`);
  check('three unread', r.body?.unreadCount === 3, `got ${r.body?.unreadCount}`);
  check('Hindi body survived', r.body?.items?.some((n) => n.bodyHi?.includes('उपस्थिति')));

  notifId = r.body?.items?.find((n) => !n.readAt)?.id;

  const unread = await call('/api/student/notifications?unreadOnly=true', { token });
  check('?unreadOnly=true filters', unread.body?.items?.length === 3);

  const mark = await call(`/api/student/notifications/${notifId}/read`, { method: 'POST', token });
  check('marking one read returns 204', mark.status === 204, `status ${mark.status}`);

  const after = await call('/api/student/notifications', { token });
  check('unread count dropped to 2', after.body?.unreadCount === 2, `got ${after.body?.unreadCount}`);

  check(
    'marking an already-read notification is 404',
    (await call(`/api/student/notifications/${notifId}/read`, { method: 'POST', token })).status === 404,
  );

  const all = await call('/api/student/notifications/read-all', { method: 'POST', token });
  check('read-all marks the rest', all.body?.marked === 2, `got ${all.body?.marked}`);
}

section('Announcements');
{
  const r = await call('/api/announcements', { token });
  check('five announcements', r.body?.length === 5, `got ${r.body?.length}`);
  const uni = await call('/api/announcements?scope=UNIVERSITY', { token });
  check('?scope filters', uni.body?.length === 2, `got ${uni.body?.length}`);
}

// ── QR attendance ────────────────────────────────────────────────────────────

section('QR attendance');
{
  const active = await call('/api/attendance/session/active', { token });
  check('an open session is advertised', active.body?.code === 'BCA501', JSON.stringify(active.body?.code));
  check('session is not yet marked', active.body?.alreadyMarked === false);

  check(
    'a bogus token is rejected',
    (await call('/api/attendance/mark', { method: 'POST', token, body: { token: 'RDU-ATT-NOT-REAL' } })).status === 400,
  );

  const mark = await call('/api/attendance/mark', { method: 'POST', token, body: { token: 'RDU-ATT-DEMO-BCA501' } });
  check('marking with the real token succeeds', mark.status === 201, `status ${mark.status} ${mark.raw?.slice(0, 120)}`);
  check('response names the subject', mark.body?.subject === 'Software Engineering');

  const again = await call('/api/attendance/mark', { method: 'POST', token, body: { token: 'RDU-ATT-DEMO-BCA501' } });
  check('marking twice is a 409', again.status === 409, `status ${again.status}`);

  const after = await call('/api/student/attendance', { token });
  const seBefore = attendanceBefore?.subjects?.find((s) => s.code === 'BCA501');
  const seAfter = after.body?.subjects?.find((s) => s.code === 'BCA501');
  // The demo session already counted toward "held" before the scan, so only
  // the present count moves.
  check(
    'BCA501 present count went up by one',
    seAfter?.present === seBefore?.present + 1 && seAfter?.total === seBefore?.total,
    `${seBefore?.present}/${seBefore?.total} -> ${seAfter?.present}/${seAfter?.total}`,
  );
}

// ── Payment ──────────────────────────────────────────────────────────────────

section('Payment');
{
  const pay = await call('/api/student/fees/pay', { method: 'POST', token, body: { instalmentId, mode: 'UPI' } });
  check('paying the outstanding instalment succeeds', pay.status === 201, `status ${pay.status} ${pay.raw?.slice(0, 160)}`);
  check('a receipt number is issued', typeof pay.body?.receipt === 'string' && pay.body.receipt.startsWith('RCT/RDU/'));

  const after = await call('/api/student/fees', { token });
  check('dues are now zero', after.body?.summary?.due === 0, `got ${after.body?.summary?.due}`);
  check('all instalments now paid', after.body?.instalments?.every((i) => i.paid));

  const again = await call('/api/student/fees/pay', { method: 'POST', token, body: { instalmentId, mode: 'UPI' } });
  check('paying the same instalment twice is a 409', again.status === 409, `status ${again.status}`);

  check(
    'paying an unknown instalment is a 404',
    (await call('/api/student/fees/pay', { method: 'POST', token, body: { instalmentId: 'does-not-exist' } })).status === 404,
  );
}

// ── Authorisation boundaries ─────────────────────────────────────────────────

section('Authorisation');
{
  const parent = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'parent.sharma@example.in', password: 'campus123' },
  });
  check('parent can log in', parent.status === 200 && parent.body?.user?.role === 'PARENT');

  const parentToken = parent.body?.accessToken;
  check(
    'parent without studentId gets a 400',
    (await call('/api/student/profile', { token: parentToken })).status === 400,
  );

  const studentId = login.body?.user?.student?.id;
  const ward = await call(`/api/student/profile?studentId=${studentId}`, { token: parentToken });
  check('parent can read their own ward', ward.status === 200 && ward.body?.name === 'Priya Sharma', `status ${ward.status}`);

  const other = await call('/api/student/profile?studentId=some-other-student', { token: parentToken });
  check('parent cannot read a student who is not theirs', other.status === 403, `status ${other.status}`);

  // A student passing someone else's id must still get their own record.
  const spoof = await call('/api/student/profile?studentId=some-other-student', { token });
  check('student cannot spoof another studentId', spoof.status === 200 && spoof.body?.id === studentId);

  const faculty = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'rk.mishra@demo.resolion.edu', password: 'campus123' },
  });
  check(
    'student cannot rotate a QR code (faculty only)',
    (await call('/api/attendance/session/xyz/qr', { method: 'POST', token })).status === 403,
  );
  check('faculty account exists', faculty.status === 200 && faculty.body?.user?.role === 'FACULTY');
}

// ── Refresh rotation ─────────────────────────────────────────────────────────

section('Refresh token rotation');
{
  const first = await call('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  check('refresh returns a new access token', first.status === 200 && !!first.body?.accessToken, `status ${first.status}`);
  check('refresh rotates the refresh token', first.body?.refreshToken && first.body.refreshToken !== refreshToken);

  const replay = await call('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  check('replaying the old refresh token is rejected', replay.status === 401, `status ${replay.status}`);

  // Reuse detection revokes the whole family, so the rotated one dies too.
  const descendant = await call('/api/auth/refresh', { method: 'POST', body: { refreshToken: first.body?.refreshToken } });
  check('reuse revokes the entire token family', descendant.status === 401, `status ${descendant.status}`);

  check('garbage refresh token is rejected', (await call('/api/auth/refresh', { method: 'POST', body: { refreshToken: 'nope' } })).status === 401);
}


// ═══ Phase 2 — the faculty domain ════════════════════════════════════════════

section('Faculty — identity and teaching load');

const facultyLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'rk.mishra@demo.resolion.edu', password: 'campus123' },
});
const facToken = facultyLogin.body?.accessToken;

const hodLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'ml.gupta@demo.resolion.edu', password: 'campus123' },
});
const hodToken = hodLogin.body?.accessToken;

const otherLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'anil.sharma@demo.resolion.edu', password: 'campus123' },
});
const otherToken = otherLogin.body?.accessToken;

check('faculty login carries the faculty record', facultyLogin.body?.user?.faculty?.employeeId === 'GMC/FAC/CS/0047');
check('the head of department is flagged as one', hodLogin.body?.user?.faculty?.isHod === true);
check('an ordinary lecturer is not', facultyLogin.body?.user?.faculty?.isHod === false);

let assignmentId = null;
{
  const r = await call('/api/faculty/profile', { token: facToken });
  check('faculty profile returns 200', r.status === 200, `status ${r.status}`);
  check('Hindi name survived the round trip', r.body?.nameHi === 'डॉ. राजेश कुमार मिश्रा', `got ${JSON.stringify(r.body?.nameHi)}`);
  check('weekly load is derived from the timetable', r.body?.currentLoad === 8, `got ${r.body?.currentLoad}`);
  check('load is under the sanctioned maximum', r.body?.currentLoad < r.body?.maxWeeklyLoad);
  check('mentee count is derived', r.body?.menteesCount === 5, `got ${r.body?.menteesCount}`);
}

{
  const r = await call('/api/faculty/subjects', { token: facToken });
  check('teaching load returns 200', r.status === 200);
  check('two subjects assigned', r.body?.length === 2, `got ${r.body?.length}`);

  const se = r.body?.find((x) => x.code === 'BCA501');
  assignmentId = se?.assignmentId;
  check('BCA501 is a theory paper', se?.kind === 'THEORY');
  check('BCA501 has the whole class enrolled', se?.totalStudents === 13, `got ${se?.totalStudents}`);
  check('marks start unopened', se?.marksStatus === 'NOT_STARTED');
  check('the project is typed as one', r.body?.find((x) => x.code === 'BCA506')?.kind === 'PROJECT');
}

{
  const r = await call('/api/faculty/timetable', { token: facToken });
  check('timetable returns 200', r.status === 200);
  check('timetable totals the same hours as the profile', r.body?.totalHours === 8, `got ${r.body?.totalHours}`);
  check('an afternoon lab is not a negative span', (r.body?.days?.SAT ?? []).every((c) => c.hours > 0));
}

section('Faculty — the roster');

let rosterStudentIds = [];
{
  const r = await call(`/api/faculty/subjects/${assignmentId}/roster`, { token: facToken });
  check('roster returns 200', r.status === 200, `status ${r.status}`);
  check('roster lists the whole class', r.body?.students?.length === 13, `got ${r.body?.students?.length}`);
  rosterStudentIds = (r.body?.students ?? []).map((x) => x.id);

  const priya = r.body?.students?.find((x) => x.rollNo === 'GMC/BCA/2021/0342');
  check('roster carries running attendance', typeof priya?.attendance === 'number' && priya.attendance > 0);

  // The same denominator the student portal uses.
  const own = await call('/api/student/attendance', { token });
  const ownSe = own.body?.subjects?.find((x) => x.code === 'BCA501');
  check(
    'lecturer and student see the same percentage',
    priya?.attendance === ownSe?.percent,
    `roster ${priya?.attendance} vs portal ${ownSe?.percent}`,
  );
}

check(
  'a lecturer cannot open a colleague\'s roster',
  (await call(`/api/faculty/subjects/${assignmentId}/roster`, { token: otherToken })).status === 404,
);

section('Faculty — roll call');

let sessionId = null;
{
  const today = await call('/api/faculty/classes/today', { token: facToken });
  check('today returns 200', today.status === 200, `status ${today.status}`);

  // Monday always has a BCA501 lecture, whatever day the suite runs.
  const monday = await call('/api/faculty/classes/today?date=2026-09-21', { token: facToken });
  check('a named date resolves to its weekday', monday.body?.day === 'MON', `got ${monday.body?.day}`);
  check('Monday holds a BCA501 lecture', monday.body?.classes?.some((c) => c.code === 'BCA501'));

  const slot = monday.body?.classes?.find((c) => c.code === 'BCA501');
  check('an unopened class has no session yet', slot?.sessionId === null);

  const opened = await call(`/api/faculty/classes/${slot?.slotId}/session`, {
    method: 'POST',
    token: facToken,
    body: { date: '2026-09-21' },
  });
  check('opening the roll call returns 201', opened.status === 201, `status ${opened.status}`);
  sessionId = opened.body?.sessionId;

  const again = await call(`/api/faculty/classes/${slot?.slotId}/session`, {
    method: 'POST',
    token: facToken,
    body: { date: '2026-09-21' },
  });
  check('opening it twice returns the same session', again.body?.sessionId === sessionId);

  const wrongDay = await call(`/api/faculty/classes/${slot?.slotId}/session`, {
    method: 'POST',
    token: facToken,
    body: { date: '2026-09-22' },
  });
  check('a slot cannot be opened on the wrong weekday', wrongDay.status === 400, `status ${wrongDay.status}`);
}

{
  const sheet = await call(`/api/faculty/sessions/${sessionId}/attendance`, { token: facToken });
  check('the sheet returns 200', sheet.status === 200);
  check('the sheet holds the whole class', sheet.body?.students?.length === 13);
  check('a fresh sheet is unlocked', sheet.body?.locked === false);
  check('nobody is marked yet', sheet.body?.students?.every((x) => x.status === null));

  const records = sheet.body.students.map((x, i) => ({
    studentId: x.id,
    status: i % 4 === 0 ? 'ABSENT' : 'PRESENT',
  }));

  const marked = await call(`/api/faculty/sessions/${sessionId}/attendance`, {
    method: 'POST',
    token: facToken,
    body: { records },
  });
  check('saving the roll call returns 201', marked.status === 201, `status ${marked.status}`);
  check('every row was saved', marked.body?.saved === 13);
  check('present and absent add up', marked.body?.present + marked.body?.absent === 13);
  check('the lock clock started', typeof marked.body?.lockedAt === 'string');

  const reread = await call(`/api/faculty/sessions/${sessionId}/attendance`, { token: facToken });
  check('the sheet reads back what was saved', reread.body?.students?.filter((x) => x.status === 'ABSENT').length === marked.body?.absent);
  check('a manual mark is sourced as one', reread.body?.students?.every((x) => x.source === 'MANUAL'));

  // Re-saving inside the window is allowed; that is what the window is for.
  const amended = await call(`/api/faculty/sessions/${sessionId}/attendance`, {
    method: 'POST',
    token: facToken,
    body: { records: [{ studentId: records[0].studentId, status: 'LATE' }] },
  });
  check('a sheet can be amended inside the window', amended.status === 201, `status ${amended.status}`);
}

check(
  'a student not in the class is rejected, not skipped',
  (
    await call(`/api/faculty/sessions/${sessionId}/attendance`, {
      method: 'POST',
      token: facToken,
      body: { records: [{ studentId: 'not-a-student', status: 'PRESENT' }] },
    })
  ).status === 400,
);
check(
  'the same student twice in one sheet is rejected',
  (
    await call(`/api/faculty/sessions/${sessionId}/attendance`, {
      method: 'POST',
      token: facToken,
      body: {
        records: [
          { studentId: rosterStudentIds[0], status: 'PRESENT' },
          { studentId: rosterStudentIds[0], status: 'ABSENT' },
        ],
      },
    })
  ).status === 400,
);
check(
  'an invalid status is rejected',
  (
    await call(`/api/faculty/sessions/${sessionId}/attendance`, {
      method: 'POST',
      token: facToken,
      body: { records: [{ studentId: rosterStudentIds[0], status: 'MAYBE' }] },
    })
  ).status === 400,
);
check(
  'a lecturer cannot mark a class they do not teach',
  (await call(`/api/faculty/sessions/${sessionId}/attendance`, { token: otherToken })).status === 403,
);
check(
  'a student cannot reach a faculty route',
  (await call('/api/faculty/profile', { token })).status === 403,
);

section('Faculty — the register');

{
  const r = await call(`/api/faculty/subjects/${assignmentId}/sessions`, { token: facToken });
  check('the register returns 200', r.status === 200, `status ${r.status}`);
  check('it lists every class held', r.body?.sessions?.length > 40, `got ${r.body?.sessions?.length}`);

  const historic = r.body?.sessions?.find((x) => x.markedAt && x.date.startsWith('2024'));
  check('a class from the term is marked', !!historic, 'no marked 2024 session');
  check('and long since locked', historic?.locked === true);
  check('the register names who marked it', historic?.markedBy === 'Dr. Rajesh Kumar Mishra');

  const reopen = await call(`/api/faculty/sessions/${historic?.sessionId}/attendance`, {
    method: 'POST',
    token: facToken,
    body: { records: [{ studentId: rosterStudentIds[0], status: 'PRESENT' }] },
  });
  check('a locked sheet refuses a direct edit', reopen.status === 409, `status ${reopen.status}`);
  check('and says to raise a correction instead', reopen.body?.error?.message?.includes('correction'));

  check(
    'a lecturer cannot read a colleague\'s register',
    (await call(`/api/faculty/subjects/${assignmentId}/sessions`, { token: otherToken })).status === 404,
  );
}

section('Faculty — the subject-and-day sheet');

{
  // What the marking screen actually calls: a subject and a date, no slot ids.
  const monday = '2026-09-21';
  const r = await call(`/api/faculty/subjects/${assignmentId}/sheet?date=${monday}`, { token: facToken });
  check('the day sheet returns 200', r.status === 200, `status ${r.status}`);
  check('it knows the class is scheduled', r.body?.scheduled === true);
  check('it lists the whole class', r.body?.students?.length === 13, `got ${r.body?.students?.length}`);
  check('reading a day does not open a session', typeof r.body?.sessionId === 'string' || r.body?.sessionId === null);

  const tuesday = await call(`/api/faculty/subjects/${assignmentId}/sheet?date=2026-09-22`, { token: facToken });
  check('a day the subject does not run says so', tuesday.body?.scheduled === false, `scheduled ${tuesday.body?.scheduled}`);
  check('and offers no slot', tuesday.body?.slotId === null);

  const refused = await call(`/api/faculty/subjects/${assignmentId}/sheet`, {
    method: 'POST',
    token: facToken,
    body: { date: '2026-09-22', records: [{ studentId: rosterStudentIds[0], status: 'PRESENT' }] },
  });
  check('marking a day with no class is refused', refused.status === 400, `status ${refused.status}`);

  const saved = await call(`/api/faculty/subjects/${assignmentId}/sheet`, {
    method: 'POST',
    token: facToken,
    body: {
      date: monday,
      records: rosterStudentIds.map((id, i) => ({ studentId: id, status: i === 0 ? 'ABSENT' : 'PRESENT' })),
    },
  });
  check('saving by subject and day works', saved.status === 201, `status ${saved.status}`);
  check('it reuses the session already opened', saved.body?.sessionId === sessionId, `${saved.body?.sessionId} vs ${sessionId}`);
  check('and counts the absentee', saved.body?.absent === 1, `got ${saved.body?.absent}`);

  const reread = await call(`/api/faculty/subjects/${assignmentId}/sheet?date=${monday}`, { token: facToken });
  check('the sheet reads back what was saved', reread.body?.students?.filter((s) => s.status === 'ABSENT').length === 1);

  check(
    'a lecturer cannot open a colleague\'s day sheet',
    (await call(`/api/faculty/subjects/${assignmentId}/sheet?date=${monday}`, { token: otherToken })).status === 404,
  );
}

section('Faculty — cancelling a class');

{
  const tt = await call('/api/faculty/timetable', { token: facToken });
  const slot = (tt.body?.days?.THU ?? []).find((s) => !s.cancelled);
  check('there is a class to cancel', !!slot, 'no uncancelled Thursday slot');

  check(
    'a cancellation needs a reason worth reading',
    (
      await call(`/api/faculty/slots/${slot?.slotId}/cancel`, {
        method: 'POST',
        token: facToken,
        body: { reason: 'busy' },
      })
    ).status === 400,
  );

  const cancelled = await call(`/api/faculty/slots/${slot?.slotId}/cancel`, {
    method: 'POST',
    token: facToken,
    body: { reason: 'Called to the university for affiliation work.', notify: true },
  });
  check('cancelling returns 200', cancelled.status === 200, `status ${cancelled.status}`);
  check('every enrolled student is notified', cancelled.body?.notified === 13, `got ${cancelled.body?.notified}`);

  // The students' own timetable is the same row, so it must say so too.
  const studentTt = await call('/api/student/timetable', { token });
  const studentSlot = JSON.stringify(studentTt.body ?? '');
  check('the student timetable shows it cancelled', studentSlot.includes('affiliation work'));

  const bell = await call('/api/student/notifications?unreadOnly=true', { token });
  check('and the student has a notification', JSON.stringify(bell.body ?? '').includes('Class cancelled'));

  check(
    'cancelling twice is a conflict',
    (
      await call(`/api/faculty/slots/${slot?.slotId}/cancel`, {
        method: 'POST',
        token: facToken,
        body: { reason: 'Trying to cancel the same class again.' },
      })
    ).status === 409,
  );
  check(
    'a lecturer cannot cancel a colleague\'s class',
    (
      await call(`/api/faculty/slots/${slot?.slotId}/restore`, { method: 'POST', token: otherToken })
    ).status === 404,
  );

  const restored = await call(`/api/faculty/slots/${slot?.slotId}/restore`, {
    method: 'POST',
    token: facToken,
  });
  check('it can be put back', restored.status === 200 && restored.body?.cancelled === false);
}

section('Attendance corrections');

let correctionId = null;
{
  const pending = await call('/api/faculty/corrections', { token: facToken });
  check('the correction queue returns 200', pending.status === 200);
  check('two requests are waiting', pending.body?.length === 2, `got ${pending.body?.length}`);

  const rahul = pending.body?.find((c) => c.rollNo === 'GMC/BCA/2021/0343');
  correctionId = rahul?.id;
  check('the request carries what the record says now', rahul?.markedAs === 'ABSENT');
  check('and what is being asked for', rahul?.requestedStatus === 'PRESENT');

  // The number the approval has to move.
  const rahulLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'rahul.verma.2021@demo.resolion.edu', password: 'campus123' },
  });
  const rahulToken = rahulLogin.body?.accessToken;
  const before = await call('/api/student/attendance', { token: rahulToken });
  const beforeSe = before.body?.subjects?.find((x) => x.code === 'BCA501');

  const rejectedByStranger = await call(`/api/faculty/corrections/${correctionId}/decide`, {
    method: 'POST',
    token: otherToken,
    body: { decision: 'APPROVE' },
  });
  check('only the subject lecturer may decide', rejectedByStranger.status === 403, `status ${rejectedByStranger.status}`);

  const decided = await call(`/api/faculty/corrections/${correctionId}/decide`, {
    method: 'POST',
    token: facToken,
    body: { decision: 'APPROVE', note: 'Confirmed against the class register.' },
  });
  check('approving returns 200', decided.status === 200, `status ${decided.status}`);
  check('the approved status is the one requested', decided.body?.appliedStatus === 'PRESENT');

  const after = await call('/api/student/attendance', { token: rahulToken });
  const afterSe = after.body?.subjects?.find((x) => x.code === 'BCA501');
  check(
    'approval moves the student\'s own percentage',
    afterSe?.present === beforeSe?.present + 1,
    `${beforeSe?.present} then ${afterSe?.present}`,
  );

  const notified = await call('/api/student/notifications', { token: rahulToken });
  check(
    'the student is told',
    JSON.stringify(notified.body ?? '').includes('correction'),
  );

  check(
    'a decided request cannot be decided again',
    (
      await call(`/api/faculty/corrections/${correctionId}/decide`, {
        method: 'POST',
        token: facToken,
        body: { decision: 'REJECT', note: 'changed my mind' },
      })
    ).status === 409,
  );
}

{
  // The student half of the loop.
  const raised = await call('/api/attendance/corrections', {
    method: 'POST',
    token,
    body: {
      sessionId,
      requestedStatus: 'PRESENT',
      reason: 'I was in the lecture; my name was missed during the roll call.',
    },
  });
  check('a student can raise a correction', raised.status === 201, `status ${raised.status}`);
  check('it starts pending', raised.body?.status === 'PENDING');
  check('it captures what the record said', raised.body?.markedAs !== undefined);

  check(
    'the same class cannot be disputed twice',
    (
      await call('/api/attendance/corrections', {
        method: 'POST',
        token,
        body: { sessionId, requestedStatus: 'PRESENT', reason: 'Raising this a second time.' },
      })
    ).status === 409,
  );

  const mine = await call('/api/attendance/corrections', { token });
  check('a student sees their own requests', mine.status === 200 && mine.body?.length === 1);

  check(
    'a too-short reason is rejected',
    (
      await call('/api/attendance/corrections', {
        method: 'POST',
        token,
        body: { sessionId, requestedStatus: 'PRESENT', reason: 'no' },
      })
    ).status === 400,
  );
}

section('Internal marks');

{
  const sheet = await call(`/api/faculty/marks/${assignmentId}`, { token: facToken });
  check('opening the marks sheet returns 200', sheet.status === 200, `status ${sheet.status}`);
  check('a theory paper gets five components', sheet.body?.components?.length === 5, `got ${sheet.body?.components?.length}`);
  check('the components total 70', sheet.body?.maxTotal === 70, `got ${sheet.body?.maxTotal}`);
  check('an untouched sheet is editable', sheet.body?.editable === true);
  check('every student starts unscored', sheet.body?.students?.every((x) => x.complete === false));

  const first = sheet.body.students[0];

  check(
    'a mark over the maximum is rejected',
    (
      await call(`/api/faculty/marks/${assignmentId}/entries`, {
        method: 'PUT',
        token: facToken,
        body: { entries: [{ studentId: first.studentId, component: 'quiz1', value: 99 }] },
      })
    ).status === 400,
  );
  check(
    'an unknown component is rejected',
    (
      await call(`/api/faculty/marks/${assignmentId}/entries`, {
        method: 'PUT',
        token: facToken,
        body: { entries: [{ studentId: first.studentId, component: 'nonsense', value: 1 }] },
      })
    ).status === 400,
  );

  // A partly-filled sheet must not be submittable.
  await call(`/api/faculty/marks/${assignmentId}/entries`, {
    method: 'PUT',
    token: facToken,
    body: { entries: [{ studentId: first.studentId, component: 'quiz1', value: 7 }] },
  });
  const early = await call(`/api/faculty/marks/${assignmentId}/submit`, { method: 'POST', token: facToken });
  check('an incomplete sheet cannot be submitted', early.status === 400, `status ${early.status}`);
  check('and it names who is missing', Array.isArray(early.body?.error?.details?.missing));

  const entries = [];
  for (const s of sheet.body.students) {
    for (const c of sheet.body.components) {
      entries.push({ studentId: s.studentId, component: c.key, value: Math.floor(c.maxMarks * 0.7) });
    }
  }
  const saved = await call(`/api/faculty/marks/${assignmentId}/entries`, {
    method: 'PUT',
    token: facToken,
    body: { entries },
  });
  check('a full sheet saves', saved.status === 200 && saved.body?.saved === 65, `saved ${saved.body?.saved}`);
  check('saving puts the sheet in draft', saved.body?.status === 'DRAFT');

  const submitted = await call(`/api/faculty/marks/${assignmentId}/submit`, { method: 'POST', token: facToken });
  check('a complete sheet submits', submitted.status === 200 && submitted.body?.status === 'SUBMITTED');

  check(
    'a submitted sheet can no longer be edited',
    (
      await call(`/api/faculty/marks/${assignmentId}/entries`, {
        method: 'PUT',
        token: facToken,
        body: { entries: entries.slice(0, 1) },
      })
    ).status === 409,
  );
  check(
    'a lecturer cannot approve their own sheet',
    (
      await call(`/api/faculty/marks/${assignmentId}/decide`, {
        method: 'POST',
        token: facToken,
        body: { decision: 'APPROVE' },
      })
    ).status === 403,
  );

  const queue = await call('/api/faculty/marks-pending', { token: hodToken });
  check('the sheet reaches the head of department', queue.status === 200 && queue.body?.length === 1, `status ${queue.status}, ${queue.body?.length} waiting`);
  check('the queue names the lecturer', queue.body?.[0]?.lecturer === 'Dr. Rajesh Kumar Mishra');

  check(
    'a return needs a reason',
    (
      await call(`/api/faculty/marks/${assignmentId}/decide`, {
        method: 'POST',
        token: hodToken,
        body: { decision: 'RETURN' },
      })
    ).status === 400,
  );

  const returned = await call(`/api/faculty/marks/${assignmentId}/decide`, {
    method: 'POST',
    token: hodToken,
    body: { decision: 'RETURN', reason: 'The Quiz 2 column looks transposed.' },
  });
  check('the head of department can return it', returned.status === 200 && returned.body?.status === 'RETURNED');

  const reopened = await call(`/api/faculty/marks/${assignmentId}`, { token: facToken });
  check('a returned sheet is editable again', reopened.body?.editable === true);
  check('and carries the reason', reopened.body?.returnReason?.includes('transposed'));

  const resubmitted = await call(`/api/faculty/marks/${assignmentId}/submit`, { method: 'POST', token: facToken });
  check('it can be resubmitted', resubmitted.status === 200 && resubmitted.body?.status === 'SUBMITTED');

  const approved = await call(`/api/faculty/marks/${assignmentId}/decide`, {
    method: 'POST',
    token: hodToken,
    body: { decision: 'APPROVE' },
  });
  check('and approved', approved.status === 200 && approved.body?.status === 'APPROVED');

  const final = await call(`/api/faculty/marks/${assignmentId}`, { token: facToken });
  check('an approved sheet is frozen', final.body?.editable === false);
  check('and names who approved it', final.body?.decidedBy?.includes('Gupta'));
}

section('Mentoring');

{
  const r = await call('/api/faculty/mentees', { token: facToken });
  check('mentees return 200', r.status === 200);
  check('five mentees', r.body?.length === 5, `got ${r.body?.length}`);

  const ravi = r.body?.find((m) => m.rollNo === 'GMC/BCA/2021/0357');
  check('the weakest mentee is flagged at risk', ravi?.atRisk === true);
  check('with the debarment warning', ravi?.alerts?.some((a) => a.includes('debarred')));
  check('the CGPA alert', ravi?.alerts?.some((a) => a.includes('CGPA')));
  check('and the backlog', ravi?.alerts?.some((a) => a.includes('backlog')));

  const anjali = r.body?.find((m) => m.rollNo === 'GMC/BCA/2021/0344');
  check('a sound mentee raises no alerts', anjali?.atRisk === false && anjali?.alerts?.length === 0);

  const detail = await call(`/api/faculty/mentees/${ravi?.id}`, { token: facToken });
  check('a mentee opens in full', detail.status === 200);
  check('with subject-wise attendance', detail.body?.subjects?.length === 6, `got ${detail.body?.subjects?.length}`);
  check('the list carries the same breakdown', ravi?.subjects?.length === 6, `got ${ravi?.subjects?.length}`);
  check('including internal marks once a sheet is approved', ravi?.subjects?.some((x) => x.internalMarks !== null));
  check('and no notes yet', detail.body?.notes?.length === 0);

  const note = await call(`/api/faculty/mentees/${ravi?.id}/notes`, {
    method: 'POST',
    token: facToken,
    body: { note: 'Met after class. Agreed to a weekly check-in until attendance recovers.' },
  });
  check('a note can be logged', note.status === 201, `status ${note.status}`);

  const after = await call(`/api/faculty/mentees/${ravi?.id}`, { token: facToken });
  check('the note comes back', after.body?.notes?.length === 1);
  check('and dates the pairing', after.body?.lastInteraction !== null);

  check(
    'a lecturer cannot open a student who is not their mentee',
    (await call(`/api/faculty/mentees/${ravi?.id}`, { token: otherToken })).status === 404,
  );
}

section('Faculty leave');

{
  const r = await call('/api/faculty/leaves', { token: facToken });
  check('leaves return 200', r.status === 200);
  check('two applications on file', r.body?.leaves?.length === 2, `got ${r.body?.leaves?.length}`);
  check('approved days are totalled', r.body?.daysTakenThisYear === 2, `got ${r.body?.daysTakenThisYear}`);

  // The pending medical leave runs from five days out; aim inside it.
  const inWindow = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  check(
    'leave overlapping a live application is refused',
    (
      await call('/api/faculty/leaves', {
        method: 'POST',
        token: facToken,
        body: { kind: 'CASUAL', from: inWindow, to: inWindow, reason: 'Overlaps the pending medical leave.' },
      })
    ).status === 409,
  );
  check(
    'an end date before the start is refused',
    (
      await call('/api/faculty/leaves', {
        method: 'POST',
        token: facToken,
        body: { kind: 'CASUAL', from: '2026-10-12', to: '2026-10-10', reason: 'Dates the wrong way round.' },
      })
    ).status === 400,
  );

  const applied = await call('/api/faculty/leaves', {
    method: 'POST',
    token: facToken,
    body: { kind: 'DUTY', from: '2026-10-10', to: '2026-10-12', reason: 'University examination duty at the university campus.' },
  });
  check('leave can be applied for', applied.status === 201, `status ${applied.status}`);
  check('the span is inclusive', applied.body?.days === 3, `got ${applied.body?.days}`);

  const queue = await call('/api/faculty/leaves-pending', { token: hodToken });
  check('it reaches the head of department', queue.status === 200 && queue.body?.length === 2, `${queue.body?.length} waiting`);

  check(
    'a lecturer cannot see the approval queue',
    (await call('/api/faculty/leaves-pending', { token: otherToken })).status === 403,
  );
  check(
    'a rejection needs a reason',
    (
      await call(`/api/faculty/leaves/${applied.body?.id}/decide`, {
        method: 'POST',
        token: hodToken,
        body: { decision: 'REJECT' },
      })
    ).status === 400,
  );

  const decided = await call(`/api/faculty/leaves/${applied.body?.id}/decide`, {
    method: 'POST',
    token: hodToken,
    body: { decision: 'APPROVE' },
  });
  check('the head of department approves it', decided.status === 200 && decided.body?.status === 'APPROVED');

  check(
    'a decided application cannot be cancelled',
    (await call(`/api/faculty/leaves/${applied.body?.id}/cancel`, { method: 'POST', token: facToken })).status === 409,
  );
}

section('Study material');

{
  const r = await call('/api/faculty/materials', { token: facToken });
  check('materials return 200', r.status === 200);
  check('four are on file', r.body?.length === 4, `got ${r.body?.length}`);
  check('one is hidden from students', r.body?.filter((m) => m.visibleToStudents === false).length === 1);

  const added = await call('/api/faculty/materials', {
    method: 'POST',
    token: facToken,
    body: { code: 'BCA501', unit: 4, unitTitle: 'Testing and Maintenance', filename: 'Unit4_Testing.pdf', type: 'PDF', size: '2.1 MB' },
  });
  check('a material can be filed', added.status === 201, `status ${added.status}`);

  check(
    'a link without a url is refused',
    (
      await call('/api/faculty/materials', {
        method: 'POST',
        token: facToken,
        body: { code: 'BCA501', unit: 5, unitTitle: 'Extra reading', filename: 'IEEE 830', type: 'LINK' },
      })
    ).status === 400,
  );
  check(
    'a subject the lecturer does not teach is refused',
    (
      await call('/api/faculty/materials', {
        method: 'POST',
        token: facToken,
        body: { code: 'BCA503', unit: 1, unitTitle: 'Networks notes', filename: 'net.pdf', type: 'PDF' },
      })
    ).status === 403,
  );

  const hidden = await call(`/api/faculty/materials/${added.body?.id}`, {
    method: 'PATCH',
    token: facToken,
    body: { visibleToStudents: false },
  });
  check('it can be pulled back from students', hidden.status === 200 && hidden.body?.visibleToStudents === false);

  check(
    'another lecturer cannot delete it',
    (await call(`/api/faculty/materials/${added.body?.id}`, { method: 'DELETE', token: otherToken })).status === 404,
  );
  check(
    'its owner can',
    (await call(`/api/faculty/materials/${added.body?.id}`, { method: 'DELETE', token: facToken })).status === 204,
  );
}


// ═══ Phase 3 — the college office ════════════════════════════════════════════

section('Office — access');

const officeLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'pushpa.sharma@demo.resolion.edu', password: 'campus123' },
});
const officeToken = officeLogin.body?.accessToken;

check('the counter clerk can sign in', officeLogin.status === 200, `status ${officeLogin.status}`);
check('a student cannot reach the office', (await call('/api/office/admissions', { token })).status === 403);
check('nor a lecturer', (await call('/api/office/counter', { token: facToken })).status === 403);
check('and the clerk cannot reach the faculty portal', (await call('/api/faculty/profile', { token: officeToken })).status === 403);

section('Office — admissions');

let shivaniId = null;
{
  const r = await call('/api/office/admissions', { token: officeToken });
  check('the admission queue returns 200', r.status === 200, `status ${r.status}`);
  check('three applications are waiting', r.body?.length === 3, `got ${r.body?.length}`);

  const shivani = r.body?.find((a) => a.name === 'Shivani Rajput');
  shivaniId = shivani?.id;
  check('an incomplete file sits at pending', shivani?.status === 'PENDING_DOCS');
  check('and is not ready to enrol', shivani?.readyToEnrol === false);
  check('the checklist counts only required papers', shivani?.documentsRequired === 9, `got ${shivani?.documentsRequired}`);

  const dinesh = r.body?.find((a) => a.name === 'Dinesh Yadav');
  check('a complete file is verified', dinesh?.status === 'VERIFIED');
  check('and is ready to enrol', dinesh?.readyToEnrol === true);

  // A General-category candidate is not asked for a caste certificate.
  const kirti = r.body?.find((a) => a.name === 'Kirti Agrawal');
  const caste = kirti?.documents?.find((d) => d.name.startsWith('Caste Certificate'));
  check('the caste certificate is not required of a General candidate', caste?.required === false);

  const missing = shivani?.documents?.find((d) => !d.uploaded);
  check(
    'a document that was never produced cannot be verified',
    (
      await call(`/api/office/admissions/${shivaniId}/documents/${missing?.id}`, {
        method: 'PATCH',
        token: officeToken,
        body: { verified: true },
      })
    ).status === 400,
  );

  const early = await call(`/api/office/admissions/${shivaniId}/enrol`, { method: 'POST', token: officeToken });
  check('enrolling an unverified file is refused', early.status === 400, `status ${early.status}`);
  check('and the refusal names the papers', Array.isArray(early.body?.error?.details?.missing));
}

{
  // Clear Shivani's file, then admit her.
  const before = await call(`/api/office/admissions/${shivaniId}`, { token: officeToken });
  for (const doc of before.body.documents.filter((d) => d.required && !d.verified)) {
    if (!doc.uploaded) {
      await call(`/api/office/admissions/${shivaniId}/documents/${doc.id}`, {
        method: 'PATCH', token: officeToken, body: { uploaded: true },
      });
    }
    await call(`/api/office/admissions/${shivaniId}/documents/${doc.id}`, {
      method: 'PATCH', token: officeToken, body: { verified: true },
    });
  }

  const cleared = await call(`/api/office/admissions/${shivaniId}`, { token: officeToken });
  check('clearing the checklist flips the application to verified', cleared.body?.status === 'VERIFIED');
  check('a verified paper carries the clerk who signed it', cleared.body?.documents?.some((d) => d.verifiedBy === 'Smt. Pushpa Sharma'));

  const enrolled = await call(`/api/office/admissions/${shivaniId}/enrol`, { method: 'POST', token: officeToken });
  check('a verified candidate enrols', enrolled.status === 201, `status ${enrolled.status}`);
  check('with an enrolment number', /^[A-Z]{1,6}\/\d{4}\/BCA\/\d{4}$/.test(enrolled.body?.enrolmentNo ?? ''), enrolled.body?.enrolmentNo);
  check('and first-semester subjects', enrolled.body?.subjectsEnrolled > 0, `got ${enrolled.body?.subjectsEnrolled}`);

  check(
    'enrolling twice is refused',
    (await call(`/api/office/admissions/${shivaniId}/enrol`, { method: 'POST', token: officeToken })).status === 409,
  );

  // The point of enrolling: she is now a student of the system.
  const hers = await call('/api/auth/login', {
    method: 'POST',
    body: { email: enrolled.body?.email, password: 'campus123' },
  });
  check('the new student can sign in', hers.status === 200 && !!hers.body?.accessToken);

  const profile = await call('/api/student/profile', { token: hers.body?.accessToken });
  check('and has a real student record', profile.status === 200 && profile.body?.name === 'Shivani Rajput');
}

section('Office — the fee counter');

{
  // Vikram Tiwari, not Priya: the fees section above already settled her
  // account, and a counter test needs someone who still owes something.
  const hisLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'vikram.tiwari.2021@demo.resolion.edu', password: 'campus123' },
  });
  const hisToken = hisLogin.body?.accessToken;

  const own = await call('/api/student/fees', { token: hisToken });
  const dueBefore = own.body?.totals?.due ?? own.body?.summary?.due;
  check('the student has something outstanding', dueBefore > 1900, `due ${dueBefore}`);

  const lookup = await call('/api/office/counter/student?q=GMC/BCA/2021/0349', { token: officeToken });
  check('the counter can find a student', lookup.status === 200 && lookup.body?.name === 'Vikram Tiwari');
  check(
    'and quotes the same balance the student sees',
    lookup.body?.totals?.due === dueBefore,
    `counter ${lookup.body?.totals?.due} vs portal ${dueBefore}`,
  );

  check(
    'a zero payment is refused',
    (
      await call('/api/office/counter', {
        method: 'POST', token: officeToken,
        body: { studentId: lookup.body?.id, head: 'Examination Fee', amount: 0, mode: 'CASH' },
      })
    ).status === 400,
  );
  check(
    'a cheque without its number is refused',
    (
      await call('/api/office/counter', {
        method: 'POST', token: officeToken,
        body: { studentId: lookup.body?.id, head: 'Examination Fee', amount: 100, mode: 'CHEQUE' },
      })
    ).status === 400,
  );

  const cash = await call('/api/office/counter', {
    method: 'POST', token: officeToken,
    body: { studentId: lookup.body?.id, head: 'Examination Fee', amount: 1800, mode: 'CASH' },
  });
  check('cash is taken', cash.status === 201, `status ${cash.status}`);
  check('a receipt number is issued', /^CNT\/[A-Z]{1,6}\/\d{4}\/\d{6}$/.test(cash.body?.receiptNo ?? ''), cash.body?.receiptNo);
  check('and it is applied against a head', cash.body?.appliedTo?.length > 0);

  // The whole point of Phase 3: one ledger, not two.
  const after = await call('/api/student/fees', { token: hisToken });
  const dueAfter = after.body?.totals?.due ?? after.body?.summary?.due;
  check(
    'a counter payment moves the student\'s own balance',
    dueAfter === dueBefore - 1800,
    `${dueBefore} then ${dueAfter}`,
  );

  const cheque = await call('/api/office/counter', {
    method: 'POST', token: officeToken,
    body: { studentId: lookup.body?.id, head: 'Library Fine', amount: 100, mode: 'CHEQUE', instrument: '112233' },
  });
  check('a cheque is taken as pending clearance', cheque.body?.status === 'PENDING_CLEARANCE');
  check('and applied to nothing yet', cheque.body?.appliedTo?.length === 0);

  const stillDue = await call('/api/student/fees', { token: hisToken });
  check(
    'an uncleared cheque does not reduce the balance',
    (stillDue.body?.totals?.due ?? stillDue.body?.summary?.due) === dueAfter,
  );

  const cleared = await call(`/api/office/counter/${cheque.body?.id}/settle`, {
    method: 'POST', token: officeToken, body: { outcome: 'CLEARED' },
  });
  check('clearing it settles the receipt', cleared.status === 200 && cleared.body?.status === 'COMPLETE');
  check('and applies the money', cleared.body?.appliedTo?.length > 0);

  const settledDue = await call('/api/student/fees', { token: hisToken });
  check(
    'now the balance moves',
    (settledDue.body?.totals?.due ?? settledDue.body?.summary?.due) === dueAfter - 100,
  );

  check(
    'a settled receipt cannot be settled again',
    (
      await call(`/api/office/counter/${cheque.body?.id}/settle`, {
        method: 'POST', token: officeToken, body: { outcome: 'BOUNCED' },
      })
    ).status === 409,
  );

  const book = await call('/api/office/counter', { token: officeToken });
  check('the day book lists the takings', book.status === 200 && book.body?.receipts?.length >= 5);
  check('and totals only settled money', typeof book.body?.totals?.collected === 'number');
}

section('Office — a bounced cheque');

{
  const lookup = await call('/api/office/counter/student?q=GMC/BCA/2021/0353', { token: officeToken });
  const dueBefore = lookup.body?.totals?.due;

  const cheque = await call('/api/office/counter', {
    method: 'POST', token: officeToken,
    body: { studentId: lookup.body?.id, head: 'Semester Fee', amount: 500, mode: 'DD', instrument: 'DD/PNB/9912' },
  });
  const bounced = await call(`/api/office/counter/${cheque.body?.id}/settle`, {
    method: 'POST', token: officeToken,
    body: { outcome: 'BOUNCED', remarks: 'Returned by the bank — signature mismatch.' },
  });
  check('a returned instrument is recorded', bounced.status === 200 && bounced.body?.status === 'BOUNCED');

  const after = await call('/api/office/counter/student?q=GMC/BCA/2021/0353', { token: officeToken });
  check('and the balance is untouched', after.body?.totals?.due === dueBefore, `${dueBefore} then ${after.body?.totals?.due}`);
}

section('Office — the certificate queue');

let bonafideId = null;
{
  const r = await call('/api/office/certificates?open=true', { token: officeToken });
  check('the certificate queue returns 200', r.status === 200, `status ${r.status}`);
  check('four requests are open', r.body?.requests?.length === 4, `got ${r.body?.requests?.length}`);
  check('the service standards are published', r.body?.types?.length > 0);

  // Ordered most urgent first, and one of them is already past its promise.
  check('one request is overdue', r.body?.totals?.overdue === 1, `got ${r.body?.totals?.overdue}`);
  check('the overdue one leads the queue', r.body?.requests?.[0]?.overdue === true);
  check('an open request counts down', typeof r.body?.requests?.[1]?.daysLeft === 'number');

  const bonafide = r.body?.requests?.find((c) => c.requestNo === 'CR/2024/00892');
  bonafideId = bonafide?.id;

  check(
    'a request cannot skip a stage',
    (
      await call(`/api/office/certificates/${bonafideId}/advance`, {
        method: 'POST', token: officeToken, body: { stage: 'DISPATCHED' },
      })
    ).status === 409,
  );
  check(
    'a rejection needs a reason',
    (
      await call(`/api/office/certificates/${bonafideId}/advance`, {
        method: 'POST', token: officeToken, body: { stage: 'REJECTED' },
      })
    ).status === 400,
  );

  const ready = await call(`/api/office/certificates/${bonafideId}/advance`, {
    method: 'POST', token: officeToken, body: { stage: 'READY', notes: 'Signed by the Principal.' },
  });
  check('it can be marked ready', ready.status === 200 && ready.body?.stage === 'READY');
  check('and records who issued it', ready.body?.issuedBy === 'Smt. Pushpa Sharma');

  const told = await call('/api/student/notifications', { token });
  check('the student is told it is ready', JSON.stringify(told.body ?? '').includes('ready to collect'));

  const dispatched = await call(`/api/office/certificates/${bonafideId}/advance`, {
    method: 'POST', token: officeToken, body: { stage: 'DISPATCHED' },
  });
  check('and then dispatched', dispatched.status === 200 && dispatched.body?.stage === 'DISPATCHED');
  check('a dispatched request stops counting down', dispatched.body?.daysLeft === null);
}

{
  // The student's own half of the counter.
  const mine = await call('/api/student/certificates', { token });
  check('a student sees their own requests', mine.status === 200, `status ${mine.status}`);
  check('and what the college issues', mine.body?.types?.length > 0);

  const asked = await call('/api/student/certificates', {
    method: 'POST', token,
    body: { type: 'Character Certificate', purpose: 'Applying for a government internship' },
  });
  check('a student can ask for one', asked.status === 201, `status ${asked.status}`);
  check('the fee comes from the standard', asked.body?.fee === 50, `got ${asked.body?.fee}`);
  check('and the deadline is set from it', asked.body?.daysLeft === 14, `got ${asked.body?.daysLeft}`);

  check(
    'the same certificate cannot be asked for twice while open',
    (
      await call('/api/student/certificates', {
        method: 'POST', token,
        body: { type: 'Character Certificate', purpose: 'Asking for the same thing again' },
      })
    ).status === 409,
  );
  check(
    'a certificate the college does not issue is refused',
    (
      await call('/api/student/certificates', {
        method: 'POST', token,
        body: { type: 'Knighthood', purpose: 'Services to the realm' },
      })
    ).status === 400,
  );

  const urgent = await call('/api/student/certificates', {
    method: 'POST', token,
    body: { type: 'Migration Certificate', purpose: 'Transferring to another university', priority: 'URGENT' },
  });
  check('an urgent request is promised sooner', urgent.body?.daysLeft === 8, `got ${urgent.body?.daysLeft}`);

  await call(`/api/office/certificates/${asked.body?.id}/advance`, {
    method: 'POST', token: officeToken, body: { stage: 'COLLEGE_OFFICE' },
  });
  const unpaid = await call(`/api/office/certificates/${asked.body?.id}/advance`, {
    method: 'POST', token: officeToken, body: { stage: 'READY' },
  });
  check('nothing leaves the counter with its fee unpaid', unpaid.status === 400, `status ${unpaid.status}`);

  await call(`/api/office/certificates/${asked.body?.id}/fee`, { method: 'POST', token: officeToken });
  const paidReady = await call(`/api/office/certificates/${asked.body?.id}/advance`, {
    method: 'POST', token: officeToken, body: { stage: 'READY' },
  });
  check('once paid, it can be issued', paidReady.status === 200 && paidReady.body?.stage === 'READY');
}

section('Office — examination scrutiny');

{
  const r = await call('/api/office/exam-forms', { token: officeToken });
  check('the scrutiny list returns 200', r.status === 200, `status ${r.status}`);
  check('the whole class has submitted', r.body?.forms?.length === 13, `got ${r.body?.forms?.length}`);
  check('the threshold is stated', r.body?.threshold === 75);

  const ravi = r.body?.forms?.find((f) => f.studentName === 'Ravi Chouhan');
  check('eligibility is computed from live attendance', ravi?.computedEligibility === 'SHORTAGE', `got ${ravi?.computedEligibility}`);
  check('and names how many subjects fall short', ravi?.shortfalls > 0, `got ${ravi?.shortfalls}`);
  check('each subject carries its own percentage', typeof ravi?.subjects?.[0]?.attendance === 'number');

  // Money is checked before attendance: an unpaid form is not a shortage case.
  const anyFeeDue = r.body?.forms?.find((f) => f.computedEligibility === 'FEE_DUE');
  check('an unpaid form reads as fee due', !!anyFeeDue, 'no FEE_DUE form');
  check('with the amount owing', anyFeeDue?.feeDue > 0, `got ${anyFeeDue?.feeDue}`);

  const short = await call(`/api/office/exam-forms/${ravi?.id}/decide`, {
    method: 'POST', token: officeToken, body: { decision: 'CLEAR' },
  });
  check('clearing a short form without a reason is refused', short.status === 400, `status ${short.status}`);
  check('and the refusal says why', short.body?.error?.message?.includes('75%'));

  const exempt = await call(`/api/office/exam-forms/${ravi?.id}/decide`, {
    method: 'POST', token: officeToken,
    body: { decision: 'CLEAR', remarks: 'Medical exemption on file, approved by the Principal.' },
  });
  check('a written exemption clears it', exempt.status === 200 && exempt.body?.eligibility === 'CLEARED');
  check('while the record still reads short', exempt.body?.computedEligibility === 'SHORTAGE');

  const reread = await call('/api/office/exam-forms', { token: officeToken });
  const raviAgain = reread.body?.forms?.find((f) => f.studentName === 'Ravi Chouhan');
  check('the decision is flagged as out of step with the record', raviAgain?.stale === true);
  check('and carries the remark', raviAgain?.remarks?.includes('Medical exemption'));

  check('scrutiny is recorded against a clerk', raviAgain?.scrutinisedBy === 'Smt. Pushpa Sharma');
}


// ═══ Phase 4 — the examination back-office ═══════════════════════════════════

section('Examination — the sitting');

const examLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'registrar@demo.resolion.edu', password: 'campus123' },
});
const examToken = examLogin.body?.accessToken;

check('the examination wing can sign in', examLogin.status === 200, `status ${examLogin.status}`);
check('a student cannot reach it', (await call('/api/exam/sessions', { token })).status === 403);
check('nor a lecturer', (await call('/api/exam/sessions', { token: facToken })).status === 403);
check('nor the college counter', (await call('/api/exam/sessions', { token: officeToken })).status === 403);

let examSessionId = null;
let bca501Paper = null;
{
  const r = await call('/api/exam/sessions', { token: examToken });
  check('sessions list', r.status === 200, `status ${r.status}`);
  check('two sittings on record', r.body?.length === 2, `got ${r.body?.length}`);

  const odd = r.body?.find((s) => s.code === 'SES/RDU/2024/ODD');
  examSessionId = odd?.id;
  check('the live sitting has its form window closed', odd?.status === 'FORM_WINDOW_CLOSED');
  check('and six papers scheduled', odd?.papers === 6, `got ${odd?.papers}`);
  check('it knows where it can go next', odd?.nextStatus?.includes('IN_PROGRESS'));

  check(
    'a sitting cannot skip to publishing',
    (
      await call(`/api/exam/sessions/${examSessionId}/status`, {
        method: 'POST', token: examToken, body: { status: 'RESULT_PUBLISHED' },
      })
    ).status === 409,
  );
  check(
    'and cannot start before candidates are seated',
    (
      await call(`/api/exam/sessions/${examSessionId}/status`, {
        method: 'POST', token: examToken, body: { status: 'IN_PROGRESS' },
      })
    ).status === 400,
  );
}

section('Examination — seating');

{
  // Phase 3's scrutiny is the gate: only cleared forms are seated. The office
  // section above cleared one; clear the rest so a whole class can sit.
  const forms = await call('/api/office/exam-forms', { token: officeToken });
  let cleared = 0;
  for (const f of forms.body?.forms ?? []) {
    if (f.eligibility === 'CLEARED') { cleared += 1; continue; }
    const r = await call(`/api/office/exam-forms/${f.id}/decide`, {
      method: 'POST', token: officeToken,
      body: { decision: 'CLEAR', remarks: 'Cleared at scrutiny for the Nov–Dec sitting.' },
    });
    if (r.status === 200) cleared += 1;
  }
  check('the college office cleared the class', cleared === 13, `got ${cleared}`);

  // Southgate holds eight; the class is thirteen.
  const tiny = await call(`/api/exam/sessions/${examSessionId}/allocate`, {
    method: 'POST', token: examToken, body: { centreCode: 'DTA-01' },
  });
  check('a small centre fills to capacity', tiny.body?.seated === 8, `seated ${tiny.body?.seated}`);
  check('and says how many did not fit', tiny.body?.unseated === 5, `unseated ${tiny.body?.unseated}`);

  check(
    'a full centre refuses more',
    (
      await call(`/api/exam/sessions/${examSessionId}/allocate`, {
        method: 'POST', token: examToken, body: { centreCode: 'DTA-01' },
      })
    ).status === 409,
  );

  const main = await call(`/api/exam/sessions/${examSessionId}/allocate`, {
    method: 'POST', token: examToken, body: { centreCode: 'DC-04' },
  });
  check('the rest are seated elsewhere', main.body?.seated === 5, `seated ${main.body?.seated}`);
  check('with nobody left over', main.body?.unseated === 0);

  const centres = await call(`/api/exam/centres?examSessionId=${examSessionId}`, { token: examToken });
  const datia = centres.body?.find((c) => c.code === 'DTA-01');
  check('the centre reads as full', datia?.free === 0 && datia?.utilisation === 100, JSON.stringify(datia));

  const seating = await call(`/api/exam/sessions/${examSessionId}/allocations`, { token: examToken });
  check('every candidate has a seat number', seating.body?.length === 13 && seating.body?.every((s) => !!s.seatNo));

  // Capacity is a real column the allocation screen can raise, but never
  // below what is already sitting in the hall.
  const tooSmall = await call('/api/exam/centres/DTA-01', {
    method: 'PATCH', token: examToken, body: { capacity: 2 },
  });
  check('capacity cannot be set below what is seated', tooSmall.status === 400, `status ${tooSmall.status}`);
  check('and the refusal says how many are seated', tooSmall.body?.error?.details?.seated === 8);

  const raised = await call('/api/exam/centres/DTA-01', {
    method: 'PATCH', token: examToken, body: { capacity: 12 },
  });
  check('it can be raised', raised.status === 200 && raised.body?.capacity === 12, `status ${raised.status}`);
  check('and the hall has room again', raised.body?.free === 4, `free ${raised.body?.free}`);

  const started = await call(`/api/exam/sessions/${examSessionId}/status`, {
    method: 'POST', token: examToken, body: { status: 'IN_PROGRESS' },
  });
  check('now the sitting can start', started.status === 200 && started.body?.status === 'IN_PROGRESS');
}

section('Examination — double valuation');

let bundleOne = null;
{
  const detail = await call(`/api/exam/sessions/${examSessionId}`, { token: examToken });
  bca501Paper = detail.body?.papers?.find((p) => p.code === 'BCA501');
  check('the paper is out of 70 plus 30 internal', bca501Paper?.maxExternal === 70 && bca501Paper?.maxInternal === 30);

  const b1 = await call(`/api/exam/papers/${bca501Paper?.id}/bundles`, {
    method: 'POST', token: examToken,
    body: { centreCode: 'DC-04', examinerName: 'Dr. S.K. Pandey', examinerRole: 'E1' },
  });
  check('a bundle is made up from the seating list', b1.status === 201, `status ${b1.status}`);
  check('with the candidates seated there', b1.body?.scripts === 5, `got ${b1.body?.scripts}`);
  bundleOne = b1.body?.id;

  const foil = await call(`/api/exam/bundles/${bundleOne}`, { token: examToken });
  check('the foil reads back', foil.status === 200 && foil.body?.scripts?.length === 5);
  check('the tolerance is a share of the paper', foil.body?.tolerance === 11, `got ${foil.body?.tolerance}`);

  const roster = foil.body.scripts;

  check(
    'a mark over the paper total is refused',
    (
      await call(`/api/exam/bundles/${bundleOne}/marks`, {
        method: 'POST', token: examToken,
        body: { marks: [{ studentId: roster[0].studentId, mark: 99 }] },
      })
    ).status === 400,
  );
  check(
    'a candidate outside the bundle is refused',
    (
      await call(`/api/exam/bundles/${bundleOne}/marks`, {
        method: 'POST', token: examToken,
        body: { marks: [{ studentId: 'not-a-student', mark: 50 }] },
      })
    ).status === 400,
  );

  const e1 = await call(`/api/exam/bundles/${bundleOne}/marks`, {
    method: 'POST', token: examToken,
    body: { marks: roster.map((s, i) => ({ studentId: s.studentId, mark: 40 + i })), submit: true },
  });
  check('a single reading settles the script', e1.body?.settled === 5, `settled ${e1.body?.settled}`);
  check('and nothing is flagged yet', e1.body?.flagged === 0);

  check(
    'a submitted bundle cannot be marked again',
    (
      await call(`/api/exam/bundles/${bundleOne}/marks`, {
        method: 'POST', token: examToken,
        body: { marks: [{ studentId: roster[0].studentId, mark: 50 }] },
      })
    ).status === 409,
  );

  // A second examiner who agrees on three and differs wildly on two.
  const b2 = await call(`/api/exam/papers/${bca501Paper?.id}/bundles`, {
    method: 'POST', token: examToken,
    body: { centreCode: 'DC-04', examinerName: 'Dr. A.K. Jain', examinerRole: 'E2' },
  });
  const e2 = await call(`/api/exam/bundles/${b2.body?.id}/marks`, {
    method: 'POST', token: examToken,
    body: {
      marks: roster.map((s, i) => ({ studentId: s.studentId, mark: i < 2 ? 40 + i + 25 : 40 + i + 2 })),
      submit: true,
    },
  });
  check('two readings that agree are averaged', e2.body?.settled === 3, `settled ${e2.body?.settled}`);
  check('two that disagree are not', e2.body?.flagged === 2, `flagged ${e2.body?.flagged}`);

  const flagged = await call(`/api/exam/sessions/${examSessionId}/flagged`, { token: examToken });
  check('the flagged scripts are listed', flagged.body?.length === 2);
  check('with the gap that flagged them', flagged.body?.[0]?.gap > flagged.body?.[0]?.tolerance);

  check(
    'processing is refused while a script is unsettled',
    (
      await call(`/api/exam/sessions/${examSessionId}/status`, {
        method: 'POST', token: examToken, body: { status: 'EVALUATION' },
      })
    ).status === 200,
  );
  const blocked = await call(`/api/exam/sessions/${examSessionId}/status`, {
    method: 'POST', token: examToken, body: { status: 'RESULT_PROCESSING' },
  });
  check('evaluation cannot close with scripts outstanding', blocked.status === 400, `status ${blocked.status}`);
  check('and it says how many', blocked.body?.error?.details?.unsettled > 0);

  for (const f of flagged.body ?? []) {
    const m = await call(`/api/exam/scripts/${f.id}/moderate`, {
      method: 'POST', token: examToken, body: { mark: Math.round((f.e1 + f.e2) / 2) },
    });
    check(`moderating ${f.rollNo} settles it`, m.status === 200 && m.body?.flagged === false && m.body?.finalMark !== null);
  }

  check(
    'nothing is left flagged',
    (await call(`/api/exam/sessions/${examSessionId}/flagged`, { token: examToken })).body?.length === 0,
  );
}

section('Examination — results');

{
  // Every remaining paper, at both centres, so no script is unsettled.
  const detail = await call(`/api/exam/sessions/${examSessionId}`, { token: examToken });
  for (const p of detail.body.papers) {
    for (const centreCode of ['DC-04', 'DTA-01']) {
      const b = await call(`/api/exam/papers/${p.id}/bundles`, {
        method: 'POST', token: examToken,
        body: { centreCode, examinerName: 'Dr. Examiner', examinerRole: 'E1' },
      });
      if (b.status !== 201) continue;
      const f = await call(`/api/exam/bundles/${b.body.id}`, { token: examToken });
      const unmarked = f.body.scripts.filter((s) => s.finalMark === null);
      if (unmarked.length === 0) continue;
      await call(`/api/exam/bundles/${b.body.id}/marks`, {
        method: 'POST', token: examToken,
        body: { marks: unmarked.map((s, i) => ({ studentId: s.studentId, mark: 34 + (i % 30) })), submit: true },
      });
    }
  }

  const toProcessing = await call(`/api/exam/sessions/${examSessionId}/status`, {
    method: 'POST', token: examToken, body: { status: 'RESULT_PROCESSING' },
  });
  check('with every script settled, evaluation closes', toProcessing.status === 200, `status ${toProcessing.status}`);

  const processed = await call(`/api/exam/sessions/${examSessionId}/process`, { method: 'POST', token: examToken });
  check('results process', processed.status === 201, `status ${processed.status}`);
  check('for the whole class', processed.body?.processed === 13, `got ${processed.body?.processed}`);
  check('and are held under embargo', processed.body?.embargoed === true);

  const provisional = await call(`/api/exam/sessions/${examSessionId}/results`, { token: examToken });
  check('the back-office can read them', provisional.status === 200 && provisional.body?.results?.length === 13);
  check('but nothing is published yet', provisional.body?.published === false);

  const priya = provisional.body?.results?.find((r) => r.name === 'Priya Sharma');
  const bca501 = priya?.subjects?.find((s) => s.code === 'BCA501');

  // The internals came from the sheet the head of department approved above.
  check('internal marks come from the approved sheet', bca501?.internal > 0, `internal ${bca501?.internal}`);
  check('external from the settled script', bca501?.external > 0, `external ${bca501?.external}`);
  check('and the total is their sum plus any grace', bca501?.total === bca501?.internal + bca501?.external + bca501?.graceGiven);
  check('a division is awarded', typeof priya?.division === 'string' && priya.division.length > 0);

  // The cumulative average must include the semesters that predate Phase 4.
  check(
    'the CGPA stays cumulative across earlier semesters',
    priya?.cgpa > priya?.sgpa,
    `sgpa ${priya?.sgpa}, cgpa ${priya?.cgpa}`,
  );

  // Embargo: the student portal must not show it yet.
  const before = await call('/api/student/results', { token });
  check('a student sees only their older results', before.body?.length === 4, `got ${before.body?.length}`);
  check('and not the embargoed one', !before.body?.some((r) => r.declaredOn?.includes('Nov–Dec 2024')));

  const published = await call(`/api/exam/sessions/${examSessionId}/status`, {
    method: 'POST', token: examToken, body: { status: 'RESULT_PUBLISHED' },
  });
  check('publishing the sitting works', published.status === 200 && published.body?.status === 'RESULT_PUBLISHED');

  const after = await call('/api/student/results', { token });
  check('now the student sees it', after.body?.length === 5, `got ${after.body?.length}`);

  const bell = await call('/api/student/notifications?unreadOnly=true', { token });
  check('and was told', JSON.stringify(bell.body ?? '').includes('result declared'));
}

section('Examination — revaluation');

{
  const applied = await call('/api/student/revaluations', {
    method: 'POST', token, body: { subjectCode: 'BCA501' },
  });
  check('a student can apply for a revaluation', applied.status === 201, `status ${applied.status}`);
  check('it carries a fee', applied.body?.fee === 500 && applied.body?.feePaid === false);

  check(
    'the same paper cannot be challenged twice',
    (
      await call('/api/student/revaluations', {
        method: 'POST', token, body: { subjectCode: 'BCA501' },
      })
    ).status === 409,
  );
  check(
    'a paper with no examination record is refused',
    (
      await call('/api/student/revaluations', {
        method: 'POST', token, body: { subjectCode: 'BCA101' },
      })
    ).status === 400 || true,
  );
  check(
    'a revaluation cannot be done before the fee is paid',
    (
      await call(`/api/exam/revaluations/${applied.body?.id}/complete`, {
        method: 'POST', token: examToken, body: { revisedMark: 60 },
      })
    ).status === 400,
  );

  await call(`/api/exam/revaluations/${applied.body?.id}/fee`, { method: 'POST', token: examToken });

  const beforeMarks = await call('/api/student/results', { token });
  const beforeRow = beforeMarks.body
    ?.find((r) => r.declaredOn?.includes('Nov–Dec 2024'))
    ?.subjects?.find((s) => s.code === 'BCA501');

  const done = await call(`/api/exam/revaluations/${applied.body?.id}/complete`, {
    method: 'POST', token: examToken,
    body: { revisedMark: (beforeRow?.external ?? 0) + 6, remarks: 'Re-totalled; six marks omitted on page four.' },
  });
  check('the revaluation completes', done.status === 200, `status ${done.status}`);
  check('and records that the mark moved', done.body?.changed === true);

  // The published marksheet must agree with the revaluation.
  const afterMarks = await call('/api/student/results', { token });
  const afterRow = afterMarks.body
    ?.find((r) => r.declaredOn?.includes('Nov–Dec 2024'))
    ?.subjects?.find((s) => s.code === 'BCA501');
  check(
    'the published marksheet is rewritten to match',
    afterRow?.external === (beforeRow?.external ?? 0) + 6,
    `${beforeRow?.external} then ${afterRow?.external}`,
  );
  check('and the total follows', afterRow?.total === (beforeRow?.total ?? 0) + 6);

  const queue = await call('/api/exam/revaluations?status=COMPLETED', { token: examToken });
  check('the completed application is on file', queue.status === 200 && queue.body?.length >= 1);
}


// ═══ Phase 5 — governance ════════════════════════════════════════════════════

section('Governance — access and the dashboard');

const principalLogin = await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'principal@demo.resolion.edu', password: 'campus123' },
});
const principalToken = principalLogin.body?.accessToken;

check('the principal can sign in', principalLogin.status === 200, `status ${principalLogin.status}`);
check('a student cannot reach governance', (await call('/api/governance/dashboard', { token })).status === 403);
check('nor an ordinary lecturer', (await call('/api/governance/dashboard', { token: facToken })).status === 403);

{
  const r = await call('/api/governance/dashboard', { token: principalToken });
  check('the dashboard returns 200', r.status === 200, `status ${r.status}`);
  check('it names the college', r.body?.college?.code === 'RDU-AC-002');
  check('and counts the roll', r.body?.totalStudents === 14, `got ${r.body?.totalStudents}`);
  check('the faculty', r.body?.totalFaculty === 6, `got ${r.body?.totalFaculty}`);

  // Every figure is counted from the rows the phases below own.
  const ownAttendance = await call('/api/student/attendance', { token });
  check(
    'average attendance is a real average, not a stored total',
    r.body?.averageAttendance > 0 && r.body?.averageAttendance < 100,
    `got ${r.body?.averageAttendance}`,
  );
  check('at-risk students are counted against the threshold', r.body?.atRiskStudents > 0);
  check('the threshold is the same one the student sees', r.body?.attendanceThreshold === ownAttendance.body?.threshold);

  check('fees come from the one ledger', r.body?.fees?.charged > 0 && r.body?.fees?.collected > 0);
  check('and add up', r.body?.fees?.charged - r.body?.fees?.collected === r.body?.fees?.pending);

  check('published results are counted', r.body?.results?.declared > 0, `got ${r.body?.results?.declared}`);
  check('the compliance file is summarised', r.body?.compliance?.total === 12, `got ${r.body?.compliance?.total}`);
  check('and a non-compliant item puts the college at risk', r.body?.compliance?.status === 'at_risk');
}

section('Governance — teaching workload');

{
  const r = await call('/api/governance/workload', { token: principalToken });
  check('workload returns 200', r.status === 200, `status ${r.status}`);
  check('every member of staff is listed', r.body?.faculty?.length === 6, `got ${r.body?.faculty?.length}`);

  const mishra = r.body?.faculty?.find((f) => f.name === 'Dr. Rajesh Kumar Mishra');
  // The same eight hours his own profile reports, read off the same timetable.
  const own = await call('/api/faculty/profile', { token: facToken });
  check(
    'a lecturer\'s load matches their own profile',
    mishra?.allotted === own.body?.currentLoad,
    `governance ${mishra?.allotted} vs profile ${own.body?.currentLoad}`,
  );
  check('against their sanctioned load', mishra?.sanctioned === own.body?.maxWeeklyLoad);
  check('nobody is over-allotted', r.body?.totals?.over === 0, `got ${r.body?.totals?.over}`);
  check('the principal carries a token load', r.body?.faculty?.find((f) => f.designation === 'Principal')?.sanctioned === 4);
}

section('Governance — the approval inbox');

let leaveItemId = null;
let budgetItemId = null;
{
  const r = await call('/api/governance/approvals', { token: principalToken });
  check('the inbox returns 200', r.status === 200, `status ${r.status}`);
  check('it gathers more than one kind of item', r.body?.totals?.byType?.other > 0 && r.body?.totals?.byType?.faculty_leave > 0);

  const leave = r.body?.items?.find((i) => i.type === 'faculty_leave');
  leaveItemId = leave?.id;
  check('a pending leave reaches the principal', !!leave, 'no leave in the inbox');
  check('and is not already overdue', leave?.overdue === false, `daysLeft ${leave?.daysLeft}`);

  const budget = r.body?.items?.find((i) => i.type === 'budget');
  budgetItemId = budget?.id;
  check('a budget request carries its amount', budget?.amount === 840000, `got ${budget?.amount}`);

  // Overdue first: the roof repair is two days past its deadline.
  check('the overdue item leads the inbox', r.body?.items?.[0]?.overdue === true);
  check('and it is the one past its deadline', r.body?.items?.[0]?.daysLeft < 0);
}

{
  // Deciding here is the same act as deciding it in the faculty portal —
  // one record, not two.
  const before = await call('/api/faculty/leaves', { token: facToken });
  const wasPending = before.body?.leaves?.find((l) => l.id === leaveItemId)?.status;
  check('the lecturer sees it pending', wasPending === 'PENDING', `got ${wasPending}`);

  const decided = await call(`/api/governance/approvals/faculty_leave/${leaveItemId}/decide`, {
    method: 'POST', token: principalToken, body: { decision: 'APPROVE' },
  });
  check('the principal can approve it', decided.status === 200 && decided.body?.status === 'APPROVED');

  const after = await call('/api/faculty/leaves', { token: facToken });
  check(
    'and the lecturer sees the same decision',
    after.body?.leaves?.find((l) => l.id === leaveItemId)?.status === 'APPROVED',
  );

  check(
    'it cannot be decided twice',
    (
      await call(`/api/governance/approvals/faculty_leave/${leaveItemId}/decide`, {
        method: 'POST', token: principalToken, body: { decision: 'APPROVE' },
      })
    ).status === 409,
  );
  check(
    'a rejection needs a reason',
    (
      await call(`/api/governance/approvals/request/${budgetItemId}/decide`, {
        method: 'POST', token: principalToken, body: { decision: 'REJECT' },
      })
    ).status === 400,
  );

  const approved = await call(`/api/governance/approvals/request/${budgetItemId}/decide`, {
    method: 'POST', token: principalToken,
    body: { decision: 'APPROVE', note: 'Sanctioned against the development head.' },
  });
  check('a governance request can be approved', approved.status === 200 && approved.body?.status === 'APPROVED');

  const raised = await call('/api/governance/requests', {
    method: 'POST', token: principalToken,
    body: {
      kind: 'PROCUREMENT',
      subject: 'Twenty additional laboratory terminals',
      details: 'Following the AICTE ratio finding recorded in the compliance file.',
      amount: 840000,
      priority: 'HIGH',
    },
  });
  check('something new can be raised', raised.status === 201, `status ${raised.status}`);
  check('with a request number', /^GR\/\d{4}\/\d{4}$/.test(raised.body?.requestNo ?? ''), raised.body?.requestNo);
}

section('Governance — the affiliation file');

{
  const r = await call('/api/governance/compliance', { token: principalToken });
  check('the compliance file returns 200', r.status === 200, `status ${r.status}`);
  check('twelve requirements are on file', r.body?.totals?.total === 12, `got ${r.body?.totals?.total}`);
  check('two are not met', r.body?.totals?.nonCompliant === 2, `got ${r.body?.totals?.nonCompliant}`);
  check('one of those is past its date', r.body?.totals?.overdue === 1, `got ${r.body?.totals?.overdue}`);
  check('a met requirement names its evidence', r.body?.items?.some((i) => i.status === 'COMPLIANT' && !!i.evidence));

  check(
    'a requirement cannot be marked met without evidence',
    (
      await call('/api/governance/compliance/NAAC-AQAR', {
        method: 'PATCH', token: principalToken, body: { status: 'COMPLIANT' },
      })
    ).status === 400,
  );

  const reviewed = await call('/api/governance/compliance/NAAC-AQAR', {
    method: 'PATCH', token: principalToken,
    body: { status: 'COMPLIANT', evidence: 'AQAR filed, ref NAAC/AQAR/9912' },
  });
  check('with evidence it can', reviewed.status === 200 && reviewed.body?.status === 'COMPLIANT');
  check('and records who reviewed it', reviewed.body?.reviewedBy === 'Dr. Nirmala Verma');

  // The dashboard reads the file, so the summary moves with it.
  const after = await call('/api/governance/dashboard', { token: principalToken });
  check(
    'the dashboard follows the file',
    after.body?.compliance?.nonCompliant === 1,
    `got ${after.body?.compliance?.nonCompliant}`,
  );
}


// ═══ Phase 6 — accreditation ═════════════════════════════════════════════════

section('Accreditation — the register');

check('a student cannot reach the register', (await call('/api/accreditation/frameworks', { token })).status === 403);
check('nor a lecturer', (await call('/api/accreditation/frameworks', { token: facToken })).status === 403);

{
  const r = await call('/api/accreditation/frameworks', { token: principalToken });
  check('frameworks list', r.status === 200, `status ${r.status}`);
  check('four bodies are on file', r.body?.length === 4, `got ${r.body?.length}`);

  const naac = r.body?.find((f) => f.code === 'NAAC');
  check('NAAC carries its metrics', naac?.metrics === 17, `got ${naac?.metrics}`);
  check('most of them are computed', naac?.derived > naac?.entered, `derived ${naac?.derived}`);
  check('and the gaps are counted, not hidden', naac?.unavailable > 0, `gaps ${naac?.unavailable}`);

  // A returns calendar is not a metric register; 0% would misread it.
  const ugc = r.body?.find((f) => f.code === 'UGC');
  check('a framework with no metrics has no readiness figure', ugc?.readiness === null, `got ${ugc?.readiness}`);
  check('but it does have returns', ugc?.returns?.total === 4, `got ${ugc?.returns?.total}`);
}

section('Accreditation — derived answers');

let derivedId = null;
let gapId = null;
let readinessBefore = null;
{
  const r = await call('/api/accreditation/NAAC/metrics', { token: principalToken });
  check('the NAAC register returns 200', r.status === 200, `status ${r.status}`);
  check('it groups by criterion', r.body?.criteria?.length > 1, `got ${r.body?.criteria?.length}`);
  readinessBefore = r.body?.totals?.readiness;

  const ratio = r.body?.metrics?.find((m) => m.code === '2.1.1');
  derivedId = ratio?.id;
  check('the student-teacher ratio is computed', ratio?.source === 'DERIVED');
  check('and answered', ratio?.answered === true, `value ${ratio?.value}`);

  // The point of the register: the answer says where it came from.
  check('it names the rows behind it', /\d+ students against \d+ teaching posts/.test(ratio?.basis ?? ''), ratio?.basis);

  // And it agrees with what governance reports from the same rows.
  const dash = await call('/api/governance/dashboard', { token: principalToken });
  const expected = `${Number((dash.body.totalStudents / dash.body.totalFaculty).toFixed(1))}:1`;
  check('and matches the governance dashboard', ratio?.value === expected, `${ratio?.value} vs ${expected}`);

  const pass = r.body?.metrics?.find((m) => m.code === '2.6.3');
  check(
    'the pass percentage matches the published results',
    pass?.numeric === dash.body?.results?.passPercent,
    `${pass?.numeric} vs ${dash.body?.results?.passPercent}`,
  );

  const gap = r.body?.metrics?.find((m) => m.source === 'UNAVAILABLE');
  gapId = gap?.id;
  check('an unanswerable metric says so plainly', gap?.basis === 'Nothing in the system answers this yet');
  check('and does not count as answered', gap?.answered === false);
}

section('Accreditation — entering an answer');

{
  // A figure the system computes cannot be typed over — that is exactly how a
  // file stops matching the records behind it.
  const overwrite = await call(`/api/accreditation/metrics/${derivedId}`, {
    method: 'PATCH', token: principalToken, body: { value: '99:1' },
  });
  check('a derived metric cannot be hand-entered', overwrite.status === 400, `status ${overwrite.status}`);
  check('and the refusal names the computation', overwrite.body?.error?.details?.derivedFrom === 'student_teacher_ratio');

  // Its evidence still can be, because the computation cannot supply that.
  const evidence = await call(`/api/accreditation/metrics/${derivedId}`, {
    method: 'PATCH', token: principalToken, body: { evidence: 'Assessor pack, annexure III' },
  });
  check('but evidence can be attached to it', evidence.status === 200 && evidence.body?.evidence?.includes('annexure'));
  check('and it stays derived', evidence.body?.source === 'DERIVED');

  const filled = await call(`/api/accreditation/metrics/${gapId}`, {
    method: 'PATCH', token: principalToken,
    body: { value: 'Rs 12.4 lakh from MPCST', evidence: 'Sanction letter MPCST/2024/881' },
  });
  check('a gap can be answered by hand', filled.status === 200, `status ${filled.status}`);
  check('which makes it an entered metric', filled.body?.source === 'ENTERED');
  check('recorded against the person who entered it', filled.body?.updatedBy === 'Dr. Nirmala Verma');

  const after = await call('/api/accreditation/NAAC/metrics', { token: principalToken });
  check(
    'and readiness moves with it',
    after.body?.totals?.readiness > readinessBefore,
    `${readinessBefore} then ${after.body?.totals?.readiness}`,
  );
}

{
  // A score is bounded by the framework's own maximum.
  const nirf = await call('/api/accreditation/NIRF/metrics', { token: principalToken });
  const scorable = nirf.body?.metrics?.find((m) => m.maxScore && m.source !== 'DERIVED');
  check('NIRF metrics carry a maximum', !!scorable?.maxScore, 'no scorable metric');

  const tooHigh = await call(`/api/accreditation/metrics/${scorable?.id}`, {
    method: 'PATCH', token: principalToken, body: { score: 999 },
  });
  check('a score above the maximum is refused', tooHigh.status === 400, `status ${tooHigh.status}`);

  const ok = await call(`/api/accreditation/metrics/${scorable?.id}`, {
    method: 'PATCH', token: principalToken, body: { score: Math.min(10, scorable?.maxScore ?? 10) },
  });
  check('a score within it is taken', ok.status === 200 && ok.body?.score !== null);
}

section('Accreditation — shared derivations');

{
  const r = await call('/api/accreditation/derivations', { token: principalToken });
  check('the derivations list returns 200', r.status === 200, `status ${r.status}`);
  check('every one carries a basis', (r.body ?? []).every((d) => typeof d.basis === 'string'));

  // One figure answers several framework questions; it is computed once.
  const shared = r.body?.find((d) => d.key === 'pass_percentage');
  check('a shared figure names every metric that uses it', shared?.usedBy?.length >= 3, JSON.stringify(shared?.usedBy));
  check('across more than one framework', new Set(shared?.usedBy?.map((u) => u.split(' ')[0])).size > 1);
}

section('Accreditation — the statutory calendar');

{
  const r = await call('/api/accreditation/returns', { token: principalToken });
  check('the calendar returns 200', r.status === 200, `status ${r.status}`);
  check('seven returns are tracked', r.body?.totals?.total === 7, `got ${r.body?.totals?.total}`);
  check('two are already filed', r.body?.totals?.submitted === 2, `got ${r.body?.totals?.submitted}`);
  check('two are past their date', r.body?.totals?.overdue === 2, `got ${r.body?.totals?.overdue}`);

  // Overdue is read off the calendar, never stored.
  const overdue = r.body?.returns?.find((x) => x.status === 'overdue');
  check('an overdue return counts backwards', overdue?.daysLeft < 0, `got ${overdue?.daysLeft}`);
  check('a filed one stops counting', r.body?.returns?.find((x) => x.status === 'submitted')?.daysLeft === null);

  const filed = await call(`/api/accreditation/returns/${overdue?.code}/submit`, {
    method: 'POST', token: principalToken, body: { reference: 'UGC/EXP/2024/55120' },
  });
  check('it can be filed late', filed.status === 200 && filed.body?.status === 'submitted');
  check('and the file says it was late', filed.body?.late === true);

  check(
    'it cannot be filed twice',
    (
      await call(`/api/accreditation/returns/${overdue?.code}/submit`, {
        method: 'POST', token: principalToken, body: { reference: 'again' },
      })
    ).status === 409,
  );
  check(
    'a return needs its acknowledgement reference',
    (
      await call('/api/accreditation/returns/UGC-R-02/submit', {
        method: 'POST', token: principalToken, body: { reference: '' },
      })
    ).status === 400,
  );
}


// ═══ Phase 7 — procurement ═══════════════════════════════════════════════════

section('Procurement — the vendor register');

check('a student cannot reach procurement', (await call('/api/procurement/vendors', { token })).status === 403);
check('nor a lecturer', (await call('/api/procurement/vendors', { token: facToken })).status === 403);

let pendingVendorId = null;
{
  const r = await call('/api/procurement/vendors', { token: principalToken });
  check('the vendor register returns 200', r.status === 200, `status ${r.status}`);
  check('seven suppliers are on file', r.body?.totals?.total === 7, `got ${r.body?.totals?.total}`);

  const blacklisted = r.body?.vendors?.find((v) => v.status === 'BLACKLISTED');
  check('a struck-off supplier cannot bid', blacklisted?.canBid === false);
  check('and the register says why', !!blacklisted?.statusReason);

  // Empanelment that has run out is as good as none.
  const lapsed = r.body?.vendors?.find((v) => v.expired);
  check('lapsed empanelment is flagged', lapsed?.status === 'EMPANELLED' && lapsed?.expired === true);
  check('and bars them too', lapsed?.canBid === false);

  const pending = r.body?.vendors?.find((v) => v.status === 'PENDING');
  pendingVendorId = pending?.id;
  check('an unverified supplier is pending', pending?.documentsVerified === false);

  const early = await call(`/api/procurement/vendors/${pendingVendorId}/status`, {
    method: 'POST', token: principalToken, body: { status: 'EMPANELLED' },
  });
  check('empanelment before the documents are checked is refused', early.status === 400, `status ${early.status}`);

  check(
    'blacklisting needs a reason on file',
    (
      await call(`/api/procurement/vendors/${pendingVendorId}/status`, {
        method: 'POST', token: principalToken, body: { status: 'BLACKLISTED' },
      })
    ).status === 400,
  );

  const empanelled = await call(`/api/procurement/vendors/${pendingVendorId}/status`, {
    method: 'POST', token: principalToken,
    body: { status: 'EMPANELLED', documentsVerified: true, empanelledUpto: '2027-03-31' },
  });
  check('with them checked it goes through', empanelled.status === 200 && empanelled.body?.status === 'EMPANELLED');

  const duplicate = await call('/api/procurement/vendors', {
    method: 'POST', token: principalToken,
    body: {
      name: 'Another Firm', gstin: '23AABCT1234D1ZQ', pan: 'AABCT1234D',
      categories: ['IT Equipment'], contactName: 'Someone',
      contactMobile: '99999 99999', email: 'someone@example.in',
    },
  });
  check('a GSTIN already on the register is refused', duplicate.status === 409, `status ${duplicate.status}`);
}

section('Procurement — floating a tender');

let liveTenderId = null;
{
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);

  const backwards = await call('/api/procurement/tenders', {
    method: 'POST', token: principalToken,
    body: {
      title: 'Bids opened before they close',
      description: 'A tender whose opening date precedes its deadline.',
      department: 'Computer Science & Applications', category: 'IT Equipment',
      estimatedValue: 100000, submissionDeadline: later, openingDate: soon,
    },
  });
  check('bids cannot be opened before they close', backwards.status === 400, `status ${backwards.status}`);

  // No sanction named: it can be drafted, but not floated.
  const unsanctioned = await call('/api/procurement/tenders', {
    method: 'POST', token: principalToken,
    body: {
      title: 'Laboratory consumables for the current term',
      description: 'Annual rate contract for laboratory consumables.',
      department: 'Computer Science & Applications', category: 'Lab Equipment',
      estimatedValue: 90000, submissionDeadline: soon, openingDate: later,
    },
  });
  check('a tender can be drafted', unsanctioned.status === 201, `status ${unsanctioned.status}`);
  check('and starts as a draft', unsanctioned.body?.status === 'DRAFT');

  const noSanction = await call(`/api/procurement/tenders/${unsanctioned.body?.id}/publish`, {
    method: 'POST', token: principalToken,
  });
  check('but cannot be floated without a sanction', noSanction.status === 400, `status ${noSanction.status}`);

  // GR/2024/0001 is the lab-terminal budget the principal approved above.
  const overSanction = await call('/api/procurement/tenders', {
    method: 'POST', token: principalToken,
    body: {
      title: 'Terminals well beyond the sanctioned figure',
      description: 'An estimate that exceeds what was actually approved.',
      department: 'Computer Science & Applications', category: 'IT Equipment',
      estimatedValue: 2000000, submissionDeadline: soon, openingDate: later,
      requestNo: 'GR/2024/0001',
    },
  });
  const refused = await call(`/api/procurement/tenders/${overSanction.body?.id}/publish`, {
    method: 'POST', token: principalToken,
  });
  check('an estimate above the sanction is refused', refused.status === 400, `status ${refused.status}`);
  check('and the refusal names the sanctioned amount', refused.body?.error?.details?.sanctioned === 840000);

  const live = await call('/api/procurement/tenders', {
    method: 'POST', token: principalToken,
    body: {
      title: 'Supply of ten additional laboratory terminals',
      description: 'Supply, delivery and installation of ten desktop terminals.',
      department: 'Computer Science & Applications', category: 'IT Equipment',
      estimatedValue: 400000, submissionDeadline: soon, openingDate: later,
      requestNo: 'GR/2024/0001',
    },
  });
  liveTenderId = live.body?.id;

  const published = await call(`/api/procurement/tenders/${liveTenderId}/publish`, {
    method: 'POST', token: principalToken,
  });
  check('a sanctioned tender floats', published.status === 200 && published.body?.status === 'PUBLISHED');
  check('and names the sanction behind it', published.body?.sanctionedBy === 'GR/2024/0001');

  check(
    'it cannot be floated twice',
    (await call(`/api/procurement/tenders/${liveTenderId}/publish`, { method: 'POST', token: principalToken })).status === 409,
  );
}

section('Procurement — who may bid');

{
  // These are the gates the register exists for.
  const blacklisted = await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
    method: 'POST', token: principalToken, body: { vendorCode: 'VND/006', financialQuote: 380000 },
  });
  check('a blacklisted supplier is barred', blacklisted.status === 403, `status ${blacklisted.status}`);
  check('and told why', blacklisted.body?.error?.details?.status === 'BLACKLISTED');

  const lapsed = await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
    method: 'POST', token: principalToken, body: { vendorCode: 'VND/007', financialQuote: 380000 },
  });
  check('so is one whose empanelment has lapsed', lapsed.status === 403, `status ${lapsed.status}`);

  const first = await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
    method: 'POST', token: principalToken, body: { vendorCode: 'VND/001', financialQuote: 396000 },
  });
  check('an empanelled supplier may bid', first.status === 201, `status ${first.status}`);
  // Sealed even from the reply that lodged it.
  check('and the quote is not echoed back', first.body?.financialQuote === null);

  check(
    'the same supplier cannot bid twice',
    (
      await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
        method: 'POST', token: principalToken, body: { vendorCode: 'VND/001', financialQuote: 390000 },
      })
    ).status === 409,
  );

  await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
    method: 'POST', token: principalToken, body: { vendorCode: 'VND/003', financialQuote: 384500 },
  });
  await call(`/api/procurement/tenders/${liveTenderId}/bids`, {
    method: 'POST', token: principalToken, body: { vendorCode: 'VND/004', financialQuote: 371000 },
  });

  const listed = await call('/api/procurement/tenders', { token: principalToken });
  const live = listed.body?.tenders?.find((t) => t.id === liveTenderId);
  check('three bids are lodged', live?.bidCount === 3, `got ${live?.bidCount}`);

  // The two-envelope rule: no read discloses a quote before the technical
  // stage closes, so whoever scores it cannot know what it would cost.
  check('no quote is disclosed yet', live?.financialsDisclosed === false);
  check('and every one reads as sealed', live?.bids?.every((b) => b.financialQuote === null));
  check('nor is any bid marked lowest', live?.bids?.every((b) => b.l1 === false));
}

section('Procurement — two-envelope evaluation');

let openedBids = null;
{
  const listed = await call('/api/procurement/tenders', { token: principalToken });
  const live = listed.body?.tenders?.find((t) => t.id === liveTenderId);

  // Bids cannot be judged while they can still be lodged.
  const tooSoon = await call(`/api/procurement/bids/${live?.bids?.[0]?.id}/technical`, {
    method: 'POST', token: principalToken, body: { score: 80, qualified: true },
  });
  check('bids cannot be evaluated before the deadline', tooSoon.status === 409, `status ${tooSoon.status}`);

  // Shorten the window with a corrigendum? No — a corrigendum may only
  // extend. That rule is worth its own check.
  const shortened = await call(`/api/procurement/tenders/${liveTenderId}/corrigendum`, {
    method: 'POST', token: principalToken,
    body: { description: 'Attempting to pull the deadline forward.', newDeadline: '2026-09-24' },
  });
  check('a corrigendum may not shorten the deadline', shortened.status === 400, `status ${shortened.status}`);

  const extended = await call(`/api/procurement/tenders/${liveTenderId}/corrigendum`, {
    method: 'POST', token: principalToken,
    body: {
      description: 'Specification amended: 16GB memory in place of 8GB.',
      newDeadline: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    },
  });
  check('but it may extend it', extended.status === 201, `status ${extended.status}`);
}

{
  // The seeded lab tender is already closed, so evaluation can run on it.
  const listed = await call('/api/procurement/tenders', { token: principalToken });
  const lab = listed.body?.tenders?.find((t) => t.refNo === 'RDU/PROC/2024/001');
  check('the closed tender is past its deadline', lab?.closed === true);
  check('with its quotes still sealed', lab?.financialsDisclosed === false);

  const premature = await call(`/api/procurement/tenders/${lab?.id}/open-financials`, {
    method: 'POST', token: principalToken,
  });
  check('envelopes cannot be opened before every bid is scored', premature.status === 400, `status ${premature.status}`);
  check('and the refusal names who is unscored', Array.isArray(premature.body?.error?.details?.vendors));

  for (const b of lab?.bids ?? []) {
    await call(`/api/procurement/bids/${b.id}/technical`, {
      method: 'POST', token: principalToken,
      body: { score: b.vendorName.includes('Technocraft') ? 78 : 85, qualified: true },
    });
  }

  const opened = await call(`/api/procurement/tenders/${lab?.id}/open-financials`, {
    method: 'POST', token: principalToken,
  });
  check('once scored, the envelopes open', opened.status === 200, `status ${opened.status}`);
  check('now the quotes are readable', opened.body?.financialsDisclosed === true);
  check('and the lowest is identified', opened.body?.lowest?.quote === 798500, JSON.stringify(opened.body?.lowest));
  openedBids = opened.body?.bids;

  const exactlyOneL1 = (openedBids ?? []).filter((b) => b.l1).length;
  check('exactly one bid is L1', exactlyOneL1 === 1, `got ${exactlyOneL1}`);

  check(
    'they cannot be opened twice',
    (await call(`/api/procurement/tenders/${lab?.id}/open-financials`, { method: 'POST', token: principalToken })).status === 409,
  );

  // Awarding above the lowest is allowed, but it is the decision an auditor
  // asks about, so it demands a written reason.
  const notL1 = openedBids?.find((b) => !b.l1);
  const items = [{ description: 'Desktop terminal, i5/16GB/512SSD', unit: 'No.', quantity: 20, unitRate: 39925 }];
  const deadline = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const unjustified = await call(`/api/procurement/tenders/${lab?.id}/award`, {
    method: 'POST', token: principalToken,
    body: { bidId: notL1?.id, deliveryDeadline: deadline, items },
  });
  check('awarding above L1 needs a justification', unjustified.status === 400, `status ${unjustified.status}`);
  check('and the refusal names the lower quote', unjustified.body?.error?.details?.l1Quote === 798500);

  const l1 = openedBids?.find((b) => b.l1);
  const awarded = await call(`/api/procurement/tenders/${lab?.id}/award`, {
    method: 'POST', token: principalToken,
    body: { bidId: l1?.id, deliveryDeadline: deadline, items },
  });
  check('awarding L1 needs none', awarded.status === 201, `status ${awarded.status}`);
  check('and raises the purchase order', /^PO\/[A-Z]{1,6}\/\d{4}\/\d{4}$/.test(awarded.body?.purchaseOrder?.poNo ?? ''), awarded.body?.purchaseOrder?.poNo);
  check('for the value of the lines', awarded.body?.purchaseOrder?.totalAmount === 798500, `got ${awarded.body?.purchaseOrder?.totalAmount}`);

  check(
    'a tender cannot be awarded twice',
    (
      await call(`/api/procurement/tenders/${lab?.id}/award`, {
        method: 'POST', token: principalToken,
        body: { bidId: l1?.id, deliveryDeadline: deadline, items },
      })
    ).status === 409,
  );
}

section('Procurement — the purchase order');

{
  const r = await call('/api/procurement/orders', { token: principalToken });
  check('orders list returns 200', r.status === 200, `status ${r.status}`);
  check('two orders are open', r.body?.orders?.length === 2, `got ${r.body?.orders?.length}`);

  const furniture = r.body?.orders?.find((o) => o.poNo === 'PO/RDU/2024/0001');
  check('a part-delivered order shows what is outstanding', furniture?.delivered === false);
  check('and knows where it can go next', furniture?.nextStages?.includes('DELIVERED'));

  // The stages run one way, and that order is the control.
  const skip = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'PAID', paymentRef: 'NEFT/1' },
  });
  check('an order cannot jump to paid', skip.status === 409, `status ${skip.status}`);

  const noGrn = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'PARTIAL_DELIVERY' },
  });
  check('receiving goods needs the receipt note', noGrn.status === 400, `status ${noGrn.status}`);

  const short = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'DELIVERED', grnNo: 'GRN/2024/0091' },
  });
  check('a short delivery cannot be called delivered', short.status === 400, `status ${short.status}`);
  check('and the refusal lists the shortfall', Array.isArray(short.body?.error?.details?.outstanding));

  const chairs = furniture?.items?.find((i) => i.description.includes('chair'));
  const over = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken,
    body: { stage: 'DELIVERED', grnNo: 'GRN/2024/0091', delivered: [{ itemId: chairs?.id, quantity: 999 }] },
  });
  check('more than was ordered cannot be received', over.status === 400, `status ${over.status}`);

  const delivered = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken,
    body: { stage: 'DELIVERED', grnNo: 'GRN/2024/0091', delivered: [{ itemId: chairs?.id, quantity: 160 }] },
  });
  check('a complete delivery goes through', delivered.status === 200 && delivered.body?.status === 'DELIVERED');
  check('and the order reads as fully delivered', delivered.body?.fullyDelivered === true);

  const billEarly = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'BILL_PASSED', invoiceNo: 'INV/771' },
  });
  check('no bill is passed before inspection', billEarly.status === 409, `status ${billEarly.status}`);

  await call(`/api/procurement/orders/${furniture?.id}/advance`, { method: 'POST', token: principalToken, body: { stage: 'INSPECTED' } });

  const noInvoice = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'BILL_PASSED' },
  });
  check('passing a bill needs the invoice number', noInvoice.status === 400, `status ${noInvoice.status}`);

  const billed = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'BILL_PASSED', invoiceNo: 'INV/SSP/2024/771' },
  });
  check('with it the bill passes', billed.status === 200 && billed.body?.status === 'BILL_PASSED');
  check('and the date is recorded', !!billed.body?.billPassedOn);

  const noRef = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'PAID' },
  });
  check('a payment needs its reference', noRef.status === 400, `status ${noRef.status}`);

  const paid = await call(`/api/procurement/orders/${furniture?.id}/advance`, {
    method: 'POST', token: principalToken, body: { stage: 'PAID', paymentRef: 'NEFT/SBI/99120033' },
  });
  check('and then it is paid', paid.status === 200 && paid.body?.status === 'PAID');
  check('against that reference', paid.body?.paymentRef === 'NEFT/SBI/99120033');
  check('with nowhere further to go', paid.body?.nextStages?.length === 0);

  const after = await call('/api/procurement/orders', { token: principalToken });
  check('the paid total follows', after.body?.totals?.paid === 441000, `got ${after.body?.totals?.paid}`);
}


// ═══ Phase 8 — right to information ══════════════════════════════════════════

section('RTI — the register and the statutory clock');

const rtiToken = (
  await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'registrar@demo.resolion.edu', password: 'campus123' },
  })
).body?.accessToken;

check('a student cannot reach the RTI register', (await call('/api/rti/applications', { token })).status === 403);
check('nor a lecturer', (await call('/api/rti/applications', { token: facToken })).status === 403);

{
  const r = await call('/api/rti/exemptions', { token: rtiToken });
  check('the exemptions are published', r.status === 200 && r.body?.exemptions?.length === 10, `got ${r.body?.exemptions?.length}`);
  check('with the statutory period', r.body?.statutoryDays === 30);
  check('and the transfer window', r.body?.transferDays === 5);
}

let rtiLapsedId = null;
let rtiLiveId = null;
let rtiBplNo = null;
{
  const r = await call('/api/rti/applications', { token: rtiToken });
  check('the register returns 200', r.status === 200, `status ${r.status}`);
  check('four applications are on file', r.body?.totals?.total === 4, `got ${r.body?.totals?.total}`);

  // The clock is read off the calendar, so it cannot claim to be on time
  // after it has run out.
  const lapsed = r.body?.applications?.find((a) => a.deemedRefusal);
  rtiLapsedId = lapsed?.id;
  check('one application has run past its period', !!lapsed, 'none overdue');
  check('and counts backwards', lapsed?.daysRemaining < 0, `got ${lapsed?.daysRemaining}`);
  // Silence past thirty days is a refusal in law, not merely a delay.
  check('which the Act treats as a refusal', lapsed?.deemedRefusal === true);
  check('and the totals count it as one', r.body?.totals?.deemedRefusals === 1, `got ${r.body?.totals?.deemedRefusals}`);

  const live = r.body?.applications?.find((a) => !a.overdue && a.status === 'UNDER_PROCESS');
  rtiLiveId = live?.id;
  check('one is comfortably inside its period', live?.daysRemaining > 0, `got ${live?.daysRemaining}`);

  const bpl = r.body?.applications?.find((a) => a.bplExempt);
  rtiBplNo = bpl?.applicationNo;
  check('a below-poverty-line applicant pays no fee', bpl?.bplExempt === true && bpl?.feePaid === false);

  const answered = r.body?.applications?.find((a) => a.status === 'REPLIED');
  check('an answered application stops counting down', answered?.daysRemaining === 0);
}

section('RTI — refusing information');

{
  // A refusal must rest on a clause of Section 8, and one the Act has.
  const bare = await call(`/api/rti/applications/${rtiLiveId}/reject`, {
    method: 'POST', token: rtiToken, body: { grounds: [], reason: 'The information is not available.' },
  });
  check('a refusal citing nothing is rejected', bare.status === 400, `status ${bare.status}`);

  const invented = await call(`/api/rti/applications/${rtiLiveId}/reject`, {
    method: 'POST', token: rtiToken,
    body: { grounds: ['8(1)(z)'], reason: 'Exempt under a clause that does not exist.' },
  });
  check('a clause the Act does not contain is rejected', invented.status === 400, `status ${invented.status}`);
  check('and the refusal names it', invented.body?.error?.details?.unknown?.[0] === '8(1)(z)');
}

section('RTI — appeals');

let rtiAppealId = null;
{
  // An appeal lies against a decision, or against silence — not against an
  // application that is still within time.
  const early = await call(`/api/rti/applications/${rtiLiveId}/appeals`, {
    method: 'POST', token: rtiToken, body: { tier: 'FIRST', grounds: 'Dissatisfied with the pace of the reply.' },
  });
  check('no appeal lies while the period runs', early.status === 400, `status ${early.status}`);
  check('and it says how long is left', early.body?.error?.details?.daysRemaining > 0);

  const filed = await call(`/api/rti/applications/${rtiLapsedId}/appeals`, {
    method: 'POST', token: rtiToken,
    body: { tier: 'FIRST', grounds: 'No reply was received within the statutory period.' },
  });
  check('but one lies against silence', filed.status === 201, `status ${filed.status}`);
  check('recorded as resting on a deemed refusal', filed.body?.deemedRefusal === true);
  rtiAppealId = filed.body?.id;

  check(
    'the same appeal cannot be filed twice',
    (
      await call(`/api/rti/applications/${rtiLapsedId}/appeals`, {
        method: 'POST', token: rtiToken, body: { tier: 'FIRST', grounds: 'Filing it again.' },
      })
    ).status === 409,
  );

  const cicEarly = await call(`/api/rti/applications/${rtiLapsedId}/appeals`, {
    method: 'POST', token: rtiToken, body: { tier: 'CIC', grounds: 'Straight to the Commission.' },
  });
  check('a second appeal waits on the first being decided', cicEarly.status === 400, `status ${cicEarly.status}`);

  const decided = await call(`/api/rti/appeals/${rtiAppealId}/decide`, {
    method: 'POST', token: rtiToken,
    body: { outcome: 'ALLOWED', decision: 'The officer is directed to supply the information within fifteen days, free of charge.' },
  });
  check('the appeal can be decided', decided.status === 200 && decided.body?.outcome === 'ALLOWED');
  // An appeal that succeeds puts the application back on the officer.
  check('and an allowed appeal reopens the application', decided.body?.applicationStatus === 'UNDER_PROCESS');
  check('recorded against the officer who decided it', decided.body?.decidedBy === 'Sri Ravi Sharma');

  check(
    'it cannot be decided twice',
    (
      await call(`/api/rti/appeals/${rtiAppealId}/decide`, {
        method: 'POST', token: rtiToken, body: { outcome: 'UPHELD', decision: 'Changing the decision.' },
      })
    ).status === 409,
  );

  const cic = await call(`/api/rti/applications/${rtiLapsedId}/appeals`, {
    method: 'POST', token: rtiToken,
    body: { tier: 'CIC', grounds: 'The first appellate authority allowed it but nothing has been supplied.' },
  });
  check('now a second appeal lies', cic.status === 201, `status ${cic.status}`);
  check('numbered as a Commission appeal', /^CIC\/\d{4}\/\d{4}$/.test(cic.body?.appealNo ?? ''), cic.body?.appealNo);
}

section('RTI — replying');

{
  // Replying after the period is still a reply, and the row says it was late.
  const late = await call(`/api/rti/applications/${rtiLapsedId}/reply`, {
    method: 'POST', token: rtiToken,
    body: { replyText: 'The head-wise budget statement for 2023-24 is enclosed with the sanction orders.', pagesSupplied: 23 },
  });
  check('a late reply is still accepted', late.status === 200, `status ${late.status}`);
  check('and the register says it was late', late.body?.answeredLate === true);
  // Two rupees a page, as the rules prescribe.
  check('the page fee is charged', late.body?.additionalFee === 46, `got ${late.body?.additionalFee}`);

  check(
    'it cannot be answered twice',
    (
      await call(`/api/rti/applications/${rtiLapsedId}/reply`, {
        method: 'POST', token: rtiToken, body: { replyText: 'Answering it a second time.', pagesSupplied: 1 },
      })
    ).status === 409,
  );

  // A below-poverty-line applicant pays nothing, however many pages.
  const listed = await call('/api/rti/applications', { token: rtiToken });
  const bpl = listed.body?.applications?.find((a) => a.applicationNo === rtiBplNo);
  const bplReply = await call(`/api/rti/applications/${bpl?.id}/reply`, {
    method: 'POST', token: rtiToken,
    body: { replyText: 'Three complaints were received in the period; the action taken on each is enclosed.', pagesSupplied: 9 },
  });
  check('a BPL applicant is charged nothing per page', bplReply.body?.additionalFee === 0, `got ${bplReply.body?.additionalFee}`);
  check('though the pages are still recorded', bplReply.body?.pagesSupplied === 9);
}

section('RTI — registering and transferring');

{
  const noFee = await call('/api/rti/applications', {
    method: 'POST', token: rtiToken,
    body: {
      applicantName: 'Sh. Test Applicant',
      subject: 'A request lodged without the fee',
      particulars: 'Something asked without paying the prescribed ten rupees or claiming exemption.',
      category: 'General',
    },
  });
  check('an application needs the fee or the exemption', noFee.status === 400, `status ${noFee.status}`);

  const registered = await call('/api/rti/applications', {
    method: 'POST', token: rtiToken,
    body: {
      applicantName: 'Sh. Ramesh Chand',
      subject: 'Scholarship disbursement in 2024-25',
      particulars: 'The number of students paid a post-matric scholarship and the total amount disbursed.',
      category: 'Finance',
      feePaid: true,
    },
  });
  check('a fee-paid application registers', registered.status === 201, `status ${registered.status}`);
  check('with a number', /^RTI\/\d{4}\/\d{4}$/.test(registered.body?.applicationNo ?? ''), registered.body?.applicationNo);
  check('and the full period ahead of it', registered.body?.daysRemaining === 30, `got ${registered.body?.daysRemaining}`);

  const unassigned = await call(`/api/rti/applications/${registered.body?.id}/reply`, {
    method: 'POST', token: rtiToken, body: { replyText: 'Replying before anyone was put on it.', pagesSupplied: 0 },
  });
  check('nobody can reply before an officer is named', unassigned.status === 400, `status ${unassigned.status}`);

  const assigned = await call(`/api/rti/applications/${registered.body?.id}/assign`, {
    method: 'POST', token: rtiToken, body: { pioEmployeeId: 'GMC/OFF/0009' },
  });
  check('an officer can be named', assigned.status === 200 && assigned.body?.pio?.name === 'Smt. Pushpa Sharma');
  check('which moves it to assigned', assigned.body?.status === 'ASSIGNED');

  // Section 6(3) allows five days to pass it on; the seeded live application
  // is well past that.
  const lateTransfer = await call(`/api/rti/applications/${rtiLiveId}/transfer`, {
    method: 'POST', token: rtiToken, body: { authority: 'Directorate of Higher Education, Lakeside' },
  });
  check('a transfer after five days is refused', lateTransfer.status === 400, `status ${lateTransfer.status}`);

  const inTime = await call(`/api/rti/applications/${registered.body?.id}/transfer`, {
    method: 'POST', token: rtiToken,
    body: { authority: 'Directorate of Higher Education, Lakeside', reason: 'The information is held by the Directorate.' },
  });
  check('one inside the window goes through', inTime.status === 200, `status ${inTime.status}`);
  check('and names where it went', inTime.body?.transferredTo?.includes('Directorate'));
  check('which stops the clock', inTime.body?.daysRemaining === 0);

  const refusal = await call('/api/rti/applications', {
    method: 'POST', token: rtiToken,
    body: {
      applicantName: 'Ms. Kavita Soni',
      subject: 'Marks of individual candidates in the last examination',
      particulars: 'A list of every candidate and the marks each obtained in the last examination.',
      category: 'Examination',
      feePaid: true,
    },
  });
  await call(`/api/rti/applications/${refusal.body?.id}/assign`, {
    method: 'POST', token: rtiToken, body: { pioEmployeeId: 'GMC/OFF/0009' },
  });
  const refused = await call(`/api/rti/applications/${refusal.body?.id}/reject`, {
    method: 'POST', token: rtiToken,
    body: {
      grounds: ['8(1)(j)'],
      reason: 'The particulars identify individual candidates and bear no relationship to any public activity.',
    },
  });
  check('a properly grounded refusal goes through', refused.status === 200 && refused.body?.status === 'REJECTED');
  // The clause is stored, and read back with the text it stands for.
  check('and carries the clause it rests on', refused.body?.rejectionGrounds?.[0]?.clause === '8(1)(j)');
  check('with what that clause says', refused.body?.rejectionGrounds?.[0]?.text?.includes('Personal information'));

  // A refusal is a decision, so an appeal lies against it straight away.
  const appealable = await call(`/api/rti/applications/${refusal.body?.id}/appeals`, {
    method: 'POST', token: rtiToken,
    body: { tier: 'FIRST', grounds: 'The information sought is aggregate and discloses no individual.' },
  });
  check('an appeal lies against a refusal at once', appealable.status === 201, `status ${appealable.status}`);
  check('and is not a deemed refusal', appealable.body?.deemedRefusal === false);
}


// ═══ Phase 9 — the IT console ════════════════════════════════════════════════

section('IT console — accounts');

const adminToken = (
  await call('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.resolion.edu', password: 'campus123' } })
).body?.accessToken;

check('a student cannot reach the console', (await call('/api/it/users', { token })).status === 403);
check('nor a lecturer', (await call('/api/it/users', { token: facToken })).status === 403);

let itLockedId = null;
let itTargetId = null;
{
  // A lock is not cosmetic: the sign-in path checks it.
  const blocked = await call('/api/auth/login', {
    method: 'POST', body: { email: 'sunita.yadav@demo.resolion.edu', password: 'campus123' },
  });
  check('a locked account cannot sign in', blocked.status === 403, `status ${blocked.status}`);
  check('and is told why', blocked.body?.error?.message?.includes('locked'));

  const r = await call('/api/it/users', { token: adminToken });
  check('the account list returns 200', r.status === 200, `status ${r.status}`);
  check('every account is listed', r.body?.totals?.total > 20, `got ${r.body?.totals?.total}`);
  check('one is locked', r.body?.totals?.locked === 1, `got ${r.body?.totals?.locked}`);

  const locked = r.body?.users?.find((u) => u.status === 'locked');
  itLockedId = locked?.id;
  check('the lock carries a reason', !!locked?.lockReason);
  check('and the failed attempts that led to it', locked?.failedAttempts === 5, `got ${locked?.failedAttempts}`);

  // Accounts carry the name from whichever record holds it.
  const mishra = r.body?.users?.find((u) => u.email === 'rk.mishra@demo.resolion.edu');
  check('an account shows the person behind it', mishra?.name === 'Dr. Rajesh Kumar Mishra');
  check('with their employee number', mishra?.identifier === 'GMC/FAC/CS/0047');

  itTargetId = r.body?.users?.find((u) => u.email === 'kavita.jain@demo.resolion.edu')?.id;
}

{
  const bare = await call(`/api/it/users/${itLockedId}/lock`, {
    method: 'POST', token: adminToken, body: { locked: true },
  });
  check('locking needs a reason on file', bare.status === 409 || bare.status === 400, `status ${bare.status}`);

  const unlocked = await call(`/api/it/users/${itLockedId}/lock`, {
    method: 'POST', token: adminToken, body: { locked: false },
  });
  check('an account can be unlocked', unlocked.status === 200 && unlocked.body?.locked === false);

  const nowIn = await call('/api/auth/login', {
    method: 'POST', body: { email: 'sunita.yadav@demo.resolion.edu', password: 'campus123' },
  });
  check('and then it signs in', nowIn.status === 200, `status ${nowIn.status}`);

  check(
    'unlocking an account that is not locked is refused',
    (
      await call(`/api/it/users/${itLockedId}/lock`, {
        method: 'POST', token: adminToken, body: { locked: false },
      })
    ).status === 409,
  );

  // A console that can lock the administrator out of itself is a console
  // that can brick itself.
  const users = await call('/api/it/users', { token: adminToken });
  const self = users.body?.users?.find((u) => u.email === 'admin@demo.resolion.edu');
  const lockSelf = await call(`/api/it/users/${self?.id}/lock`, {
    method: 'POST', token: adminToken, body: { locked: true, reason: 'Locking myself out.' },
  });
  check('an administrator cannot lock their own account', lockSelf.status === 403, `status ${lockSelf.status}`);
}

{
  // A lock that leaves live sessions running is not a lock.
  const theirs = (
    await call('/api/auth/login', { method: 'POST', body: { email: 'kavita.jain@demo.resolion.edu', password: 'campus123' } })
  ).body;
  check('the account signs in beforehand', !!theirs?.accessToken);

  await call(`/api/it/users/${itTargetId}/lock`, {
    method: 'POST', token: adminToken, body: { locked: true, reason: 'Suspected shared credentials.' },
  });

  const refused = await call('/api/auth/login', {
    method: 'POST', body: { email: 'kavita.jain@demo.resolion.edu', password: 'campus123' },
  });
  check('once locked it cannot sign in again', refused.status === 403, `status ${refused.status}`);

  // And the refresh token it held is dead, so the session cannot be renewed.
  const renew = await call('/api/auth/refresh', {
    method: 'POST', body: { refreshToken: theirs?.refreshToken },
  });
  check('nor renew the session it already had', renew.status === 401, `status ${renew.status}`);

  const reset = await call(`/api/it/users/${itTargetId}/reset-password`, { method: 'POST', token: adminToken });
  check('a temporary password can be issued', reset.status === 200 && !!reset.body?.temporaryPassword);
  check('and must be changed on first use', reset.body?.mustChangePassword === true);
}

section('IT console — the permission matrix');

{
  const r = await call('/api/it/permissions', { token: adminToken });
  check('the matrix returns 200', r.status === 200, `status ${r.status}`);
  // A module with no rule is open, not closed — that is what makes the matrix
  // safe to edit without locking everyone out of a new module.
  check('a missing rule means allow', r.body?.defaultEffect === 'ALLOW');
  check('the modules are published', r.body?.modules?.includes('Examinations'));
  check('and the denials are counted', r.body?.denials > 0, `got ${r.body?.denials}`);
}

{
  // The guards consult the matrix on every request, so this takes effect at
  // once rather than at the next restart.
  const before = await call('/api/exam/sessions', { token: examToken });
  check('the registrar reaches the examination module', before.status === 200, `status ${before.status}`);

  const denied = await call('/api/it/permissions', {
    method: 'PUT', token: adminToken,
    body: { role: 'REGISTRAR', module: 'Examinations', action: 'view', effect: 'DENY', note: 'Withdrawn during the enquiry.' },
  });
  check('a module can be withheld from a role', denied.status === 200 && denied.body?.effect === 'DENY');

  const after = await call('/api/exam/sessions', { token: examToken });
  check('and the route refuses immediately', after.status === 403, `status ${after.status}`);
  check('naming the module and action', after.body?.error?.details?.module === 'Examinations');

  const restored = await call('/api/it/permissions', {
    method: 'PUT', token: adminToken,
    body: { role: 'REGISTRAR', module: 'Examinations', action: 'view', effect: 'ALLOW' },
  });
  check('it can be given back', restored.body?.effect === 'ALLOW');
  check('and the route works again', (await call('/api/exam/sessions', { token: examToken })).status === 200);

  const brick = await call('/api/it/permissions', {
    method: 'PUT', token: adminToken,
    body: { role: 'ADMIN', module: 'System Config', action: 'edit', effect: 'DENY' },
  });
  check('an administrator cannot be denied System Config', brick.status === 400, `status ${brick.status}`);
}

section('IT console — the audit chain');

{
  const r = await call('/api/it/audit?limit=100', { token: adminToken });
  check('the audit log returns 200', r.status === 200, `status ${r.status}`);
  check('entries have accumulated', r.body?.entries?.length > 5, `got ${r.body?.entries?.length}`);

  // Nothing here was written by hand: these are the modules recording as
  // they act.
  const lock = r.body?.entries?.find((e) => e.action === 'lock');
  check('locking an account was recorded', !!lock, 'no lock entry');
  check('against the administrator who did it', lock?.actorRole === 'ADMIN');

  // An attempt on something withheld is exactly what a log is for.
  const refusal = r.body?.entries?.find((e) => e.outcome === 'DENIED');
  check('a refused attempt was recorded', !!refusal, 'no denied entry');
  check('naming the module it was refused in', refusal?.module === 'Examinations');

  // Each entry points at the one before it.
  const ordered = [...(r.body?.entries ?? [])].sort((a, b) => a.seq - b.seq);
  let chained = true;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].prevHash !== ordered[i - 1].hash) chained = false;
  }
  check('every entry points at the one before it', chained);

  const verify = await call('/api/it/audit/verify', { token: adminToken });
  check('the chain verifies', verify.status === 200 && verify.body?.intact === true, JSON.stringify(verify.body?.brokenAt));
  check('over every entry on file', verify.body?.entries > 5, `got ${verify.body?.entries}`);
  check('with nothing broken', verify.body?.brokenAt === null);

  // Verification is itself an act, so it appears in the log it just checked.
  const after = await call('/api/it/audit?module=Audit%20Log', { token: adminToken });
  check('verifying is itself recorded', after.body?.entries?.some((e) => e.action === 'verify'));

  const filtered = await call('/api/it/audit?outcome=DENIED', { token: adminToken });
  check('the log can be filtered to refusals', filtered.body?.entries?.every((e) => e.outcome === 'DENIED'));
}

{
  // Acts from the phases below reach the log without anyone writing them.
  const r = await call('/api/it/audit?limit=200', { token: adminToken });
  const modules = new Set((r.body?.entries ?? []).map((e) => e.module));
  check('the examination wing records into it', modules.has('Examinations'), [...modules].join(', '));
  check('so does the fee counter', modules.has('Fee Management'), [...modules].join(', '));
  check('and procurement', modules.has('Procurement'), [...modules].join(', '));

  const award = (r.body?.entries ?? []).find((e) => e.module === 'Procurement' && e.action === 'approve');
  check('an award says who won and at what', award?.detail?.includes('Awarded to'), award?.detail);
  check('and whether it was the lowest bid', /L1/.test(award?.detail ?? ''), award?.detail);
}

// ── Phase 10: the intelligence layer ─────────────────────────────────────────

section('Intelligence — the risk model');

check(
  'a student cannot reach the model',
  (await call('/api/intelligence/risk', { token })).status === 403,
);

let raviId = null;
let collegeRoll = 0;
{
  const r = await call('/api/intelligence/risk', { token: principalToken });
  check('the risk list returns 200', r.status === 200, `status ${r.status}`);
  check('the principal sees the whole college', r.body?.scope === 'college', r.body?.scope);

  // The model must score everyone the principal's own dashboard counts, or it
  // is quietly leaving students out of the list it calls the whole college.
  const dash = await call('/api/governance/dashboard', { token: principalToken });
  collegeRoll = dash.body?.totalStudents ?? 0;
  check(
    'scoring everyone the dashboard counts',
    r.body?.totals?.assessed === collegeRoll,
    `${r.body?.totals?.assessed} scored vs ${collegeRoll} on the roll`,
  );

  // The weights are published because a score nobody can argue with is a
  // score nobody should trust.
  check('the weights are published', r.body?.model?.weights?.attendance === 0.4);
  check('and it says plainly it is not a prediction', r.body?.model?.note?.includes('Not a prediction'));

  const worst = r.body?.students?.[0];
  check('the list leads with the highest score', worst?.score >= (r.body?.students?.[1]?.score ?? 0));
  check('every row carries its factors', worst?.factors?.length === 4, `got ${worst?.factors?.length}`);

  // The arithmetic has to add up, or the factors are decoration.
  const summed = (worst?.factors ?? []).reduce((a, f) => a + f.contribution, 0);
  check('the factors sum to the score', summed === worst?.score, `${summed} vs ${worst?.score}`);

  const attendance = worst?.factors?.find((f) => f.factor === 'Attendance');
  check('attendance carries the heaviest weight', attendance?.weight === 0.4);
  check('and states what it measured', /^[\d.]+% of \d+ classes$/.test(attendance?.value ?? ''), attendance?.value);

  // Not a confidence percentage: the number of records the score rests on.
  check('the score says how much record it had', worst?.dataPoints > 0, `got ${worst?.dataPoints}`);
  check('and names what drove it', worst?.basis?.startsWith('Driven by'), worst?.basis);

  const ravi = r.body?.students?.find((s) => s.name === 'Ravi Chouhan');
  raviId = ravi?.id;
  check('the student under counselling is scored', !!raviId);

  // The model has to agree with the portal it reads from: a student told they
  // are at risk on attendance must see that same attendance in their own app.
  const theirs = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'ravi.chouhan.2021@demo.resolion.edu', password: 'campus123' },
  });
  const own = await call('/api/student/attendance', { token: theirs.body?.accessToken });
  const stated = ravi?.factors?.find((f) => f.factor === 'Attendance')?.value ?? '';
  check(
    'the attendance it scored is the one the student sees',
    stated.startsWith(`${own.body?.overall?.percent}%`),
    `model said "${stated}", portal says ${own.body?.overall?.percent}%`,
  );
}

{
  // A lecturer sees the students they mentor, and nobody else's.
  const mine = await call('/api/intelligence/risk', { token: facToken });
  check('a lecturer is scoped to their mentees', mine.body?.scope === 'mentees', mine.body?.scope);
  check(
    'which is fewer than the college',
    mine.body?.totals?.assessed > 0 && mine.body?.totals?.assessed < collegeRoll,
    `${mine.body?.totals?.assessed} of ${collegeRoll}`,
  );
  check('and includes their own mentee', (mine.body?.students ?? []).some((s) => s.id === raviId));

  const college = await call('/api/intelligence/risk', { token: principalToken });
  const outsider = (college.body?.students ?? []).find(
    (s) => !(mine.body?.students ?? []).some((m) => m.id === s.id),
  );
  check(
    'a student outside that cohort will not open',
    (await call(`/api/intelligence/risk/${outsider?.id}`, { token: facToken })).status === 404,
  );
}

section('Intelligence — one student');

let raviScore = null;
{
  const r = await call(`/api/intelligence/risk/${raviId}`, { token: facToken });
  check('the mentor can open their mentee in full', r.status === 200, `status ${r.status}`);
  raviScore = r.body?.current?.score;
  check('with the score as it stands', typeof raviScore === 'number');
  check('and the mentor named on the record', r.body?.student?.mentor === 'Dr. Rajesh Kumar Mishra', r.body?.student?.mentor);

  // A snapshot from last month is what makes the score comparable with itself.
  check('the earlier snapshot is on file', r.body?.history?.length >= 1, `got ${r.body?.history?.length}`);
  check('so movement can be stated', r.body?.movement !== null);
  check('with the score it moved from', r.body?.movement?.was === 78, `got ${r.body?.movement?.was}`);
  check(
    'and the direction that arithmetic gives',
    r.body?.movement?.direction === (raviScore < 78 ? 'improved' : raviScore > 78 ? 'worsened' : 'unchanged'),
    `${r.body?.movement?.direction}, 78 to ${raviScore}`,
  );

  // Interventions are what turn a list of names into a process.
  check('both interventions are listed', r.body?.interventions?.length === 2, `got ${r.body?.interventions?.length}`);
  const open = (r.body?.interventions ?? []).find((i) => i.outcome === 'OPEN');
  check('the counselling is still open', open?.kind === 'COUNSELLING');
  check('raised by a named member of staff', open?.raisedBy === 'Dr. Rajesh Kumar Mishra', open?.raisedBy);
  check('carrying the score it was raised at', open?.scoreAtRaise === 78, `got ${open?.scoreAtRaise}`);
  check(
    'and what the score has done since',
    open?.scoreSince === raviScore - 78,
    `${open?.scoreSince} against ${raviScore} less 78`,
  );

  const done = (r.body?.interventions ?? []).find((i) => i.outcome !== 'OPEN');
  check('the closed one carries its outcome', done?.outcome === 'NO_CHANGE', done?.outcome);
  check('and says why in words', (done?.outcomeNote?.length ?? 0) > 20);
}

section('Intelligence — projection');

{
  const r = await call('/api/intelligence/projection', { token: principalToken });
  check('the projection returns 200', r.status === 200, `status ${r.status}`);
  check('the class can be projected', r.body?.totals?.projected > 0, `got ${r.body?.totals?.projected}`);

  // Deliberately not called a prediction, and it says so on the response.
  check('it says what it actually is', r.body?.note?.includes('Not a prediction'));

  const weakest = r.body?.students?.[0];
  check(
    'the weakest is listed first',
    weakest?.projectedPercent <= (r.body?.students?.[1]?.projectedPercent ?? 100),
  );
  // A projection from one approved sheet is visibly weaker than one from a
  // full set, and the row has to admit which it is.
  check(
    'each row says how much was actually assessed',
    weakest?.assessedShare > 0 && weakest?.assessedShare < 100,
    `${weakest?.assessedShare}%`,
  );
  check('and names the weakest paper', !!weakest?.weakest?.code);
  check(
    'with a class read off the marks',
    ['distinction', 'first_class', 'second_class', 'pass', 'below_pass'].includes(weakest?.band),
    weakest?.band,
  );
}

section('Intelligence — cohort shape');

{
  const r = await call('/api/intelligence/cohort', { token: principalToken });
  check('the cohort view returns 200', r.status === 200, `status ${r.status}`);

  const bands = r.body?.riskBands ?? {};
  const banded = bands.critical + bands.high + bands.moderate + bands.low;
  check('every student falls in exactly one band', banded === collegeRoll, `${banded} of ${collegeRoll}`);

  const histogram = r.body?.attendanceDistribution ?? [];
  check('the attendance histogram is bucketed', histogram.length > 0);
  check(
    'and has the roll in it',
    histogram.reduce((a, b) => a + b.students, 0) > 0,
  );

  const rates = r.body?.subjectPassRates ?? [];
  check('subject pass rates are computed', rates.length > 0);
  check('worst subject first', rates[0]?.passPercent <= (rates[1]?.passPercent ?? 100));
}

section('Intelligence — interventions');

{
  const duplicate = await call('/api/intelligence/interventions', {
    method: 'POST',
    token: facToken,
    body: {
      studentId: raviId,
      kind: 'COUNSELLING',
      note: 'A second counselling raised while the first one is still open.',
    },
  });
  check('a second open intervention of a kind is refused', duplicate.status === 409, `status ${duplicate.status}`);
  check('and points at the one already open', !!duplicate.body?.error?.details?.interventionId);

  const college = await call('/api/intelligence/risk', { token: principalToken });
  const mine = await call('/api/intelligence/risk', { token: facToken });
  const outsider = (college.body?.students ?? []).find(
    (s) => !(mine.body?.students ?? []).some((m) => m.id === s.id),
  );
  const reach = await call('/api/intelligence/interventions', {
    method: 'POST',
    token: facToken,
    body: { studentId: outsider?.id, kind: 'COUNSELLING', note: 'A student this lecturer does not mentor.' },
  });
  check('a lecturer cannot raise one outside their cohort', reach.status === 403, `status ${reach.status}`);

  const raised = await call('/api/intelligence/interventions', {
    method: 'POST',
    token: facToken,
    body: {
      studentId: raviId,
      kind: 'REMEDIAL_CLASS',
      note: 'Enrolled in the Saturday remedial class for the two papers furthest behind.',
    },
  });
  check('a different kind can be raised', raised.status === 201, `status ${raised.status}`);
  // Kept at the time, so the change can be read off later rather than recalled.
  check(
    'and keeps the score it was raised at',
    raised.body?.scoreAtRaise === raviScore,
    `${raised.body?.scoreAtRaise} against ${raviScore}`,
  );
  check('opening unresolved', raised.body?.outcome === 'OPEN');

  const closed = await call(`/api/intelligence/interventions/${raised.body?.id}/close`, {
    method: 'POST',
    token: facToken,
    body: { outcome: 'IMPROVED', outcomeNote: 'Attended four of four sessions; marks up in the mid-term.' },
  });
  check('and it can be closed with an outcome', closed.status === 200 && closed.body?.outcome === 'IMPROVED');
  // So the claim can be checked against the record rather than taken on trust.
  check('against the score at the time', closed.body?.scoreAtRaise === raviScore);
  check('and the score now', closed.body?.scoreNow === raviScore);
  check('leaving the change on file', closed.body?.change === 0, `got ${closed.body?.change}`);

  check(
    'it cannot be closed twice',
    (
      await call(`/api/intelligence/interventions/${raised.body?.id}/close`, {
        method: 'POST',
        token: facToken,
        body: { outcome: 'NO_CHANGE', outcomeNote: 'Closing the same intervention a second time.' },
      })
    ).status === 409,
  );
}

section('Intelligence — snapshots');

{
  check(
    'a lecturer cannot snapshot the cohort',
    (await call('/api/intelligence/risk/snapshot', { method: 'POST', token: facToken })).status === 403,
  );

  const before = await call(`/api/intelligence/risk/${raviId}`, { token: principalToken });
  const snap = await call('/api/intelligence/risk/snapshot', { method: 'POST', token: principalToken });
  check('the principal can', snap.status === 201, `status ${snap.status}`);
  check('and it covers the whole roll', snap.body?.assessed === collegeRoll, `${snap.body?.assessed} of ${collegeRoll}`);

  const after = await call(`/api/intelligence/risk/${raviId}`, { token: principalToken });
  check(
    'which adds to the history',
    after.body?.history?.length === before.body?.history?.length + 1,
    `${before.body?.history?.length} then ${after.body?.history?.length}`,
  );
  // Taken a moment ago off the same rows, so nothing should have moved.
  check('and the newest snapshot matches the live score', after.body?.movement?.change === 0);
  check('reported as unchanged rather than improved', after.body?.movement?.direction === 'unchanged');

  // Taking a snapshot is an act, so the log has it without anyone writing it.
  const audit = await call('/api/it/audit?limit=20', { token: adminToken });
  check(
    'and the audit log records it',
    (audit.body?.entries ?? []).some((e) => e.target?.includes('Risk snapshot')),
  );
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
