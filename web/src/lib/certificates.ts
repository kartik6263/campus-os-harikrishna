/**
 * Digital certificates: the register, issuing, revoking, the official PDF,
 * the signing keys (/api/certificates) and public verification (/api/verify).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, ApiError, api, currentTenantCode, getAccessToken, refreshSession } from './api';
import { saveBlob } from './records';

export interface DigitalCertificate {
  id: string;
  serialNo: string;
  type: string;
  title: string;
  statement: string;
  recipientName: string;
  recipientRef: string | null;
  recipientEmail: string | null;
  studentId: string | null;
  requestId: string | null;
  fields: Array<[string, string]>;
  issuedAt: string;
  validUntil: string | null;
  expired: boolean;
  issuer: { name: string; title: string };
  status: 'VALID' | 'REVOKED';
  revokedAt: string | null;
  revokedReason: string | null;
  revokedBy: string | null;
  batchRef: string | null;
  keyId: string;
  keyRetired: boolean;
  payloadHash: string;
  pdfHash: string | null;
  hasPdf: boolean;
  verifications: number;
  lastVerifiedAt: string | null;
  verifyUrl: string;
}

export interface Register {
  total: number;
  shown: number;
  counts: { valid: number; revoked: number; expired: number };
  batches: Array<{ batchRef: string; count: number }>;
  certificates: DigitalCertificate[];
}

export interface Template { type: string; title: string; statement: string }

export interface SigningKey {
  kid: string; alg: string; algorithm: string; kty: string; crv: string; x: string; publicKeyPem: string;
  createdAt: string; retiredAt: string | null; signing: boolean; certificates: number;
}

export type Recipient = { studentId: string } | { name: string; ref?: string; email?: string };

export interface IssueResult {
  batchRef: string | null;
  issued: Array<{ id: string; serialNo: string; recipientName: string }>;
  failed: Array<{ row: number; recipient: string; reason: string }>;
}

/** What a certificate looks like when it is "valid" in the plain sense: signed, not revoked, not expired. */
export const standing = (c: Pick<DigitalCertificate, 'status' | 'expired'>) => (c.status === 'REVOKED' ? 'Revoked' : c.expired ? 'Expired' : 'Valid');

const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export const useRegister = (f: { q?: string; type?: string; status?: string; batch?: string }) =>
  useQuery({ queryKey: ['certificates', 'register', f], queryFn: () => api<Register>(`/api/certificates?${qs(f)}`) });

export const useTemplates = () =>
  useQuery({ queryKey: ['certificates', 'templates'], queryFn: () => api<Template[]>('/api/certificates/templates'), staleTime: 3_600_000 });

export const useMyCertificates = () =>
  useQuery({ queryKey: ['certificates', 'mine'], queryFn: () => api<DigitalCertificate[]>('/api/certificates/mine') });

export const useSigningKeys = (enabled = true) =>
  useQuery({ queryKey: ['certificates', 'keys'], enabled, queryFn: () => api<{ heldOutside: boolean; keys: SigningKey[] }>('/api/certificates/keys') });

function useCertMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['certificates'] }); } });
}

export const useIssue = () =>
  useCertMutation((body: { type: string; title: string; statement: string; fields: Array<[string, string]>; validUntil?: string; batchRef?: string; issuer?: { name: string; title: string }; recipients: Recipient[] }) =>
    api<IssueResult>('/api/certificates/issue', { method: 'POST', body }));

export const useRevoke = () =>
  useCertMutation(({ id, reason }: { id: string; reason: string }) => api<DigitalCertificate>(`/api/certificates/${id}/revoke`, { method: 'POST', body: { reason } }));

export const useRotateKey = () =>
  useCertMutation((reason: string) => api<{ kid: string }>('/api/certificates/keys/rotate', { method: 'POST', body: { reason } }));

const headers = (anonymous = false): Record<string, string> => {
  const token = anonymous ? null : getAccessToken();
  const tenant = currentTenantCode();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'X-Tenant': tenant } : {}) };
};

/** Saves the official, signed PDF exactly as it was filed. */
export async function downloadCertificate(c: Pick<DigitalCertificate, 'id' | 'serialNo'>) {
  const send = () => fetch(`${API_BASE}/api/certificates/${c.id}/pdf`, { credentials: 'include', headers: headers() });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'That certificate has no PDF on file' : 'Could not download the certificate');
  saveBlob(await res.blob(), `${c.serialNo.replace(/\//g, '-')}.pdf`);
}

// ─── Public verification ──────────────────────────────────────────────────────

export type VerifyStatus = 'valid' | 'revoked' | 'expired' | 'tampered' | 'not_found' | 'not_issued' | 'unmatched';

export interface VerifiedCertificate {
  serialNo: string;
  type: string;
  title: string;
  statement: string;
  recipient: { name: string; ref: string | null };
  fields: Array<[string, string]>;
  institution: { name: string; code: string };
  issuedAt: string;
  validUntil: string | null;
  issuer: string;
  revokedAt: string | null;
  revokedReason: string | null;
  verifications: number;
  cryptography: { algorithm: string; keyId: string; keyRetired: boolean; signatureValid: boolean; payloadHash: string; pdfHash: string | null; payload?: unknown; signature?: string };
}

export interface Verification {
  status: VerifyStatus;
  reference: string;
  checkedAt: string;
  signatureChecked?: boolean;
  documentHash?: string;
  claimsSerial?: string | null;
  certificate: VerifiedCertificate | null;
}

export const verifyNumber = (no: string, sig?: string) =>
  api<Verification>(`/api/verify/certificate?${new URLSearchParams({ no, ...(sig ? { sig } : {}) })}`, { anonymous: true });

/** Sends the PDF itself; the server matches its SHA-256 against the hash filed at issue. */
export async function verifyDocument(file: File): Promise<Verification> {
  if (file.size > 15 * 1024 * 1024) throw new ApiError(413, 'That file is larger than 15 MB');
  const res = await fetch(`${API_BASE}/api/verify/document`, { method: 'POST', headers: { ...headers(true), 'Content-Type': 'application/pdf' }, body: file });
  const body = await res.json().catch(() => null) as (Verification & { error?: { message?: string } }) | null;
  if (!res.ok) throw new ApiError(res.status, body?.error?.message ?? 'The document could not be checked');
  return body!;
}

/** The SHA-256 of a file, computed in the browser, so the verifier can show it matches what the server saw. */
export async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
