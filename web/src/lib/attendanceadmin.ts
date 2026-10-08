import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Attendance administration (/api/attendance-admin) and a student's own
 * leave and condonation (/api/attendance/leaves, /api/attendance/condonation).
 */

export interface AttendancePolicy {
  threshold: number;
  condonationFloor: number;
  warnBelow: number;
  lateCountsAsPresent: boolean;
  leaveBackdateDays: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Holiday { id: string; date: string; name: string; createdBy: string | null }

export interface ClassSummary {
  programmeId: string; programme: string; semester: number; students: number; average: number | null; shortStudents: number;
  subjects: Array<{ code: string; name: string; faculty: string; held: number; lastHeld: string | null; average: number | null; below: number; warning: number }>;
}
export interface Summary { term: string; threshold: number; warnBelow: number; classes: ClassSummary[] }

export interface Defaulter {
  id: string; name: string; enrolmentNo: string; rollNo: string | null; programme: string; mobile: string | null; parentEmail: string | null; mentor: string | null;
  overall: number; short: Array<{ code: string; present: number; total: number; percent: number }>; lowest: number; condonable: boolean;
  condonation: { requestNo: string; status: CondonationStatus } | null; pendingLeave: number;
}
export interface Defaulters { term: string; threshold: number; floor: number; students: Defaulter[] }

export interface ComplianceRow {
  id: string; name: string; department: string; expected: number; marked: number; draft: number; rate: number | null;
  missing: Array<{ date: string; time: string; code: string; name: string; state: 'missing' | 'draft' }>;
}
export interface Compliance { from: string; to: string; holidays: Array<{ date: string; name: string }>; own: boolean; expected: number; marked: number; rate: number | null; faculty: ComplianceRow[] }

export type LeaveKind = 'MEDICAL' | 'ON_DUTY' | 'PERSONAL';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CondonationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AttendanceLeave {
  id: string; leaveNo: string; studentId: string; kind: LeaveKind; fromDate: string; toDate: string; reason: string; proofFileId: string | null;
  status: LeaveStatus; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; excused: number; createdAt: string;
}
type StudentRef = { id: string; name: string; enrolmentNo: string; semester: number; programme: { shortName: string } };
export type StaffLeave = AttendanceLeave & { student: StudentRef; proof: { id: string; name: string } | null };

export interface Condonation {
  id: string; requestNo: string; studentId: string; term: string; percent: number; kind: 'MEDICAL' | 'OTHER'; reason: string; proofFileId: string | null;
  fee: number; status: CondonationStatus; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string;
}
export type StaffCondonation = Condonation & { student: StudentRef; proof: { id: string; name: string } | null };

export interface MyCondonation {
  term: string; threshold: number; floor: number;
  short: Array<{ code: string; name: string; present: number; total: number; percent: number }>;
  lowest: number | null; eligible: boolean; reason: string | null; request: Condonation | null;
}

export const LEAVE_KIND: Record<LeaveKind, string> = { MEDICAL: 'Medical', ON_DUTY: 'On duty (college activity)', PERSONAL: 'Personal' };
export const LEAVE_STATUS: Record<LeaveStatus, string> = { PENDING: 'Awaiting decision', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Withdrawn' };

const A = '/api/attendance-admin';
const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

// ─── Staff ────────────────────────────────────────────────────────────────────

export const usePolicy = () => useQuery({ queryKey: ['att-admin', 'policy'], queryFn: () => api<AttendancePolicy>(`${A}/policy`) });
export const useHolidays = (year: number) => useQuery({ queryKey: ['att-admin', 'holidays', year], queryFn: () => api<Holiday[]>(`${A}/holidays?year=${year}`) });
export const useSummary = (enabled = true) => useQuery({ queryKey: ['att-admin', 'summary'], queryFn: () => api<Summary>(`${A}/summary`), enabled });
export const useDefaulters = (f: { programmeId?: string; semester?: number; q?: string }, enabled = true) =>
  useQuery({ queryKey: ['att-admin', 'defaulters', f], queryFn: () => api<Defaulters>(`${A}/defaulters${qs(f)}`), enabled });
export const useCompliance = (from: string, to: string) => useQuery({ queryKey: ['att-admin', 'compliance', from, to], queryFn: () => api<Compliance>(`${A}/compliance${qs({ from, to })}`) });
export const useStaffLeaves = (status?: LeaveStatus) => useQuery({ queryKey: ['att-admin', 'leaves', status ?? 'all'], queryFn: () => api<StaffLeave[]>(`${A}/leaves${qs({ status })}`) });
export const useStaffCondonations = (status?: CondonationStatus, enabled = true) =>
  useQuery({ queryKey: ['att-admin', 'condonations', status ?? 'all'], queryFn: () => api<StaffCondonation[]>(`${A}/condonations${qs({ status })}`), enabled });

/** Any decision moves the shortage list, the summary and the students' own percentages. */
function useAdminMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['att-admin'] }); void qc.invalidateQueries({ queryKey: ['attendance'] }); } });
}

