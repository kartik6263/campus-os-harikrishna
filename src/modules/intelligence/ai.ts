import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { currentTenant, prisma } from '../../db.js';
import { ApiError, asyncHandler, validate } from '../../lib/http.js';
import { requireAuth, requireRole, resolveStudentId } from '../../auth/middleware.js';
import { aiQuota } from '../../lib/aiquota.js';
import { GeminiError, geminiEnabled, geminiJson, geminiModel } from '../../lib/gemini.js';
import { recordFor } from '../itconsole/audit.js';
import { learningPlanFor } from '../learning.js';
import { resolveScope } from './index.js';
import { assess, project, type Assessment, type Projection } from './scoring.js';

/**
 * Gemini on top of the intelligence layer: a counselling brief for a student
 * at risk, a performance coach's reading of a projection, and a week-by-week
 * study plan built from the student's own learning plan.
 *
 * The scores themselves stay rule-based and explainable (scoring.ts); the
 * model only explains them and proposes what to do. It is given the figures,
 * never the student's name or numbers, and its answer is checked against a
 * schema before anyone sees it. Without a key, or when the call fails, each
 * endpoint answers from built-in rules over the same figures and says so.
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

const KINDS = ['COUNSELLING', 'PARENT_CONTACT', 'REMEDIAL_CLASS', 'FEE_RELIEF', 'MEDICAL_REFERRAL', 'OTHER'] as const;
const OWNERS = ['Mentor', 'Parent', 'Head of department', 'College office', 'Student', 'Counsellor'] as const;

type Source = 'gemini' | 'builtin';
interface Envelope<T> { source: Source; model: string | null; generatedAt: string; cached: boolean; notice: string | null; data: T }

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Briefs are kept for six hours per student and per input: asking again with
 * nothing changed returns the same brief without another model call, while
 * any change in the figures makes a fresh one.
 */
const cache = new Map<string, { at: number; value: Envelope<unknown> }>();
const TTL = 6 * 3_600_000;
setInterval(() => { const now = Date.now(); for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k); }, 600_000).unref();
const keyOf = (kind: string, studentId: string, input: unknown) =>
  `${currentTenant()?.slug ?? 'default'}:${kind}:${studentId}:${crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex')}`;

async function produce<T>(opts: {
  kind: string;
  studentId: string;
  input: unknown;
  refresh: boolean;
  ai: () => Promise<T>;
  builtin: () => T;
}): Promise<Envelope<T>> {
  const key = keyOf(opts.kind, opts.studentId, opts.input);
  const hitCache = cache.get(key);
  if (hitCache && !opts.refresh && Date.now() - hitCache.at < TTL) return { ...(hitCache.value as Envelope<T>), cached: true };
  let env: Envelope<T>;
  if (geminiEnabled) {
    try {
      env = { source: 'gemini', model: geminiModel, generatedAt: new Date().toISOString(), cached: false, notice: null, data: await opts.ai() };
    } catch (err) {
      console.error(`[ai] ${opts.kind} via Gemini failed; using built-in rules`, err instanceof Error ? err.message : err);
      env = {
        source: 'builtin', model: null, generatedAt: new Date().toISOString(), cached: false,
        notice: err instanceof GeminiError && err.status === 429 ? 'Gemini is busy right now, so this was drafted by the built-in rules. Try again shortly.' : 'Gemini could not be reached, so this was drafted by the built-in rules.',
        data: opts.builtin(),
      };
      return env; // a fallback is not cached, so the next ask tries Gemini again
    }
  } else {
    env = { source: 'builtin', model: null, generatedAt: new Date().toISOString(), cached: false, notice: null, data: opts.builtin() };
  }
  cache.set(key, { at: Date.now(), value: env });
  return env;
}

const SYSTEM = `You are an academic adviser inside Resolion Campus OS, an Indian college ERP. You help mentors, heads of department and principals act early for students.

Use only the figures you are given. Never invent a number, a date, a policy or a resource. Do not diagnose medical or mental-health conditions; where wellbeing may be involved, suggest a referral to the college counsellor. Be specific, practical and kind: Indian college context, plain English a busy lecturer can act on today. Refer to the person as "the student" — you are not told their name.`;

// ─── Dropout-risk brief ───────────────────────────────────────────────────────

