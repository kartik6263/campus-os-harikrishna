/**
 * End-to-end test of the AI layer against a running, freshly seeded API.
 *
 * With Gemini — against a local stand-in that speaks the generateContent
 * protocol and checks every request it is sent:
 *   GEMINI_API_KEY=test GEMINI_BASE_URL=http://127.0.0.1:4999/v1beta npm run dev
 *   node scripts/smoke-ai.mjs
 *
 * Without a key — every feature must still answer, from the built-in rules:
 *   npm run dev
 *   node scripts/smoke-ai.mjs
 */
import http from 'node:http';

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
const login = async (email) => (await call('/api/auth/login', { method: 'POST', body: { email, password: 'campus123' } })).body.accessToken;
const msg = (r) => `${r.status} ${r.body?.error?.message ?? ''}`;

// ─── The stand-in for Gemini ─────────────────────────────────────────────────

const seen = [];
const problems = [];
const SIGNATURE = 'c2lnbmF0dXJlLWZvci10ZXN0';

/** Gemini's schema subset: upper-case types, no JSON-Schema-only keys. */
function lintSchema(s, path) {
  if (!s || typeof s !== 'object') return;
  for (const bad of ['$schema', 'additionalProperties', '$ref', 'anyOf', 'oneOf']) if (bad in s) problems.push(`${path} carries ${bad}`);
  if (s.type && !/^(OBJECT|STRING|NUMBER|INTEGER|BOOLEAN|ARRAY)$/.test(s.type)) problems.push(`${path} has type ${s.type}`);
  for (const [k, v] of Object.entries(s.properties ?? {})) lintSchema(v, `${path}.${k}`);
  if (s.items) lintSchema(s.items, `${path}[]`);
}

/** Writes JSON that fits a schema, as the real model would. */
function fill(s, key = '') {
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case 'OBJECT': return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, fill(v, k)]));
    case 'ARRAY': return [fill(s.items, key), fill(s.items, key)];
    case 'INTEGER': return s.minimum ?? 1;
    case 'NUMBER': return s.minimum ?? 1;
    case 'BOOLEAN': return true;
    case 'STRING':
      if (key === 'resourceId') return 'invented-resource-id';
      if (key === 'subjectCode') return 'BCA501';
      return `Generated ${key || 'text'} for testing the contract.`;
    default: return null;
  }
}

const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    seen.push({ url: req.url, key: req.headers['x-goog-api-key'], body });
    const send = (code, json) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    if (!/\/v1beta\/models\/[^/]+:generateContent$/.test(req.url ?? '')) return send(404, { error: { message: `bad path ${req.url}` } });
    if (!req.headers['x-goog-api-key']) return send(401, { error: { message: 'no key' } });
    const texts = (body.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? '').join(' ');
    if (texts.includes('FORCE429')) return send(429, { error: { message: 'Resource has been exhausted' } });
    const ok = (parts) => send(200, { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] });

    // Transcription
    if ((body.contents ?? []).some((c) => c.parts?.some((p) => p.inlineData))) return ok([{ text: 'कितने छात्रों की फीस बकाया है' }]);

    // Structured output
    if (body.generationConfig?.responseMimeType === 'application/json') {
      lintSchema(body.generationConfig.responseSchema, 'responseSchema');
      return ok([{ text: JSON.stringify(fill(body.generationConfig.responseSchema)) }]);
    }

    // Tool calling: call the first tool, then answer from what came back.
    const decls = body.tools?.[0]?.functionDeclarations ?? [];
    for (const d of decls) lintSchema(d.parameters, `tool ${d.name}`);
    const contents = body.contents ?? [];
    const responses = contents.flatMap((c) => c.parts ?? []).filter((p) => p.functionResponse);
    if (decls.length && responses.length === 0) {
      return ok([{ functionCall: { name: decls[0].name, args: {} }, thoughtSignature: SIGNATURE }]);
    }
    const echoed = contents.some((c) => c.role === 'model' && c.parts?.some((p) => p.thoughtSignature === SIGNATURE));
    const r = responses[0]?.functionResponse;
    return ok([{ text: `GEMINI-ANSWER from ${r?.name ?? 'nothing'}; signature ${echoed ? 'echoed' : 'MISSING'}; result ${r?.response?.result ? 'present' : 'absent'}` }]);
  });
});
await new Promise((r) => mock.listen(4999, '127.0.0.1', r));

