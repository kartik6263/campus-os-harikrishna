/**
 * Server state for the college office (Phase 3) and the examination
 * back-office (Phase 4).
 *
 * Same approach as `queries.ts` and `facultyqueries.ts`: the `legacy*` hooks
 * adapt each API response into the shape the screen already renders, so a
 * screen swaps a mock import for a hook call rather than being rewritten.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type AdmissionStatus = 'PENDING_DOCS' | 'VERIFIED' | 'ENROLLED' | 'REJECTED';
export type ReceiptStatus = 'COMPLETE' | 'PENDING_CLEARANCE' | 'BOUNCED';
export type CertificateStage = 'REQUESTED' | 'COLLEGE_OFFICE' | 'READY' | 'DISPATCHED' | 'REJECTED';
export type ExamEligibility = 'PENDING' | 'ELIGIBLE' | 'SHORTAGE' | 'FEE_DUE' | 'CLEARED';

export interface ApiAdmissionDocument {
  id: string;
  name: string;
  required: boolean;
  uploaded: boolean;
  verified: boolean;
  verifiedBy: string | null;
  verifiedOn: string | null;
  remarks: string | null;
}

export interface ApiAdmission {
  id: string;
  applicationNo: string;
  name: string;
  nameHi: string | null;
  dob: string;
  gender: string | null;
  category: string | null;
  mobile: string | null;
  email: string | null;
  meritRank: number | null;
  admissionDate: string;
  status: AdmissionStatus;
  rejectReason: string | null;
  studentId: string | null;
  programme: { code: string; shortName: string; name: string };
  documentsVerified: number;
  documentsRequired: number;
  readyToEnrol: boolean;
  documents: ApiAdmissionDocument[];
}

export interface ApiReceipt {
  id: string;
  receiptNo: string;
  studentId: string;
  enrolmentNo: string;
  studentName: string;
  programme: string;
  head: string;
  amount: number;
  mode: string;
  instrument: string | null;
  receivedBy: string;
  receivedAt: string;
  status: ReceiptStatus;
  remarks: string | null;
}

export interface ApiCounterStudent {
  id: string;
  enrolmentNo: string;
  rollNo: string;
  name: string;
  semester: number;
  programme: { shortName: string; name: string };
  mobile: string | null;
  totals: { charged: number; paid: number; due: number };
  heads: Array<{ head: string; amount: number; paid: number; due: number; category: string; dueDate: string | null }>;
  instalments: Array<{ id: string; number: number; amount: number; dueDate: string; paidAt: string | null }>;
}

export interface ApiCertificate {
  id: string;
  requestNo: string;
  type: string;
  studentId: string;
  studentName: string;
  enrolmentNo: string;
  rollNo: string;
  programme: string;
  purpose: string;
  priority: 'NORMAL' | 'URGENT';
  stage: CertificateStage;
  fee: number;
  feePaid: boolean;
  requestedOn: string;
  slaDeadline: string;
  daysLeft: number | null;
  overdue: boolean;
  notes: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  rejectReason: string | null;
}

export interface ApiExamForm {
  id: string;
  formNo: string;
  studentId: string;
  studentName: string;
  enrolmentNo: string;
  rollNo: string;
  programme: string;
  semester: number;
  submittedOn: string;
  eligibility: ExamEligibility;
  computedEligibility: 'ELIGIBLE' | 'SHORTAGE' | 'FEE_DUE';
  stale: boolean;
  feeDue: number;
  shortfalls: number;
  remarks: string | null;
  scrutinisedBy: string | null;
  scrutinisedAt: string | null;
  waiver: { requestNo: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; note: string | null } | null;
  subjects: Array<{
    code: string;
    name: string;
    kind: string;
    attendance: number;
    present: number;
    held: number;
    eligible: boolean;
  }>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  admissions: ['office', 'admissions'] as const,
  counter: ['office', 'counter'] as const,
  certificates: ['office', 'certificates'] as const,
  examForms: ['office', 'exam-forms'] as const,
};

export const useAdmissions = () =>
  useQuery({ queryKey: keys.admissions, queryFn: () => api<ApiAdmission[]>('/api/office/admissions') });

export const useCounterDay = () =>
  useQuery({
    queryKey: keys.counter,
    queryFn: () =>
      api<{ totals: { count: number; collected: number; awaitingClearance: number }; receipts: ApiReceipt[] }>(
        '/api/office/counter',
      ),
  });

export const useCertificates = () =>
  useQuery({
    queryKey: keys.certificates,
    queryFn: () =>
      api<{
        totals: { open: number; overdue: number; ready: number };
        types: Array<{ type: string; slaDays: number; fee: number }>;
        requests: ApiCertificate[];
      }>('/api/office/certificates'),
  });

export const useExamForms = () =>
  useQuery({
    queryKey: keys.examForms,
    queryFn: () =>
      api<{
        threshold: number;
        totals: { total: number; eligible: number; shortage: number; feeDue: number; stale: number };
        forms: ApiExamForm[];
      }>('/api/office/exam-forms'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateAdmissionDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      documentId,
      ...body
    }: {
      applicationId: string;
      documentId: string;
      uploaded?: boolean;
      verified?: boolean;
      remarks?: string | null;
    }) =>
      api<ApiAdmission>(`/api/office/admissions/${applicationId}/documents/${documentId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.admissions }),
  });
}

export function useEnrolCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      api<{ studentId: string; enrolmentNo: string; rollNo: string; name: string; email: string; subjectsEnrolled: number }>(
        `/api/office/admissions/${applicationId}/enrol`,
        { method: 'POST' },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['office'] }),
  });
}

export function useRejectAdmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: string; reason: string }) =>
      api<ApiAdmission>(`/api/office/admissions/${applicationId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.admissions }),
  });
}

/** Looks a student up at the counter, by enrolment number, roll number or name. */
export function useCounterLookup() {
  return useMutation({
    mutationFn: (q: string) =>
      api<ApiCounterStudent>(`/api/office/counter/student?q=${encodeURIComponent(q)}`),
  });
}

