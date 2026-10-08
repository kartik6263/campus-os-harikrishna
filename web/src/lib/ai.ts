/**
 * Gemini on the intelligence screens: counselling briefs, performance
 * coaching and study plans (/api/ai). Each answer says whether Gemini wrote
 * it or the built-in rules did, so nobody mistakes one for the other.
 */
import { useMutation } from '@tanstack/react-query';
import { api } from './api';

export type InterventionKind = 'COUNSELLING' | 'PARENT_CONTACT' | 'REMEDIAL_CLASS' | 'FEE_RELIEF' | 'MEDICAL_REFERRAL' | 'OTHER';

export interface Envelope<T> {
  source: 'gemini' | 'builtin';
  model: string | null;
  generatedAt: string;
  cached: boolean;
  notice: string | null;
  data: T;
}

export interface RiskBrief {
  summary: string;
  drivers: Array<{ factor: string; explanation: string }>;
  actions: Array<{ kind: InterventionKind; title: string; detail: string; owner: string; dueInDays: number }>;
  mentorOpener: string;
  parentMessage: string;
  parentMessageHi: string;
}

export interface PerformanceBrief {
  outlook: string;
  subjects: Array<{ subject: string; status: 'strong' | 'steady' | 'at risk'; advice: string }>;
  targets: string[];
  teacherNote: string;
}

export interface PlanResource { id: string; kind: string; title: string; source: string; type: string; url: string | null; size: string | null }

export interface StudyPlan {
  message: string;
  weeks: Array<{ week: number; focus: string; tasks: Array<{ subjectCode: string; task: string; resourceId: string | null; minutes: number; resource: PlanResource | null }> }>;
  habits: string[];
}

export const sourceLabel = (e: { source: 'gemini' | 'builtin'; model: string | null; cached: boolean }) =>
  e.source === 'gemini' ? `✦ Gemini${e.model ? ` · ${e.model}` : ''}${e.cached ? ' · saved' : ''}` : 'Built-in rules';

export const useRiskBrief = (studentId: string) =>
  useMutation({ mutationFn: (refresh: boolean) => api<Envelope<RiskBrief> & { score: number; band: string }>(`/api/ai/risk-brief/${studentId}`, { method: 'POST', body: { refresh } }) });

export const usePerformanceBrief = (studentId: string) =>
  useMutation({ mutationFn: (refresh: boolean) => api<Envelope<PerformanceBrief>>(`/api/ai/performance-brief/${studentId}`, { method: 'POST', body: { refresh } }) });

/** With no id, the signed-in student's own plan (a parent's ward's). */
export const useStudyPlan = (studentId?: string | null) =>
  useMutation({ mutationFn: (refresh: boolean) => api<Envelope<StudyPlan>>(studentId ? `/api/ai/study-plan/${studentId}` : '/api/ai/study-plan', { method: 'POST', body: { refresh } }) });

/** A due date `days` from today, as yyyy-mm-dd in local time. */
export function dueIn(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
