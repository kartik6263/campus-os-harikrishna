/**
 * Server state for the intelligence layer (Phase 10).
 *
 * The score is the server's and so is its working: every factor arrives with
 * the weight it carried and the number it contributed, and those contributions
 * sum to the score exactly. Nothing here recomputes a risk figure — if the
 * screen disagreed with the API, the mentor would be reading a third number
 * that exists nowhere else.
 *
 * One deliberate absence: there is no confidence percentage. The model reports
 * how many records it had to go on, which is a real quantity; a confidence
 * figure would be invented, and the screens say "records behind it" instead.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type ApiBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface ApiFactor {
  factor: string;
  value: string;
  direction: 'negative' | 'positive' | 'neutral';
  weight: number;
  contribution: number;
}

export interface ApiRiskRow {
  id: string;
  enrolmentNo: string;
  rollNo: string;
  name: string;
  programme: string;
  semester: number;
  mentor: string | null;
  score: number;
  band: ApiBand;
  basis: string;
  dataPoints: number;
  factors: ApiFactor[];
  openInterventions: number;
}

export interface ApiRiskList {
  scope: 'college' | 'mentees';
  model: { weights: Record<string, number>; note: string };
  totals: { assessed: number; critical: number; high: number; moderate: number; low: number };
  students: ApiRiskRow[];
}

export interface ApiIntervention {
  id: string;
  kind: 'COUNSELLING' | 'PARENT_CONTACT' | 'REMEDIAL_CLASS' | 'FEE_RELIEF' | 'MEDICAL_REFERRAL' | 'OTHER';
  note: string;
  raisedBy: string;
  raisedAt: string;
  dueOn: string | null;
  outcome: 'OPEN' | 'IMPROVED' | 'NO_CHANGE' | 'WORSENED' | 'WITHDRAWN';
  outcomeNote: string | null;
  closedAt: string | null;
  scoreAtRaise: number | null;
  scoreSince: number | null;
}

export interface ApiProjection {
  studentId: string;
  assessedShare: number;
  internalScored: number;
  internalMax: number;
  projectedPercent: number | null;
  band: 'distinction' | 'first_class' | 'second_class' | 'pass' | 'below_pass' | null;
  subjects: Array<{ code: string; name: string; scored: number; max: number; percent: number }>;
}

export interface ApiRiskDetail {
  student: {
    id: string;
    enrolmentNo: string;
    rollNo: string;
    name: string;
    programme: string;
    semester: number;
    mentor: string | null;
  };
  current: { score: number; band: ApiBand; basis: string; dataPoints: number; factors: ApiFactor[] };
  movement: {
    since: string;
    was: number;
    change: number;
    direction: 'improved' | 'worsened' | 'unchanged';
  } | null;
  history: Array<{ assessedAt: string; score: number; band: ApiBand; basis: string; dataPoints: number }>;
  projection: ApiProjection | null;
  interventions: ApiIntervention[];
}

export interface ApiProjectionRow extends ApiProjection {
  name: string;
  enrolmentNo: string;
  programme: string;
  semester: number;
  weakest: { code: string; name: string; percent: number } | null;
}

export interface ApiProjectionList {
  scope: 'college' | 'mentees';
  note: string;
  totals: { projected: number; notYetAssessable: number; belowPass: number };
  students: ApiProjectionRow[];
}

export interface ApiCohort {
  scope: 'college' | 'mentees';
  riskBands: { critical: number; high: number; moderate: number; low: number };
  attendanceDistribution: Array<{ from: number; to: number; students: number }>;
  subjectPassRates: Array<{ code: string; name: string; sat: number; passed: number; passPercent: number }>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const riskKeys = {
  list: ['intelligence', 'risk'] as const,
  one: (id: string) => ['intelligence', 'risk', id] as const,
  projection: ['intelligence', 'projection'] as const,
  cohort: ['intelligence', 'cohort'] as const,
};

export const useRiskList = () =>
  useQuery({ queryKey: riskKeys.list, queryFn: () => api<ApiRiskList>('/api/intelligence/risk') });

export const useRiskDetail = (studentId: string | null) =>
  useQuery({
    queryKey: riskKeys.one(studentId ?? ''),
    queryFn: () => api<ApiRiskDetail>(`/api/intelligence/risk/${studentId}`),
    enabled: !!studentId,
  });

export const useProjection = () =>
  useQuery({
    queryKey: riskKeys.projection,
    queryFn: () => api<ApiProjectionList>('/api/intelligence/projection'),
  });

export const useCohort = () =>
  useQuery({ queryKey: riskKeys.cohort, queryFn: () => api<ApiCohort>('/api/intelligence/cohort') });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useRaiseIntervention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      studentId: string;
      kind: ApiIntervention['kind'];
      note: string;
      dueOn?: string;
    }) => api<{ id: string; scoreAtRaise: number | null }>('/api/intelligence/interventions', {
      method: 'POST',
      body,
    }),
    onSuccess: (_r, body) => {
      void qc.invalidateQueries({ queryKey: riskKeys.one(body.studentId) });
      void qc.invalidateQueries({ queryKey: riskKeys.list });
    },
  });
}

export function useCloseIntervention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      studentId: string;
      outcome: 'IMPROVED' | 'NO_CHANGE' | 'WORSENED' | 'WITHDRAWN';
      outcomeNote: string;
    }) =>
      api<{ outcome: string; scoreAtRaise: number | null; scoreNow: number; change: number | null }>(
        `/api/intelligence/interventions/${id}/close`,
        { method: 'POST', body: { outcome: body.outcome, outcomeNote: body.outcomeNote } },
      ),
    onSuccess: (_r, body) => {
      void qc.invalidateQueries({ queryKey: riskKeys.one(body.studentId) });
      void qc.invalidateQueries({ queryKey: riskKeys.list });
    },
  });
}

export function useTakeSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ assessedAt: string; assessed: number; critical: number; high: number }>(
        '/api/intelligence/risk/snapshot',
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['intelligence'] });
    },
  });
}

// ─── The legacy adapter ───────────────────────────────────────────────────────

export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low';

const LEVEL: Record<ApiBand, RiskLevel> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
};

export interface LegacyRiskFactor {
  factor: string;
  value: string;
  direction: 'negative' | 'positive' | 'neutral';
  weight: number;
  /** Points this factor actually put on the score, out of 100. */
  contribution: number;
}

