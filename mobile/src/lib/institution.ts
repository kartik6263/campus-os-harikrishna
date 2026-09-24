/**
 * The institution this deployment serves — its name, logo mark and city —
 * read from the API so one app build works for any university, college,
 * school or institute. Set in the web IT Console → Institution.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const PRODUCT_NAME = 'Resolion Campus OS';

export interface Institution {
  name: string;
  nameHi: string | null;
  shortCode: string;
  kind: string;
  city: string | null;
  helpdesk: string | null;
  phone: string | null;
  emailDomain: string | null;
}

const DEFAULT: Institution = {
  name: 'Resolion Demo University',
  nameHi: 'रिज़ोलियन डेमो विश्वविद्यालय',
  shortCode: 'RDU',
  kind: 'University',
  city: 'Demo City',
  helpdesk: null,
  phone: null,
  emailDomain: 'demo.resolion.edu',
};

export function useInstitution() {
  const q = useQuery({
    queryKey: ['institution'],
    queryFn: () => api<Institution>('/api/institution', { anonymous: true }),
    staleTime: 5 * 60_000,
    retry: 3,
  });
  const i = q.data ?? DEFAULT;
  const name = (lang: string) => (lang === 'hi' && i.nameHi ? i.nameHi : i.name);
  return {
    ...i,
    /** Name in the current language. */
    displayName: name,
    /** "Name · City" in the current language. */
    placeLine: (lang: string) => (i.city ? `${name(lang)} · ${i.city}` : name(lang)),
  };
}
