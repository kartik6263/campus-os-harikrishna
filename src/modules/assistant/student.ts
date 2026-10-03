import type { Request } from 'express';
import { z } from 'zod';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { env } from '../../env.js';

/**
 * The student's (and parent's) half of the assistant.
 *
 * Its lookups are the student portal's own endpoints, called in-process with
 * the asker's own token — so it sees exactly what the portal shows them and
 * nothing more. A parent's token resolves to their ward, as in the portal.
 */

async function self<T>(req: Request, path: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: req.headers.authorization ?? '' };
  const tenant = req.headers['x-tenant'];
  if (typeof tenant === 'string') headers['X-Tenant'] = tenant;
  const res = await fetch(`http://127.0.0.1:${env.PORT}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

interface Attendance { threshold: number; overall: { present: number; total: number; percent: number }; subjects: Array<{ code: string; name: string; faculty: string; total: number; present: number; percent: number; meetsThreshold: boolean; classesNeeded: number }> }
interface Fees { summary: { total: number; paid: number; due: number }; items: Array<{ head: string; amount: number; paid: number; outstanding: number; dueDate: string | null }> }
interface Result { semester: number; declaredOn: string; sgpa: number; cgpa: number; outcome: string; subjects: Array<{ code: string; name: string; total: number; grade: string; passed: boolean }> }
interface Timetable { byDay: Record<string, Array<{ time: string; subject: string; code: string; faculty: string; room: string; cancelled: boolean; cancelReason: string | null }>> }

const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const studentLookups = {
  attendance: (req: Request) => self<Attendance>(req, '/api/student/attendance'),
  fees: (req: Request) => self<Fees>(req, '/api/student/fees'),
  results: (req: Request) => self<Result[]>(req, '/api/student/results'),
  timetable: (req: Request) => self<Timetable>(req, '/api/student/timetable'),
  learning: (req: Request) => self<unknown>(req, '/api/learning'),
};

export function studentTools(req: Request, used: string[]) {
  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    used.push(name);
    return JSON.stringify(await fn());
  };
  return [
    betaZodTool({ name: 'my_attendance', description: 'Overall and per-subject attendance, the 75% threshold, and how many more classes are needed in each subject below it.', inputSchema: z.object({}), run: () => run('my_attendance', () => studentLookups.attendance(req))() }),
    betaZodTool({ name: 'my_fees', description: 'Fee heads with amounts billed, paid and outstanding, and due dates.', inputSchema: z.object({}), run: () => run('my_fees', () => studentLookups.fees(req))() }),
    betaZodTool({ name: 'my_results', description: 'Published semester results: SGPA, CGPA, outcome and subject grades.', inputSchema: z.object({}), run: () => run('my_results', () => studentLookups.results(req))() }),
    betaZodTool({ name: 'my_timetable', description: 'The weekly class timetable, including cancelled classes and their reasons.', inputSchema: z.object({}), run: () => run('my_timetable', () => studentLookups.timetable(req))() }),
    betaZodTool({ name: 'my_learning_plan', description: 'Subjects needing attention and the study material recommended for each.', inputSchema: z.object({}), run: () => run('my_learning_plan', () => studentLookups.learning(req))() }),
  ];
}

export function studentSystemPrompt(institution: string, role: string) {
  return `You are the student helpdesk assistant inside Resolion Campus OS for ${institution}. You are speaking with ${role === 'PARENT' ? "a parent about their ward's records" : 'a student about their own records'}.

Answer only from your tools, which return this person's own attendance, fees, results, timetable and learning plan. Never guess a figure. If asked about something the tools do not cover (hostel rooms, library, admissions, other students), say which section of the portal handles it.

Reply in the language the user writes in — English, Hindi, or Hinglish. Be warm, brief and specific: lead with the answer, then one practical next step (for example how many classes to attend to reach 75%, or where to pay a due). Money in ₹ with Indian grouping. Today is ${new Date().toDateString()} (${DAY[new Date().getDay()]}).`;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export async function studentBuiltin(req: Request, question: string, used: string[]): Promise<string> {
  const q = question.toLowerCase();
  const has = (...w: string[]) => w.some((x) => q.includes(x));

  if (has('attendance', 'present', 'absent', 'उपस्थिति', 'हाजिरी', 'attend')) {
    used.push('my_attendance');
    const a = await studentLookups.attendance(req);
    const short = a.subjects.filter((s) => !s.meetsThreshold);
    return `Your overall attendance is **${a.overall.percent}%** (${a.overall.present} of ${a.overall.total} classes).${short.length ? `\n\nBelow ${a.threshold}% in ${short.length} subject${short.length > 1 ? 's' : ''}:\n${short.map((s) => `- **${s.name}** — ${s.percent}%; attend the next **${s.classesNeeded}** classes without a miss to reach ${a.threshold}%`).join('\n')}` : `\n\nEvery subject is at or above ${a.threshold}%.`}`;
  }
  if (has('fee', 'pay', 'due', 'शुल्क', 'फीस', 'बकाया')) {
    used.push('my_fees');
    const f = await studentLookups.fees(req);
    const owing = f.items.filter((i) => i.outstanding > 0);
    return f.summary.due > 0
      ? `You owe **${inr(f.summary.due)}** of ${inr(f.summary.total)}:\n${owing.map((i) => `- ${i.head}: ${inr(i.outstanding)}${i.dueDate ? ` (due ${new Date(i.dueDate).toLocaleDateString('en-IN')})` : ''}`).join('\n')}\n\nPay from the **Fees** section; the receipt is issued at once.`
      : `Nothing is due — all ${inr(f.summary.total)} billed has been paid. Receipts are in the **Fees** section.`;
  }
  if (has('result', 'cgpa', 'sgpa', 'marks', 'grade', 'परिणाम', 'रिज़ल्ट', 'result')) {
    used.push('my_results');
    const r = await studentLookups.results(req);
    const last = r[r.length - 1];
    return last
      ? `Your latest published result is **Semester ${last.semester}** (${last.declaredOn}): SGPA **${last.sgpa}**, CGPA **${last.cgpa}**, ${last.outcome === 'PASS' ? 'passed' : last.outcome.toLowerCase()}.\n\n${last.subjects.map((s) => `- ${s.name}: ${s.total} (${s.grade})`).join('\n')}`
      : 'No result has been published for you yet.';
  }
  if (has('timetable', 'class', 'today', 'tomorrow', 'lecture', 'कक्षा', 'आज')) {
    used.push('my_timetable');
    const t = await studentLookups.timetable(req);
    const day = DAY[(new Date().getDay() + (has('tomorrow', 'कल') ? 1 : 0)) % 7]!;
    const slots = t.byDay[day] ?? [];
    return slots.length
      ? `Your classes ${has('tomorrow', 'कल') ? 'tomorrow' : 'today'} (${day}):\n${slots.map((s) => `- ${s.time} — **${s.subject}**, ${s.room}${s.cancelled ? ` — *cancelled: ${s.cancelReason ?? 'no reason given'}*` : ''}`).join('\n')}`
      : `No classes ${has('tomorrow', 'कल') ? 'tomorrow' : 'today'} (${day}).`;
  }
  used.push('my_attendance', 'my_fees');
  const [a, f] = await Promise.all([studentLookups.attendance(req), studentLookups.fees(req)]);
  return `Here is where you stand:\n- Attendance **${a.overall.percent}%**${a.subjects.some((s) => !s.meetsThreshold) ? ` — below 75% in ${a.subjects.filter((s) => !s.meetsThreshold).length} subject(s)` : ''}\n- Fees due **${inr(f.summary.due)}**\n\nAsk me about your attendance, fees, results, or today's classes.`;
}