const RiskBrief = z.object({
  summary: z.string().min(10).max(700).describe('Two or three sentences: how serious this is and why, in plain words'),
  drivers: z.array(z.object({
    factor: z.string().max(60),
    explanation: z.string().max(300).describe('What this figure means for the student and how far it is from safe'),
  })).min(1).max(5),
  actions: z.array(z.object({
    kind: z.enum(KINDS),
    title: z.string().max(80),
    detail: z.string().max(400).describe('Exactly what to do, with the figure it addresses'),
    owner: z.enum(OWNERS),
    dueInDays: z.number().int().min(1).max(60),
  })).min(1).max(4).describe('Most urgent first; do not repeat an intervention that is already open'),
  mentorOpener: z.string().max(400).describe('How the mentor could open the conversation with the student, in a warm first-person voice'),
  parentMessage: z.string().max(500).describe('A short, respectful message to the parent in English, with no blame'),
  parentMessageHi: z.string().max(600).describe('The same message to the parent in Hindi (Devanagari)'),
});
type RiskBrief = z.infer<typeof RiskBrief>;

const kindLabel = (k: string) => k.toLowerCase().replace(/_/g, ' ');

function builtinRiskBrief(a: Assessment, open: string[]): RiskBrief {
  const neg = a.factors.filter((f) => f.direction === 'negative').sort((x, y) => y.contribution - x.contribution);
  const drivers = (neg.length ? neg : a.factors).slice(0, 4).map((f) => ({
    factor: f.factor,
    explanation: f.direction === 'negative'
      ? `${f.value} — adds ${f.contribution} points of the ${a.score}.`
      : `${f.value} — not adding to the risk.`,
  }));
  const actions: RiskBrief['actions'] = [];
  const add = (kind: (typeof KINDS)[number], title: string, detail: string, owner: (typeof OWNERS)[number], dueInDays: number) => {
    if (!open.includes(kind) && !actions.some((x) => x.kind === kind)) actions.push({ kind, title, detail, owner, dueInDays });
  };
  for (const f of neg) {
    if (f.factor === 'Attendance') {
      add('PARENT_CONTACT', 'Call home about attendance', `Attendance is ${f.value}. Agree with the parent on a plan to attend every class for the next four weeks.`, 'Mentor', 3);
      add('COUNSELLING', 'One-to-one with the mentor', 'Find out what is keeping the student away — travel, work, health or a subject they have stopped following.', 'Mentor', 5);
    } else if (f.factor === 'Results' || f.factor === 'Backlogs') {
      add('REMEDIAL_CLASS', 'Remedial classes for weak subjects', `${f.factor}: ${f.value}. Enrol the student in remedial sessions and set a fortnightly check of internal marks.`, 'Head of department', 10);
    } else if (f.factor === 'Fee arrears') {
      add('FEE_RELIEF', 'Check fee relief and scholarships', `${f.value}. Check instalment and scholarship options with the college office before arrears block the exam form.`, 'College office', 7);
    }
  }
  if (actions.length === 0) add('COUNSELLING', 'Check in with the student', 'The score is driven by thin data; a short conversation will show whether anything is wrong.', 'Mentor', 7);
  const worst = neg[0];
  return {
    summary: `Risk score ${a.score} of 100 (${a.band.toLowerCase()}). ${worst ? `The largest share comes from ${worst.factor.toLowerCase()} (${worst.value}).` : 'No single factor stands out.'} Based on ${a.basis}.`,
    drivers,
    actions: actions.slice(0, 4),
    mentorOpener: `I wanted to check in with you — I have noticed ${worst ? worst.factor.toLowerCase() === 'fee arrears' ? 'there are some fees pending' : `your ${worst.factor.toLowerCase()} has slipped` : 'a few things'} and I would like to understand how things are going and how I can help.`,
    parentMessage: `Namaste. This is your ward's mentor at the college. ${worst ? `Their ${worst.factor.toLowerCase()} needs attention (${worst.value}).` : ''} We would like to speak with you this week to agree on how we can support them together.`,
    parentMessageHi: `नमस्ते। मैं महाविद्यालय में आपके पाल्य का मेंटर हूँ। ${worst ? `उनकी ${worst.factor === 'Attendance' ? 'उपस्थिति' : worst.factor === 'Fee arrears' ? 'फीस' : 'पढ़ाई'} पर ध्यान देने की ज़रूरत है (${worst.value})।` : ''} हम इस सप्ताह आपसे बात करना चाहेंगे ताकि मिलकर उनकी सहायता कर सकें।`,
  };
}

