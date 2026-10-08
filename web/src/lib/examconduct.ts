import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Conducting and evaluating a sitting (/api/exam): the examiner panel,
 * bundles in evaluation, hall attendance per paper and unfair-means cases.
 */

export interface Examiner { id: string; name: string; designation: string; institution: string; subjects: string; mobile: string | null; email: string | null; active: boolean; bundles: number; pending: number }
export interface BundleRow {
  id: string; bundleNo: string; status: 'UNASSIGNED' | 'RECEIVED' | 'UNDER_EVALUATION' | 'SUBMITTED' | 'MODERATED'; examinerName: string | null; examinerRole: 'E1' | 'E2' | 'MODERATOR'; examinerId: string | null;
  assignedAt: string | null; submittedAt: string | null; paper: { id: string; code: string; name: string; maxExternal: number }; centre: { code: string; name: string };
  scripts: number; marked: number; flagged: number; tolerance: number;
}
export interface HallSheet {
  paper: { id: string; code: string; name: string; examDate: string; examTime: string; session: { code: string; status: string } };
  candidates: Array<{ studentId: string; name: string; rollNo: string | null; enrolmentNo: string; seatNo: string | null; centre: string; kind: 'REGULAR' | 'BACKLOG'; absent: boolean; marked: boolean; ufm: { caseNo: string; status: string; decision: string | null } | null }>;
}
export interface UfmCase {
  id: string; caseNo: string; status: 'REPORTED' | 'DECIDED'; decision: 'WARNING' | 'PAPER_CANCELLED' | 'SESSION_CANCELLED' | 'DEBARRED' | null; decisionNote: string | null; decidedBy: string | null; decidedAt: string | null;
  description: string; reportedBy: string; createdAt: string; student: { name: string; rollNo: string | null; enrolmentNo: string }; paper: { id: string; code: string; name: string }; evidence: { id: string; name: string } | null;
}
export const UFM_DECISION: Record<string, string> = { WARNING: 'Warning only', PAPER_CANCELLED: 'Paper cancelled', SESSION_CANCELLED: 'Whole sitting cancelled', DEBARRED: 'Sitting cancelled and debarred from the next' };

export const useExaminers = () => useQuery({ queryKey: ['exam', 'examiners'], queryFn: () => api<Examiner[]>('/api/exam/examiners') });
export const useSessionBundles = (sessionId: string | null) => useQuery({ queryKey: ['exam', 'bundles', sessionId], enabled: !!sessionId, queryFn: () => api<BundleRow[]>(`/api/exam/sessions/${sessionId}/bundles`) });
export const useHallSheet = (paperId: string | null) => useQuery({ queryKey: ['exam', 'hall', paperId], enabled: !!paperId, queryFn: () => api<HallSheet>(`/api/exam/papers/${paperId}/attendance`) });
export const useUfmCases = (sessionId: string | null) => useQuery({ queryKey: ['exam', 'ufm', sessionId], enabled: !!sessionId, queryFn: () => api<UfmCase[]>(`/api/exam/sessions/${sessionId}/malpractice`) });

function useExamMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam'] }) });
}
type ExaminerInput = { name: string; designation: string; institution: string; subjects: string; mobile: string; email: string };
export const useSaveExaminer = () => useExamMutation((b: ExaminerInput & { id?: string }) => { const { id, ...body } = b; return id ? api<Examiner>(`/api/exam/examiners/${id}`, { method: 'PATCH', body }) : api<Examiner>('/api/exam/examiners', { method: 'POST', body }); });
export const useToggleExaminer = () => useExamMutation((b: { id: string; active: boolean }) => api(`/api/exam/examiners/${b.id}`, { method: 'PATCH', body: { active: b.active } }));
export const useNewBundle = () => useExamMutation((b: { paperId: string; centreCode: string; examinerId: string; examinerRole: 'E1' | 'E2' | 'MODERATOR' }) => api<{ id: string; bundleNo: string; scripts: number }>(`/api/exam/papers/${b.paperId}/bundles`, { method: 'POST', body: { centreCode: b.centreCode, examinerId: b.examinerId, examinerRole: b.examinerRole } }));
export const useSaveAttendance = () => useExamMutation((b: { paperId: string; absent: string[] }) => api<{ candidates: number; absent: number; present: number }>(`/api/exam/papers/${b.paperId}/attendance`, { method: 'POST', body: { absent: b.absent } }));
export const useReportUfm = () => useExamMutation((b: { paperId: string; studentId: string; description: string; reportedBy: string; evidenceFileId?: string }) => { const { paperId, ...body } = b; return api<{ caseNo: string }>(`/api/exam/papers/${paperId}/malpractice`, { method: 'POST', body }); });
export const useDecideUfm = () => useExamMutation((b: { id: string; decision: string; note: string }) => api(`/api/exam/malpractice/${b.id}/decide`, { method: 'POST', body: { decision: b.decision, note: b.note } }));
