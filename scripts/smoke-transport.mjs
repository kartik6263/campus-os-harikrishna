/**
 * End-to-end test of transport management against a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-transport.mjs
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
const login = async (email) => { const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } }); if (r.status !== 200) throw new Error(`login ${email}`); return r.body.accessToken; };
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;
const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const office = await login('pushpa.sharma@demo.resolion.edu');
const registrar = await login('registrar@demo.resolion.edu');
const priya = await login('priya.sharma.2021@demo.resolion.edu');
const rahul = await login('rahul.verma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

console.log('\nOverview and compliance');
let ov = await call('/api/transport/overview', { token: office });
check('the overview loads', ov.status === 200 && ov.body.routes.length === 2, msg(ov));
check("an expiring PUC is flagged", ov.body.compliance.some((c) => /PUC/.test(c.what) && c.state === 'expiring'), JSON.stringify(ov.body.compliance));
check('a student cannot read it', (await call('/api/transport/overview', { token: priya })).status === 403);

console.log('\nFleet and crew');
let r = await call('/api/transport/vehicles', { method: 'POST', token: office, body: { regNo: 'not a plate', kind: 'BUS', capacity: 40, ownership: 'OWNED' } });
check('a malformed registration is refused', r.status === 400, msg(r));
r = await call('/api/transport/vehicles', { method: 'POST', token: office, body: { regNo: 'MP07 HB 1188', kind: 'BUS', make: 'Ashok Leyland Lynx', capacity: 3 + 1, ownership: 'OWNED', fitnessValidTill: day(300), insuranceValidTill: day(300), permitValidTill: day(300), pucValidTill: day(180), odometer: 1200 } });
check('the desk adds a vehicle', r.status === 201 && r.body.regNo === 'MP07-HB-1188', msg(r));
const van = r.body;
r = await call('/api/transport/vehicles', { method: 'POST', token: office, body: { regNo: 'MP07-HB-1188', kind: 'VAN', capacity: 10, ownership: 'HIRED' } });
check('the same registration twice is refused', r.status === 409, msg(r));
r = await call(`/api/transport/vehicles/${van.id}`, { method: 'PATCH', token: office, body: { odometer: 1000 } });
check('the odometer cannot run backwards', r.status === 400, msg(r));
r = await call(`/api/transport/vehicles/${van.id}/logs`, { method: 'POST', token: office, body: { kind: 'FUEL', date: day(-3), odometer: 1300, cost: 3000 } });
check('a fuel entry needs litres', r.status === 400, msg(r));
await call(`/api/transport/vehicles/${van.id}/logs`, { method: 'POST', token: office, body: { kind: 'FUEL', date: day(-3), odometer: 1300, litres: 30, cost: 2850, vendor: 'HP, City Centre' } });
await call(`/api/transport/vehicles/${van.id}/logs`, { method: 'POST', token: office, body: { kind: 'FUEL', date: day(-1), odometer: 1540, litres: 40, cost: 3800 } });
r = await call(`/api/transport/vehicles/${van.id}/logs`, { token: office });
check('mileage is worked out between fills', r.body.logs[0].kmpl === 6, JSON.stringify(r.body.logs.map((l) => l.kmpl)));
check('and the odometer moved on', (await call('/api/transport/vehicles', { token: office })).body.find((v) => v.id === van.id).odometer === 1540);
r = await call('/api/transport/crew', { method: 'POST', token: office, body: { name: 'Shri Mohan Lal', phone: '+91 98260 00011', role: 'DRIVER' } });
check('a driver needs a licence', r.status === 400, msg(r));
r = await call('/api/transport/crew', { method: 'POST', token: office, body: { name: 'Shri Mohan Lal', phone: '+91 98260 00011', role: 'DRIVER', licenceNo: 'MP07 20190011111', licenceValidTill: day(-5), verifiedOn: day(-100) } });
const lapsed = r.body;
check('a driver is added (with a lapsed licence, for the next test)', r.status === 201, msg(r));

console.log('\nRoutes');
const stops = [{ name: 'Morar', time: '07:50', fare: 3800 }, { name: 'Gola Ka Mandir', time: '08:05', fare: 3200 }, { name: 'Model College Gate', time: '08:30', fare: 0 }];
r = await call('/api/transport/routes', { method: 'POST', token: office, body: { routeNo: 'R-20', name: 'Morar — Model College', vehicleId: van.id, driverId: lapsed.id, attendantId: null, stops: [stops[1], stops[0], stops[2]] } });
check('stop times must run in order', r.status === 400, msg(r));
r = await call('/api/transport/routes', { method: 'POST', token: office, body: { routeNo: 'R-20', name: 'Morar — Model College', vehicleId: van.id, driverId: lapsed.id, attendantId: null, stops } });
check('a route is added', r.status === 201, msg(r));
const r20 = r.body.id;
let routes = (await call('/api/transport/routes', { token: office })).body;
const r07 = routes.find((x) => x.routeNo === 'R-07');
const priyaStop = r07.stops.find((s) => s.riders > 0);
r = await call(`/api/transport/routes/${r07.id}`, { method: 'PUT', token: office, body: { routeNo: 'R-07', name: r07.name, vehicleId: r07.vehicleId, driverId: r07.driverId, attendantId: r07.attendantId, active: true, stops: r07.stops.filter((s) => s.id !== priyaStop.id).map((s) => ({ id: s.id, name: s.name, time: s.time, fare: s.fare })) } });
check('a stop students board at cannot be removed', r.status === 409, msg(r));
r = await call(`/api/transport/routes/${r07.id}`, { method: 'PUT', token: office, body: { routeNo: 'R-07', name: r07.name, vehicleId: r07.vehicleId, driverId: r07.driverId, attendantId: r07.attendantId, active: true, stops: r07.stops.map((s) => ({ id: s.id, name: s.id === priyaStop.id ? 'Sector 4 Market' : s.name, time: s.time, fare: s.fare })) } });
check('renaming a stop keeps its riders', r.status === 200, msg(r));
let me = await call('/api/transport/me', { token: priya });
check("the student's pass follows the renamed stop", me.body.pass.stop.name === 'Sector 4 Market' && me.body.pass.state === 'ACTIVE', JSON.stringify(me.body.pass?.stop));
r = await call(`/api/transport/crew/${lapsed.id}`, { method: 'PATCH', token: office, body: { active: false } });
check('a driver on a route cannot be stood down', r.status === 409, msg(r));
r = await call(`/api/transport/vehicles/${van.id}`, { method: 'PATCH', token: office, body: { status: 'RETIRED' } });
check('a vehicle on a route cannot be retired', r.status === 409, msg(r));

console.log('\nRequests, seats and the fee chain');
const gandhi = r07.stops.find((s) => s.name === 'Gandhi Road');
r = await call('/api/transport/me/requests', { method: 'POST', token: rahul, body: { routeId: r07.id, stopId: gandhi.id, note: 'From this term' } });
check('a student asks for a pass', r.status === 201 && r.body.kind === 'NEW', msg(r));
const req = r.body;
r = await call('/api/transport/me/requests', { method: 'POST', token: rahul, body: { routeId: r07.id, stopId: gandhi.id } });
check('a second open request is refused', r.status === 409, msg(r));
r = await call('/api/transport/me/requests', { method: 'POST', token: priya, body: { routeId: r07.id, stopId: priyaStop.id } });
check('asking for the route and stop you already have is refused', r.status === 409, msg(r));
r = await call(`/api/transport/requests/${req.id}/decide`, { method: 'POST', token: office, body: { approve: true } });
check('the desk approves; the fare is charged', r.status === 200 && r.body.charged === gandhi.fare, msg(r));
me = await call('/api/transport/me', { token: rahul });
check('the pass waits for payment', me.body.pass.state === 'PENDING_PAYMENT' && me.body.pass.feeDue === gandhi.fare, JSON.stringify(me.body.pass));
const rahulId = (await call('/api/lifecycle/students?q=Rahul', { token: registrar })).body.students[0].id;
const fees = await call('/api/student/fees', { token: rahul });
r = await call('/api/office/counter', { method: 'POST', token: office, body: { studentId: rahulId, head: 'Fee payment', amount: fees.body.summary.due, mode: 'CASH' } });
check('the fee is paid at the counter', r.status === 201, msg(r));
me = await call('/api/transport/me', { token: rahul });
check('the pass activates by itself once paid', me.body.pass.state === 'ACTIVE' && me.body.pass.feeDue === 0, JSON.stringify(me.body.pass?.state));
const rahulPass = me.body.pass.passNo;
// Move within the term to a farther stop: only the difference is charged.
const farther = r07.stops.find((s) => s.fare > gandhi.fare);
r = await call('/api/transport/me/requests', { method: 'POST', token: rahul, body: { routeId: r07.id, stopId: farther.id } });
check('a resident asks to move stops', r.status === 201 && r.body.kind === 'CHANGE', msg(r));
r = await call(`/api/transport/requests/${r.body.id}/decide`, { method: 'POST', token: office, body: { approve: true } });
check('moving to a farther stop charges only the difference', r.status === 200 && r.body.charged === farther.fare - gandhi.fare, msg(r));
r = await call('/api/transport/passes', { method: 'POST', token: office, body: { studentId: rahulId, routeId: r07.id, stopId: gandhi.id, waiveFee: true, reason: 'Hardship' } });
check('the office cannot waive a fee', r.status === 403, msg(r));
// Fill the 4-seat van, then see the fifth refused.
const others = (await call('/api/lifecycle/students?status=ACTIVE', { token: registrar })).body.students.filter((s) => !['Priya Sharma', 'Rahul Verma'].includes(s.name)).slice(0, 5);
const r20stops = (await call('/api/transport/routes', { token: office })).body.find((x) => x.id === r20).stops;
for (const s of others.slice(0, 4)) await call('/api/transport/passes', { method: 'POST', token: registrar, body: { studentId: s.id, routeId: r20, stopId: r20stops[0].id, waiveFee: true, reason: 'Staff ward concession' } });
r = await call('/api/transport/passes', { method: 'POST', token: office, body: { studentId: others[4].id, routeId: r20, stopId: r20stops[0].id } });
check('a full bus takes no one more', r.status === 409 && /full/.test(r.body.error.message), msg(r));
r = await call(`/api/transport/vehicles/${van.id}`, { method: 'PATCH', token: office, body: { capacity: 4 } });
check('capacity can stay at what is taken', r.status === 200, msg(r));

console.log('\nTrips, stop times and boarding');
r = await call('/api/transport/trips', { method: 'POST', token: office, body: { routeId: r20, shift: 'MORNING' } });
check('a trip with an unlicensed driver cannot start', r.status === 409 && /licence/.test(r.body.error.message), msg(r));
r = await call('/api/transport/trips', { method: 'POST', token: office, body: { routeId: r20, shift: 'MORNING', override: 'Relief driver not available; principal approved' } });
check('only the registrar may start past the checks', r.status === 403, msg(r));
r = await call('/api/transport/trips', { method: 'POST', token: office, body: { routeId: r07.id, shift: 'MORNING', odometerStart: 84300 } });
check('the morning trip starts', r.status === 201, msg(r));
const trip = r.body;
r = await call('/api/transport/trips', { method: 'POST', token: office, body: { routeId: r07.id, shift: 'MORNING' } });
check('the same run cannot start twice in a day', r.status === 409, msg(r));
r = await call(`/api/transport/trips/${trip.id}/depart`, { method: 'POST', token: office, body: { index: 0 } });
check('the bus leaves the first stop, its delay measured', r.status === 200 && typeof r.body.delayMinutes === 'number', msg(r));
r = await call(`/api/transport/trips/${trip.id}/board`, { method: 'POST', token: office, body: { passNo: me.body.pass.passNo } });
check("a pass with an unpaid difference cannot board", r.status === 409 && /unpaid/.test(r.body.error.message), msg(r));
const priyaMe = await call('/api/transport/me', { token: priya });
r = await call(`/api/transport/trips/${trip.id}/board`, { method: 'POST', token: office, body: { passNo: priyaMe.body.pass.passNo } });
check('a paid pass boards', r.status === 201, msg(r));
r = await call(`/api/transport/trips/${trip.id}/board`, { method: 'POST', token: office, body: { passNo: priyaMe.body.pass.passNo } });
check('nobody boards twice', r.status === 409, msg(r));
const r20pass = (await call(`/api/transport/passes?routeId=${r20}`, { token: office })).body[0].passNo;
r = await call(`/api/transport/trips/${trip.id}/board`, { method: 'POST', token: office, body: { passNo: r20pass } });
check('a pass for another route cannot board', r.status === 409 && /route/.test(r.body.error.message), msg(r));
r = await call(`/api/transport/trips/${trip.id}/depart`, { method: 'POST', token: office, body: { index: 2 } });
check('a stop with no one waiting can be passed over', r.status === 200, msg(r));
r = await call(`/api/transport/trips/${trip.id}/depart`, { method: 'POST', token: office, body: { index: 1 } });
check('the bus never goes back to a stop', r.status === 409, msg(r));
me = await call('/api/transport/me', { token: priya });
check('the student sees the real departure times and her boarding', me.body.live?.stops[0].departedAt && me.body.live.boardedAt && me.body.live.stops[1].skipped, JSON.stringify(me.body.live?.stops?.slice(0, 3)));
check('and an arrival estimate for the stops ahead', me.body.live.stops.slice(3).every((s) => s.eta), JSON.stringify(me.body.live.stops.slice(3)));
const pm = await call('/api/transport/me', { token: parent });
check("the parent sees the ward's run", pm.status === 200 && !!pm.body.live, msg(pm));
const legacy = await call('/api/student/transport', { token: priya });
check('the mobile tracker gets the real position', legacy.status === 200 && legacy.body.currentStop === 2 && legacy.body.passValid === true && legacy.body.busNo === 'MP07-GC-4892', JSON.stringify({ c: legacy.body?.currentStop, v: legacy.body?.passValid }));
r = await call(`/api/transport/trips/${trip.id}/end`, { method: 'POST', token: office, body: { odometerEnd: 84250 } });
check('the end reading cannot be below the start', r.status === 400, msg(r));
r = await call(`/api/transport/trips/${trip.id}/end`, { method: 'POST', token: office, body: { odometerEnd: 84322 } });
check('the trip ends', r.status === 200, msg(r));
const ev = await call('/api/transport/trips', { method: 'POST', token: office, body: { routeId: r07.id, shift: 'EVENING' } });
r = await call(`/api/transport/trips/${ev.body.id}/depart`, { method: 'POST', token: office, body: { index: 0 } });
check('an evening run records times without inventing a delay', r.status === 200 && r.body.delayMinutes === null && r.body.stop === 'Model College Gate', msg(r));
r = await call(`/api/transport/trips/${ev.body.id}/cancel`, { method: 'POST', token: office, body: { reason: 'Heavy rain; roads flooded' } });
check('cancelling a run alerts its riders', r.status === 200 && r.body.alerted >= 2, msg(r));

console.log('\nIncidents, alerts and passes');
r = await call('/api/transport/incidents', { method: 'POST', token: office, body: { kind: 'BREAKDOWN', severity: 'HIGH', description: 'Clutch plate failed near Gandhi Road.', routeId: r07.id, occurredAt: new Date().toISOString(), alertRiders: 'R-07 is delayed by 40 minutes; a relief bus is on the way.' } });
check('an incident is logged and riders alerted', r.status === 201 && r.body.ridersAlerted >= 2, msg(r));
r = await call(`/api/transport/incidents/${r.body.id}/close`, { method: 'POST', token: office, body: { actionTaken: 'Relief bus sent; clutch replaced at the depot.' } });
check('and closed with the action taken', r.status === 200 && r.body.status === 'CLOSED', msg(r));
r = await call(`/api/transport/routes/${r07.id}/alert`, { method: 'POST', token: office, body: { message: 'Pickup at Company Bagh moves to the petrol pump from Monday.' } });
check('the desk alerts every rider on a route', r.status === 200 && r.body.sent >= 2, msg(r));
const passes = (await call(`/api/transport/passes?q=${encodeURIComponent(rahulPass)}`, { token: office })).body;
r = await call(`/api/transport/passes/${passes[0].id}/cancel`, { method: 'POST', token: office, body: { reason: 'Moved to the hostel' } });
check('a pass is cancelled with a reason', r.status === 200, msg(r));
r = await call(`/api/transport/routes/${r20}`, { method: 'DELETE', token: registrar });
check('a route with passes cannot be deleted', r.status === 409, msg(r));
r = await call(`/api/transport/routes/${r20}`, { method: 'DELETE', token: office });
check('the office cannot delete a route', r.status === 403, msg(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
