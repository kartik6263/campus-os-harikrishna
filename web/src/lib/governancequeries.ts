/**
 * Server state for the principal's portal (Phase 5).
 *
 * Almost nothing here is stored server-side: the dashboard and the approval
 * inbox are aggregated from the phases below on read, so a figure the
 * principal sees is the figure the record holds.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface ApiDashboard {
  college: { code: string; name: string; district: string | null };
  totalStudents: number;
  totalFaculty: number;
  programmes: number;
  averageAttendance: number;
  atRiskStudents: number;
  attendanceThreshold: number;
  fees: { charged: number; collected: number; pending: number; collectedPercent: number };
  examForms: { total: number; cleared: number };
  results: { declared: number; passPercent: number; distinctions: number; firstClass: number };
  compliance: {
    total: number;
    compliant: number;
    nonCompliant: number;
    status: 'compliant' | 'partial' | 'at_risk' | 'unknown';
  };
}

export interface ApiWorkloadRow {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  isHod: boolean;
  sanctioned: number;
  allotted: number;
  utilisation: number;
  over: boolean;
  under: boolean;
  subjects: number;
  mentees: number;
}

export interface ApiApprovalItem {
  id: string;
  type: string;
  typeLabel: string;
  from: { id: string; name: string; role: string };
  subject: string;
  details: string;
  raisedOn: string;
  slaDeadline: string;
  priority: string;
  status: string;
  amount: number | null;
  meta: Record<string, string>;
  daysLeft: number;
  overdue: boolean;
}

export interface ApiComplianceItem {
  id: string;
  code: string;
  category: string;
  requirement: string;
  authority: string;
  status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'NOT_APPLICABLE';
  evidence: string | null;
  remarks: string | null;
  dueOn: string | null;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  overdue: boolean;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  dashboard: ['governance', 'dashboard'] as const,
  workload: ['governance', 'workload'] as const,
  approvals: ['governance', 'approvals'] as const,
  compliance: ['governance', 'compliance'] as const,
};

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => api<ApiDashboard>('/api/governance/dashboard') });

export const useWorkload = () =>
  useQuery({
    queryKey: keys.workload,
    queryFn: () =>
      api<{
        term: string;
        totals: { staff: number; sanctioned: number; allotted: number; over: number; under: number };
        faculty: ApiWorkloadRow[];
      }>('/api/governance/workload'),
  });

export const useApprovals = () =>
  useQuery({
    queryKey: keys.approvals,
    queryFn: () =>
      api<{
        totals: {
          pending: number;
          overdue: number;
          byType: { faculty_leave: number; marks_entry: number; other: number };
        };
        items: ApiApprovalItem[];
      }>('/api/governance/approvals'),
  });

export const useCompliance = () =>
  useQuery({
    queryKey: keys.compliance,
    queryFn: () =>
      api<{
        totals: {
          total: number; compliant: number; partial: number;
          nonCompliant: number; notApplicable: number; overdue: number;
        };
        items: ApiComplianceItem[];
      }>('/api/governance/compliance'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Decides an inbox item.
 *
 * The type routes it to the module that owns the record, so approving a leave
 * here is the same act the head of department performs in the faculty portal.
 */
export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      id,
      decision,
      note,
    }: {
      type: 'faculty_leave' | 'marks_entry' | 'request';
      id: string;
      decision: 'APPROVE' | 'REJECT';
      note?: string;
    }) =>
      api<{ id: string; type: string; status: string; decidedAt: string }>(
        `/api/governance/approvals/${type}/${id}/decide`,
        { method: 'POST', body: { decision, note } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['governance'] }),
  });
}