// ─── Tests ───────────────────────────────────────────────────────────────────

const admin = await login('admin@demo.resolion.edu');
const faculty = await login('rk.mishra@demo.resolion.edu');
const student = await login('priya.sharma.2021@demo.resolion.edu');
const parent = await login('parent.sharma@example.in');

const status = await call('/api/assistant/status', { token: admin });
const live = status.body?.mode === 'gemini';
console.log(`\nMode: ${status.body?.mode} (${live ? 'against the local Gemini stand-in' : 'built-in rules'})`);

console.log('\nCampus assistant');
let r = await call('/api/assistant/chat', { method: 'POST', token: admin, body: { messages: [{ role: 'user', content: 'Which students are at risk of dropping out?' }] } });
check('staff question answered', r.status === 200 && typeof r.body.reply === 'string' && r.body.reply.length > 10, msg(r));
if (live) {
  check('answered by Gemini', r.body.mode === 'gemini' && r.body.model, JSON.stringify({ mode: r.body.mode, model: r.body.model }));
  check('Gemini ran a lookup and saw its result', /from institution_overview; signature echoed; result present/.test(r.body.reply), r.body.reply);
  check('the lookup is reported', r.body.lookups.includes('institution_overview'), r.body.lookups.join(','));
  const first = seen.find((s) => s.body.tools);
  check('the API key is sent in the x-goog-api-key header', first?.key === 'test');
  check('a system instruction is sent', !!first?.body.systemInstruction?.parts?.[0]?.text?.includes('Answer only from what your tools return'));
} else {
  check('answered by the built-in reports', r.body.mode === 'builtin', r.body.mode);
}
r = await call('/api/assistant/chat', { method: 'POST', token: student, body: { messages: [{ role: 'user', content: 'What is my attendance?' }] } });
check('student question answered from their own records', r.status === 200 && r.body.lookups.includes('my_attendance'), `${msg(r)} ${r.body?.lookups}`);
r = await call('/api/assistant/chat', { method: 'POST', token: parent, body: { messages: [{ role: 'user', content: 'ward fees?' }] } });
check('parent question answered', r.status === 200, msg(r));
if (live) {
  r = await call('/api/assistant/chat', { method: 'POST', token: admin, body: { messages: [{ role: 'user', content: 'fee defaulters FORCE429' }] } });
  check('a rate-limited model falls back to the built-in reports', r.status === 200 && r.body.mode === 'builtin' && /busy/.test(r.body.notice ?? ''), JSON.stringify({ mode: r.body?.mode, notice: r.body?.notice }));
}
r = await call('/api/assistant/chat', { method: 'POST', token: admin, body: { messages: [{ role: 'assistant', content: 'hello' }] } });
check('a conversation must end on a question', r.status === 400, msg(r));

console.log('\nVoice transcription');
const clip = Buffer.alloc(3000, 7).toString('base64');
r = await call('/api/assistant/transcribe', { method: 'POST', token: student, body: { audio: clip, mimeType: 'audio/webm;codecs=opus', lang: 'hi' } });
if (live) {
  check('a clip is transcribed', r.status === 200 && r.body.text === 'कितने छात्रों की फीस बकाया है', msg(r));
  const sent = seen.findLast((s) => s.body.contents?.[0]?.parts?.some((p) => p.inlineData));
  check('the clip is sent inline with its type', sent?.body.contents[0].parts.find((p) => p.inlineData)?.inlineData.mimeType === 'audio/webm');
  r = await call('/api/assistant/transcribe', { method: 'POST', token: student, body: { audio: clip, mimeType: 'video/mp4', lang: 'hi' } });
  check('a non-audio type is refused', r.status === 400, msg(r));
  r = await call('/api/assistant/transcribe', { method: 'POST', token: student, body: { audio: '%%%' + clip, mimeType: 'audio/webm' } });
  check('audio that is not base64 is refused', r.status === 400, msg(r));
} else {
  check('without a key, transcription says why', r.status === 503 && /Gemini/.test(r.body?.error?.message ?? ''), msg(r));
}