export interface LegacyAtRiskStudent {
  id: string;
  name: string;
  enrolmentNo: string;
  programme: string;
  semester: number;
  college: string;
  riskScore: number;
  riskLevel: RiskLevel;
  /** How many records the score rests on. Not a confidence percentage. */
  dataPoints: number;
  basis: string;
  riskFactors: LegacyRiskFactor[];
  openInterventions: number;
  mentorName: string;
}

const COLLEGE = 'Govt. Maharani Vasundhara Raje Girls College, Demo City';

function toLegacy(r: ApiRiskRow): LegacyAtRiskStudent {
  return {
    id: r.id,
    name: r.name,
    enrolmentNo: r.enrolmentNo,
    programme: r.programme,
    semester: r.semester,
    college: COLLEGE,
    riskScore: r.score,
    riskLevel: LEVEL[r.band],
    dataPoints: r.dataPoints,
    basis: r.basis,
    riskFactors: r.factors,
    openInterventions: r.openInterventions,
    mentorName: r.mentor ?? 'No mentor assigned',
  };
}

/**
 * The at-risk list in the shape the screen already renders.
 *
 * The band counts come from the server's own totals rather than being counted
 * again here, so the tiles and the list can never disagree.
 */
export function useAtRiskStudents() {
  const query = useRiskList();

  const students = useMemo(
    () => (query.data?.students ?? []).map(toLegacy),
    [query.data],
  );

  const distribution = useMemo(() => {
    const t = query.data?.totals;
    return {
      critical: t?.critical ?? 0,
      high: t?.high ?? 0,
      moderate: t?.moderate ?? 0,
      low: t?.low ?? 0,
      total: t?.assessed ?? 0,
    };
  }, [query.data]);

  return {
    students,
    distribution,
    scope: query.data?.scope ?? 'mentees',
    model: query.data?.model,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** The intervention kinds, with the wording the screen puts in its dropdown. */
export const INTERVENTION_KINDS: Array<{ value: ApiIntervention['kind']; label: string }> = [
  { value: 'COUNSELLING', label: 'Counselling session' },
  { value: 'PARENT_CONTACT', label: 'Contacted the family' },
  { value: 'REMEDIAL_CLASS', label: 'Remedial class' },
  { value: 'FEE_RELIEF', label: 'Fee relief or scholarship' },
  { value: 'MEDICAL_REFERRAL', label: 'Medical referral' },
  { value: 'OTHER', label: 'Something else' },
];

export const OUTCOMES: Array<{ value: 'IMPROVED' | 'NO_CHANGE' | 'WORSENED' | 'WITHDRAWN'; label: string }> = [
  { value: 'IMPROVED', label: 'Improved' },
  { value: 'NO_CHANGE', label: 'No change' },
  { value: 'WORSENED', label: 'Worsened' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

export const kindLabel = (kind: ApiIntervention['kind']) =>
  INTERVENTION_KINDS.find((k) => k.value === kind)?.label ?? kind;

/** Day-month-year, the way every other screen in this app prints a date. */
export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-IN', { month: 'short' })}-${d.getFullYear()}`;
}
