import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { recordFor } from '../itconsole/audit.js';
import { aiQuota } from '../../lib/aiquota.js';
import * as data from './data.js';
import { studentBuiltin, studentSystemPrompt, studentTools } from './student.js';
import { GeminiError, geminiConverse, geminiEnabled, geminiModel, geminiTranscribe, type GeminiTool } from '../../lib/gemini.js';
import { tool } from './tool.js';

/**
 * The campus assistant.
 *
 * Staff ask in plain English or Hindi; the answer is built only from the
 * read-only lookups in data.ts, scoped to what the asker may see. With a
 * Gemini (or Anthropic) key configured, the model chooses the lookups and
 * writes the answer; without one, or when the model fails, a built-in router
 * answers the common questions from the same lookups, so the feature never
 * pretends and never goes dark.
 */
export const assistantRouter = Router();

assistantRouter.use(requireAuth);
assistantRouter.use(requireRole('STUDENT', 'PARENT', 'FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'));

const forSelf = (req: Request) => req.auth!.role === 'STUDENT' || req.auth!.role === 'PARENT';

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

async function scopeFor(req: Request): Promise<data.Scope> {
  const auth = req.auth!;
  if (['PRINCIPAL', 'REGISTRAR', 'ADMIN'].includes(auth.role)) return { collegeId: null, label: 'the whole institution' };
  const faculty = auth.facultyId ? await prisma.faculty.findUnique({ where: { id: auth.facultyId }, select: { collegeId: true, college: { select: { name: true } } } }) : null;
  const office = faculty ? null : await prisma.officeStaff.findUnique({ where: { userId: auth.sub }, select: { collegeId: true, college: { select: { name: true } } } });
  const own = faculty ?? office;
  return own ? { collegeId: own.collegeId, label: own.college.name } : { collegeId: null, label: 'the whole institution' };
}