export function useTakePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      studentId: string;
      head: string;
      amount: number;
      mode: 'CASH' | 'CHEQUE' | 'UPI' | 'DD' | 'CARD' | 'NEFT';
      instrument?: string;
      remarks?: string;
    }) =>
      api<{
        id: string;
        receiptNo: string;
        studentName: string;
        enrolmentNo: string;
        head: string;
        amount: number;
        mode: string;
        instrument: string | null;
        status: ReceiptStatus;
        receivedAt: string;
        appliedTo: Array<{ head: string; amount: number }>;
      }>('/api/office/counter', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['office'] }),
  });
}

export function useSettleReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome, remarks }: { id: string; outcome: 'CLEARED' | 'BOUNCED'; remarks?: string }) =>
      api(`/api/office/counter/${id}/settle`, { method: 'POST', body: { outcome, remarks } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['office'] }),
  });
}

export function useAdvanceCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage,
      notes,
      reason,
    }: {
      id: string;
      stage: 'COLLEGE_OFFICE' | 'READY' | 'DISPATCHED' | 'REJECTED';
      notes?: string;
      reason?: string;
    }) => api<ApiCertificate>(`/api/office/certificates/${id}/advance`, { method: 'POST', body: { stage, notes, reason } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.certificates }),
  });
}

export function useMarkCertificateFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<ApiCertificate>(`/api/office/certificates/${id}/fee`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.certificates }),
  });
}

/** Sends a form the office cannot clear to the Principal as an eligibility waiver. */
export function useReferExamForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<{ requestNo: string; status: string }>(`/api/office/exam-forms/${id}/refer`, { method: 'POST', body: { reason } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.examForms }),
  });
}

/** Reminds students of what they owe, on the app. */
export function useRemindDues() {
  return useMutation({
    mutationFn: (b: { studentIds: string[]; note?: string }) =>
      api<{ sent: number; skipped: number }>('/api/office/finance/remind', { method: 'POST', body: b }),
  });
}

