/**
 * Which institute this phone belongs to.
 *
 * Every institute runs its own backend. With a control plane configured
 * (EXPO_PUBLIC_CONTROL_PLANE_URL), the first launch asks for the institute's
 * code, looks up that institute's backend, and remembers it. Without one, the
 * app talks to the single backend it was built for, as before.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setApiBase, store, tokens } from './api';

const CONTROL_PLANE = process.env.EXPO_PUBLIC_CONTROL_PLANE_URL?.replace(/\/$/, '');
const KEY = 'campus.institute';

/** True when the app serves many institutes and must be told which. */
export const multiInstitute = Boolean(CONTROL_PLANE);

export interface ChosenInstitute {
  slug: string;
  name: string;
  apiUrl: string;
  /** Set for an institute on a shared pool: sent as X-Tenant. */
  tenantHeader?: string | null;
}

export class InstituteLookupError extends Error {
  constructor(readonly reason: 'not-found' | 'suspended' | 'provisioning' | 'unreachable') {
    super(reason);
  }
}

/** Asks the control plane for an institute's backend. */
export async function lookUpInstitute(code: string): Promise<ChosenInstitute> {
  const slug = code.trim().toLowerCase();
  let res: Response;
  try {
    res = await fetch(`${CONTROL_PLANE}/api/resolve?slug=${encodeURIComponent(slug)}`);
  } catch {
    throw new InstituteLookupError('unreachable');
  }
  if (res.status === 404) throw new InstituteLookupError('not-found');
  if (!res.ok) throw new InstituteLookupError('unreachable');
  const t = (await res.json()) as { slug: string; name: string; status: string; apiUrl: string | null; tenantHeader?: string | null };
  if (t.status === 'suspended') throw new InstituteLookupError('suspended');
  if (t.status !== 'active' || !t.apiUrl) throw new InstituteLookupError('provisioning');
  return { slug: t.slug, name: t.name, apiUrl: t.apiUrl, tenantHeader: t.tenantHeader ?? null };
}

interface InstituteValue {
  /** False until the remembered institute has been read on launch. */
  ready: boolean;
  institute: ChosenInstitute | null;
  choose: (i: ChosenInstitute) => Promise<void>;
  /** Forgets the institute (and its session) so another can be chosen. */
  forget: () => Promise<void>;
}

const Ctx = createContext<InstituteValue>({ ready: true, institute: null, choose: async () => {}, forget: async () => {} });

export function InstituteProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!multiInstitute);
  const [institute, setInstitute] = useState<ChosenInstitute | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!multiInstitute) return;
    (async () => {
      try {
        const raw = await store.get(KEY);
        if (raw) {
          const i = JSON.parse(raw) as ChosenInstitute;
          setApiBase(i.apiUrl, i.tenantHeader ?? null);
          setInstitute(i);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const choose = useCallback(async (i: ChosenInstitute) => {
    // Sessions belong to one institute's backend; never carry one across.
    await tokens.clear();
    queryClient.clear();
    setApiBase(i.apiUrl, i.tenantHeader ?? null);
    await store.set(KEY, JSON.stringify(i));
    setInstitute(i);
  }, [queryClient]);

  const forget = useCallback(async () => {
    await tokens.clear();
    queryClient.clear();
    await store.remove(KEY);
    setInstitute(null);
  }, [queryClient]);

  const value = useMemo(() => ({ ready, institute, choose, forget }), [ready, institute, choose, forget]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useInstitute = () => useContext(Ctx);