console.log('\nDropout-risk brief');
const cohort = await call('/api/intelligence/risk', { token: faculty });
const mentee = cohort.body?.students?.[0]?.id;
check('the mentor has a cohort', !!mentee, msg(cohort));
const before = seen.length;
r = await call(`/api/ai/risk-brief/${mentee}`, { method: 'POST', token: faculty, body: {} });
check('brief drafted', r.status === 200 && r.body.data?.summary && r.body.data.actions.length >= 0 && r.body.data.parentMessageHi, msg(r));
check(`brief written by ${live ? 'Gemini' : 'the built-in rules'}`, r.body?.source === (live ? 'gemini' : 'builtin'), r.body?.source);
if (live) {
  const sent = JSON.stringify(seen.slice(before).map((s) => s.body));
  const names = (cohort.body?.students ?? []).slice(0, 5).map((s) => s.name);
  check("the student's name is not sent to Gemini", names.every((n) => !sent.includes(n)), names.join(', '));
  r = await call(`/api/ai/risk-brief/${mentee}`, { method: 'POST', token: faculty, body: {} });
  check('asking again with nothing changed returns the saved brief', r.body?.cached === true, String(r.body?.cached));
  r = await call(`/api/ai/risk-brief/${mentee}`, { method: 'POST', token: faculty, body: { refresh: true } });
  check('"draft again" makes a fresh one', r.status === 200 && r.body.cached === false, String(r.body?.cached));
}
r = await call(`/api/ai/risk-brief/${mentee}`, { method: 'POST', token: student, body: {} });
check('a student cannot read a risk brief', r.status === 403, msg(r));
r = await call('/api/ai/risk-brief/not-a-real-student', { method: 'POST', token: faculty, body: {} });
check("a student outside the mentor's cohort is refused", r.status === 404, msg(r));

console.log('\nPerformance coach');
const proj = await call('/api/intelligence/projection', { token: admin });
const projected = proj.body?.students?.[0]?.studentId;
if (projected) {
  r = await call(`/api/ai/performance-brief/${projected}`, { method: 'POST', token: admin, body: {} });
  check('coaching notes drafted', r.status === 200 && r.body.data?.outlook && Array.isArray(r.body.data.targets), msg(r));
  check(`coach answered by ${live ? 'Gemini' : 'the built-in rules'}`, r.body?.source === (live ? 'gemini' : 'builtin'), r.body?.source);
} else {
  check('no projected student to coach (no approved marks in the seed)', true);
}
const unprojected = (cohort.body?.students ?? []).find((s) => !(proj.body?.students ?? []).some((p) => p.studentId === s.id));
if (unprojected) {
  r = await call(`/api/ai/performance-brief/${unprojected.id}`, { method: 'POST', token: faculty, body: {} });
  check('a student with no approved marks gets a plain refusal', r.status === 409, msg(r));
}

console.log('\nStudy plan');
r = await call('/api/ai/study-plan', { method: 'POST', token: student, body: {} });
check('a student builds their own plan', r.status === 200 && r.body.data?.weeks?.length > 0, msg(r));
check(`plan written by ${live ? 'Gemini' : 'the built-in rules'}`, r.body?.source === (live ? 'gemini' : 'builtin'), r.body?.source);
if (live) {
  const tasks = (r.body.data?.weeks ?? []).flatMap((w) => w.tasks);
  check('an invented resource id is dropped, not linked', tasks.every((t) => t.resourceId === null && t.resource === null), JSON.stringify(tasks[0]));
}
r = await call('/api/ai/study-plan', { method: 'POST', token: parent, body: {} });
check("a parent sees their ward's plan", r.status === 200, msg(r));
r = await call(`/api/ai/study-plan/${mentee}`, { method: 'POST', token: faculty, body: {} });
check("staff build a student's plan", r.status === 200, msg(r));

if (live) {
  console.log('\nProtocol');
  check('every schema sent fits Gemini\'s subset', problems.length === 0, problems.slice(0, 5).join('; '));
  check('every request went to models/{model}:generateContent', seen.every((s) => /models\/gemini-[\w.-]+:generateContent$/.test(s.url)), seen.map((s) => s.url).join(' '));
}

const it = await call('/api/it/health', { token: admin });
const row = (it.body?.integrations ?? []).find((i) => /Gemini/.test(i.name));
check('the IT cell sees Gemini\'s status', !!row && row.configured === live, JSON.stringify(row));

mock.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