/** The staff lookups, in a form both Gemini and Claude can be given. */
function toolsFor(scope: data.Scope): GeminiTool[] {
  return [
    tool('institution_overview',
      'Headline figures: student and staff counts, fees billed/collected/outstanding and monthly collection, attendance rate, risk-band counts, open work queues (approvals, certificates, admissions, grievances, RTI, tenders), and every college with its student count.',
      z.object({}),
      () => data.overview(scope)),
    tool('find_students',
      'Look up students by name, enrolment number or roll number. Returns programme, college, mentor, attendance %, fees due, latest CGPA and current risk score for each match.',
      z.object({ query: z.string().min(2).describe('A name or part of one, or an enrolment/roll number') }),
      (i) => data.findStudents(scope, i.query)),
    tool('at_risk_students',
      'Students whose latest dropout-risk assessment is at or above a band, highest score first, with the basis of the score, attendance, fees due and CGPA.',
      z.object({
        min_band: z.enum(['MODERATE', 'HIGH', 'CRITICAL']).optional().describe('Lowest band to include; default HIGH'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      (i) => data.atRiskStudents(scope, i.min_band ?? 'HIGH', i.limit ?? 15)),
    tool('fee_defaulters',
      'How many students owe fees and how much in total, with the largest individual dues.',
      z.object({ limit: z.number().int().min(1).max(50).optional() }),
      (i) => data.feeDefaulters(scope, i.limit ?? 15)),
    tool('low_attendance',
      'Students below an attendance threshold (the detention list), lowest first.',
      z.object({ threshold_percent: z.number().min(1).max(100).optional().describe('Default 75'), limit: z.number().int().min(1).max(50).optional() }),
      (i) => data.lowAttendance(scope, i.threshold_percent ?? 75, i.limit ?? 20)),
    tool('compare',
      'Attendance %, fee collection %, outstanding fees and high-risk student count side by side for each college or each programme.',
      z.object({ by: z.enum(['college', 'programme']) }),
      (i) => data.compare(scope, i.by)),
  ];
}

/** Hands the same lookups to Claude's tool runner, recording which ran. */
function forClaude(tools: GeminiTool[], used: string[]) {
  return tools.map((t) => betaZodTool({
    name: t.name,
    description: t.description,
    inputSchema: t.schema,
    run: async (input) => { used.push(t.name); return JSON.stringify(await t.run(input as Record<string, unknown>)); },
  }));
}

function systemPrompt(institution: string, scope: data.Scope, role: string) {
  return `You are the campus assistant inside Resolion Campus OS for ${institution}. The person asking is signed in as ${role}; their data access covers ${scope.label}.

Answer only from what your tools return. Every number you state must come from a tool result in this conversation; if the tools cannot answer, say what is missing rather than estimating. Call tools as needed — several in one turn when the question spans topics.

Reply in the language the user writes in (English or Hindi). Be concise and practical, as a senior administrator's aide would be: lead with the answer, then the few facts that support it, then a suggested next step when one is obvious (for example, raising an intervention for a high-risk student, or sending fee reminders). Use a short markdown table when listing more than three students or colleges. Money is in Indian rupees; format with ₹ and Indian digit grouping. Today is ${new Date().toDateString()}.`;
}

// ─── Built-in answers, used when no model is configured or it fails ─────────

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const table = (head: string[], rows: Array<Array<string | number | null>>) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((c) => c ?? '—').join(' | ')} |`)].join('\n');

async function builtin(scope: data.Scope, question: string, used: string[]): Promise<string> {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has('risk', 'dropout', 'drop out', 'जोखिम', 'ड्रॉप')) {
    used.push('at_risk_students');
    const rows = await data.atRiskStudents(scope, has('moderate') ? 'MODERATE' : 'HIGH', 10);
    if (!rows.length) return `No student in ${scope.label} is currently assessed at high or critical risk.`;
    return `**${rows.length} student${rows.length > 1 ? 's' : ''} at high or critical risk** in ${scope.label}, highest score first:\n\n${table(['Student', 'Programme', 'Score', 'Attendance', 'Fees due', 'CGPA'], rows.map((r) => [`${r.name} (${r.enrolmentNo})`, r.programme, `${r.score} ${r.band}`, r.attendancePercent !== null ? `${r.attendancePercent}%` : null, inr(r.feesDueRupees), r.latestCgpa]))}\n\nNext step: open the Intelligence Layer's at-risk register to raise an intervention for each.`;
  }
  if (has('fee', 'due', 'defaulter', 'outstanding', 'शुल्क', 'फीस', 'बकाया')) {
    used.push('fee_defaulters');
    const d = await data.feeDefaulters(scope, 10);
    return `**${d.studentsWithDues} students owe fees, ${inr(d.totalOutstandingRupees)} in total** (${scope.label}). The largest dues:\n\n${table(['Student', 'College', 'Due', 'Billed'], d.largest.map((r) => [`${r.name} (${r.enrolmentNo})`, r.college, inr(r.dueRupees), inr(r.billedRupees)]))}`;
  }
  if (has('attendance', 'detention', 'absent', 'उपस्थिति', 'हाजिरी')) {
    used.push('low_attendance');
    const threshold = Number(/(\d{2})\s*%/.exec(q)?.[1] ?? 75);
    const d = await data.lowAttendance(scope, threshold, 10);
    return `**${d.studentsBelow} students are below ${threshold}% attendance** in ${scope.label}. The lowest:\n\n${table(['Student', 'College', 'Attendance', 'Attended / held'], d.lowest.map((r) => [`${r.name} (${r.enrolmentNo})`, r.college, `${r.attendancePercent}%`, `${r.attended} / ${r.classesHeld}`]))}`;
  }
  if (has('compare', 'college-wise', 'collegewise', 'programme', 'program', 'तुलना')) {
    const by = has('programme', 'program', 'course') ? 'programme' : 'college';
    used.push('compare');
    const rows = await data.compare(scope, by);
    return `**${by === 'college' ? 'College' : 'Programme'} comparison** (${scope.label}):\n\n${table([by === 'college' ? 'College' : 'Programme', 'Students', 'Attendance', 'Fee collection', 'Outstanding', 'High risk'], rows.map((r) => [String(r[by]), r.students, r.attendancePercent !== null ? `${r.attendancePercent}%` : null, r.feeCollectionPercent !== null ? `${r.feeCollectionPercent}%` : null, inr(r.outstandingRupees), r.highRiskStudents]))}`;
  }
  // A name or enrolment number: look the student up.
  const candidate = question.replace(/^(who is|show|find|tell me about|details of|student)\s+/i, '').replace(/[?.!]/g, '').trim();
  if (candidate.length >= 3 && candidate.split(/\s+/).length <= 4 && !has('overview', 'summary', 'how is', 'status', 'pending')) {
    used.push('find_students');
    const rows = await data.findStudents(scope, candidate);
    if (rows.length) {
      return rows.map((s) => `**${s.name}** · ${s.enrolmentNo}\n${s.programme}, ${s.college}${s.mentor ? ` · mentor ${s.mentor}` : ''}\nAttendance ${s.attendancePercent ?? '—'}% · fees due ${inr(s.feesDueRupees)} · CGPA ${s.latestCgpa ?? '—'}${s.risk ? ` · risk ${s.risk.score} (${s.risk.band})` : ''}`).join('\n\n');
    }
  }
  used.push('institution_overview');
  const o = await data.overview(scope);
  const atRisk = (o.risk.HIGH ?? 0) + (o.risk.CRITICAL ?? 0);
  return `**${o.counts.students.toLocaleString('en-IN')} students across ${o.counts.colleges} colleges, ${o.counts.faculty} teaching staff.**\n\n- Fees: ${inr(o.fees.collected)} collected of ${inr(o.fees.billed)} billed (${o.fees.collectionRate ?? '—'}%); ${inr(o.fees.outstanding)} outstanding.\n- Attendance: ${o.attendance.last30Days ?? '—'}% over the last 30 days.\n- ${atRisk} students at high or critical dropout risk.\n- Waiting: ${o.queues.approvalsPending} approvals, ${o.queues.certificatesOpen} certificate requests, ${o.queues.admissionsPending} admissions, ${o.queues.grievancesOpen} grievances, ${o.queues.rtiOpen} RTI applications.\n\nAsk me about at-risk students, fee defaulters, attendance below 75%, a college comparison, or any student by name.`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

type Mode = 'gemini' | 'claude' | 'builtin';

/** Which model answers, from AI_PROVIDER and the keys present. */
export function assistantMode(): Mode {
  const p = env.AI_PROVIDER;
  if (p === 'builtin') return 'builtin';
  if (p === 'gemini') return geminiEnabled ? 'gemini' : 'builtin';
  if (p === 'claude') return client ? 'claude' : 'builtin';
  return geminiEnabled ? 'gemini' : client ? 'claude' : 'builtin';
}

const modelFor = (m: Mode) => (m === 'gemini' ? geminiModel : m === 'claude' ? env.ANTHROPIC_MODEL : null);

// ─── Route ────────────────────────────────────────────────────────────────────

const chatBody = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(30),
});

