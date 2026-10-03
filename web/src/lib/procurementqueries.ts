/**
 * Server state for procurement (Phase 7).
 *
 * The two-envelope rule carries through: a bid's `financialQuote` is null
 * until the server discloses it, and the adapters keep that null rather than
 * substituting a zero — a sealed quote and a quote of nothing are not the
 * same thing.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type ApiVendorStatus = 'PENDING' | 'EMPANELLED' | 'BLACKLISTED' | 'SUSPENDED';
export type ApiTenderStatus =
  | 'DRAFT' | 'PUBLISHED' | 'CORRIGENDUM' | 'BID_OPEN' | 'EVALUATION' | 'AWARDED' | 'CANCELLED';
export type ApiPOStatus =
  | 'ISSUED' | 'ACKNOWLEDGED' | 'PARTIAL_DELIVERY' | 'DELIVERED' | 'INSPECTED' | 'BILL_PASSED' | 'PAID';

export interface ApiVendor {
  id: string;
  code: string;
  name: string;
  gstin: string;
  pan: string;
  categories: string[];
  contactName: string;
  contactMobile: string;
  email: string;
  status: ApiVendorStatus;
  documentsVerified: boolean;
  registeredOn: string;
  empanelledUpto: string | null;
  statusReason: string | null;
  expired: boolean;
  canBid: boolean;
  bids: number;
  orders: number;
}

export interface ApiBid {
  id: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  submittedAt: string;
  technicalScore: number | null;
  technicalRemarks: string | null;
  status: 'SUBMITTED' | 'TECHNICAL_QUALIFIED' | 'TECHNICAL_REJECTED' | 'FINANCIAL_OPENED' | 'RECOMMENDED';
  financialQuote: number | null;
  financialOpenedAt: string | null;
  l1: boolean;
  awarded: boolean;
}

export interface ApiTender {
  id: string;
  refNo: string;
  title: string;
  description: string;
  department: string;
  category: string;
  estimatedValue: number;
  status: ApiTenderStatus;
  publishedOn: string | null;
  submissionDeadline: string;
  openingDate: string;
  technicalClosedAt: string | null;
  cancelReason: string | null;
  createdBy: string;
  sanction: { requestNo: string; subject: string; status: string; amount: number | null } | null;
  purchaseOrder: { poNo: string; status: string } | null;
  closed: boolean;
  financialsDisclosed: boolean;
  bidCount: number;
  bids: ApiBid[];
  corrigenda: Array<{ id: string; description: string; newDeadline: string | null; issuedAt: string }>;
}

export interface ApiPOItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  amount: number;
  deliveredQty: number;
  outstanding: number;
}

export interface ApiOrder {
  id: string;
  poNo: string;
  tenderRef: string;
  title: string;
  vendorCode: string;
  vendorName: string;
  totalAmount: number;
  issueDate: string;
  deliveryDeadline: string;
  status: ApiPOStatus;
  nextStages: ApiPOStatus[];
  grnNo: string | null;
  invoiceNo: string | null;
  billPassedOn: string | null;
  paymentDate: string | null;
  paymentRef: string | null;
  overdue: boolean;
  items: ApiPOItem[];
  delivered: boolean;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  vendors: ['procurement', 'vendors'] as const,
  tenders: ['procurement', 'tenders'] as const,
  orders: ['procurement', 'orders'] as const,
};

export const useVendorsApi = () =>
  useQuery({
    queryKey: keys.vendors,
    queryFn: () =>
      api<{
        totals: { total: number; empanelled: number; pending: number; blacklisted: number };
        vendors: ApiVendor[];
      }>('/api/procurement/vendors'),
  });

export const useTendersApi = () =>
  useQuery({
    queryKey: keys.tenders,
    queryFn: () =>
      api<{
        totals: { total: number; live: number; evaluating: number; awarded: number };
        tenders: ApiTender[];
      }>('/api/procurement/tenders'),
  });

export const useOrdersApi = () =>
  useQuery({
    queryKey: keys.orders,
    queryFn: () =>
      api<{
        totals: { total: number; open: number; overdue: number; committed: number; paid: number };
        orders: ApiOrder[];
      }>('/api/procurement/orders'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSetVendorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: ApiVendorStatus;
      reason?: string;
      empanelledUpto?: string;
      documentsVerified?: boolean;
    }) => api<ApiVendor>(`/api/procurement/vendors/${id}/status`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['procurement'] }),
  });
}

export function useAddVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string; gstin: string; pan: string; categories: string[];
      contactName: string; contactMobile: string; email: string;
    }) => api<{ id: string; code: string; name: string }>('/api/procurement/vendors', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.vendors }),
  });
}

export function usePublishTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ refNo: string; status: string; sanctionedBy: string }>(
        `/api/procurement/tenders/${id}/publish`,
        { method: 'POST' },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tenders }),
  });
}

export function useScoreBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score, qualified, remarks }: { id: string; score: number; qualified: boolean; remarks?: string }) =>
      api(`/api/procurement/bids/${id}/technical`, { method: 'POST', body: { score, qualified, remarks } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tenders }),
  });
}

/** Closes the technical stage, which is the moment the quotes become readable. */
export function useOpenFinancials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{
        refNo: string; qualified: number; rejected: number;
        lowest: { vendor: string; quote: number; bidId: string } | null;
      }>(`/api/procurement/tenders/${id}/open-financials`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tenders }),
  });
}

