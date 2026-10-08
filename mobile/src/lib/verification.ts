import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { StatusType } from '@/components';

/**
 * DigiLocker verification from the app. DigiLocker returns to the web app's
 * address (the one registered with it), which sees the trip began here and
 * passes the code on to `<scheme>://digilocker`, the route that finishes it.
 */
export type VerificationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

export interface MyVerification {
  digilockerEnabled: boolean;
  abcApplies: boolean;
  identityStatus: VerificationStatus;
  identitySource: 'DIGILOCKER' | 'DOCUMENT' | null;
  identityNote: string | null;
  linked: boolean;
  dlName: string | null;
  dlDob: string | null;
  aadhaarLast4: string | null;
  nameMatch: boolean | null;
  dobMatch: boolean | null;
  verifiedAt: string | null;
  documents: Array<{ name: string; issuer: string; date: string }>;
  abcId: string | null;
  abcSource: 'DIGILOCKER' | 'SELF' | null;
  abcStatus: VerificationStatus;
  abcNote: string | null;
  record: { name: string | null; dob: string | null; abcId: string | null };
}

export type CompleteResult = Omit<MyVerification, 'digilockerEnabled' | 'record'> & { abcFound: boolean };

export const PILL: Record<VerificationStatus, { status: StatusType; label: string; labelHi: string }> = {
  UNVERIFIED: { status: 'draft', label: 'Not verified', labelHi: 'असत्यापित' },
  PENDING_REVIEW: { status: 'pending', label: 'With the office', labelHi: 'कार्यालय में' },
  VERIFIED: { status: 'approved', label: 'Verified', labelHi: 'सत्यापित' },
  REJECTED: { status: 'rejected', label: 'Rejected', labelHi: 'अस्वीकृत' },
};

export const showDlDate = (d: string | null) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : d ?? '—');

export const verificationKey = ['verification', 'me'];

export const useMyVerification = () =>
  useQuery({ queryKey: verificationKey, queryFn: () => api<MyVerification>('/api/verification/me') });

/** This build's deep-link scheme, if DigiLocker can return to it (not inside Expo Go). */
export function appScheme(): string | null {
  const s = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(s) ? s[0] : s;
  return scheme && /^campusos(-[a-z0-9]+)?$/.test(scheme) && Constants.appOwnership !== 'expo' ? scheme : null;
}

export async function startDigilocker(scheme: string): Promise<void> {
  const { url } = await api<{ url: string }>('/api/verification/digilocker/start', {
    method: 'POST',
    body: { client: 'mobile', appScheme: scheme },
  });
  await Linking.openURL(url);
}

const completing = new Map<string, Promise<CompleteResult>>();
export function completeDigilocker(body: { state: string; code?: string; error?: string; errorDescription?: string }) {
  let p = completing.get(body.state);
  if (!p) {
    p = api<CompleteResult>('/api/verification/digilocker/complete', { method: 'POST', body });
    completing.set(body.state, p);
  }
  return p;
}