export function useReviewCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      status,
      evidence,
      remarks,
    }: {
      code: string;
      status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'NOT_APPLICABLE';
      evidence?: string;
      remarks?: string;
    }) =>
      api<ApiComplianceItem>(`/api/governance/compliance/${code}`, {
        method: 'PATCH',
        body: { status, evidence, remarks },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['governance'] }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

/** `COLLEGE_STATS` as the dashboard expects it. */
export function useCollegeStats() {
  const q = useDashboard();
  const d = q.data;

  return {
    data: d
      ? {
          totalStudents: d.totalStudents,
          totalFaculty: d.totalFaculty,
          programmes: d.programmes,
          currentSemester: '2024–25 (Odd)',
          averageAttendance: d.averageAttendance,
          atRiskStudents: d.atRiskStudents,
          // The screen speaks of "this month"; the ledger is the term's.
          feeCollectedThisMonth: d.fees.collected,
          feeTarget: d.fees.charged,
          pendingFees: d.fees.pending,
          examFormsSubmitted: d.examForms.cleared,
          examFormsTotal: d.examForms.total,
          resultPerformance: {
            passPercent: d.results.passPercent,
            distinctions: d.results.distinctions,
            firstClass: d.results.firstClass,
          },
          affiliationStatus: d.compliance.status,
          college: d.college,
        }
      : null,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyApprovalItem {
  id: string;
  apiType: 'faculty_leave' | 'marks_entry' | 'request';
  type: string;
  typeLabel: string;
  from: { id: string; name: string; role: string };
  subject: string;
  details: string;
  raisedOn: string;
  slaDeadline: string;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'approved' | 'rejected' | 'delegated';
  amount?: number;
  attachments?: string[];
  meta?: Record<string, string>;
  daysLeft: number;
  overdue: boolean;
}

/** The three kinds the decide route knows, from the item's own type. */
function apiTypeOf(type: string): 'faculty_leave' | 'marks_entry' | 'request' {
  if (type === 'faculty_leave') return 'faculty_leave';
  if (type === 'marks_entry') return 'marks_entry';
  return 'request';
}

/** `APPROVAL_QUEUE` as the inbox and dashboard expect it. */
export function useApprovalQueue() {
  const q = useApprovals();

  const data = useMemo(
    () =>
      (q.data?.items ?? []).map<LegacyApprovalItem>((i) => ({
        id: i.id,
        apiType: apiTypeOf(i.type),
        type: i.type,
        typeLabel: i.typeLabel,
        from: i.from,
        subject: i.subject,
        details: i.details,
        raisedOn: formatDate(i.raisedOn),
        slaDeadline: formatDate(i.slaDeadline),
        priority: (i.priority === 'high' || i.priority === 'low' ? i.priority : 'normal') as
          | 'high' | 'normal' | 'low',
        // A submitted marks sheet is pending as far as the inbox is concerned.
        status: (i.status === 'submitted' ? 'pending' : i.status) as LegacyApprovalItem['status'],
        amount: i.amount ?? undefined,
        meta: i.meta,
        daysLeft: i.daysLeft,
        overdue: i.overdue,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyWorkloadRow {
  id: string;
  facultyId: string;
  name: string;
  designation: string;
  department: string;
  weeklyLoad: number;
  maxLoad: number;
  subjects: string[];
  status: 'ok' | 'at_limit' | 'overloaded' | 'underloaded';
}

/** `FACULTY_WORKLOAD` as the allocation screen expects it. */
export function useWorkloadList() {
  const q = useWorkload();

  const data = useMemo(
    () =>
      (q.data?.faculty ?? []).map<LegacyWorkloadRow>((f) => ({
        id: f.employeeId,
        facultyId: f.id,
        name: f.name,
        designation: f.designation,
        department: f.department,
        weeklyLoad: f.allotted,
        maxLoad: f.sanctioned,
        // The API counts assignments; the screen prints subject codes, and a
        // count is the honest thing to show until it sends them.
        subjects: Array.from({ length: f.subjects }, (_, i) => `Paper ${i + 1}`),
        status: f.over
          ? ('overloaded' as const)
          : f.allotted === f.sanctioned
            ? ('at_limit' as const)
            : f.under
              ? ('underloaded' as const)
              : ('ok' as const),
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, term: q.data?.term, isPending: q.isPending, error: q.error };
}

export interface LegacyChecklistItem {
  id: string;
  code: string;
  category: string;
  item: string;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
  value: string;
  due: string;
  remarks?: string;
  authority: string;
  overdue: boolean;
}

/** `AFFILIATION_CHECKLIST` as the compliance screen expects it. */
export function useComplianceChecklist() {
  const q = useCompliance();

  const data = useMemo(
    () =>
      (q.data?.items ?? []).map<LegacyChecklistItem>((i) => ({
        id: i.id,
        code: i.code,
        category: i.category,
        item: i.requirement,
        status: i.status.toLowerCase() as LegacyChecklistItem['status'],
        // The screen's "value" column is where the evidence belongs.
        value: i.evidence ?? '—',
        due: i.dueOn ? formatDate(i.dueOn) : 'Annual',
        remarks: i.remarks ?? undefined,
        authority: i.authority,
        overdue: i.overdue,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}