export function useAwardTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      bidId: string;
      justification?: string;
      deliveryDeadline: string;
      items: Array<{ description: string; unit: string; quantity: number; unitRate: number }>;
    }) =>
      api<{
        awardedTo: string; quote: number; aboveL1: boolean;
        purchaseOrder: { poNo: string; totalAmount: number };
      }>(`/api/procurement/tenders/${id}/award`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['procurement'] }),
  });
}

export function useAdvanceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      stage: ApiPOStatus;
      grnNo?: string;
      invoiceNo?: string;
      paymentRef?: string;
      delivered?: Array<{ itemId: string; quantity: number }>;
    }) => api<ApiOrder & { fullyDelivered: boolean }>(`/api/procurement/orders/${id}/advance`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.orders }),
  });
}

// ═══ Legacy adapters ═════════════════════════════════════════════════════════

export type VendorStatus = 'pending' | 'empanelled' | 'blacklisted' | 'suspended';

export interface LegacyVendor {
  id: string;
  vendorId: string;
  name: string;
  gstin: string;
  pan: string;
  category: string[];
  registeredOn: string;
  status: VendorStatus;
  contactName: string;
  contactMobile: string;
  email: string;
  documentsVerified: boolean;
  empanelledUpto?: string;
  statusReason?: string;
  expired: boolean;
  canBid: boolean;
}

