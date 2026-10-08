/**
 * The student lifecycle — standing on the rolls, promotion, detention,
 * breaks, exits, readmission and graduation — read and changed through
 * /api/lifecycle. The server enforces every rule; these are its shapes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type StudentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'DETAINED' | 'WITHDRAWN' | 'TRANSFERRED' | 'RUSTICATED' | 'GRADUATED';
export type LifecycleAction = 'SUSPEND' | 'REINSTATE' | 'LEAVE' | 'RESUME' | 'DETAIN' | 'WITHDRAW' | 'TRANSFER' | 'RUSTICATE' | 'READMIT' | 'GRADUATE';
export type RequestKind = 'BREAK_OF_STUDY' | 'RESUME' | 'WITHDRAWAL' | 'TRANSFER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: 'Active', ON_LEAVE: 'Break in study', SUSPENDED: 'Suspended', DETAINED: 'Detained',
  WITHDRAWN: 'Withdrawn', TRANSFERRED: 'Transferred out', RUSTICATED: 'Rusticated', GRADUATED: 'Graduated',
};

export const STATUS_STYLE: Record<StudentStatus, string> = {
  ACTIVE: 'bg-[#D1FAE5] text-[#0E7A5F]',
  ON_LEAVE: 'bg-[#EFF6FF] text-[#1D4ED8]',
  SUSPENDED: 'bg-[#FEF9EC] text-[#8A6D1F]',
  DETAINED: 'bg-[#FEF9EC] text-[#8A6D1F]',
  WITHDRAWN: 'bg-[#EDEFF3] text-[#5A6577]',
  TRANSFERRED: 'bg-[#EDEFF3] text-[#5A6577]',
  RUSTICATED: 'bg-[#FEE2E2] text-[#A8242C]',
  GRADUATED: 'bg-[#16264A] text-white',
};

export const REQUEST_LABEL: Record<RequestKind, string> = {
  BREAK_OF_STUDY: 'Break in study', RESUME: 'Resume studies', WITHDRAWAL: 'Withdrawal', TRANSFER: 'Transfer to another institution',
};

export const EVENT_LABEL: Record<string, string> = {
  ADMITTED: 'Admitted', PROMOTED: 'Promoted', DETAINED: 'Detained', LEAVE_STARTED: 'Break in study began', RESUMED: 'Resumed studies',
  SUSPENDED: 'Suspended', REINSTATED: 'Reinstated', WITHDRAWN: 'Withdrawn', TRANSFERRED: 'Transferred out', RUSTICATED: 'Rusticated',
  READMITTED: 'Readmitted', GRADUATED: 'Graduated', CLEARANCE: 'No-dues clearance',
};

export interface HistoryEntry {
  id: string; kind: string; fromStatus: StudentStatus | null; toStatus: StudentStatus | null;
  fromSemester: number | null; toSemester: number | null; term: string | null;
  reason: string; reference: string | null; effectiveOn: string; by: string;
}

export interface ClearanceItem {
  department: string; automatic: boolean; applicable: boolean; cleared: boolean; waived: boolean;
  detail: string; signedBy: string | null; signedAt: string | null; remarks: string | null;
}
export interface Clearance { items: ClearanceItem[]; complete: boolean; pending: string[] }

export interface LifecycleRequest {
  id: string; requestNo: string; kind: RequestKind; reason: string; destination: string | null; returnBy: string | null;
  status: RequestStatus; decisionNote: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string;
}

export interface ProgrammeCohorts {
  id: string; code: string; name: string; shortName: string; years: number; finalSemester: number;
  semesters: Array<{ semester: number; active: number; total: number }>;
}

export interface Overview {
  counts: Record<StudentStatus, number>;
  pendingRequests: number;
  term: string;
  programmes: ProgrammeCohorts[];
  recent: Array<{ id: string; kind: string; student: { id: string; name: string; enrolmentNo: string }; toStatus: StudentStatus | null; fromSemester: number | null; toSemester: number | null; reason: string; by: string; at: string }>;
}

export interface RegisterRow {
  id: string; name: string; enrolmentNo: string; rollNo: string; semester: number; batch: string;
  status: StudentStatus; statusSince: string; programme: string; finalSemester: number; feeDue: number;
}

export interface StudentLifecycle {
  id: string; name: string; enrolmentNo: string; rollNo: string; semester: number; year: number; batch: string;
  status: StudentStatus; statusSince: string; graduatedOn: string | null; mobile: string | null; email: string; signInOpen: boolean;
  programme: { code: string; name: string; shortName: string; years: number; finalSemester: number };
  college: string; currentTerm: string | null; suggestedTerm: string;
  standing: { semestersDeclared: number[]; failedSemesters: number[]; backlogs: Array<{ code: string; name: string; semester: number }>; cgpa: number | null; creditsEarned: number; attendance: number | null; feeDue: number };
  graduation: { eligible: boolean; blockers: string[] };
  clearance: Clearance;
  actions: Array<{ action: LifecycleAction; label: string; needsClearance: boolean; reenrol: 'optional' | 'required' | null }>;
  history: HistoryEntry[];
  requests: LifecycleRequest[];
}

export interface PromotionRow {
  id: string; name: string; rollNo: string; enrolmentNo: string; resultDeclared: boolean; cgpa: number | null;
  backlogs: number; backlogCodes: string[]; attendance: number | null; feeDue: number; flags: string[]; suggestion: 'PROMOTE' | 'DETAIN';
}
export interface PromotionSheet {
  programme: { id: string; name: string; shortName: string; years: number; finalSemester: number };
  semester: number; isFinal: boolean; toSemester: number; nextSemesterSubjects: number; suggestedTerm: string;
  rules: { requireResult: boolean; maxBacklogs: number | null; minAttendance: number | null };
  students: PromotionRow[];
}

export interface GraduationSheet {
  programme: { id: string; name: string; shortName: string; finalSemester: number };
  graduated: number;
  students: Array<{ id: string; name: string; rollNo: string; enrolmentNo: string; cgpa: number | null; creditsEarned: number; eligible: boolean; blockers: string[] }>;
}

export interface QueueRow extends LifecycleRequest {
  student: { id: string; name: string; enrolmentNo: string; semester: number; status: StudentStatus; programme: string };
}

export interface MyLifecycle {
  status: StudentStatus; statusSince: string; graduatedOn: string | null; semester: number; batch: string;
  programme: string; finalSemester: number; history: HistoryEntry[]; clearance: Clearance;
  requests: LifecycleRequest[]; canApply: RequestKind[];
}

const qs = (o: Record<string, string | number | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const useLifecycleOverview = () =>
  useQuery({ queryKey: ['lifecycle', 'overview'], queryFn: () => api<Overview>('/api/lifecycle/overview') });

export const useRegister = (f: { status?: string; programmeId?: string; semester?: string; q?: string }) =>
  useQuery({ queryKey: ['lifecycle', 'register', f], queryFn: () => api<{ total: number; shown: number; students: RegisterRow[] }>(`/api/lifecycle/students?${qs(f)}`) });

export const useStudentLifecycle = (id: string | null) =>
  useQuery({ queryKey: ['lifecycle', 'student', id], enabled: !!id, queryFn: () => api<StudentLifecycle>(`/api/lifecycle/students/${id}`) });

export const usePromotionSheet = (p: { programmeId: string; semester: string; maxBacklogs?: string; minAttendance?: string; requireResult?: string }) =>
  useQuery({
    queryKey: ['lifecycle', 'promotion', p], enabled: !!p.programmeId && !!p.semester,
    queryFn: () => api<PromotionSheet>(`/api/lifecycle/promotion?${qs(p)}`),
  });

export const useGraduationSheet = (programmeId: string) =>
  useQuery({ queryKey: ['lifecycle', 'graduation', programmeId], enabled: !!programmeId, queryFn: () => api<GraduationSheet>(`/api/lifecycle/graduation?programmeId=${programmeId}`) });

export const useRequestQueue = (status: string) =>
  useQuery({ queryKey: ['lifecycle', 'requests', status], queryFn: () => api<QueueRow[]>(`/api/lifecycle/requests?${qs({ status })}`) });

export const useMyLifecycle = () =>
  useQuery({ queryKey: ['lifecycle', 'me'], queryFn: () => api<MyLifecycle>('/api/lifecycle/me') });

/** Every lifecycle write invalidates every lifecycle read: the screens overlap. */
export function useLifecycleMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lifecycle'] });
      void qc.invalidateQueries({ queryKey: ['records'] });
    },
  });
}

