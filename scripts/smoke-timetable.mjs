/**
 * End-to-end test of timetable management against a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-timetable.mjs
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
const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const all = (week) => week.days.flatMap((d) => d.classes);

const registrar = await login('registrar@demo.resolion.edu');
const office = await login('pushpa.sharma@demo.resolion.edu');
const mishra = await login('rk.mishra@demo.resolion.edu');
const hod = await login('ml.gupta@demo.resolion.edu');
const kavita = await login('kavita.jain@demo.resolion.edu');
const priya = await login('priya.sharma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

// Next week: every class in it is still to come.
const nextWeek = addDays(istDay(0), 7);

console.log('\nThe dated week');
let r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
check('the student sees six days of next week', r.status === 200 && r.body.days.length === 6, msg(r));
const pWeek = r.body;
check('each day carries its date', pWeek.days.every((d, i) => d.date === addDays(pWeek.weekOf, i)));
check('only this term\'s subjects appear', all(pWeek).every((c) => c.code.startsWith('BCA5')), JSON.stringify([...new Set(all(pWeek).map((c) => c.code))]));
check('the bell schedule comes with it', pWeek.periods.length === 8);
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: parent });
check('the parent sees the ward\'s week', r.status === 200 && all(r.body).length === all(pWeek).length, msg(r));
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: mishra });
check('a lecturer sees their own week', r.status === 200 && all(r.body).length > 0 && new Set(all(r.body).map((c) => c.regularFacultyId)).size === 1, msg(r));
const mWeek = r.body;
r = await call(`/api/timetable/week?weekOf=${nextWeek}&scope=class`, { token: office });
check('a class needs its programme and semester', r.status === 400, msg(r));
const opts = (await call('/api/timetable/options', { token: office })).body;
check('options list programmes, teachers, rooms and periods', opts.programmes.length > 0 && opts.faculty.length > 0 && opts.rooms.length >= 8 && opts.periods.length === 8);
const cls = opts.classes[0];
r = await call(`/api/timetable/week?weekOf=${nextWeek}&scope=class&programmeId=${cls.programmeId}&semester=${cls.semester}`, { token: office });
check('the office sees a class\'s week', r.status === 200 && all(r.body).length > 0, msg(r));
r = await call(`/api/timetable/week?weekOf=${nextWeek}&scope=room&room=CS-201`, { token: office });
check('and a room\'s week', r.status === 200 && all(r.body).every((c) => c.room === 'CS-201') && all(r.body).length > 0, msg(r));
r = await call(`/api/timetable/week?weekOf=${nextWeek}&scope=class&programmeId=${cls.programmeId}&semester=${cls.semester}`, { token: priya });
check('a student cannot look at other timetables', r.status === 403, msg(r));
r = await call(`/api/timetable/pattern?scope=faculty&facultyId=${all(mWeek)[0].regularFacultyId}`, { token: office });
check('the weekly pattern for printing', r.status === 200 && r.body.slots.length === mWeek.days.flatMap((d) => d.classes).filter((c) => c.kind === 'REGULAR').length, msg(r));

console.log('\nCancel and reschedule one dated class');
const target = all(mWeek).find((c) => c.kind === 'REGULAR' && c.status === 'SCHEDULED');
const sat = mWeek.days[5].date;
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'busy' } });
check('a reason worth reading is required', r.status === 400, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: kavita, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Trying to cancel a colleague\'s class.' } });
check('a colleague cannot cancel it', r.status === 403, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: priya, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Students cannot cancel classes.' } });
check('nor can a student', r.status === 403, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: addDays(target.date, 1), reason: 'Wrong day for this class entirely.' } });
check('a date the class does not meet is refused', r.status === 400, msg(r));
// A make-up on top of the same class's other lecture is a clash.
const busy = all(pWeek).find((c) => c.date !== target.date && c.status === 'SCHEDULED');
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Called to the university for paper setting.', makeup: { date: busy.date, startTime: busy.startTime, endTime: busy.endTime, room: 'CS-204' } } });
check('a make-up class at a time the class is busy is refused', r.status === 409 && /class/.test(r.body?.error?.message ?? ''), msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Called to the university for paper setting.', makeup: { date: sat, startTime: '15:00', endTime: '16:00', room: 'Nowhere-9' } } });
check('a make-up in a room not on the list is refused', r.status === 400, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Called to the university for paper setting.', makeup: { date: sat, startTime: '15:00', endTime: '16:00', room: 'CS-204' } } });
check('cancelled with a make-up class', r.status === 201 && r.body.notified > 0, msg(r));
const cancelId = r.body.id;
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
const off = all(r.body).find((c) => c.id === target.id && c.date === target.date);
const makeup = all(r.body).find((c) => c.kind === 'EXTRA' && c.date === sat);
check('the student sees that date cancelled, with the reason', off?.status === 'CANCELLED' && /paper setting/.test(off?.note ?? ''), JSON.stringify(off));
check('and the make-up class on Saturday', makeup?.startTime === '15:00' && makeup?.room === 'CS-204' && makeup?.makeupFor?.date === target.date, JSON.stringify(makeup));
r = await call(`/api/timetable/week?weekOf=${addDays(nextWeek, 7)}`, { token: priya });
check('the week after, the class is back as usual', all(r.body).find((c) => c.id === target.id)?.status === 'SCHEDULED');
r = await call('/api/student/notifications?unreadOnly=true', { token: priya });
check('the class was told, make-up included', JSON.stringify(r.body).includes('Make-up class'));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Cancelling the very same class again.' } });
check('cancelling twice is a conflict', r.status === 409, msg(r));
r = await call(`/api/timetable/changes/${cancelId}`, { method: 'DELETE', token: mishra });
check('the cancellation can be withdrawn', r.status === 200 && r.body.kind === 'CANCEL', msg(r));
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
check('the class is back and the make-up gone', all(r.body).find((c) => c.id === target.id && c.date === target.date)?.status === 'SCHEDULED' && !all(r.body).some((c) => c.kind === 'EXTRA'));

console.log('\nRoom change');
r = await call(`/api/timetable/free-rooms?date=${target.date}&startTime=${target.startTime}&endTime=${target.endTime}&capacity=40`, { token: mishra });
check('free rooms for the period, big enough', r.status === 200 && r.body.length > 0 && r.body.every((x) => x.capacity >= 40), msg(r));
const freeRoom = r.body.find((x) => x.code !== target.room);
const takenRoom = all(pWeek).find((c) => c.date === target.date && c.id !== target.id && c.startTime < target.endTime && target.startTime < c.endTime)?.room;
if (takenRoom) {
  r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'ROOM', slotId: target.id, date: target.date, room: takenRoom, reason: 'Projector not working' } });
  check('a room busy at that hour is refused', r.status === 409, msg(r));
}
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'ROOM', slotId: target.id, date: target.date, room: freeRoom.code, reason: 'Projector not working' } });
check('moved to a free room', r.status === 201, msg(r));
const roomId = r.body.id;
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
const moved = all(r.body).find((c) => c.id === target.id && c.date === target.date);
check('the student sees the new room and where it was', moved?.room === freeRoom.code && moved?.roomChange?.from === target.room, JSON.stringify(moved?.roomChange));
r = await call(`/api/timetable/changes/${roomId}`, { method: 'DELETE', token: hod });
check('the head of department can undo it', r.status === 200, msg(r));

console.log('\nSubstitute');
r = await call(`/api/timetable/free-faculty?date=${target.date}&startTime=${target.startTime}&endTime=${target.endTime}&department=Computer Science`, { token: mishra });
check('teachers free in that period', r.status === 200 && r.body.length > 0 && !r.body.some((f) => f.id === target.regularFacultyId), msg(r));
const freeFaculty = r.body[0];
const busyFaculty = all(pWeek).find((c) => c.date === target.date && c.regularFacultyId !== target.regularFacultyId && c.startTime < target.endTime && target.startTime < c.endTime);
if (busyFaculty) {
  const bf = { id: busyFaculty.regularFacultyId };
  r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'SUBSTITUTE', slotId: target.id, date: target.date, facultyId: bf.id, reason: 'On examination duty' } });
  check('a substitute who is teaching then is refused', r.status === 409, msg(r));
}
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'SUBSTITUTE', slotId: target.id, date: target.date, facultyId: freeFaculty.id, reason: 'On examination duty' } });
check('a free colleague takes the class', r.status === 201, msg(r));
const subId = r.body.id;
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
check('the student sees who is teaching', all(r.body).find((c) => c.id === target.id && c.date === target.date)?.faculty === freeFaculty.name);
const EMAIL = { Kavita: 'kavita.jain@demo.resolion.edu', Sunita: 'sunita.yadav@demo.resolion.edu', Anil: 'anil.sharma@demo.resolion.edu', Gupta: 'ml.gupta@demo.resolion.edu' };
const subKey = Object.keys(EMAIL).find((k) => freeFaculty.name.includes(k));
const subToken = subKey ? await login(EMAIL[subKey]).catch(() => null) : null;
console.log('  (substitute: ' + freeFaculty.name + ')');
if (subToken) {
  r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: subToken });
  check('the substitute has it on their own timetable', all(r.body).some((c) => c.id === target.id && c.date === target.date && c.substitute), msg(r));
  r = await call(`/api/faculty/classes/${target.id}/session`, { method: 'POST', token: subToken, body: { date: target.date } });
  check('the substitute can open its roll call', r.status === 201, msg(r));
  const sess = r.body?.sessionId;
  r = await call(`/api/faculty/sessions/${sess}/attendance`, { token: subToken });
  check('and read the class list', r.status === 200 && r.body.students.length > 0, msg(r));
  const outsider = [kavita, hod].find((t) => t !== subToken);
  r = await call(`/api/faculty/sessions/${sess}/attendance`, { token: outsider });
  check('a lecturer neither teaching nor covering cannot', r.status === 403 || r.status === 404, msg(r));
}
r = await call(`/api/timetable/changes/${subId}`, { method: 'DELETE', token: mishra });
check('the substitute can be withdrawn', r.status === 200, msg(r));

console.log('\nExtra class');
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'EXTRA', subjectId: target.subjectId, date: sat, startTime: '14:00', endTime: '15:00', room: 'CS-204', reason: 'Revision before the internal test' } });
check('an extra class is added', r.status === 201 && r.body.notified > 0, msg(r));
const extraId = r.body.id;
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'EXTRA', subjectId: target.subjectId, date: sat, startTime: '14:30', endTime: '15:30', room: 'CS-203', reason: 'Second revision class' } });
check('a second one overlapping it is a clash', r.status === 409, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'EXTRA', subjectId: target.subjectId, date: addDays(sat, 1), startTime: '10:00', endTime: '11:00', room: 'CS-204', reason: 'Sunday revision class' } });
check('not on a Sunday', r.status === 400, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'EXTRA', subjectId: target.subjectId, date: istDay(-3), startTime: '10:00', endTime: '11:00', room: 'CS-204', reason: 'Back-dated revision class' } });
check('not in the past', r.status === 400, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: kavita, body: { kind: 'EXTRA', subjectId: target.subjectId, date: sat, startTime: '15:00', endTime: '16:00', room: 'CS-204', reason: 'Not my subject at all' } });
check('a lecturer adds classes only for their own subjects', r.status === 403, msg(r));
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: mishra });
check('the extra class is on the lecturer\'s week', all(r.body).some((c) => c.id === extraId && c.kind === 'EXTRA'));

console.log('\nHolidays');
r = await call('/api/attendance-admin/holidays', { method: 'POST', token: registrar, body: { date: target.date, name: 'Test holiday' } });
const holidayId = r.body?.id;
r = await call(`/api/timetable/week?weekOf=${nextWeek}`, { token: priya });
check('a holiday shows on the week', r.body.days.find((d) => d.date === target.date)?.holiday === 'Test holiday' && all(r.body).filter((c) => c.date === target.date).every((c) => c.status === 'HOLIDAY'));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'CANCEL', slotId: target.id, date: target.date, reason: 'Cancelling on a holiday makes no sense.' } });
check('a class on a holiday cannot be changed', r.status === 409, msg(r));
r = await call('/api/timetable/changes', { method: 'POST', token: mishra, body: { kind: 'EXTRA', subjectId: target.subjectId, date: target.date, startTime: '15:00', endTime: '16:00', room: 'CS-204', reason: 'Extra class on a holiday' } });
check('nor an extra class put on one', r.status === 400, msg(r));
await call(`/api/attendance-admin/holidays/${holidayId}`, { method: 'DELETE', token: registrar });

console.log('\nChange log');
r = await call('/api/timetable/changes', { token: mishra });
check('the lecturer sees their changes', r.status === 200 && r.body.changes.some((c) => c.id === extraId), msg(r));
r = await call('/api/timetable/changes', { token: kavita });
check('a colleague does not see them', r.status === 200 && !r.body.changes.some((c) => c.id === extraId), msg(r));
r = await call('/api/timetable/changes', { token: office });
check('the office sees every change', r.status === 200 && r.body.changes.some((c) => c.id === extraId), msg(r));
r = await call(`/api/timetable/changes/${extraId}`, { method: 'DELETE', token: mishra });
check('the extra class can be withdrawn', r.status === 200, msg(r));

console.log('\nThe lecturer\'s own timetable screen');
r = await call('/api/faculty/timetable', { token: mishra });
const thisWeekSlot = Object.values(r.body.days).flat().find((s) => !s.cancelled);
r = await call(`/api/faculty/slots/${thisWeekSlot.slotId}/cancel`, { method: 'POST', token: mishra, body: { reason: 'Cancelling only the next meeting of this class.' } });
check('cancelling from the weekly grid cancels only its next date', r.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(r.body.date), msg(r));
const legacyDate = r.body.date;
r = await call(`/api/timetable/week?weekOf=${addDays(legacyDate, 7)}`, { token: mishra });
check('the following week it meets as usual', all(r.body).find((c) => c.id === thisWeekSlot.slotId)?.status === 'SCHEDULED');
r = await call(`/api/faculty/slots/${thisWeekSlot.slotId}/restore`, { method: 'POST', token: mishra });
check('and restore puts it back', r.status === 200 && r.body.date === legacyDate, msg(r));

console.log('\nRooms');
r = await call('/api/timetable/rooms', { token: office });
check('the room list with weekly use', r.status === 200 && r.body.some((x) => x.code === 'CS-201' && x.weeklyHours > 0), msg(r));
r = await call('/api/timetable/rooms', { method: 'POST', token: office, body: { code: 'CS-301', building: 'New block', capacity: 72, kind: 'CLASSROOM' } });
check('the office adds a room', r.status === 201, msg(r));
const newRoom = r.body.id;
r = await call('/api/timetable/rooms', { method: 'POST', token: office, body: { code: 'cs-301', capacity: 30 } });
check('the same room twice is refused', r.status === 409, msg(r));
r = await call('/api/timetable/rooms', { method: 'POST', token: mishra, body: { code: 'CS-999', capacity: 30 } });
check('a lecturer cannot add rooms', r.status === 403, msg(r));
const cs201 = (await call('/api/timetable/rooms', { token: office })).body.find((x) => x.code === 'CS-201');
r = await call(`/api/timetable/rooms/${cs201.id}`, { method: 'PATCH', token: office, body: { active: false } });
check('a room still in use cannot be taken out of use', r.status === 409, msg(r));
r = await call(`/api/timetable/rooms/${newRoom}`, { method: 'PATCH', token: office, body: { capacity: 80, active: false } });
check('an unused room can be edited and retired', r.status === 200 && r.body.capacity === 80 && r.body.active === false, msg(r));

console.log('\nBell schedule');
const periods = (await call('/api/timetable/periods', { token: priya })).body;
r = await call('/api/timetable/periods', { method: 'PUT', token: office, body: { periods } });
check('the office cannot change the bell schedule', r.status === 403, msg(r));
r = await call('/api/timetable/periods', { method: 'PUT', token: registrar, body: { periods: [{ label: 'A', startTime: '09:00', endTime: '10:00' }, { label: 'B', startTime: '09:30', endTime: '10:30' }] } });
check('overlapping periods are refused', r.status === 400, msg(r));
r = await call('/api/timetable/periods', { method: 'PUT', token: registrar, body: { periods: periods.map(({ label, startTime, endTime, isBreak }) => ({ label, startTime, endTime, isBreak })) } });
check('the registrar saves it', r.status === 200 && r.body.length === periods.length, msg(r));

console.log('\nHealth check');
r = await call('/api/timetable/health', { token: office });
check('the term\'s timetable is checked', r.status === 200 && Array.isArray(r.body.issues) && r.body.slots > 0, msg(r));
check('the demo timetable has no double booking', !r.body.issues.some((i) => ['teacher', 'room', 'class'].includes(i.kind)), JSON.stringify(r.body.issues.filter((i) => i.severity === 'error')));
r = await call('/api/attendance-admin/compliance', { token: office });
check('roll-call compliance still reads the timetable', r.status === 200 && typeof r.body.expected === 'number', msg(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
