/**
 * Server state for the accreditation register (Phase 6).
 *
 * The register's whole point is that a metric says where its answer came
 * from, so the adapters carry `source` and `basis` through rather than
 * flattening every answer into one undifferentiated value.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type MetricSource = 'DERIVED' | 'ENTERED' | 'UNAVAILABLE';

export interface ApiFramework {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxScore: number | null;
  metrics: number;
  derived: number;
  entered: number;
  unavailable: number;
  readiness: number | null;
  returns: { total: number; submitted: number; overdue: number };
}

export interface ApiMetric {
  id: string;
  code: string;
  criterion: number | null;
  criterionTitle: string | null;
  title: string;
  description: string | null;
  target: string | null;
  maxScore: number | null;
  source: MetricSource;
  derivedFrom: string | null;
  value: string | null;
  numeric: number | null;
  score: number | null;
  basis: string;
  evidence: string | null;
  remarks: string | null;
  updatedBy: string | null;
  updatedAt: string;
  answered: boolean;
}

export interface ApiRegister {
  framework: { id: string; code: string; name: string; description: string | null; maxScore: number | null };
  totals: {
    metrics: number; answered: number; derived: number; entered: number;
    unavailable: number; withEvidence: number; readiness: number | null; score: number;
  };
  criteria: Array<{ criterion: number; title: string; metrics: number; answered: number }>;
  metrics: ApiMetric[];
}

export interface ApiReturn {
  id: string;
  code: string;
  name: string;
  framework: string;
  dueOn: string;
  submittedOn: string | null;
  reference: string | null;
  remarks: string | null;
  status: 'submitted' | 'pending' | 'overdue';
  daysLeft: number | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  frameworks: ['accreditation', 'frameworks'] as const,
  register: (code: string) => ['accreditation', 'register', code] as const,
  derivations: ['accreditation', 'derivations'] as const,
  returns: ['accreditation', 'returns'] as const,
};

export const useFrameworks = () =>
  useQuery({ queryKey: keys.frameworks, queryFn: () => api<ApiFramework[]>('/api/accreditation/frameworks') });

export const useRegister = (code: string) =>
  useQuery({
    queryKey: keys.register(code),
    queryFn: () => api<ApiRegister>(`/api/accreditation/${code}/metrics`),
  });

export const useDerivations = () =>
  useQuery({
    queryKey: keys.derivations,
    queryFn: () =>
      api<Array<{ key: string; value: string; numeric: number | null; basis: string; usedBy: string[] }>>(
        '/api/accreditation/derivations',
      ),
  });

export const useReturns = () =>
  useQuery({
    queryKey: keys.returns,
    queryFn: () =>
      api<{
        totals: { total: number; submitted: number; pending: number; overdue: number };
        returns: ApiReturn[];
      }>('/api/accreditation/returns'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Records an answer, or attaches evidence.
 *
 * A derived metric refuses a value or a score — the server names the
 * computation in the error, which is what the screen should show.
 */