/** `VENDORS` as the vendor screen expects it. */
export function useVendorList() {
  const q = useVendorsApi();

  const data = useMemo(
    () =>
      (q.data?.vendors ?? []).map<LegacyVendor>((v) => ({
        id: v.code,
        vendorId: v.id,
        name: v.name,
        gstin: v.gstin,
        pan: v.pan,
        category: v.categories,
        registeredOn: formatDate(v.registeredOn),
        status: v.status.toLowerCase() as VendorStatus,
        contactName: v.contactName,
        contactMobile: v.contactMobile,
        email: v.email,
        documentsVerified: v.documentsVerified,
        empanelledUpto: v.empanelledUpto ? formatDate(v.empanelledUpto) : undefined,
        statusReason: v.statusReason ?? undefined,
        expired: v.expired,
        canBid: v.canBid,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export type TenderStatus =
  | 'draft' | 'published' | 'corrigendum' | 'bid_open' | 'evaluation' | 'awarded' | 'cancelled';

export interface LegacyTenderBid {
  id: string;
  vendorId: string;
  vendorName: string;
  technicalScore?: number;
  technicalQualified?: boolean;
  /** Null while the envelope is sealed — not zero. */
  financialQuote: number | null;
  l1?: boolean;
  status: 'submitted' | 'technical_qualified' | 'technical_rejected' | 'financial_opened' | 'recommended';
}

export interface LegacyTender {
  id: string;
  tenderId: string;
  refNo: string;
  title: string;
  description: string;
  department: string;
  estimatedValue: number;
  publishedOn: string;
  submissionDeadline: string;
  openingDate: string;
  status: TenderStatus;
  category: string;
  corrigendum?: { date: string; description: string }[];
  bids?: LegacyTenderBid[];
  awardedTo?: string;
  poNo?: string;
  financialsDisclosed: boolean;
  closed: boolean;
  sanction: ApiTender['sanction'];
}

/** `TENDERS` as the tender screen expects it. */
export function useTenderList() {
  const q = useTendersApi();

  const data = useMemo(
    () =>
      (q.data?.tenders ?? []).map<LegacyTender>((t) => ({
        id: t.refNo,
        tenderId: t.id,
        refNo: t.refNo,
        title: t.title,
        description: t.description,
        department: t.department,
        estimatedValue: t.estimatedValue,
        publishedOn: t.publishedOn ? formatDate(t.publishedOn) : '—',
        submissionDeadline: formatDate(t.submissionDeadline),
        openingDate: formatDate(t.openingDate),
        status: t.status.toLowerCase() as TenderStatus,
        category: t.category,
        corrigendum: t.corrigenda.map((c) => ({
          date: formatDate(c.issuedAt),
          description: c.description,
        })),
        bids: t.bids.map((b) => ({
          id: b.id,
          vendorId: b.vendorCode,
          vendorName: b.vendorName,
          technicalScore: b.technicalScore ?? undefined,
          technicalQualified:
            b.status === 'TECHNICAL_REJECTED'
              ? false
              : b.status === 'SUBMITTED'
                ? undefined
                : true,
          financialQuote: b.financialQuote,
          l1: b.l1,
          status: b.status.toLowerCase() as LegacyTenderBid['status'],
        })),
        awardedTo: t.bids.find((b) => b.awarded)?.vendorName,
        poNo: t.purchaseOrder?.poNo,
        financialsDisclosed: t.financialsDisclosed,
        closed: t.closed,
        sanction: t.sanction,
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export interface LegacyPOItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  amount: number;
  deliveredQty?: number;
}

export interface LegacyPurchaseOrder {
  id: string;
  orderId: string;
  poNo: string;
  tenderId: string;
  vendorId: string;
  vendorName: string;
  items: LegacyPOItem[];
  totalAmount: number;
  issueDate: string;
  deliveryDeadline: string;
  status: 'issued' | 'acknowledged' | 'partial_delivery' | 'delivered' | 'inspected' | 'bill_passed' | 'paid';
  grnNo?: string;
  invoiceNo?: string;
  billPassedOn?: string;
  paymentDate?: string;
  paymentRef?: string;
  nextStages: ApiPOStatus[];
  overdue: boolean;
  fullyDelivered: boolean;
}

/** `PURCHASE_ORDERS` as the order screen expects it. */
export function useOrderList() {
  const q = useOrdersApi();

  const data = useMemo(
    () =>
      (q.data?.orders ?? []).map<LegacyPurchaseOrder>((o) => ({
        id: o.poNo,
        orderId: o.id,
        poNo: o.poNo,
        tenderId: o.tenderRef,
        vendorId: o.vendorCode,
        vendorName: o.vendorName,
        totalAmount: o.totalAmount,
        issueDate: formatDate(o.issueDate),
        deliveryDeadline: formatDate(o.deliveryDeadline),
        status: o.status.toLowerCase() as LegacyPurchaseOrder['status'],
        grnNo: o.grnNo ?? undefined,
        invoiceNo: o.invoiceNo ?? undefined,
        billPassedOn: o.billPassedOn ? formatDate(o.billPassedOn) : undefined,
        paymentDate: o.paymentDate ? formatDate(o.paymentDate) : undefined,
        paymentRef: o.paymentRef ?? undefined,
        nextStages: o.nextStages,
        overdue: o.overdue,
        fullyDelivered: o.delivered,
        items: o.items.map((i) => ({
          id: i.id,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unitRate: i.unitRate,
          amount: i.amount,
          deliveredQty: i.deliveredQty,
        })),
      })),
    [q.data],
  );

  return { data, totals: q.data?.totals, isPending: q.isPending, error: q.error };
}

export function useCreateTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; description: string; department: string; category: string; estimatedValue: number; submissionDeadline: string; openingDate: string; requestNo?: string }) =>
      api<{ id: string; refNo: string; title: string; status: ApiTenderStatus }>('/api/procurement/tenders', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tenders }),
  });
}

export function useIssueCorrigendum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; description: string; newDeadline?: string }) =>
      api<{ id: string; tenderRef: string; issuedAt: string }>(`/api/procurement/tenders/${id}/corrigendum`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tenders }),
  });
}