export const transitionStudent = (id: string, body: { action: LifecycleAction; reason: string; reference?: string; effectiveOn?: string; semester?: number; term?: string }) =>
  api<{ to: StudentStatus; certificates: string[]; enrolled: number }>(`/api/lifecycle/students/${id}/transition`, { method: 'POST', body });

export const signClearance = (id: string, body: { department: string; cleared: boolean; remarks?: string }) =>
  api<Clearance>(`/api/lifecycle/students/${id}/clearance`, { method: 'POST', body });

export const surrenderPass = (id: string) =>
  api<Clearance>(`/api/lifecycle/students/${id}/clearance/surrender-pass`, { method: 'POST' });

export const commitPromotion = (body: { programmeId: string; semester: number; term: string; reference?: string; decisions: Array<{ studentId: string; decision: 'PROMOTE' | 'DETAIN' | 'HOLD'; reason?: string }> }) =>
  api<{ promoted: number; detained: number; skipped: Array<{ studentId: string; name: string; reason: string }>; toSemester: number; term: string; subjects: number }>('/api/lifecycle/promotion', { method: 'POST', body });

export const commitGraduation = (body: { studentIds: string[]; reference: string; effectiveOn?: string }) =>
  api<{ graduated: number; skipped: Array<{ studentId: string; reason: string }> }>('/api/lifecycle/graduation', { method: 'POST', body });

export const decideRequest = (id: string, body: { approve: boolean; note: string; reference?: string; semester?: number; term?: string }) =>
  api<LifecycleRequest>(`/api/lifecycle/requests/${id}/decide`, { method: 'POST', body });

export const applyForChange = (body: { kind: RequestKind; reason: string; destination?: string; returnBy?: string }) =>
  api<LifecycleRequest>('/api/lifecycle/me/requests', { method: 'POST', body });

export const cancelApplication = (id: string) =>
  api<LifecycleRequest>(`/api/lifecycle/me/requests/${id}/cancel`, { method: 'POST' });

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
