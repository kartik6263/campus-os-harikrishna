/**
 * Which institute this page belongs to.
 *
 * Every institute has its own backend and database. One web deployment
 * serves all of them: on `abc.<base domain>` the page asks the control plane
 * which backend "abc" has, and talks only to that one. Before a domain is set
 * up, `?tenant=abc` does the same on any address (and is remembered).
 */
import { setApiBase } from './api';

const CONTROL_PLANE = (import.meta.env.VITE_CONTROL_PLANE_URL as string | undefined)?.replace(/\/$/, '');
const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.toLowerCase();
/** Subdomains that are the product itself, not an institute. */
const RESERVED = new Set(['www', 'app', 'control', 'admin', 'api']);
const REMEMBER_KEY = 'resolion.tenant';

let onTenantSite = false;
/** True on a real institute's site, where demo hints must not appear. */
export const isTenantSite = () => onTenantSite;

/** `?tenant=demo` opens the demo institute (no institute can take "demo"). */
const DEMO = 'demo';

export type TenantOutcome =
  | { kind: 'default' }
  | { kind: 'landing' }
  | { kind: 'tenant'; slug: string; name: string }
  | { kind: 'problem'; slug: string; reason: 'not-found' | 'suspended' | 'provisioning' | 'unreachable' };

function slugFromHost(): string | null {
  if (!BASE_DOMAIN) return null;
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(`.${BASE_DOMAIN}`)) return null;
  const label = host.slice(0, -(BASE_DOMAIN.length + 1));
  return label && !label.includes('.') && !RESERVED.has(label) ? label : null;
}

function slugFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('tenant')) {
    try { return localStorage.getItem(REMEMBER_KEY); } catch { return null; }
  }
  const slug = params.get('tenant')?.trim().toLowerCase() || null;
  try {
    if (slug) localStorage.setItem(REMEMBER_KEY, slug);
    else localStorage.removeItem(REMEMBER_KEY); // ?tenant= with no value goes back to the default
  } catch { /* storage blocked: works for this visit only */ }
  params.delete('tenant');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
  return slug;
}

export async function resolveTenant(): Promise<TenantOutcome> {
  const slug = slugFromHost() ?? slugFromQuery();
  if (!CONTROL_PLANE || slug === DEMO) return { kind: 'default' };
  // The product's own address belongs to no institute: it shows the landing page.
  if (!slug) return { kind: 'landing' };

  try {
    const res = await fetch(`${CONTROL_PLANE}/api/resolve?slug=${encodeURIComponent(slug)}`);
    if (res.status === 404) return { kind: 'problem', slug, reason: 'not-found' };
    if (!res.ok) return { kind: 'problem', slug, reason: 'unreachable' };
    const t = (await res.json()) as { slug: string; name: string; status: string; apiUrl: string | null; tenantHeader?: string | null };
    if (t.status === 'suspended') return { kind: 'problem', slug, reason: 'suspended' };
    if (t.status !== 'active' || !t.apiUrl) return { kind: 'problem', slug, reason: 'provisioning' };
    // A pooled institute shares its backend, so it is named on every request.
    setApiBase(t.apiUrl, t.tenantHeader ?? null);
    onTenantSite = true;
    return { kind: 'tenant', slug: t.slug, name: t.name };
  } catch {
    return { kind: 'problem', slug, reason: 'unreachable' };
  }
}

/** Whether an institute code exists and is open, for the landing page's search. */
export async function checkInstitute(code: string): Promise<'ok' | Extract<TenantOutcome, { kind: 'problem' }>['reason']> {
  try {
    const res = await fetch(`${CONTROL_PLANE}/api/resolve?slug=${encodeURIComponent(code)}`);
    if (res.status === 404) return 'not-found';
    if (!res.ok) return 'unreachable';
    const t = (await res.json()) as { status: string; apiUrl: string | null };
    if (t.status === 'suspended') return 'suspended';
    return t.status === 'active' && t.apiUrl ? 'ok' : 'provisioning';
  } catch {
    return 'unreachable';
  }
}

/** An institute's own site: its subdomain once a domain exists, else `?tenant=`. */
export function instituteUrl(code: string): string {
  return BASE_DOMAIN ? `https://${code}.${BASE_DOMAIN}/` : `${window.location.pathname}?tenant=${encodeURIComponent(code)}`;
}

/** The demo institute, from the landing page. */
export const demoUrl = () => `${window.location.pathname}?tenant=${DEMO}`;

/** Forgets a remembered `?tenant=`, for the "go back" link on a problem page. */
export function forgetTenant() {
  try { localStorage.removeItem(REMEMBER_KEY); } catch { /* nothing to forget */ }
}
