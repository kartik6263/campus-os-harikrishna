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
import * as data from './data.js';
import { studentBuiltin, studentSystemPrompt, studentTools } from './student.js';

/**
 * The campus assistant.
 *
 * Staff ask in plain English or Hindi; the answer is built only from the
 * read-only lookups in data.ts, scoped to what the asker may see. With an
 * Anthropic key configured, Claude chooses the lookups and writes the answer;
 * without one, a built-in router answers the common questions from the same
 * lookups, so the feature never pretends and never goes dark.
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

function toolsFor(scope: data.Scope, used: string[]) {
  const track = <T,>(name: string, fn: () => Promise<T>) => async () => {
    used.push(name);
    return JSON.stringify(await fn());
  };
  return [
    betaZodTool({
      name: 'institution_overview',
      description: 'Headline figures: student and staff counts, fees billed/collected/outstanding and monthly collection, attendance rate, risk-band counts, open work queues (approvals, certificates, admissions, grievances, RTI, tenders), and every college with its student count.',
      inputSchema: z.object({}),
      run: () => track('institution_overview', () => data.overview(scope))(),
    }),
    betaZodTool({
      name: 'find_students',
      description: 'Look up students by name, enrolment number or roll number. Returns programme, college, mentor, attendance %, fees due, latest CGPA and current risk score for each match.',
      inputSchema: z.object({ query: z.string().min(2).describe('A name or part of one, or an enrolment/roll number') }),
      run: (input) => track('find_students', () => data.findStudents(scope, input.query))(),
    }),
    betaZodTool({
      name: 'at_risk_students',
      description: 'Students whose latest dropout-risk assessment is at or above a band, highest score first, with the basis of the score, attendance, fees due and CGPA.',
      inputSchema: z.object({
        min_band: z.enum(['MODERATE', 'HIGH', 'CRITICAL']).optional().describe('Lowest band to include; default HIGH'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      run: (input) => track('at_risk_students', () => data.atRiskStudents(scope, input.min_band ?? 'HIGH', input.limit ?? 15))(),
    }),
    betaZodTool({
      name: 'fee_defaulters',
      description: 'How many students owe fees and how much in total, with the largest individual dues.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      run: (input) => track('fee_defaulters', () => data.feeDefaulters(scope, input.limit ?? 15))(),
    }),
    betaZodTool({
      name: 'low_attendance',
      description: 'Students below an attendance threshold (the detention list), lowest first.',
      inputSchema: z.object({ threshold_percent: z.number().min(1).max(100).optional().describe('Default 75'), limit: z.number().int().min(1).max(50).optional() }),
      run: (input) => track('low_attendance', () => data.lowAttendance(scope, input.threshold_percent ?? 75, input.limit ?? 20))(),
    }),
    betaZodTool({
      name: 'compare',
      description: 'Attendance %, fee collection %, outstanding fees and high-risk student count side by side for each college or each programme.',
      inputSchema: z.object({ by: z.enum(['college', 'programme']) }),
      run: (input) => track('compare', () => data.compare(scope, input.by))(),
    }),
  ];
}

function systemPrompt(institution: string, scope: data.Scope, role: string) {
  return `You are the campus assistant inside Resolion Campus OS for ${institution}. The person asking is signed in as ${role}; their data access covers ${scope.label}.

Answer only from what your tools return. Every number you state must come from a tool result in this conversation; if the tools cannot answer, say what is missing rather than estimating. Call tools as needed — several in one turn when the question spans topics.

Reply in the language the user writes in (English or Hindi). Be concise and practical, as a senior administrator's aide would be: lead with the answer, then the few facts that support it, then a suggested next step when one is obvious (for example, raising an intervention for a high-risk student, or sending fee reminders). Use a short markdown table when listing more than three students or colleges. Money is in Indian rupees; format with ₹ and Indian digit grouping. Today is ${new Date().toDateString()}.`;
}

// ─── Built-in answers, used when no Anthropic key is configured ──────────────

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

    const own = forSelf(req);
    const scope: data.Scope = own ? { collegeId: null, label: 'their own record' } : await scopeFor(req);
    const used: string[] = [];
    const started = Date.now();

    let reply: string;
    let mode: 'claude' | 'builtin' = 'builtin';

    if (client) {
      const institution = (await prisma.institution.findUnique({ where: { id: 'default' }, select: { name: true } }))?.name ?? 'the institution';
      // The history is trimmed to recent turns and must open on a user turn.
      const history = messages.slice(-12);
      while (history[0]?.role !== 'user') history.shift();
      try {
        const final = await client.beta.messages.toolRunner({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          // If a safety classifier declines, the API retries on a suitable model within the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: own ? studentSystemPrompt(institution, req.auth!.role) : systemPrompt(institution, scope, req.auth!.role),
          tools: own ? studentTools(req, used) : toolsFor(scope, used),
          messages: history,
          max_iterations: 8,
        });
        if (final.stop_reason === 'refusal') {
          reply = 'I cannot help with that request. Ask me about students, attendance, fees, risk or the work waiting in the institution.';
        } else {
          reply = final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim() || 'I could not form an answer from the records.';
        }
        mode = 'claude';
      } catch (err) {
        // A failed call to the model falls back to the built-in answers rather than failing the user.
        console.error('[assistant] Claude request failed; answering from built-in reports', err instanceof Error ? err.message : err);
        reply = own ? await studentBuiltin(req, last.content, used) : await builtin(scope, last.content, used);
      }
    } else {
      reply = own ? await studentBuiltin(req, last.content, used) : await builtin(scope, last.content, used);
    }

    await recordFor(req, { module: 'Assistant', action: 'Asked the campus assistant', target: last.content.slice(0, 80), detail: `${mode}; ${used.join(', ') || 'no lookups'}` });
    res.json({ reply, mode, lookups: [...new Set(used)], scope: scope.label, ms: Date.now() - started });
  }),
);

assistantRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ mode: client ? 'claude' : 'builtin', model: client ? env.ANTHROPIC_MODEL : null });
  }),
);
