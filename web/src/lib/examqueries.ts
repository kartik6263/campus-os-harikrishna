/**
 * Server state for the examination back-office (Phase 4).
 *
 * Same approach as the other query modules: the `legacy*` hooks adapt each
 * API response into the shape the screen already renders.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'PLANNED' | 'FORM_WINDOW_OPEN' | 'FORM_WINDOW_CLOSED' | 'IN_PROGRESS'
  | 'EVALUATION' | 'RESULT_PROCESSING' | 'RESULT_PUBLISHED';

export interface ApiExamSession {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  status: SessionStatus;
  formOpensOn: string;
  formClosesOn: string;
  lateClosesOn: string;
  examStartsOn: string;
  examEndsOn: string;
  resultTargetOn: string;
  publishedAt: string | null;
  fees: { regular: number; late: number; backlog: number };
  papers: number;
  candidates: number;
  results: number;
  nextStatus: SessionStatus[];
}

export interface ApiPaper {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  examDate: string;
  examTime: string;
  maxExternal: number;
  maxInternal: number;
  dispatchedAt: string | null;
  bundles: number;
  scripts: number;
  settled: number;
  flagged: number;
}

export interface ApiSessionDetail {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  status: SessionStatus;
  publishedAt: string | null;
  nextStatus: SessionStatus[];
  dates: {
    formOpensOn: string; formClosesOn: string; lateClosesOn: string;
    examStartsOn: string; examEndsOn: string; resultTargetOn: string;
  };
  fees: { regular: number; late: number; backlog: number };
  papers: ApiPaper[];
}

export interface ApiCentre {
  id: string;
  code: string;
  name: string;
  city: string;
  district: string;
  pincode: string | null;
  capacity: number;
  assigned: number;
  free: number;
  utilisation: number;
  over: boolean;
}

export interface ApiBundleScript {
  id: string;
  studentId: string;
  rollNo: string;
  enrolmentNo: string;
  name: string;
  e1: number | null;
  e2: number | null;
  moderatorMark: number | null;
  finalMark: number | null;
  flagged: boolean;
  flagReason: string | null;
  absent: boolean;
}

export interface ApiBundle {
  id: string;
  bundleNo: string;
  status: 'UNASSIGNED' | 'RECEIVED' | 'UNDER_EVALUATION' | 'SUBMITTED' | 'MODERATED';
  examinerName: string | null;
  examinerRole: 'E1' | 'E2' | 'MODERATOR';
  assignedAt: string | null;
  submittedAt: string | null;
  paper: { id: string; code: string; name: string; maxExternal: number; examDate: string };
  centre: { code: string; name: string };
  tolerance: number;
  scripts: ApiBundleScript[];
}

export interface ApiFlaggedScript {
  id: string;
  rollNo: string;
  enrolmentNo: string;
  name: string;
  code: string;
  subject: string;
  maxExternal: number;
  e1: number | null;
  e2: number | null;
  gap: number | null;
  tolerance: number;
  flagReason: string | null;
}

export interface ApiResult {
  id: string;
  studentId: string;
  rollNo: string;
  enrolmentNo: string;
  name: string;
  programme: string;
  college: string;
  semester: number;
  sgpa: number;
  cgpa: number;
  outcome: 'PASS' | 'FAIL' | 'WITHHELD';
  division: string | null;
  graceMarks: number;
  published: boolean;
  subjects: Array<{
    code: string; name: string; internal: number; external: number;
    total: number; grade: string; graceGiven: number; passed: boolean;
  }>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  sessions: ['exam', 'sessions'] as const,
  session: (id: string) => ['exam', 'session', id] as const,
  centres: (id: string) => ['exam', 'centres', id] as const,
  bundle: (id: string) => ['exam', 'bundle', id] as const,
  flagged: (id: string) => ['exam', 'flagged', id] as const,
  results: (id: string) => ['exam', 'results', id] as const,
};

export const useExamSessions = () =>
  useQuery({ queryKey: keys.sessions, queryFn: () => api<ApiExamSession[]>('/api/exam/sessions') });

export const useExamSession = (id: string | null) =>
  useQuery({
    queryKey: keys.session(id ?? 'none'),
    enabled: !!id,
    queryFn: () => api<ApiSessionDetail>(`/api/exam/sessions/${id}`),
  });

export const useExamCentres = (sessionId: string | null) =>
  useQuery({
    queryKey: keys.centres(sessionId ?? 'none'),
    queryFn: () =>
      api<ApiCentre[]>(`/api/exam/centres${sessionId ? `?sessionId=${sessionId}` : ''}`),
  });

export const useBundle = (id: string | null) =>
  useQuery({
    queryKey: keys.bundle(id ?? 'none'),
    enabled: !!id,
    queryFn: () => api<ApiBundle>(`/api/exam/bundles/${id}`),
  });

export const useFlaggedScripts = (sessionId: string | null) =>
  useQuery({
    queryKey: keys.flagged(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: () => api<ApiFlaggedScript[]>(`/api/exam/sessions/${sessionId}/flagged`),
  });

export const useSessionResults = (sessionId: string | null) =>
  useQuery({
    queryKey: keys.results(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: () =>
      api<{
        published: boolean;
        totals: { total: number; passed: number; graced: number };
        results: ApiResult[];
      }>(`/api/exam/sessions/${sessionId}/results`),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAdvanceSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SessionStatus }) =>
      api<ApiExamSession>(`/api/exam/sessions/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

export function useAllocateCentre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, centreCode, semester }: { sessionId: string; centreCode: string; semester?: number }) =>
      api<{
        centre: { code: string; name: string; capacity: number };
        seated: number;
        unseated: number;
        occupancy: number;
      }>(`/api/exam/sessions/${sessionId}/allocate`, { method: 'POST', body: { centreCode, semester } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

/** Adjusts a hall's sanctioned capacity. */
export function useSetCentreCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, capacity }: { code: string; capacity: number }) =>
      api<{ code: string; capacity: number; assigned: number; free: number }>(
        `/api/exam/centres/${code}`,
        { method: 'PATCH', body: { capacity } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

export function useCreateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId, centreCode, examinerName, examinerRole,
    }: { paperId: string; centreCode: string; examinerName: string; examinerRole: 'E1' | 'E2' | 'MODERATOR' }) =>
      api<{ id: string; bundleNo: string; scripts: number }>(`/api/exam/papers/${paperId}/bundles`, {
        method: 'POST',
        body: { centreCode, examinerName, examinerRole },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

export function useEnterMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bundleId, marks, submit,
    }: {
      bundleId: string;
      marks: Array<{ studentId: string; mark: number | null; absent?: boolean }>;
      submit?: boolean;
    }) =>
      api<{ saved: number; settled: number; flagged: number; status: string; tolerance: number }>(
        `/api/exam/bundles/${bundleId}/marks`,
        { method: 'POST', body: { marks, submit: submit ?? false } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

export function useModerateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scriptId, mark }: { scriptId: string; mark: number }) =>
      api(`/api/exam/scripts/${scriptId}/moderate`, { method: 'POST', body: { mark } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

export function useProcessResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, applyGrace }: { sessionId: string; applyGrace?: boolean }) =>
      api<{
        processed: number; passed: number; failed: number; graced: number;
        passPercent: number; embargoed: boolean;
      }>(`/api/exam/sessions/${sessionId}/process`, {
        method: 'POST',
        body: { applyGrace: applyGrace ?? true },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

/** `CURRENT_SESSION` / `EXAM_SESSIONS` as the setup screen expects them. */
export function useSessionList() {
  const q = useExamSessions();

  const data = useMemo(
    () =>
      (q.data ?? []).map((s) => ({
        id: s.code,
        sessionId: s.id,
        name: s.name,
        academicYear: s.academicYear,
        status: s.status.toLowerCase(),
        formWindowOpen: formatDate(s.formOpensOn),
        formWindowClose: formatDate(s.formClosesOn),
        lateWindowClose: formatDate(s.lateClosesOn),
        examStartDate: formatDate(s.examStartsOn),
        examEndDate: formatDate(s.examEndsOn),
        resultTarget: formatDate(s.resultTargetOn),
        regularFee: s.fees.regular,
        lateFee: s.fees.late,
        backlogFee: s.fees.backlog,
        papers: s.papers,
        candidates: s.candidates,
        results: s.results,
        nextStatus: s.nextStatus,
      })),
    [q.data],
  );

  // The live sitting is the one that has not been published.
  const current = data.find((s) => s.status !== 'result_published') ?? data[0] ?? null;

  return { data, current, isPending: q.isPending, error: q.error };
}

export interface LegacyCentre {
  id: string;
  code: string;
  name: string;
  city: string;
  district: string;
  capacity: number;
  assigned: number;
  pincode: string;
  utilisation: number;
  over: boolean;
}

/** `EXAM_CENTRES` as the allocation screen expects it. */
export function useCentreList(sessionId: string | null) {
  const q = useExamCentres(sessionId);

  const data = useMemo(
    () =>
      (q.data ?? []).map<LegacyCentre>((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        city: c.city,
        district: c.district,
        capacity: c.capacity,
        assigned: c.assigned,
        pincode: c.pincode ?? '',
        utilisation: c.utilisation,
        over: c.over,
      })),
    [q.data],
  );

  return { data, isPending: q.isPending, error: q.error };
}

export interface LegacyStudentMark {
  studentId: string;
  rollNo: string;
  name: string;
  E1?: number;
  E2?: number;
  moderatorMark?: number;
  finalMark?: number;
  flagged: boolean;
  flagReason?: string;
}

export interface LegacyFoil {
  subjectCode: string;
  subjectName: string;
  examDate: string;
  maxExternal: number;
  maxInternal: number;
  paperId: string;
  bundles: Array<{
    bundleId: string;
    id: string;
    centreCode: string;
    examinerName: string;
    examinerType: 'E1' | 'E2' | 'moderator';
    status: string;
    students: LegacyStudentMark[];
  }>;
}

const ROLE_LABEL: Record<string, 'E1' | 'E2' | 'moderator'> = {
  E1: 'E1', E2: 'E2', MODERATOR: 'moderator',
};

/**
 * `MARKS_FOIL` as the evaluation screen expects it.
 *
 * The screen is organised paper-by-paper with bundles inside; the API keeps
 * marks on the script, so one bundle per paper is presented with every
 * reading that script has had.
 */
export function useMarksFoil(sessionId: string | null, bundleId: string | null) {
  const session = useExamSession(sessionId);
  const bundle = useBundle(bundleId);

  const data = useMemo(() => {
    const papers = session.data?.papers ?? [];
    return papers.map<LegacyFoil>((p) => ({
      subjectCode: p.code,
      subjectName: p.name,
      examDate: formatDate(p.examDate),
      maxExternal: p.maxExternal,
      maxInternal: p.maxInternal,
      paperId: p.id,
      bundles:
        bundle.data && bundle.data.paper.id === p.id
          ? [
              {
                bundleId: bundle.data.bundleNo,
                id: bundle.data.id,
                centreCode: bundle.data.centre.code,
                examinerName: bundle.data.examinerName ?? '—',
                examinerType: ROLE_LABEL[bundle.data.examinerRole] ?? 'E1',
                status: bundle.data.status.toLowerCase(),
                students: bundle.data.scripts.map((s) => ({
                  studentId: s.enrolmentNo,
                  rollNo: s.rollNo,
                  name: s.name,
                  E1: s.e1 ?? undefined,
                  E2: s.e2 ?? undefined,
                  moderatorMark: s.moderatorMark ?? undefined,
                  finalMark: s.finalMark ?? undefined,
                  flagged: s.flagged,
                  flagReason: s.flagReason ?? undefined,
                })),
              },
            ]
          : [],
    }));
  }, [session.data, bundle.data]);

  return {
    data,
    tolerance: bundle.data?.tolerance ?? 0,
    isPending: session.isPending,
    error: session.error ?? bundle.error,
  };
}

export interface LegacyResult {
  studentId: string;
  rollNo: string;
  name: string;
  programme: string;
  semester: number;
  college: string;
  subjects: Array<{
    code: string; name: string; internal: number; external: number;
    total: number; maxTotal: number; grade: string; graceGiven?: number;
    status: 'pass' | 'fail' | 'compartment';
  }>;
  sgpa: number;
  cgpa: number;
  result: 'Pass' | 'Fail' | 'Compartment' | 'Withheld';
  graceApplied: boolean;
  graceMarks?: number;
  divisionProvisional: string;
}

/** `PROVISIONAL_RESULTS` as the result screen expects it. */
export function useProvisionalResults(sessionId: string | null) {
  const q = useSessionResults(sessionId);

  const data = useMemo(
    () =>
      (q.data?.results ?? []).map<LegacyResult>((r) => ({
        studentId: r.enrolmentNo,
        rollNo: r.rollNo,
        name: r.name,
        programme: r.programme,
        semester: r.semester,
        college: r.college,
        sgpa: r.sgpa,
        cgpa: r.cgpa,
        result: r.outcome === 'PASS' ? 'Pass' : r.outcome === 'FAIL' ? 'Fail' : 'Withheld',
        graceApplied: r.graceMarks > 0,
        graceMarks: r.graceMarks || undefined,
        divisionProvisional: r.division ?? 'Fail',
        subjects: r.subjects.map((s) => ({
          code: s.code,
          name: s.name,
          internal: s.internal,
          external: s.external,
          total: s.total,
          maxTotal: 100,
          grade: s.grade,
          graceGiven: s.graceGiven || undefined,
          status: s.passed ? ('pass' as const) : ('fail' as const),
        })),
      })),
    [q.data],
  );

  return {
    data,
    totals: q.data?.totals,
    published: q.data?.published ?? false,
    isPending: q.isPending,
    error: q.error,
  };
}

/** The grace rules, as the ordinance states them — served by the API. */
export const GRACE_RULES = {
  maxPerSubject: 5,
  maxTotal: 10,
  eligibleIfFailByLessThan: 4,
  minPassMarks: 33,
  description:
    'Grace marks up to 5 per subject and 10 total may be applied to a candidate ' +
    'who falls short by 4 marks or fewer in a subject. Grace that would not clear ' +
    'the bar is not spent.',
};