export function useUpdateMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string; value?: string; score?: number; evidence?: string; remarks?: string }) =>
      api<ApiMetric>(`/api/accreditation/metrics/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accreditation'] }),
  });
}

export function useSubmitReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      reference,
      submittedOn,
      remarks,
    }: { code: string; reference: string; submittedOn?: string; remarks?: string }) =>
      api<{ code: string; name: string; submittedOn: string; reference: string; late: boolean }>(
        `/api/accreditation/returns/${code}/submit`,
        { method: 'POST', body: { reference, submittedOn, remarks } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accreditation'] }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

export type DataSource = 'live' | 'manual' | 'missing';

/** The screens' three-way source, from the register's own. */
const sourceOf = (s: MetricSource): DataSource =>
  s === 'DERIVED' ? 'live' : s === 'ENTERED' ? 'manual' : 'missing';

export interface LegacyNAACMetric {
  id: string;
  code: string;
  criteria: number;
  criteriaTitle: string;
  title: string;
  description: string;
  targetValue: string;
  currentValue: string | null;
  source: DataSource;
  liveSourceModule?: string;
  evidenceAttached: boolean;
  remarks?: string;
  basis: string;
  answered: boolean;
}

/** `NAAC_METRICS` and `NAAC_CRITERIA` as the NAAC screen expects them. */
export function useNAACRegister() {
  const q = useRegister('NAAC');

  const data = useMemo(
    () =>
      (q.data?.metrics ?? []).map<LegacyNAACMetric>((m) => ({
        id: m.id,
        code: m.code,
        criteria: m.criterion ?? 0,
        criteriaTitle: m.criterionTitle ?? '',
        title: m.title,
        description: m.description ?? '',
        targetValue: m.target ?? '—',
        currentValue: m.answered ? m.value : null,
        source: sourceOf(m.source),
        // Where a live figure comes from, in the screen's own idiom.
        liveSourceModule: m.derivedFrom ?? undefined,
        evidenceAttached: !!m.evidence,
        remarks: m.remarks ?? undefined,
        basis: m.basis,
        answered: m.answered,
      })),
    [q.data],
  );

  const criteria = useMemo(
    () => (q.data?.criteria ?? []).map((c) => c.title),
    [q.data],
  );

  return { data, criteria, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyNIRFParameter {
  id: string;
  metricId: string;
  category: string;
  name: string;
  maxScore: number;
  achievedScore: number | null;
  source: DataSource;
  liveSourceModule?: string;
  notes?: string;
  value: string | null;
  basis: string;
}

/** `NIRF_PARAMETERS` as the NIRF screen expects it. */
export function useNIRFRegister() {
  const q = useRegister('NIRF');

  const data = useMemo(
    () =>
      (q.data?.metrics ?? []).map<LegacyNIRFParameter>((m) => ({
        id: m.code,
        metricId: m.id,
        category: m.criterionTitle ?? 'Other',
        name: m.title,
        maxScore: m.maxScore ?? 0,
        achievedScore: m.score,
        source: sourceOf(m.source),
        liveSourceModule: m.derivedFrom ?? undefined,
        notes: m.remarks ?? undefined,
        value: m.answered ? m.value : null,
        basis: m.basis,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyAisheSection {
  id: string;
  metricId: string;
  title: string;
  filled: boolean;
  auto: boolean;
  module?: string;
  value: string | null;
  basis: string;
}

/** `AISHE_DATA` as the survey screen expects it. */
export function useAISHERegister() {
  const q = useRegister('AISHE');
  const frameworks = useFrameworks();

  const sections = useMemo(
    () =>
      (q.data?.metrics ?? []).map<LegacyAisheSection>((m) => ({
        id: m.code,
        metricId: m.id,
        title: m.title,
        filled: m.answered,
        auto: m.source === 'DERIVED',
        module: m.derivedFrom ?? undefined,
        value: m.answered ? m.value : null,
        basis: m.basis,
      })),
    [q.data],
  );

  // The survey's headline figures are two of its own derived sections.
  const enrolment = (q.data?.metrics ?? []).find((m) => m.derivedFrom === 'enrolment_total');

  return {
    data: {
      academicYear: '2024-25',
      lastSubmitted: '2023-24',
      sections,
      enrollmentTotal: enrolment?.numeric ?? 0,
      facultyTotal: 0,
    },
    returns: frameworks.data?.find((f) => f.code === 'AISHE')?.returns,
    totals: q.data?.totals,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyUGCReturn {
  id: string;
  code: string;
  name: string;
  dueDate: string;
  status: 'submitted' | 'pending' | 'overdue';
  submittedOn: string | null;
  reference: string | null;
  daysLeft: number | null;
  framework: string;
}

/** `UGC_RETURNS` as the returns screen expects it. */
export function useReturnList() {
  const q = useReturns();

  const data = useMemo(
    () =>
      (q.data?.returns ?? []).map<LegacyUGCReturn>((r) => ({
        id: r.code,
        code: r.code,
        name: r.name,
        dueDate: formatDate(r.dueOn),
        status: r.status,
        submittedOn: r.submittedOn ? formatDate(r.submittedOn) : null,
        reference: r.reference,
        daysLeft: r.daysLeft,
        framework: r.framework,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}
