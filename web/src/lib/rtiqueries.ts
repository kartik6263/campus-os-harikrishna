/**
 * Server state for the RTI register (Phase 8).
 *
 * The statutory clock is the server's: `daysRemaining`, `overdue` and
 * `deemedRefusal` are computed from the date of receipt on every read, so the
 * screens display them rather than recomputing them from a printed date.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type ApiRtiStatus =
  | 'RECEIVED' | 'ASSIGNED' | 'UNDER_PROCESS' | 'REPLIED' | 'REJECTED'
  | 'TRANSFERRED' | 'FIRST_APPEAL' | 'CIC_APPEAL' | 'CLOSED';

export interface ApiRtiAppeal {
  id: string;
  appealNo: string;
  tier: 'FIRST' | 'CIC';
  filedOn: string;
  deemedRefusal: boolean;
  grounds: string;
  outcome: 'PENDING' | 'UPHELD' | 'ALLOWED' | 'PARTIALLY_ALLOWED';
  decidedOn: string | null;
  decision: string | null;
  decidedBy: string | null;
}

export interface ApiRtiApplication {
  id: string;
  applicationNo: string;
  applicantName: string;
  applicantAddress: string | null;
  applicantEmail: string | null;
  subject: string;
  particulars: string;
  category: string;
  receivedOn: string;
  bplExempt: boolean;
  feePaid: boolean;
  status: ApiRtiStatus;
  pio: { id: string; name: string; designation: string } | null;
  assignedAt: string | null;
  repliedOn: string | null;
  replyText: string | null;
  pagesSupplied: number | null;
  additionalFee: number | null;
  rejectedOn: string | null;
  rejectionGrounds: Array<{ clause: string; text: string | null }>;
  rejectionReason: string | null;
  transferredTo: string | null;
  transferredOn: string | null;
  deadline: string;
  daysRemaining: number;
  overdue: boolean;
  deemedRefusal: boolean;
  answeredLate: boolean;
  transferWindowClosed: boolean;
  appeals: ApiRtiAppeal[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  applications: ['rti', 'applications'] as const,
  exemptions: ['rti', 'exemptions'] as const,
};

export const useRtiApplications = () =>
  useQuery({
    queryKey: keys.applications,
    queryFn: () =>
      api<{
        statutoryDays: number;
        totals: {
          total: number; open: number; overdue: number;
          deemedRefusals: number; underAppeal: number; answeredLate: number;
        };
        applications: ApiRtiApplication[];
      }>('/api/rti/applications'),
  });

export const useExemptions = () =>
  useQuery({
    queryKey: keys.exemptions,
    queryFn: () =>
      api<{
        statutoryDays: number;
        transferDays: number;
        appealDays: number;
        exemptions: Array<{ clause: string; text: string }>;
      }>('/api/rti/exemptions'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useRegisterRti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      applicantName: string;
      applicantAddress?: string;
      applicantEmail?: string;
      subject: string;
      particulars: string;
      category: string;
      bplExempt?: boolean;
      feePaid?: boolean;
      receivedOn?: string;
    }) => api<ApiRtiApplication>('/api/rti/applications', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useAssignPio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pioEmployeeId }: { id: string; pioEmployeeId: string }) =>
      api<ApiRtiApplication>(`/api/rti/applications/${id}/assign`, {
        method: 'POST',
        body: { pioEmployeeId },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useReplyRti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replyText, pagesSupplied }: { id: string; replyText: string; pagesSupplied: number }) =>
      api<ApiRtiApplication>(`/api/rti/applications/${id}/reply`, {
        method: 'POST',
        body: { replyText, pagesSupplied },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

/** Refusing needs a clause of Section 8; the server checks it is a real one. */
export function useRejectRti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, grounds, reason }: { id: string; grounds: string[]; reason: string }) =>
      api<ApiRtiApplication>(`/api/rti/applications/${id}/reject`, {
        method: 'POST',
        body: { grounds, reason },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useTransferRti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, authority, reason }: { id: string; authority: string; reason?: string }) =>
      api<ApiRtiApplication>(`/api/rti/applications/${id}/transfer`, {
        method: 'POST',
        body: { authority, reason },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useFileAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier, grounds }: { id: string; tier: 'FIRST' | 'CIC'; grounds: string }) =>
      api<{ appealNo: string; tier: string; deemedRefusal: boolean }>(
        `/api/rti/applications/${id}/appeals`,
        { method: 'POST', body: { tier, grounds } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useDecideAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      outcome,
      decision,
    }: { id: string; outcome: 'UPHELD' | 'ALLOWED' | 'PARTIALLY_ALLOWED'; decision: string }) =>
      api<{ outcome: string; applicationStatus: string }>(`/api/rti/appeals/${id}/decide`, {
        method: 'POST',
        body: { outcome, decision },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.applications }),
  });
}

// ═══ Legacy adapter ══════════════════════════════════════════════════════════

export interface LegacyRTIApplication {
  id: string;
  applicationId: string;
  applicantName: string;
  subject: string;
  particulars: string;
  receivedOn: string;
  deadline: string;
  status: 'received' | 'assigned' | 'under_process' | 'replied' | 'rejected' | 'transferred' | 'first_appeal' | 'cic_appeal' | 'closed';
  pio: string;
  pioEmployeeId: string | null;
  daysRemaining: number;
  infoCategory: string;
  /** The Act's own reading of a lapsed period, not merely "late". */
  deemedRefusal: boolean;
  overdue: boolean;
  answeredLate: boolean;
  bplExempt: boolean;
  feePaid: boolean;
  replyText: string | null;
  pagesSupplied: number | null;
  additionalFee: number | null;
  rejectionGrounds: Array<{ clause: string; text: string | null }>;
  rejectionReason: string | null;
  transferredTo: string | null;
  transferWindowClosed: boolean;
  appeals: ApiRtiAppeal[];
}

/** `RTI_APPLICATIONS` as the RTI screens expect it. */
export function useRtiList() {
  const q = useRtiApplications();

  const data = useMemo(
    () =>
      (q.data?.applications ?? []).map<LegacyRTIApplication>((a) => ({
        id: a.applicationNo,
        applicationId: a.id,
        applicantName: a.applicantName,
        subject: a.subject,
        particulars: a.particulars,
        receivedOn: formatDate(a.receivedOn),
        deadline: formatDate(a.deadline),
        status: a.status.toLowerCase() as LegacyRTIApplication['status'],
        pio: a.pio?.name ?? 'Not yet assigned',
        // The assign route takes an employee id, so carry it through.
        pioEmployeeId: null,
        daysRemaining: a.daysRemaining,
        infoCategory: a.category,
        deemedRefusal: a.deemedRefusal,
        overdue: a.overdue,
        answeredLate: a.answeredLate,
        bplExempt: a.bplExempt,
        feePaid: a.feePaid,
        replyText: a.replyText,
        pagesSupplied: a.pagesSupplied,
        additionalFee: a.additionalFee,
        rejectionGrounds: a.rejectionGrounds,
        rejectionReason: a.rejectionReason,
        transferredTo: a.transferredTo,
        transferWindowClosed: a.transferWindowClosed,
        appeals: a.appeals,
      })),
    [q.data],
  );

  return {
    data,
    totals: q.data?.totals,
    statutoryDays: q.data?.statutoryDays ?? 30,
    isPending: q.isPending,
    error: q.error,
  };
}