assistantRouter.post(
  '/chat',
  validate('body', chatBody),
  asyncHandler(async (req, res) => {
    const { messages } = req.body as z.infer<typeof chatBody>;
    const last = messages[messages.length - 1]!;
    if (last.role !== 'user') throw ApiError.badRequest('The last message must be the question');
    aiQuota(req, 'chat', 60, 10);

    const own = forSelf(req);
    const scope: data.Scope = own ? { collegeId: null, label: 'their own record' } : await scopeFor(req);
    const used: string[] = [];
    const started = Date.now();
    const wanted = assistantMode();
    const fallbackAnswer = () => (own ? studentBuiltin(req, last.content, used) : builtin(scope, last.content, used));

    let reply: string;
    let mode: Mode = 'builtin';
    let notice: string | null = null;

    if (wanted !== 'builtin') {
      const institution = (await prisma.institution.findUnique({ where: { id: 'default' }, select: { name: true } }))?.name ?? 'the institution';
      // The history is trimmed to recent turns and must open on a user turn.
      const history = messages.slice(-12);
      while (history[0]?.role !== 'user') history.shift();
      const system = own ? studentSystemPrompt(institution, req.auth!.role) : systemPrompt(institution, scope, req.auth!.role);
      const tools = own ? studentTools(req) : toolsFor(scope);
      try {
        if (wanted === 'gemini') {
          reply = await geminiConverse({ system, history, tools, used, maxIterations: 8 });
        } else {
          const final = await client!.beta.messages.toolRunner({
            model: env.ANTHROPIC_MODEL,
            max_tokens: 16000,
            output_config: { effort: 'medium' },
            // If a safety classifier declines, the API retries on a suitable model within the same call.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system,
            tools: forClaude(tools, used),
            messages: history,
            max_iterations: 8,
          });
          reply = final.stop_reason === 'refusal'
            ? 'I cannot help with that request. Ask me about students, attendance, fees, risk or the work waiting in the institution.'
            : final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim() || 'I could not form an answer from the records.';
        }
        mode = wanted;
      } catch (err) {
        // A failed call to the model falls back to the built-in answers rather than failing the user.
        console.error(`[assistant] ${wanted} request failed; answering from built-in reports`, err instanceof Error ? err.message : err);
        notice = err instanceof GeminiError && err.status === 429
          ? 'The AI model is busy right now, so this answer comes from the built-in reports.'
          : 'The AI model could not be reached, so this answer comes from the built-in reports.';
        used.length = 0;
        reply = await fallbackAnswer();
      }
    } else {
      reply = await fallbackAnswer();
    }

    await recordFor(req, { module: 'Assistant', action: 'Asked the campus assistant', target: last.content.slice(0, 80), detail: `${mode}; ${used.join(', ') || 'no lookups'}` });
    res.json({ reply, mode, model: modelFor(mode), notice, lookups: [...new Set(used)], scope: scope.label, ms: Date.now() - started });
  }),
);