export function useDecideExamForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, remarks }: { id: string; decision: 'CLEAR' | 'HOLD'; remarks?: string }) =>
      api(`/api/office/exam-forms/${id}/decide`, { method: 'POST', body: { decision, remarks } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.examForms }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

export interface LegacyDocumentStatus {
  id: string;
  name: string;
  required: boolean;
  uploaded: boolean;
  verified: boolean;
  verifiedBy?: string;
  verifiedOn?: string;
  remarks?: string;
}

export interface LegacyAdmissionStudent {
  id: string;
  applicationId: string;
  name: string;
  dob: string;
  category: string;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  email: string;
  programme: string;
  admissionDate: string;
  meritRank?: number;
  documents: LegacyDocumentStatus[];
  status: 'pending_docs' | 'verified' | 'enrolled' | 'rejected';
  feeStatus: 'unpaid' | 'partial' | 'paid';
  readyToEnrol: boolean;
}

/** `ADMISSION_QUEUE` as the admission screen expects it. */
export function useAdmissionQueue() {
  const q = useAdmissions();

  const data = useMemo(
    () =>
      (q.data ?? []).map<LegacyAdmissionStudent>((a) => ({
        // The screen keys on `id`, and prints it as the application number.
        id: a.applicationNo,
        applicationId: a.id,
        name: a.name,
        dob: formatDate(a.dob),
        category: a.category ?? 'General',
        gender: (a.gender as 'Male' | 'Female' | 'Other') ?? 'Other',
        mobile: a.mobile ?? '—',
        email: a.email ?? '—',
        programme: `${a.programme.shortName} (I Sem)`,
        admissionDate: formatDate(a.admissionDate),
        meritRank: a.meritRank ?? undefined,
        status: a.status.toLowerCase() as LegacyAdmissionStudent['status'],
        // The counter tracks fees on the ledger, not on the application.
        feeStatus: a.status === 'ENROLLED' ? 'paid' : 'unpaid',
        readyToEnrol: a.readyToEnrol,
        documents: a.documents.map((d) => ({
          id: d.id,
          name: d.name,
          required: d.required,
          uploaded: d.uploaded,
          verified: d.verified,
          verifiedBy: d.verifiedBy ?? undefined,
          verifiedOn: d.verifiedOn ? formatDate(d.verifiedOn) : undefined,
          remarks: d.remarks ?? undefined,
        })),
      })),
    [q.data],
  );

  return { data, isPending: q.isPending, error: q.error };
}

export interface LegacyCounterTransaction {
  id: string;
  studentId: string;
  studentName: string;
  programme: string;
  head: string;
  amount: number;
  mode: 'Cash' | 'Cheque' | 'UPI' | 'DD' | 'Card' | 'NEFT';
  chequeNo?: string;
  upiRef?: string;
  ddNo?: string;
  receivedBy: string;
  date: string;
  time: string;
  receiptNo: string;
  status: 'complete' | 'pending_clearance' | 'bounced';
}

const MODE_LABEL: Record<string, LegacyCounterTransaction['mode']> = {
  CASH: 'Cash', CHEQUE: 'Cheque', UPI: 'UPI', DD: 'DD', CARD: 'Card', NEFT: 'NEFT',
};

/** The enum the API takes, from the label the form shows. */
export const MODE_TO_API: Record<string, 'CASH' | 'CHEQUE' | 'UPI' | 'DD' | 'CARD' | 'NEFT'> = {
  Cash: 'CASH', Cheque: 'CHEQUE', UPI: 'UPI', DD: 'DD', Card: 'CARD', NEFT: 'NEFT',
};

export function receiptToLegacy(r: ApiReceipt): LegacyCounterTransaction {
  const when = new Date(r.receivedAt);
  return {
    id: r.id,
    studentId: r.enrolmentNo,
    studentName: r.studentName,
    programme: r.programme,
    head: r.head,
    amount: r.amount,
    mode: MODE_LABEL[r.mode] ?? 'Cash',
    chequeNo: r.mode === 'CHEQUE' ? (r.instrument ?? undefined) : undefined,
    upiRef: r.mode === 'UPI' ? (r.instrument ?? undefined) : undefined,
    ddNo: r.mode === 'DD' ? (r.instrument ?? undefined) : undefined,
    receivedBy: r.receivedBy,
    date: formatDate(r.receivedAt),
    time: when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    receiptNo: r.receiptNo,
    status: r.status.toLowerCase() as LegacyCounterTransaction['status'],
  };
}

/** `COUNTER_TRANSACTIONS` as the fee counter expects it. */
export function useCounterTransactions() {
  const q = useCounterDay();
  const data = useMemo(() => (q.data?.receipts ?? []).map(receiptToLegacy), [q.data]);
  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyCertItem {
  id: string;
  type: string;
  studentName: string;
  studentId: string;
  programme: string;
  requestedOn: string;
  slaDeadline: string;
  priority: 'normal' | 'urgent';
  stage: 'requested' | 'college_office' | 'ready' | 'dispatched' | 'rejected';
  fee: number;
  feePaid: boolean;
  purpose: string;
  notes?: string;
  daysLeft: number | null;
  overdue: boolean;
  requestId: string;
}

/** `CERT_QUEUE` as the certificate screen expects it. */
export function useCertificateQueue() {
  const q = useCertificates();

  const data = useMemo(
    () =>
      (q.data?.requests ?? []).map<LegacyCertItem>((c) => ({
        id: c.requestNo,
        requestId: c.id,
        type: c.type,
        studentName: c.studentName,
        studentId: c.enrolmentNo,
        programme: c.programme,
        requestedOn: formatDate(c.requestedOn),
        slaDeadline: formatDate(c.slaDeadline),
        priority: c.priority.toLowerCase() as 'normal' | 'urgent',
        stage: c.stage.toLowerCase() as LegacyCertItem['stage'],
        fee: c.fee,
        feePaid: c.feePaid,
        purpose: c.purpose,
        notes: c.notes ?? undefined,
        daysLeft: c.daysLeft,
        overdue: c.overdue,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyExamFormEntry {
  id: string;
  formId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  programme: string;
  semester: number;
  submittedOn: string;
  feeStatus: 'paid' | 'unpaid' | 'late_fee_pending';
  eligibilityStatus: 'eligible' | 'shortage' | 'fee_due' | 'cleared';
  subjects: Array<{ code: string; name: string; type: 'regular' | 'backlog'; attendance: number; eligible: boolean }>;
  remarks?: string;
  feeDue: number;
  shortfalls: number;
  stale: boolean;
  /** The student's record id, for actions that address the student. */
  studentRecordId: string;
  waiver: ApiExamForm['waiver'];
}

/** `EXAM_SCRUTINY` as the scrutiny screen expects it. */
export function useExamScrutiny() {
  const q = useExamForms();

  const data = useMemo(
    () =>
      (q.data?.forms ?? []).map<LegacyExamFormEntry>((f) => ({
        id: f.formNo,
        formId: f.id,
        studentId: f.enrolmentNo,
        studentName: f.studentName,
        rollNo: f.rollNo,
        programme: f.programme,
        semester: f.semester,
        submittedOn: formatDate(f.submittedOn),
        feeStatus: f.feeDue > 0 ? 'unpaid' : 'paid',
        // What the clerk decided if they have, otherwise what the record says.
        eligibilityStatus: (f.eligibility === 'PENDING'
          ? f.computedEligibility.toLowerCase()
          : f.eligibility.toLowerCase()) as LegacyExamFormEntry['eligibilityStatus'],
        subjects: f.subjects.map((s) => ({
          code: s.code,
          name: s.name,
          type: s.kind.toLowerCase() as 'regular' | 'backlog',
          attendance: s.attendance,
          eligible: s.eligible,
        })),
        remarks: f.remarks ?? undefined,
        feeDue: f.feeDue,
        shortfalls: f.shortfalls,
        stale: f.stale,
        studentRecordId: f.studentId,
        waiver: f.waiver ?? null,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, threshold: q.data?.threshold ?? 75, isPending: q.isPending, error: q.error };
}
