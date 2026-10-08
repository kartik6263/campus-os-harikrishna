import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { downloadPdf } from './export';

/**
 * Fees: the college counter (/api/office/counter), fee administration
 * (/api/fee-admin) and the student's statement (/api/student/fees/statement),
 * plus the receipt and statement PDFs every screen hands out.
 */

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const COUNTER_MODES = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'DD', 'NEFT'] as const;
export type CounterMode = (typeof COUNTER_MODES)[number];
export const MODE_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', CHEQUE: 'Cheque', DD: 'Demand draft', NEFT: 'NEFT / RTGS' };

export interface CounterStudent {
  id: string; enrolmentNo: string; rollNo: string | null; name: string; semester: number; programme: { shortName: string; name: string }; mobile: string | null;
  totals: { charged: number; paid: number; due: number };
  heads: Array<{ id: string; term: string; head: string; amount: number; paid: number; due: number; category: string; dueDate: string | null }>;
  instalments: Array<{ id: string; number: number; amount: number; dueDate: string; paidAt: string | null }>;
}
export interface CounterReceiptRow {
  id: string; receiptNo: string; paymentId: string; studentId: string; enrolmentNo: string; studentName: string; programme: string; head: string; amount: number;
  mode: string; instrument: string | null; receivedBy: string; receivedAt: string; status: 'COMPLETE' | 'PENDING_CLEARANCE' | 'BOUNCED' | 'CANCELLED'; remarks: string | null;
}
export interface TakenPayment {
  id: string; receiptNo: string; studentName: string; enrolmentNo: string; head: string; amount: number; mode: string; instrument: string | null;
  status: string; receivedAt: string; appliedTo: Array<{ head: string; amount: number }>; unallocated: number;
}
export interface StatementReceipt {
  id: string; receiptNo: string | null; txnId: string; date: string; amount: number; mode: string; kind: 'RECEIPT' | 'CONCESSION' | 'REFUND'; status: string; head: string;
  instrument: string | null; receivedBy: string | null; cancelledAt: string | null; cancelReason: string | null; appliedTo: Array<{ head: string; amount: number }>;
}
export interface Statement {
  student: { name: string; enrolmentNo: string; rollNo: string | null; semester: number; programme: { name: string; shortName: string } } | null;
  totals: { charged: number; paid: number; due: number };
  lines: Array<{ date: string; kind: string; ref: string; particulars: string; debit: number; credit: number; balance: number }>;
  receipts: StatementReceipt[];
}
export interface DayBook {
  date: string; collected: number; count: number; cash: number; pendingClearance: number;
  cancelled: Array<{ receiptNo: string | null; amount: number; reason: string | null; by: string | null }>;
  byMode: Array<{ key: string; amount: number }>; byClerk: Array<{ key: string; amount: number }>; byHead: Array<{ key: string; amount: number }>;
  entries: Array<{ id: string; time: string; receiptNo: string | null; student: string; enrolmentNo: string; head: string; amount: number; mode: string; status: string; channel: string; clerk: string | null }>;
  closed: { date: string; expectedCash: number; countedCash: number; difference: number; remarks: string | null; closedBy: string; closedAt: string } | null;
}
type StudentRef = { id: string; name: string; enrolmentNo: string; semester: number; programme: { shortName: string } };
type HeadRef = { head: string; term: string; amount: number; paid: number };
export interface Concession { id: string; concessionNo: string; studentId: string; feeItemId: string; kind: string; amount: number; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requestedBy: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string; student: StudentRef; feeItem: HeadRef }
export interface Refund { id: string; refundNo: string; studentId: string; feeItemId: string; amount: number; reason: string; status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'; requestedBy: string; decidedBy: string | null; decisionNote: string | null; payoutMode: string | null; payoutRef: string | null; paidAt: string | null; createdAt: string; student: StudentRef; feeItem: HeadRef }
export interface FeeStructure {
  id: string; name: string; programmeId: string; programme: string; semester: number; term: string; students: number; total: number;
  heads: Array<{ head: string; category: 'TUITION' | 'DEVELOPMENT' | 'EXAM' | 'OTHER'; amount: number; dueDate: string }>;
  instalments: Array<{ percent: number; dueDate: string }>; appliedAt: string | null; appliedTo: number; createdBy: string;
}
export const CONCESSION_KINDS: Record<string, string> = { MERIT: 'Merit', NEED_BASED: 'Need-based', SIBLING: 'Sibling', STAFF_WARD: 'Staff ward', SPORTS: 'Sports', SCHOLARSHIP: 'Scholarship', OTHER: 'Other' };

const qs = (o: Record<string, string | undefined>) => { const p = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`); return p.length ? `?${p.join('&')}` : ''; };

export const useCounterDay = (date?: string) => useQuery({ queryKey: ['fees', 'counter', date ?? 'recent'], queryFn: () => api<{ totals: { count: number; collected: number; awaitingClearance: number }; receipts: CounterReceiptRow[] }>(`/api/office/counter${qs({ date })}`) });
export const useDayBook = (date: string) => useQuery({ queryKey: ['fees', 'daybook', date], queryFn: () => api<DayBook>(`/api/fee-admin/daybook?date=${date}`) });
export const useConcessions = (status?: string) => useQuery({ queryKey: ['fees', 'concessions', status ?? 'all'], queryFn: () => api<Concession[]>(`/api/fee-admin/concessions${qs({ status })}`) });
export const useRefunds = (status?: string) => useQuery({ queryKey: ['fees', 'refunds', status ?? 'all'], queryFn: () => api<Refund[]>(`/api/fee-admin/refunds${qs({ status })}`) });
export const useStructures = () => useQuery({ queryKey: ['fees', 'structures'], queryFn: () => api<FeeStructure[]>('/api/fee-admin/structures') });
export const useMyStatement = () => useQuery({ queryKey: ['fees', 'statement', 'me'], queryFn: () => api<Statement>('/api/student/fees/statement') });
export const useStudentStatement = (id: string | null) => useQuery({
  queryKey: ['fees', 'statement', id], enabled: !!id,
  queryFn: () => api<Statement & { items: Array<{ id: string; head: string; term: string; category: string; amount: number; paid: number; due: number; dueDate: string | null; fine: boolean }>; concessions: Concession[]; refunds: Refund[]; instalments: Array<{ id: string; term: string; number: number; amount: number; dueDate: string; paidAt: string | null }> }>(`/api/fee-admin/students/${id}/statement`),
});

function useFeeMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries() });
}
export const useLookupStudent = () => useMutation({ mutationFn: (q: string) => api<CounterStudent>(`/api/fee-admin/lookup?q=${encodeURIComponent(q)}`) });
export const useTake = () => useFeeMutation((b: { studentId: string; head: string; amount: number; mode: CounterMode; instrument?: string; remarks?: string; feeItemId?: string }) => api<TakenPayment>('/api/office/counter', { method: 'POST', body: b }));
export const useSettleCheque = () => useFeeMutation((b: { id: string; outcome: 'CLEARED' | 'BOUNCED'; remarks?: string }) => api(`/api/office/counter/${b.id}/settle`, { method: 'POST', body: { outcome: b.outcome, ...(b.remarks ? { remarks: b.remarks } : {}) } }));
export const useCancelReceipt = () => useFeeMutation((b: { paymentId: string; reason: string }) => api<{ reversed: number }>(`/api/fee-admin/receipts/${b.paymentId}/cancel`, { method: 'POST', body: { reason: b.reason } }));
export const useCloseDay = () => useFeeMutation((b: { date: string; countedCash: number; remarks?: string }) => api('/api/fee-admin/daybook/close', { method: 'POST', body: b }));
export const useRequestConcession = () => useFeeMutation((b: { studentId: string; feeItemId: string; kind: string; amount: number; reason: string }) => api<Concession>('/api/fee-admin/concessions', { method: 'POST', body: b }));
export const useDecideConcession = () => useFeeMutation((b: { id: string; approve: boolean; note: string }) => api<{ amount?: number }>(`/api/fee-admin/concessions/${b.id}/decide`, { method: 'POST', body: { approve: b.approve, note: b.note } }));
export const useRequestRefund = () => useFeeMutation((b: { studentId: string; feeItemId: string; amount: number; reason: string }) => api<Refund>('/api/fee-admin/refunds', { method: 'POST', body: b }));
export const useDecideRefund = () => useFeeMutation((b: { id: string; approve: boolean; note: string }) => api(`/api/fee-admin/refunds/${b.id}/decide`, { method: 'POST', body: { approve: b.approve, note: b.note } }));
export const usePayRefund = () => useFeeMutation((b: { id: string; mode: string; reference: string }) => api(`/api/fee-admin/refunds/${b.id}/pay`, { method: 'POST', body: { mode: b.mode, reference: b.reference } }));
export const useSaveStructure = () => useFeeMutation((b: Omit<FeeStructure, 'id' | 'programme' | 'students' | 'total' | 'appliedAt' | 'appliedTo' | 'createdBy'> & { id?: string }) => {
  const { id, ...body } = b;
  return id ? api<FeeStructure>(`/api/fee-admin/structures/${id}`, { method: 'PUT', body }) : api<FeeStructure>('/api/fee-admin/structures', { method: 'POST', body });
});
export const useDeleteStructure = () => useFeeMutation((id: string) => api(`/api/fee-admin/structures/${id}`, { method: 'DELETE' }));
export const useApplyStructure = () => useFeeMutation((b: { id: string; dryRun: boolean }) => api<{ students: number; charges: number; amount: number; instalments: number; skipped: number }>(`/api/fee-admin/structures/${b.id}/apply`, { method: 'POST', body: { dryRun: b.dryRun } }));
export const useLateFines = () => useFeeMutation((b: { perDay: number; cap: number; graceDays: number; term?: string; dryRun: boolean }) => api<{ overdue: number; created: number; updated: number; amount: number; dryRun: boolean }>('/api/fee-admin/late-fines', { method: 'POST', body: b }));
export const useInstalmentPlan = () => useFeeMutation((b: { studentId: string; term: string; parts: Array<{ amount: number; dueDate: string }> }) => api<{ parts: number; total: number }>('/api/fee-admin/instalments', { method: 'POST', body: b }));

// ─── PDFs ─────────────────────────────────────────────────────────────────────

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A fee receipt as a PDF: what was received, how, and which heads it paid. */
export function receiptPdf(r: { receiptNo: string; date: string; student: string; enrolmentNo: string; programme?: string; head: string; amount: number; mode: string; instrument?: string | null; status: string; receivedBy?: string | null; appliedTo?: Array<{ head: string; amount: number }>; cancelReason?: string | null }) {
  const label = r.status === 'CANCELLED' ? 'CANCELLED RECEIPT' : r.status === 'PENDING_CLEARANCE' || r.status === 'PENDING' ? 'Provisional — subject to clearance' : r.status === 'BOUNCED' || r.status === 'FAILED' ? 'Instrument returned unpaid' : 'Fee receipt';
  void downloadPdf({
    title: label,
    subtitle: `Receipt ${r.receiptNo}`,
    sections: [
      { fields: [['Receipt no.', r.receiptNo], ['Date', when(r.date)], ['Student', r.student], ['Enrolment no.', r.enrolmentNo], ...(r.programme ? [['Programme', r.programme] as [string, string]] : []), ['Towards', r.head], ['Amount', inr(r.amount)], ['Mode', `${MODE_LABEL[r.mode] ?? r.mode}${r.instrument ? ` · ${r.instrument}` : ''}`], ...(r.receivedBy ? [['Received by', r.receivedBy] as [string, string]] : [])] },
      ...(r.appliedTo?.length ? [{ heading: 'Applied to', table: { head: ['Fee head', 'Amount'], body: r.appliedTo.map((a) => [a.head, inr(a.amount)]) } }] : []),
      ...(r.cancelReason ? [{ heading: 'Cancelled', text: [r.cancelReason] }] : []),
      { text: ['This is a computer-generated receipt and needs no signature. Verify it with the college accounts office by its receipt number.'] },
    ],
  });
}

/** The full statement of account as a PDF. */
export function statementPdf(s: Statement) {
  void downloadPdf({
    title: 'Fee statement',
    subtitle: s.student ? `${s.student.name} · ${s.student.enrolmentNo} · ${s.student.programme.shortName} semester ${s.student.semester}` : undefined,
    sections: [
      { fields: [['Charged', inr(s.totals.charged)], ['Paid / credited', inr(s.totals.paid)], ['Outstanding', inr(s.totals.due)]] },
      { heading: 'Account', table: { head: ['Date', 'Particulars', 'Ref.', 'Debit', 'Credit', 'Balance'], body: s.lines.map((l) => [l.date.startsWith('1970') ? '—' : new Date(l.date).toLocaleDateString('en-IN'), l.particulars, l.ref, l.debit ? inr(l.debit) : '', l.credit ? inr(l.credit) : '', inr(l.balance)]) } },
    ],
  });
}