export const useSavePolicy = () => useAdminMutation((p: Omit<AttendancePolicy, 'updatedBy' | 'updatedAt'>) => api<AttendancePolicy>(`${A}/policy`, { method: 'PUT', body: p }));
export const useAddHoliday = () => useAdminMutation((h: { date: string; name: string }) => api<Holiday>(`${A}/holidays`, { method: 'POST', body: h }));
export const useRemoveHoliday = () => useAdminMutation((id: string) => api(`${A}/holidays/${id}`, { method: 'DELETE' }));
export const useNotifyDefaulters = () => useAdminMutation((b: { studentIds: string[]; message: string }) => api<{ sent: number }>(`${A}/defaulters/notify`, { method: 'POST', body: b }));
export const useDecideLeave = () => useAdminMutation((b: { id: string; approve: boolean; note?: string }) => api<{ status: LeaveStatus; excused: number }>(`${A}/leaves/${b.id}/decide`, { method: 'POST', body: { approve: b.approve, ...(b.note ? { note: b.note } : {}) } }));
export const useRevokeLeave = () => useAdminMutation((b: { id: string; note: string }) => api<{ restored: number }>(`${A}/leaves/${b.id}/revoke`, { method: 'POST', body: { note: b.note } }));
export const useDecideCondonation = () => useAdminMutation((b: { id: string; approve: boolean; note: string; fee: number }) => api(`${A}/condonations/${b.id}/decide`, { method: 'POST', body: { approve: b.approve, note: b.note, fee: b.fee } }));

// ─── Student / parent ─────────────────────────────────────────────────────────

export const useMyLeaves = () => useQuery({ queryKey: ['attendance', 'leaves'], queryFn: () => api<{ leaves: AttendanceLeave[]; backdateDays: number; today: string }>('/api/attendance/leaves') });
export const useMyCondonation = () => useQuery({ queryKey: ['attendance', 'condonation'], queryFn: () => api<MyCondonation>('/api/attendance/condonation') });

function useSelfMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ['attendance'] }) });
}
export const useApplyLeave = () => useSelfMutation((b: { kind: LeaveKind; fromDate: string; toDate: string; reason: string; proofFileId?: string }) => api<AttendanceLeave>('/api/attendance/leaves', { method: 'POST', body: b }));
export const useCancelLeave = () => useSelfMutation((id: string) => api(`/api/attendance/leaves/${id}/cancel`, { method: 'POST' }));
export const useRequestCondonation = () => useSelfMutation((b: { kind: 'MEDICAL' | 'OTHER'; reason: string; proofFileId?: string }) => api<Condonation>('/api/attendance/condonation', { method: 'POST', body: b }));

/** yyyy-mm-dd → "12 Oct 2026". */
export const ymd = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