aiRouter.post(
  '/risk-brief/:studentId',
  requireRole('FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  validate('params', z.object({ studentId: z.string().min(1) })),
  validate('body', z.object({ refresh: z.boolean().optional() }).default({})),
  asyncHandler(async (req, res) => {
    const studentId = String(req.params.studentId);
    const { studentIds } = await resolveScope(req);
    if (!studentIds.includes(studentId)) throw ApiError.notFound('That student is not in your cohort');
    const refresh = Boolean((req.body as { refresh?: boolean }).refresh);
    if (geminiEnabled) aiQuota(req, 'brief', 40, 10);

    const [scores, projections, interventions, student, history] = await Promise.all([
      assess([studentId]),
      project([studentId]),
      prisma.intervention.findMany({ where: { studentId }, orderBy: { raisedAt: 'desc' }, take: 6, select: { kind: true, outcome: true, raisedAt: true, note: true } }),
      prisma.student.findUnique({ where: { id: studentId }, select: { semester: true, status: true, programme: { select: { name: true, years: true } } } }),
      prisma.riskAssessment.findMany({ where: { studentId }, orderBy: { assessedAt: 'desc' }, take: 4, select: { assessedAt: true, score: true } }),
    ]);
    if (!student) throw ApiError.notFound('No such student');
    const a = scores.get(studentId)!;
    const p = projections.get(studentId) ?? null;
    const open = interventions.filter((i) => i.outcome === 'OPEN').map((i) => i.kind);

    const input = {
      programme: student.programme.name, semester: student.semester, of: student.programme.years * 2, standing: student.status,
      risk: { score: a.score, band: a.band, basis: a.basis, factors: a.factors.map((f) => ({ factor: f.factor, value: f.value, direction: f.direction, points: f.contribution })) },
      trend: history.map((h) => ({ on: h.assessedAt.toISOString().slice(0, 10), score: h.score })),
      internalMarks: p && p.projectedPercent !== null ? { projectedPercent: p.projectedPercent, band: p.band, assessedShare: p.assessedShare, subjects: p.subjects.map((s) => ({ subject: s.name, percent: s.percent })) } : null,
      interventions: interventions.map((i) => ({ kind: i.kind, outcome: i.outcome, raised: i.raisedAt.toISOString().slice(0, 10) })),
    };

    const out = await produce({
      kind: 'risk', studentId, input, refresh,
      ai: async () => {
        const brief = await geminiJson({
          system: SYSTEM,
          prompt: `Write a counselling brief for a mentor about one student flagged by the early-warning model. Explain the score from its factors, then propose up to four interventions. Interventions already open: ${open.length ? open.map(kindLabel).join(', ') : 'none'} — do not propose those kinds again.\n\nRisk bands: LOW <30, MODERATE 30–49, HIGH 50–69, CRITICAL 70+. The attendance bar is 75%; below 50% the student is past recovering by attendance alone.\n\nFigures (JSON):\n${JSON.stringify(input, null, 1)}`,
          schema: RiskBrief,
        });
        return { ...brief, actions: brief.actions.filter((x) => !open.includes(x.kind)) };
      },
      builtin: () => builtinRiskBrief(a, open),
    });
    await recordFor(req, { module: 'Intelligence', action: 'AI risk brief', target: studentId, detail: `${out.source}${out.cached ? ' (cached)' : ''}; score ${a.score}` });
    res.json({ ...out, score: a.score, band: a.band });
  }),
);

// ─── Performance coach ────────────────────────────────────────────────────────

const PerformanceBrief = z.object({
  outlook: z.string().min(10).max(600).describe('Where the student is heading on current marks, and how confident that reading is given the share assessed'),
  subjects: z.array(z.object({
    subject: z.string().max(120),
    status: z.enum(['strong', 'steady', 'at risk']),
    advice: z.string().max(300).describe('One concrete step for this subject'),
  })).max(10),
  targets: z.array(z.string().max(200)).min(1).max(4).describe('Measurable targets for the rest of the term, e.g. "Score 15/20 or more in the next Data Structures test"'),
  teacherNote: z.string().max(400).describe('What the subject teachers or mentor should do'),
});
type PerformanceBrief = z.infer<typeof PerformanceBrief>;

const statusOf = (p: number): PerformanceBrief['subjects'][number]['status'] => (p >= 60 ? 'strong' : p >= 45 ? 'steady' : 'at risk');

function builtinPerformance(p: Projection, cgpa: number | null): PerformanceBrief {
  const sorted = [...p.subjects].sort((x, y) => x.percent - y.percent);
  const weak = sorted.filter((s) => s.percent < 45);
  return {
    outlook: p.projectedPercent === null
      ? 'No internal marks have been approved yet, so there is nothing to project.'
      : `On the ${Math.round(p.assessedShare * 100)}% of internal assessment marked so far, the student is heading for ${p.projectedPercent}% (${(p.band ?? '').replace('_', ' ')})${cgpa !== null ? `, against a CGPA of ${cgpa.toFixed(2)}` : ''}. ${p.assessedShare < 0.5 ? 'Less than half the assessment is marked, so this reading can still move a long way.' : 'Most of the assessment is marked, so this is a firm reading.'}`,
    subjects: sorted.map((s) => ({
      subject: s.name, status: statusOf(s.percent),
      advice: s.percent < 45 ? `At ${s.percent}%, below the pass line: revise the units tested so far and ask the teacher for a re-test or extra practice.` : s.percent < 60 ? `At ${s.percent}%: one more good test lifts this to first class.` : `At ${s.percent}%: keep the pace.`,
    })),
    targets: weak.length
      ? weak.slice(0, 3).map((s) => `Lift ${s.name} from ${s.percent}% to at least 50% by the next internal test`)
      : [`Hold every subject at or above ${Math.max(60, Math.floor((sorted[0]?.percent ?? 60) / 5) * 5)}% for the rest of the term`],
    teacherNote: weak.length ? `Give ${weak.map((s) => s.name).join(', ')} a remedial session and a short re-test within two weeks.` : 'No subject is below the pass line; encourage the student to aim for distinction.',
  };
}

aiRouter.post(
  '/performance-brief/:studentId',
  requireRole('FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'),
  validate('params', z.object({ studentId: z.string().min(1) })),
  validate('body', z.object({ refresh: z.boolean().optional() }).default({})),
  asyncHandler(async (req, res) => {
    const studentId = String(req.params.studentId);
    const { studentIds } = await resolveScope(req);
    if (!studentIds.includes(studentId)) throw ApiError.notFound('That student is not in your cohort');
    const refresh = Boolean((req.body as { refresh?: boolean }).refresh);
    const [projections, results] = await Promise.all([
      project([studentId]),
      prisma.semesterResult.findMany({ where: { studentId, published: true }, orderBy: { semester: 'asc' }, select: { semester: true, sgpa: true, cgpa: true, outcome: true } }),
    ]);
    const p = projections.get(studentId);
    if (!p || p.projectedPercent === null) throw ApiError.conflict('No internal marks have been approved for this student yet, so there is nothing to coach on');
    if (geminiEnabled) aiQuota(req, 'brief', 40, 10);
    const cgpa = results.at(-1)?.cgpa ?? null;
    const input = {
      projection: { projectedPercent: p.projectedPercent, band: p.band, assessedShare: p.assessedShare, subjects: p.subjects.map((s) => ({ subject: s.name, scored: s.scored, max: s.max, percent: s.percent })) },
      pastResults: results.map((r) => ({ semester: r.semester, sgpa: r.sgpa, cgpa: r.cgpa, outcome: r.outcome })),
    };
    const out = await produce({
      kind: 'performance', studentId, input, refresh,
      ai: () => geminiJson({
        system: SYSTEM,
        prompt: `Read this student's term projection like a performance coach. The projection extrapolates approved internal marks; "assessedShare" is the share of internal assessment marked so far, so a low share means a weak reading — say so. Pass line 33% externally; treat below 45% internal as at risk, 60%+ as first class, 75%+ as distinction. Give one line of advice per subject and up to four measurable targets.\n\nFigures (JSON):\n${JSON.stringify(input, null, 1)}`,
        schema: PerformanceBrief,
      }),
      builtin: () => builtinPerformance(p, cgpa),
    });
    await recordFor(req, { module: 'Intelligence', action: 'AI performance brief', target: studentId, detail: `${out.source}${out.cached ? ' (cached)' : ''}; projected ${p.projectedPercent}%` });
    res.json(out);
  }),
);

// ─── Study plan ───────────────────────────────────────────────────────────────

const StudyPlan = z.object({
  message: z.string().max(500).describe('A short encouraging note to the student about the plan, addressed as "you"'),
  weeks: z.array(z.object({
    week: z.number().int().min(1).max(8),
    focus: z.string().max(120),
    tasks: z.array(z.object({
      subjectCode: z.string().max(20),
      task: z.string().max(240).describe('A concrete task, e.g. "Work through Unit 2 notes and solve 10 problems"'),
      resourceId: z.string().max(80).nullable().describe('The id of one resource from the list given, or null'),
      minutes: z.number().int().min(15).max(240),
    })).min(1).max(6),
  })).min(1).max(4),
  habits: z.array(z.string().max(200)).max(4).describe('Study habits that address the weak spots, e.g. attendance'),
});
type StudyPlan = z.infer<typeof StudyPlan>;
type Plan = Awaited<ReturnType<typeof learningPlanFor>>;

function builtinStudyPlan(plan: Plan): StudyPlan {
  const items = plan.plan;
  const weeks: StudyPlan['weeks'] = [];
  for (let w = 1; w <= Math.min(4, Math.max(2, items.length * 2)); w++) {
    const tasks = items.map((p) => {
      const pick = p.resources[(w - 1) % Math.max(1, p.resources.length)];
      return {
        subjectCode: p.subject.code,
        task: pick ? `${w === 1 ? 'Start with' : 'Continue with'} ${pick.title}${p.basis === 'attendance' ? ' and attend every class this week' : ''}` : `Revise this week's ${p.subject.name} classes`,
        resourceId: pick?.id ?? null,
        minutes: p.level === 'needs attention' ? 90 : 60,
      };
    });
    weeks.push({ week: w, focus: items.map((p) => p.subject.name).join(' & ') || 'Revision', tasks });
  }
  const attendanceWeak = items.filter((p) => p.basis === 'attendance');
  return {
    message: items.length ? `This plan puts most of your time on ${items.map((p) => p.subject.name).join(', ')}. Small daily sessions add up — tick them off as you go.` : 'Everything is on track. Keep revising each week.',
    weeks,
    habits: [
      ...(attendanceWeak.length ? [`Attend every ${attendanceWeak.map((p) => p.subject.name).join(' and ')} class until you are above 75%.`] : []),
      'Study at the same time each day, 45–60 minutes at a stretch with a short break.',
      'Bring one question to each teacher every week.',
    ],
  };
}

const studyPlanRoute = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);
  const refresh = Boolean((req.body as { refresh?: boolean } | undefined)?.refresh);
  const plan = await learningPlanFor(studentId);
  if (geminiEnabled) aiQuota(req, 'plan', 20, 10);
  const resources = plan.plan.flatMap((p) => p.resources.map((r) => ({ id: r.id, subjectCode: p.subject.code, kind: r.kind, title: r.title, type: r.type })));
  const input = { programme: plan.student.programme, subjects: plan.subjects, focus: plan.plan.map((p) => ({ code: p.subject.code, name: p.subject.name, basis: p.basis, percent: p.percent, level: p.level })), resources };
  const out = await produce({
    kind: 'plan', studentId, input, refresh,
    ai: async () => {
      const draft = await geminiJson({
        system: SYSTEM,
        prompt: `Build a personalised study plan of two to four weeks for a student, from their own learning plan. Put most time on subjects marked "needs attention", less on "watch". Where a subject is judged on attendance, include attending its classes. Each task may cite one resource by its exact id from the list; never invent a resource. Keep a weekday load of about 60–120 minutes in total. Address the student as "you".\n\nLearning plan (JSON):\n${JSON.stringify(input, null, 1)}`,
        schema: StudyPlan,
      });
      // Only resources that exist survive; an invented id becomes no link at all.
      const ids = new Set(resources.map((r) => r.id));
      const codes = new Set(plan.subjects.map((s) => s.code));
      return { ...draft, weeks: draft.weeks.map((w) => ({ ...w, tasks: w.tasks.filter((t) => codes.has(t.subjectCode)).map((t) => ({ ...t, resourceId: t.resourceId && ids.has(t.resourceId) ? t.resourceId : null })) })).filter((w) => w.tasks.length) };
    },
    builtin: () => builtinStudyPlan(plan),
  });
  const byId = new Map(plan.plan.flatMap((p) => p.resources.map((r) => [r.id, r] as const)));
  await recordFor(req, { module: 'Learning', action: 'AI study plan', target: plan.student.enrolmentNo, detail: `${out.source}${out.cached ? ' (cached)' : ''}` });
  res.json({
    ...out,
    data: {
      ...out.data,
      weeks: out.data.weeks.map((w) => ({ ...w, tasks: w.tasks.map((t) => ({ ...t, resource: t.resourceId ? byId.get(t.resourceId) ?? null : null })) })),
    },
    subjects: plan.subjects,
  });
});

aiRouter.post('/study-plan', validate('body', z.object({ refresh: z.boolean().optional() }).default({})), studyPlanRoute);
aiRouter.post('/study-plan/:studentId', validate('body', z.object({ refresh: z.boolean().optional() }).default({})), studyPlanRoute);