// ─── POST /api/assistant/transcribe ───────────────────────────────────────────

/**
 * Writes down a spoken question, for browsers with no speech recognition of
 * their own (Firefox, Safari) or when better Hindi is wanted. The clip goes
 * to Gemini and is not stored.
 */
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/flac', 'audio/opus'] as const;

assistantRouter.post(
  '/transcribe',
  validate('body', z.object({
    audio: z.string().min(100).max(1_300_000, 'Keep a voice question under a minute'),
    mimeType: z.string().transform((m) => m.split(';')[0]!.trim().toLowerCase()).pipe(z.enum(AUDIO_TYPES)),
    lang: z.enum(['en', 'hi']).default('en'),
  })),
  asyncHandler(async (req, res) => {
    if (!geminiEnabled) throw new ApiError(503, 'Voice transcription needs a Gemini API key on the server. Use Chrome or Edge, or type the question.', 'ai_unavailable');
    aiQuota(req, 'transcribe', 40, 10);
    const { audio, mimeType, lang } = req.body as { audio: string; mimeType: string; lang: 'en' | 'hi' };
    if (!/^[A-Za-z0-9+/]+=*$/.test(audio)) throw ApiError.badRequest('The audio must be base64');
    try {
      const text = await geminiTranscribe(audio, mimeType === 'audio/mp4' ? 'audio/m4a' : mimeType, lang);
      res.json({ text });
    } catch (err) {
      console.error('[assistant] transcription failed', err instanceof Error ? err.message : err);
      throw new ApiError(502, err instanceof GeminiError && err.status === 429
        ? 'Transcription is busy right now. Try again in a moment, or type the question.'
        : 'The voice clip could not be transcribed. Try again, or type the question.', 'ai_failed');
    }
  }),
);

assistantRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const mode = assistantMode();
    res.json({ mode, model: modelFor(mode), transcription: geminiEnabled, insights: geminiEnabled ? 'gemini' : 'builtin', insightsModel: geminiEnabled ? geminiModel : null });
  }),
);
