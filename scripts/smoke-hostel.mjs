/**
 * End-to-end test of hostel management against a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-hostel.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (email) => {
  const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return r.body.accessToken;
};
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const registrar = await login('registrar@demo.resolion.edu');
const office = await login('pushpa.sharma@demo.resolion.edu');
const priya = await login('priya.sharma.2021@demo.resolion.edu');
const rahul = await login('rahul.verma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

console.log('\nSetting up hostels and rooms');
let ov = await call('/api/hostel/overview', { token: office });
check('the overview lists the hostels', ov.status === 200 && ov.body.hostels.length === 2, msg(ov));
const GH = ov.body.hostels.find((h) => h.code === 'GH');
const BH = ov.body.hostels.find((h) => h.code === 'BH');
let r = await call('/api/hostel/hostels', { method: 'POST', token: office, body: { code: 'PG', name: 'Postgraduate Hostel', gender: 'CO_ED' } });
check('the office cannot add a hostel', r.status === 403, msg(r));
r = await call('/api/hostel/hostels', { method: 'POST', token: registrar, body: { code: 'PG', name: 'Postgraduate Hostel', gender: 'CO_ED', amenities: ['Wi-Fi', 'Kitchenette'], messRatePerMonth: 3500, wardenName: 'Dr. R. Iyer', wardenPhone: '+91 98765 43210' } });
check('the registrar adds a third hostel', r.status === 201, msg(r));
const PG = r.body;
r = await call('/api/hostel/hostels', { method: 'POST', token: registrar, body: { code: 'PG', name: 'Another', gender: 'BOYS' } });
check('a duplicate hostel code is refused', r.status === 409, msg(r));
r = await call(`/api/hostel/hostels/${PG.id}/rooms/bulk`, { method: 'POST', token: registrar, body: { fromFloor: 0, toFloor: 1, roomsPerFloor: 5, capacity: 2, attachedBath: true, amenities: ['Bed', 'Wardrobe'], rentPerSemester: 18000 } });
check('rooms are added floor by floor', r.status === 201 && r.body.added === 10, msg(r));
r = await call(`/api/hostel/hostels/${PG.id}/rooms/bulk`, { method: 'POST', token: registrar, body: { fromFloor: 1, toFloor: 1, roomsPerFloor: 5, capacity: 2 } });
check('adding the same rooms again skips them', r.status === 201 && r.body.added === 0 && r.body.skipped === 5, msg(r));
r = await call(`/api/hostel/hostels/${PG.id}/rooms`, { method: 'POST', token: registrar, body: { roomNo: 'S1', floor: 0, capacity: 1, ac: true, rentPerSemester: 30000 } });
check('a single room is added', r.status === 201 && r.body.beds.length === 1, msg(r));
const spare = r.body;
r = await call(`/api/hostel/hostels/${PG.id}/rooms`, { method: 'POST', token: registrar, body: { roomNo: 'S1', floor: 0, capacity: 1 } });
check('a duplicate room number is refused', r.status === 409, msg(r));
r = await call(`/api/hostel/rooms/${spare.id}`, { method: 'DELETE', token: registrar });
check('an unused room can be deleted', r.status === 204, msg(r));

console.log('\nRooms and their residents');
let ghRooms = (await call(`/api/hostel/hostels/${GH.id}/rooms`, { token: office })).body;
const r104 = ghRooms.find((x) => x.roomNo === '104');
check("Priya's room shows her and her roommate", r104.occupied === 2 && r104.beds.some((b) => b.student?.name === 'Priya Sharma'), JSON.stringify(r104.beds));
r = await call(`/api/hostel/rooms/${r104.id}`, { method: 'PATCH', token: registrar, body: { capacity: 1 } });
check('a room cannot shrink below its residents', r.status === 409, msg(r));
r = await call(`/api/hostel/rooms/${r104.id}`, { method: 'PATCH', token: office, body: { status: 'BLOCKED' } });
check('an occupied room cannot be blocked', r.status === 409, msg(r));
r = await call(`/api/hostel/rooms/${r104.id}`, { method: 'PATCH', token: office, body: { notes: 'Inspected; all fittings in order' } });
check('an edit changes only what was sent', r.status === 200 && r.body.rentPerSemester === r104.rentPerSemester && r.body.amenities.length === r104.amenities.length && r.body.capacity === 2, msg(r));
r = await call(`/api/hostel/hostels/${PG.id}`, { method: 'PATCH', token: registrar, body: { wardenName: 'Dr. Radha Iyer' } });
check("editing a hostel keeps its amenities and mess rate", r.status === 200 && r.body.amenities.length === 2 && r.body.messRatePerMonth === 3500, msg(r));
r = await call(`/api/hostel/rooms/${r104.id}`, { method: 'PATCH', token: office, body: { rentPerSemester: 1 } });
check("the office cannot change a room's rent", r.status === 403, msg(r));
r = await call(`/api/hostel/rooms/${r104.id}`, { method: 'DELETE', token: registrar });
check('a room with history cannot be deleted', r.status === 409, msg(r));
const maint = ghRooms.find((x) => x.status === 'MAINTENANCE');

console.log('\nApplications and allotment');
let apps = (await call('/api/hostel/applications?status=PENDING', { token: office })).body;
check('the queue is ordered by priority', apps.length === 3 && apps[0].priorityScore >= apps[1].priorityScore, apps.map((a) => a.priorityScore).join(','));
const neha = apps.find((a) => a.student.name === 'Neha Gupta');
const bhRoom = (await call(`/api/hostel/hostels/${BH.id}/rooms`, { token: office })).body.find((x) => x.occupied === 0 && x.status === 'AVAILABLE');
r = await call(`/api/hostel/applications/${neha.id}/decide`, { method: 'POST', token: office, body: { action: 'ALLOT', roomId: bhRoom.id } });
check("a girl cannot be put in the boys' hostel", r.status === 409 && /boys/i.test(r.body.error.message), msg(r));
r = await call(`/api/hostel/applications/${neha.id}/decide`, { method: 'POST', token: office, body: { action: 'ALLOT', roomId: r104.id, bed: 'A' } });
check('a taken bed cannot be given', r.status === 409, msg(r));
r = await call(`/api/hostel/applications/${neha.id}/decide`, { method: 'POST', token: office, body: { action: 'ALLOT', roomId: maint.id } });
check('a room under maintenance cannot be given', r.status === 409, msg(r));
const ghFree = ghRooms.find((x) => x.status === 'AVAILABLE' && x.occupied === 0 && x.capacity === 2);
r = await call(`/api/hostel/applications/${neha.id}/decide`, { method: 'POST', token: office, body: { action: 'ALLOT', roomId: ghFree.id, note: 'Distance' } });
check('the office allots a bed', r.status === 200 && r.body.status === 'ALLOTTED' && r.body.bed === 'A', msg(r));
r = await call(`/api/hostel/applications/${neha.id}/decide`, { method: 'POST', token: office, body: { action: 'REJECT', note: 'Changed my mind' } });
check('a decided application cannot be decided again', r.status === 409, msg(r));
const priyaId = r104.beds.find((b) => b.student?.name === 'Priya Sharma').student.id;
r = await call('/api/hostel/allotments', { method: 'POST', token: office, body: { studentId: priyaId, roomId: ghFree.id } });
check('a student already in a bed cannot be given another', r.status === 409, msg(r));
r = await call('/api/hostel/applications/auto-allot', { method: 'POST', token: office, body: { dryRun: true } });
const preview = r.body.plan;
check('the allotment run previews first, writing nothing', r.status === 200 && r.body.dryRun && preview.length === 2, msg(r));
const ravi = preview.find((p) => p.student === 'Ravi Chouhan');
check('the special-needs applicant is first and placed low', preview[0].student === 'Ravi Chouhan' && ravi.room && /\/(1|G)\d\d$/.test(ravi.room), JSON.stringify(ravi));
r = await call('/api/hostel/applications/auto-allot', { method: 'POST', token: office, body: { dryRun: false } });
check('the run allots everyone it planned', r.status === 200 && r.body.allotted === 2, msg(r));

console.log("The student's own hostel");
let me = await call('/api/hostel/me', { token: priya });
check('the student sees her room, bed and roommate', me.status === 200 && me.body.allotment.room.roomNo === '104' && me.body.allotment.roommates.length === 1, msg(me));
check('and the week\'s mess menu', me.body.menu.length === 7);
check("only girls' and co-ed hostels are offered to her", me.body.hostels.every((h) => h.gender !== 'BOYS') && me.body.hostels.some((h) => h.code === 'PG'));
r = await call('/api/hostel/me/applications', { method: 'POST', token: priya, body: { distanceKm: 20, reason: 'I would like to apply again please' } });
check('a resident cannot apply again', r.status === 409, msg(r));
const rahulMe = await call('/api/hostel/me', { token: rahul });
check("a boy is offered the boys' hostel, not the girls'", rahulMe.body.hostels.some((h) => h.code === 'BH') && !rahulMe.body.hostels.some((h) => h.code === 'GH'));
const parentMe = await call('/api/hostel/me', { token: parent });
check("the parent sees the ward's hostel", parentMe.status === 200 && parentMe.body.allotment?.room.roomNo === '104', msg(parentMe));

console.log('\nComplaints');
r = await call('/api/hostel/me/complaints', { method: 'POST', token: priya, body: { category: 'Ragging', description: 'Seniors are making first-years stand outside at night.', priority: 'LOW' } });
check('a ragging complaint is always urgent', r.status === 201 && r.body.priority === 'URGENT', msg(r));
r = await call('/api/hostel/me/complaints', { method: 'POST', token: priya, body: { category: 'Electrical', description: 'The tube light in room 104 does not work.' } });
const tube = r.body;
check('the student raises a complaint with a service deadline', r.status === 201 && tube.ticketNo.startsWith('HC/GH/') && tube.dueBy, msg(r));
r = await call(`/api/hostel/complaints/${tube.id}/update`, { method: 'POST', token: office, body: { status: 'ASSIGNED' } });
check('assigning needs a name', r.status === 400, msg(r));
r = await call(`/api/hostel/complaints/${tube.id}/update`, { method: 'POST', token: office, body: { status: 'ASSIGNED', assignedTo: 'Electrician — Mohan' } });
check('the office assigns it', r.status === 200 && r.body.status === 'ASSIGNED', msg(r));
r = await call(`/api/hostel/complaints/${tube.id}/update`, { method: 'POST', token: office, body: { status: 'RESOLVED' } });
check('resolving needs a word to the student', r.status === 400, msg(r));
r = await call(`/api/hostel/complaints/${tube.id}/update`, { method: 'POST', token: office, body: { status: 'RESOLVED', response: 'Tube light and starter replaced.' } });
check('the office resolves it', r.status === 200 && r.body.status === 'RESOLVED', msg(r));
r = await call(`/api/hostel/me/complaints/${tube.id}/feedback`, { method: 'POST', token: priya, body: { reopen: true } });
check('reopening needs a reason', r.status === 400, msg(r));
r = await call(`/api/hostel/me/complaints/${tube.id}/feedback`, { method: 'POST', token: priya, body: { reopen: true, feedback: 'It flickers again at night.' } });
check('the student reopens it', r.status === 200 && r.body.status === 'OPEN' && r.body.reopened === 1, msg(r));
await call(`/api/hostel/complaints/${tube.id}/update`, { method: 'POST', token: office, body: { status: 'RESOLVED', response: 'Choke replaced as well.' } });
r = await call(`/api/hostel/me/complaints/${tube.id}/feedback`, { method: 'POST', token: priya, body: { reopen: false, rating: 5, feedback: 'Fixed, thank you' } });
check('the student closes it with a rating', r.status === 200 && r.body.status === 'CLOSED' && r.body.rating === 5, msg(r));
r = await call('/api/hostel/me/complaints', { method: 'POST', token: await login('sunita.yadav.2021@demo.resolion.edu'), body: { category: 'Other', description: 'Not a resident, so this must be refused.' } });
check('a non-resident cannot raise a hostel complaint', r.status === 409, msg(r));

console.log('\nLeave, parent consent and the gate');
const seeded = me.body.leaves.find((l) => l.status === 'AWAITING_PARENT');
r = await call(`/api/hostel/leaves/${seeded.id}/decide`, { method: 'POST', token: office, body: { approve: true } });
check('the warden cannot approve before the parent consents', r.status === 409, msg(r));
r = await call(`/api/hostel/me/leaves/${seeded.id}/consent`, { method: 'POST', token: priya, body: { consent: true } });
check('the student cannot consent for her parent', r.status === 403, msg(r));
r = await call(`/api/hostel/me/leaves/${seeded.id}/consent`, { method: 'POST', token: parent, body: { consent: true, note: 'Her uncle will pick her up' } });
check('the parent consents', r.status === 200 && r.body.status === 'PENDING', msg(r));
r = await call(`/api/hostel/leaves/${seeded.id}/decide`, { method: 'POST', token: office, body: { approve: true, note: 'Return by 8 pm' } });
check('the warden approves', r.status === 200 && r.body.status === 'APPROVED', msg(r));
r = await call(`/api/hostel/leaves/${seeded.id}/gate`, { method: 'POST', token: office, body: { event: 'OUT' } });
check('the gate will not let her out days early', r.status === 409, msg(r));
r = await call('/api/hostel/me/leaves', { method: 'POST', token: priya, body: { kind: 'GATE_PASS', from: iso(10 * 60_000), to: iso(26 * 3_600_000), destination: 'City market', reason: 'Buying books' } });
check('a gate pass cannot run overnight', r.status === 400, msg(r));
const from = new Date(); from.setMinutes(from.getMinutes() + 10);
const to = new Date(from.getTime() + 60 * 60_000);
if (new Date(from.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) === new Date(to.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)) {
  r = await call('/api/hostel/me/leaves', { method: 'POST', token: priya, body: { kind: 'GATE_PASS', from: from.toISOString(), to: to.toISOString(), destination: 'City market', reason: 'Buying books' } });
  check('a same-day gate pass needs no parent', r.status === 201 && r.body.status === 'PENDING' && r.body.parentConsent === 'NOT_REQUIRED', msg(r));
  const gp = r.body;
  r = await call('/api/hostel/me/leaves', { method: 'POST', token: priya, body: { kind: 'GATE_PASS', from: from.toISOString(), to: to.toISOString(), destination: 'Again', reason: 'Overlapping pass' } });
  check('an overlapping pass is refused', r.status === 409, msg(r));
  await call(`/api/hostel/leaves/${gp.id}/decide`, { method: 'POST', token: office, body: { approve: true } });
  r = await call(`/api/hostel/passes/${encodeURIComponent(gp.passNo)}`, { token: office });
  check('the gate finds the pass by its number', r.status === 200 && r.body.status === 'APPROVED', msg(r));
  r = await call(`/api/hostel/leaves/${gp.id}/gate`, { method: 'POST', token: office, body: { event: 'OUT' } });
  check('the gate lets her out', r.status === 200 && r.body.status === 'OUT', msg(r));
  ov = await call('/api/hostel/overview', { token: office });
  check('the overview counts her out', ov.body.totals.studentsOut >= 1);
  r = await call(`/api/hostel/leaves/${gp.id}/gate`, { method: 'POST', token: office, body: { event: 'IN' } });
  check('and back in, on time', r.status === 200 && r.body.status === 'RETURNED' && r.body.late === false, msg(r));
} else {
  console.log('  (skipping the same-day gate pass: too close to midnight IST)');
}

console.log('\nVisitors and the night roll call');
r = await call('/api/hostel/visitors', { method: 'POST', token: office, body: { studentId: priyaId, visitorName: 'Meena Sharma', relation: 'Mother', phone: '+91 98260 12345', idProof: 'Aadhaar ••••4321', purpose: 'Bringing winter clothes' } });
check('a visitor is signed in', r.status === 201, msg(r));
const visit = r.body;
r = await call('/api/hostel/visitors?inside=true', { token: office });
check('and shows as inside', r.body.some((v) => v.id === visit.id));
r = await call(`/api/hostel/visitors/${visit.id}/out`, { method: 'POST', token: office });
check('and is signed out', r.status === 200 && r.body.outAt, msg(r));
r = await call(`/api/hostel/visitors/${visit.id}/out`, { method: 'POST', token: office });
check('signing out twice is refused', r.status === 409, msg(r));
const roll = await call(`/api/hostel/rollcall?hostelId=${GH.id}`, { token: office });
check('the roll call lists every resident', roll.status === 200 && roll.body.residents.length >= 4, msg(roll));
r = await call('/api/hostel/rollcall', { method: 'POST', token: office, body: { hostelId: GH.id, date: roll.body.date, entries: [{ studentId: 'not-a-resident', status: 'PRESENT' }] } });
check('a stranger cannot be marked', r.status === 400, msg(r));
r = await call('/api/hostel/rollcall', { method: 'POST', token: office, body: { hostelId: GH.id, date: roll.body.date, entries: roll.body.residents.map((x, i) => ({ studentId: x.id, status: x.status ?? (i === 0 ? 'ABSENT' : 'PRESENT') })) } });
check('the roll call is saved', r.status === 200 && r.body.marked === roll.body.residents.length, msg(r));
r = await call(`/api/hostel/rollcall?hostelId=${GH.id}`, { token: office });
check('and reads back as marked', r.body.marked && r.body.residents.every((x) => x.status), msg(r));

console.log('\nMess and billing');
r = await call('/api/hostel/mess/menu', { method: 'PUT', token: office, body: { hostelId: GH.id, days: [{ day: 0, breakfast: 'Aloo paratha, curd', lunch: 'Special thali', snacks: 'Fruit', dinner: 'Khichdi, kadhi' }] } });
check('the office updates the menu', r.status === 200 && r.body.find((d) => d.day === 0).breakfast === 'Aloo paratha, curd', msg(r));
const month = new Date().toISOString().slice(0, 7);
const due = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
r = await call('/api/hostel/billing', { method: 'POST', token: office, body: { hostelId: GH.id, kind: 'MESS', month, dueDate: due } });
check('the office cannot run billing', r.status === 403, msg(r));
r = await call('/api/hostel/billing', { method: 'POST', token: registrar, body: { hostelId: GH.id, kind: 'MESS', month, dueDate: due } });
check('the mess bill is charged to every resident', r.status === 201 && r.body.charged >= 4 && r.body.total === r.body.charged * 3200, msg(r));
r = await call('/api/hostel/billing', { method: 'POST', token: registrar, body: { hostelId: GH.id, kind: 'MESS', month, dueDate: due } });
check('the same month cannot be billed twice', r.status === 409, msg(r));
r = await call('/api/hostel/billing', { method: 'POST', token: registrar, body: { hostelId: GH.id, kind: 'RENT', dueDate: due } });
check('room rent is charged at each room\'s rate', r.status === 201 && r.body.charged >= 4, msg(r));
me = await call('/api/hostel/me', { token: priya });
check('the student sees the hostel charges', me.body.dues.some((d) => d.head.startsWith('Hostel mess')) && me.body.dues.some((d) => d.head.startsWith('Hostel room rent')), JSON.stringify(me.body.dues));
const fees = await call('/api/student/fees', { token: priya });
check('and they are on her fee account', fees.body.items.some((i) => i.head.startsWith('Hostel mess')), msg(fees));

console.log('\nRoom change, transfer and vacating');
const target = me.body.changeOptions.find((o) => o.freeBeds > 0);
r = await call('/api/hostel/me/room-change', { method: 'POST', token: priya, body: { preferredRoomId: target.id, reason: 'Would like a quieter room near the stairs' } });
check('the student asks to move', r.status === 201, msg(r));
const rc = r.body;
r = await call('/api/hostel/me/room-change', { method: 'POST', token: priya, body: { reason: 'A second request while one is open' } });
check('only one request at a time', r.status === 409, msg(r));
r = await call(`/api/hostel/room-changes/${rc.id}/decide`, { method: 'POST', token: office, body: { approve: true, note: 'Approved; room 104 is crowded' } });
check('the office approves and moves her', r.status === 200, msg(r));
me = await call('/api/hostel/me', { token: priya });
check('she is now in the new room', me.body.allotment.room.roomNo === target.roomNo, me.body.allotment?.room.roomNo);
ghRooms = (await call(`/api/hostel/hostels/${GH.id}/rooms`, { token: office })).body;
check('her old bed is free', ghRooms.find((x) => x.roomNo === '104').occupied === 1);
const residents = (await call(`/api/hostel/residents?hostelId=${GH.id}`, { token: office })).body;
const anjali = residents.find((x) => x.student.name === 'Anjali Patel');
r = await call(`/api/hostel/allotments/${anjali.id}/transfer`, { method: 'POST', token: office, body: { roomId: (await call(`/api/hostel/hostels/${BH.id}/rooms`, { token: office })).body[0].id, reason: 'Testing the gender rule on transfer' } });
check('a transfer still keeps to the gender rule — and changes nothing', r.status === 409, msg(r));
const still = (await call(`/api/hostel/residents?hostelId=${GH.id}`, { token: office })).body.find((x) => x.student.name === 'Anjali Patel');
check('Anjali still has her bed after the refused transfer', !!still && still.id === anjali.id);
r = await call(`/api/hostel/allotments/${anjali.id}/vacate`, { method: 'POST', token: office, body: { reason: 'Moved to a flat with family' } });
check('the office vacates a bed', r.status === 200, msg(r));
r = await call(`/api/hostel/allotments/${anjali.id}/vacate`, { method: 'POST', token: office, body: { reason: 'Again' } });
check('vacating twice is refused', r.status === 409, msg(r));
r = await call(`/api/hostel/hostels/${GH.id}`, { method: 'PATCH', token: registrar, body: { active: false } });
check('a hostel with residents cannot be closed', r.status === 409, msg(r));
r = await call(`/api/hostel/hostels/${GH.id}`, { method: 'PATCH', token: registrar, body: { gender: 'BOYS' } });
check("a girls' hostel with girls in it cannot become a boys' hostel", r.status === 409, msg(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
