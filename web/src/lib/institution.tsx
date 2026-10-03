/**
 * The institution this deployment serves.
 *
 * Resolion Campus OS is one product for universities, colleges, schools and
 * institutes, so the customer's name, logo mark and contact details come from
 * the API (set in IT Console → Institution), never from code. The last value
 * seen is cached so the name paints instantly, even while a sleeping server
 * wakes up.
 */
import { Fragment, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, currentTenantCode } from './api';

export const PRODUCT_NAME = 'Resolion Campus OS';

export type InstitutionKind = 'University' | 'College' | 'School' | 'Institute' | 'Academy' | 'Other';

export interface Institution {
  name: string;
  nameHi: string | null;
  shortCode: string;
  kind: InstitutionKind;
  tagline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  emailDomain: string | null;
  helpdesk: string | null;
}

export const DEFAULT_INSTITUTION: Institution = {
  name: 'Resolion Demo University',
  nameHi: 'रिज़ोलियन डेमो विश्वविद्यालय',
  shortCode: 'RDU',
  kind: 'University',
  tagline: 'Powered by Resolion Campus OS',
  address: '1 Campus Road',
  city: 'Demo City',
  state: null,
  pincode: null,
  country: 'India',
  phone: null,
  email: null,
  website: null,
  emailDomain: 'demo.resolion.edu',
  helpdesk: null,
};

// Per backend, so two institutes opened in one browser never share a name.
const CACHE_KEY = `resolion.institution:${API_BASE}:${currentTenantCode() ?? ""}`;
const KEY = ['institution'] as const;

function cached(): Institution | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_INSTITUTION, ...(JSON.parse(raw) as Partial<Institution>) } : undefined;
  } catch {
    return undefined;
  }
}

// The live copy the module screens read while rendering. The app remounts
// when the name changes (see InstitutionBoundary), so they pick up an edit.
let current: Institution = cached() ?? DEFAULT_INSTITUTION;

/** The institution, for code outside a component or deep in mock data. */
export const inst = () => current;
/** "Name, City". */
export const instPlace = () => (current.city ? `${current.name}, ${current.city}` : current.name);
/** The Hindi name, falling back to the English one. */
export const instHi = () => current.nameHi || current.name;
/** The Hindi name with the city. */
export const instPlaceHi = () => (current.city ? `${instHi()}, ${current.city}` : instHi());

function remember(i: Institution) {
  current = { ...DEFAULT_INSTITUTION, ...i };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(i));
  } catch {
    // Private windows and blocked storage: the API copy still applies.
  }
}

export interface InstitutionView extends Institution {
  /** "Name, City" — the line printed under the product name. */
  place: string;
  /** Name in the current language. */
  displayName: (lang: string) => string;
  /** The help-desk line for sign-in pages, when one is set. */
  helpLine: string | null;
}

export function useInstitution(): InstitutionView {
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const i = await api<Institution>('/api/institution', { anonymous: true });
      remember(i);
      return i;
    },
    placeholderData: cached,
    staleTime: 5 * 60_000,
    retry: 3,
  });

  const i = q.data ?? DEFAULT_INSTITUTION;
  return {
    ...i,
    place: i.city ? `${i.name}, ${i.city}` : i.name,
    displayName: (lang) => (lang === 'hi' && i.nameHi ? i.nameHi : i.name),
    helpLine: i.helpdesk || i.phone,
  };
}

/**
 * Remounts the app when the institution's identity changes — on the first
 * fetch of a new install, or after an administrator saves new settings — so
 * every screen that read `inst()` shows the new name. The same name keeps the
 * tree, and its state, untouched.
 */
export function InstitutionBoundary({ children }: { children: ReactNode }) {
  const { name, shortCode, city, nameHi } = useInstitution();
  return <Fragment key={`${name}|${shortCode}|${city}|${nameHi}`}>{children}</Fragment>;
}

/** Keeps the browser tab title on the customer's name. */
export function InstitutionTitle() {
  const { name } = useInstitution();
  useEffect(() => {
    document.title = `${name} · ${PRODUCT_NAME}`;
  }, [name]);
  return null;
}

export function useSaveInstitution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Institution) => api<Institution>('/api/it/institution', { method: 'PUT', body }),
    onSuccess: (saved) => {
      remember(saved);
      qc.setQueryData(KEY, saved);
    },
  });
}
