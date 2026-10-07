/**
 * Identity verification through DigiLocker, and the student's ABC ID.
 *
 * The trip: `startDigilocker()` asks the server for DigiLocker's consent URL
 * and leaves for it; DigiLocker sends the person back to this app's address
 * with `?code=…&state=dl.w.…`, which `readDigilockerReturn()` picks up on load
 * and the return screen hands to the server to finish.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type VerificationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

export interface IssuedDocument { name: string; doctype: string; issuer: string; date: string }

export interface Verification {
  identityStatus: VerificationStatus;
  identitySource: 'DIGILOCKER' | 'DOCUMENT' | null;
  identityDocType: string | null;
  identityProofFileId: string | null;
  linked: boolean;
  dlName: string | null;
  dlDob: string | null;
  dlGender: string | null;
  eaadhaar: boolean;
  aadhaarLast4: string | null;
  nameMatch: boolean | null;
  dobMatch: boolean | null;
  identityNote: string | null;
  verifiedAt: string | null;
  documents: IssuedDocument[];
  abcId: string | null;
  abcSource: 'DIGILOCKER' | 'SELF' | null;
  abcStatus: VerificationStatus;
  abcNote: string | null;
  abcProofFileId: string | null;
  abcVerifiedAt: string | null;
  reviewedAt: string | null;
}

export interface MyVerification extends Verification {
  digilockerEnabled: boolean;
  role: string;
  abcApplies: boolean;
  record: { name: string | null; dob: string | null; ref: string; abcId: string | null; apaarId: string | null };
}

export const ID_DOCUMENTS = ['Masked Aadhaar', 'PAN card', 'Passport', 'Voter ID', 'Driving licence', 'Class 10 marksheet'] as const;

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  UNVERIFIED: 'Not verified',
  PENDING_REVIEW: 'With the office',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const STATUS_TONE: Record<VerificationStatus, string> = {
  UNVERIFIED: 'bg-[#EDEFF3] text-[#5A6577]',
  PENDING_REVIEW: 'bg-[#FEF9EC] text-[#8A6D1F]',
  VERIFIED: 'bg-[#D1FAE5] text-[#0E7A5F]',
  REJECTED: 'bg-[#FEE2E2] text-[#A8242C]',
};

/** DDMMYYYY as DD-MM-YYYY. */
export const showDlDate = (d: string | null) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : d ?? '—');

export const VERIFICATION_KEY = ['verification', 'me'];

export function useMyVerification(enabled = true) {
  return useQuery({ queryKey: VERIFICATION_KEY, queryFn: () => api<MyVerification>('/api/verification/me'), enabled });
}

/** Leaves for DigiLocker's consent page. */
export async function startDigilocker(): Promise<void> {
  const { url } = await api<{ url: string }>('/api/verification/digilocker/start', { method: 'POST', body: { client: 'web' } });
  window.location.assign(url);
}

export interface DigilockerReturn { state: string; code?: string; error?: string; errorDescription?: string }

/**
 * DigiLocker's answer, if this page load is the return from it. Taken out of
 * the address bar at once, so a reload or the back button never resends it.
 */
export function readDigilockerReturn(): DigilockerReturn | null {
  const q = new URLSearchParams(window.location.search);
  const state = q.get('state');
  if (!state?.startsWith('dl.w.')) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return {
    state,
    code: q.get('code') ?? undefined,
    error: q.get('error') ?? undefined,
    errorDescription: q.get('error_description') ?? undefined,
  };
}

export type CompleteResult = Verification & { abcFound: boolean; abcApplies: boolean };

// One request per return, even when React mounts the screen twice.
const completing = new Map<string, Promise<CompleteResult>>();
export function completeDigilocker(r: DigilockerReturn): Promise<CompleteResult> {
  let p = completing.get(r.state);
  if (!p) {
    p = api<CompleteResult>('/api/verification/digilocker/complete', { method: 'POST', body: r });
    completing.set(r.state, p);
  }
  return p;
}

export function useSubmitIdentityProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { docType: string; proofFileId: string }) => api<Verification>('/api/verification/identity-proof', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification'] }),
  });
}

export function useSubmitAbc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { abcId: string; proofFileId: string }) => api<Verification>('/api/verification/abc', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification'] }),
  });
}

export interface WardVerification {
  name: string;
  enrolmentNo: string;
  identityStatus: VerificationStatus;
  verifiedAt: string | null;
  abcId: string | null;
  abcStatus: VerificationStatus;
  abcVerifiedAt: string | null;
}

export function useWardVerification() {
  return useQuery({ queryKey: ['verification', 'wards'], queryFn: () => api<{ wards: WardVerification[] }>('/api/verification/wards') });
}

// ─── The office's register ────────────────────────────────────────────────────

export interface RegisterRow extends Verification {
  userId: string;
  role: string;
  email: string;
  name: string;
  ref: string | null;
  recordDob: string | null;
  recordAbcId: string | null;
  updatedAt: string;
}

export interface Register {
  digilockerEnabled: boolean;
  summary: { pending: number; identityVerified: number; students: number; studentsVerified: number; abcVerified: number };
  rows: RegisterRow[];
}

export type RegisterFilter = 'pending' | 'verified' | 'rejected' | 'all';

export function useRegister(status: RegisterFilter, role: string, q: string) {
  const params = new URLSearchParams({ status, ...(role ? { role } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  return useQuery({ queryKey: ['verification', 'register', status, role, q.trim()], queryFn: () => api<Register>(`/api/verification/register?${params}`) });
}

export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; target: 'identity' | 'abc'; decision: 'VERIFIED' | 'REJECTED'; note?: string }) =>
      api<Verification>(`/api/verification/register/${userId}/review`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification'] }),
  });
}
