/**
 * End-to-end test of digital certificates against a running, freshly seeded API.
 *
 *   npx tsx prisma/seed.ts && npm run dev
 *   node scripts/smoke-certificates.mjs
 *
 * Issues from the office queue and directly, verifies by number, by QR, by
 * uploaded PDF and independently with the published key; then tampers — with
 * the QR, the PDF and the database row — revokes, and rotates the key.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const BASE = process.env.API_BASE ?? 'http://localhost:4000';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };

async function call(path, { method = 'GET', token, body, raw, type } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = type ?? 'application/pdf';
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}) });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, body: json, bytes: buf, headers: res.headers };
}
const login = async (email) => {
  const r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return r.body.accessToken;
};
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;
const sigOf = (url) => new URL(url).searchParams.get('sig');

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

const office = await login('pushpa.sharma@demo.resolion.edu');
const registrar = await login('registrar@demo.resolion.edu');
const admin = await login('admin@demo.resolion.edu');
const student = await login('priya.sharma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

console.log('\nIssuing from the office queue');
let q = await call('/api/office/certificates', { token: office });
let req = q.body.requests.find((r) => r.stage === 'COLLEGE_OFFICE') ?? q.body.requests.find((r) => r.stage === 'REQUESTED');
check('the queue has a request to process', !!req, msg(q));
if (req.stage === 'REQUESTED') await call(`/api/office/certificates/${req.id}/advance`, { method: 'POST', token: office, body: { stage: 'COLLEGE_OFFICE' } });
if (req.fee > 0 && !req.feePaid) await call(`/api/office/certificates/${req.id}/fee`, { method: 'POST', token: office });
let r = await call(`/api/office/certificates/${req.id}/advance`, { method: 'POST', token: office, body: { stage: 'READY', notes: 'Register: ISS/2026/00012' } });
check('marking ready issues a signed certificate', r.status === 200 && r.body.certificate?.serialNo === req.requestNo, msg(r));
const queued = r.body.certificate;

console.log('\nVerifying by number and by QR');
r = await call(`/api/verify/certificate?no=${encodeURIComponent(queued.serialNo)}`);
check('number alone: valid', r.body.status === 'valid', r.body.status);
check('number alone: the name is masked and no payload is given', r.body.certificate.recipient.name.includes('•') && !r.body.certificate.cryptography.payload);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(queued.serialNo)}&sig=${sigOf(queued.verifyUrl)}`);
check('with the QR signature: valid and in full', r.body.status === 'valid' && !r.body.certificate.recipient.name.includes('•') && !!r.body.certificate.cryptography.payload, r.body.status);
const full = r.body.certificate;
const keys = await call('/api/verify/keys');
const key = keys.body.keys.find((k) => k.kid === full.cryptography.keyId);
check('the signing key is published', !!key && key.alg === 'EdDSA', JSON.stringify(keys.body.keys?.[0]));
const independent = crypto.verify(null, Buffer.from(canonical(full.cryptography.payload)), crypto.createPublicKey(key.publicKeyPem), Buffer.from(full.cryptography.signature, 'base64url'));
check('the signature checks out independently, with only the public key', independent);
const viaJwk = crypto.verify(null, Buffer.from(canonical(full.cryptography.payload)), crypto.createPublicKey({ key: { kty: key.kty, crv: key.crv, x: key.x }, format: 'jwk' }), Buffer.from(full.cryptography.signature, 'base64url'));
check('and with the key in JWK form', viaJwk);
check('the payload hash is the SHA-256 of the signed bytes', crypto.createHash('sha256').update(canonical(full.cryptography.payload)).digest('hex') === full.cryptography.payloadHash);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(queued.serialNo)}&sig=AAAAforgedAAAAAAAAAAAAAA`);
check('a forged QR code is reported as tampered', r.body.status === 'tampered', r.body.status);
r = await call('/api/verify/certificate?no=CR/1999/00001');
check('an unknown number is not found', r.body.status === 'not_found', r.body.status);
const pending = q.body.requests.find((x) => x.stage === 'REQUESTED' && x.id !== req.id);
if (pending) {
  r = await call(`/api/verify/certificate?no=${encodeURIComponent(pending.requestNo)}`);
  check('a request not yet issued says so', r.body.status === 'not_issued', r.body.status);
}

console.log('\nCertificates issued before digital signing');
const legacy = q.body.requests.find((x) => ['READY', 'DISPATCHED'].includes(x.stage) && x.id !== req.id);
if (legacy) {
  r = await call(`/api/verify/certificate?no=${encodeURIComponent(legacy.requestNo)}`);
  check('an older issued certificate is signed on first check and verifies', r.body.status === 'valid', `${legacy.requestNo} ${r.body.status}`);
  check('it keeps its original date of issue', r.body.certificate && new Date(r.body.certificate.issuedAt).getTime() === new Date(legacy.issuedAt).getTime());
}

console.log('\nThe official PDF');
const priya = (await call('/api/lifecycle/students?q=Priya', { token: registrar })).body.students[0];
r = await call('/api/certificates/issue', { method: 'POST', token: registrar, body: { type: 'Bonafide Certificate', title: 'Bonafide Certificate', statement: '{name} is a bonafide student of {programme} at this institution.', fields: [['Purpose', 'Passport application']], recipients: [{ studentId: priya.id }] } });
check('the registrar issues one certificate', r.status === 201 && r.body.issued.length === 1, msg(r));
const mine = await call('/api/certificates/mine', { token: student });
check("the student sees their signed certificates", mine.status === 200 && mine.body.length > 0, msg(mine));
const own = mine.body[0];
r = await call(`/api/certificates/${own.id}/pdf`, { token: student });
check('the holder downloads the official PDF', r.status === 200 && r.bytes.subarray(0, 5).toString() === '%PDF-' && r.headers.get('content-type') === 'application/pdf', `${r.status}`);
const pdf = r.bytes;
fs.writeFileSync(new URL('../.smoke-certificate.pdf', import.meta.url), pdf);
check('the PDF is the file filed at issue', crypto.createHash('sha256').update(pdf).digest('hex') === own.pdfHash);
r = await call(`/api/certificates/${own.id}/pdf`, { token: parent });
check("a parent downloads their ward's", r.status === 200);
r = await call('/api/verify/document', { method: 'POST', raw: pdf });
check('uploading the PDF verifies it, in full', r.body.status === 'valid' && r.body.certificate.serialNo === own.serialNo && !r.body.certificate.recipient.name.includes('•'), msg(r));
const edited = Buffer.from(pdf); edited[Math.floor(edited.length / 2)] ^= 0x01;
r = await call('/api/verify/document', { method: 'POST', raw: edited });
check('a PDF with one byte changed does not match', r.body.status === 'unmatched', r.body.status);
r = await call('/api/verify/document', { method: 'POST', raw: Buffer.from('hello this is not a pdf at all, just text'.repeat(5)) });
check('a file that is not a PDF is refused', r.status === 400, msg(r));

console.log('\nIssuing directly');
const reg = await call('/api/lifecycle/students?q=a', { token: registrar });
const two = reg.body.students.filter((s) => s.status === 'ACTIVE').slice(0, 2);
const tpl = (await call('/api/certificates/templates', { token: registrar })).body.find((t) => t.type === 'Participation Certificate');
check('templates are offered', !!tpl);
const issueBody = {
  type: 'Participation Certificate', title: tpl.title, statement: '{name} participated in the National Seminar on AI in Education.',
  fields: [['Event', 'National Seminar on AI in Education'], ['Held on', '7 October 2026']],
  validUntil: '2031-12-31', batchRef: 'SEM/AI/2026',
  recipients: [...two.map((s) => ({ studentId: s.id })), { name: 'Dr. Meera Iyer', ref: 'GUEST-014', email: 'meera.iyer@example.org' }, { studentId: 'no-such-student' }],
};
r = await call('/api/certificates/issue', { method: 'POST', token: office, body: issueBody });
check('the office cannot issue directly', r.status === 403, msg(r));
r = await call('/api/certificates/issue', { method: 'POST', token: registrar, body: { ...issueBody, validUntil: '2020-01-01' } });
check('a validity date in the past is refused', r.status === 400, msg(r));
r = await call('/api/certificates/issue', { method: 'POST', token: registrar, body: issueBody });
check('the registrar issues a batch', r.status === 201 && r.body.issued.length === 3 && r.body.batchRef === 'SEM/AI/2026', msg(r));
check('a bad row is reported, not fatal', r.body.failed?.length === 1 && r.body.failed[0].reason === 'No such student', JSON.stringify(r.body.failed));
check('serials come from the series', r.body.issued.every((i) => /\/PAR\/\d{4}\/\d{6}$/.test(i.serialNo)), r.body.issued.map((i) => i.serialNo).join(','));
const guest = r.body.issued.find((i) => i.recipientName === 'Dr. Meera Iyer');
const list = await call('/api/certificates?batch=SEM%2FAI%2F2026', { token: office });
check('the register lists the batch (the office reads it)', list.status === 200 && list.body.total === 3, msg(list));
const guestRow = list.body.certificates.find((c) => c.id === guest.id);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(guest.serialNo)}&sig=${sigOf(guestRow.verifyUrl)}`);
check('an external participant\'s certificate verifies', r.body.status === 'valid' && r.body.certificate.validUntil, r.body.status);
r = await call(`/api/certificates/${guest.id}/pdf`, { token: student });
check("a student cannot download someone else's certificate", r.status === 404, msg(r));

console.log('\nTampering with the database row');
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const dbUrl = /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)[1];
const db = new pg.Client({ connectionString: dbUrl }); await db.connect();
await db.query(`UPDATE digital_certificates SET "recipientName" = 'Someone Else' WHERE id = $1`, [guest.id]);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(guest.serialNo)}`);
check('a certificate edited in the database is reported as tampered', r.body.status === 'tampered', r.body.status);
await db.query(`UPDATE digital_certificates SET "recipientName" = 'Dr. Meera Iyer' WHERE id = $1`, [guest.id]);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(guest.serialNo)}`);
check('and valid again once restored', r.body.status === 'valid', r.body.status);
await db.query(`UPDATE digital_certificates SET "validUntil" = now() - interval '1 day', "signature" = "signature" WHERE id = $1`, [guest.id]);
r = await call(`/api/verify/certificate?no=${encodeURIComponent(guest.serialNo)}`);
check('changing the validity date also breaks the signature', r.body.status === 'tampered', r.body.status);
await db.end();

console.log('\nRevocation');
const target = list.body.certificates.find((c) => c.id !== guest.id);
r = await call(`/api/certificates/${target.id}/revoke`, { method: 'POST', token: office, body: { reason: 'Issued in error to the wrong student' } });
check('the office cannot revoke', r.status === 403, msg(r));
r = await call(`/api/certificates/${target.id}/revoke`, { method: 'POST', token: registrar, body: { reason: 'short' } });
check('a revocation needs a real reason', r.status === 400, msg(r));
r = await call(`/api/certificates/${target.id}/revoke`, { method: 'POST', token: registrar, body: { reason: 'Issued in error: the student did not attend' } });
check('the registrar revokes', r.status === 200 && r.body.status === 'REVOKED', msg(r));
r = await call(`/api/verify/certificate?no=${encodeURIComponent(target.serialNo)}`);
check('a revoked certificate verifies as revoked, with the reason', r.body.status === 'revoked' && /did not attend/.test(r.body.certificate.revokedReason), r.body.status);
r = await call(`/api/certificates/${target.id}/revoke`, { method: 'POST', token: registrar, body: { reason: 'Issued in error: the student did not attend' } });
check('revoking twice is refused', r.status === 409, msg(r));

console.log('\nKey rotation');
r = await call('/api/certificates/keys/rotate', { method: 'POST', token: registrar, body: { reason: 'Annual rotation of the signing key' } });
check('only an administrator rotates the key', r.status === 403, msg(r));
r = await call('/api/certificates/keys/rotate', { method: 'POST', token: admin, body: { reason: 'Annual rotation of the signing key' } });
check('the administrator rotates the key', r.status === 201 && r.body.kid !== full.cryptography.keyId, msg(r));
const newKid = r.body.kid;
r = await call(`/api/verify/certificate?no=${encodeURIComponent(queued.serialNo)}`);
check('a certificate signed by the retired key still verifies', r.body.status === 'valid' && r.body.certificate.cryptography.keyRetired === true, r.body.status);
r = await call('/api/certificates/issue', { method: 'POST', token: registrar, body: { type: 'Merit Certificate', title: 'Certificate of Merit', statement: '{name} topped the semester examinations.', recipients: [{ studentId: two[0].id }] } });
const fresh = (await call(`/api/certificates?q=${encodeURIComponent(r.body.issued[0].serialNo)}`, { token: registrar })).body.certificates[0];
check('new certificates are signed with the new key', fresh?.keyId === newKid, fresh?.keyId);
const k = await call('/api/certificates/keys', { token: registrar });
check('the key list shows both, and which signs', k.body.keys.length >= 2 && k.body.keys.filter((x) => x.signing).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
