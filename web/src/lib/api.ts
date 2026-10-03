/**
 * API client for the web app.
 *
 * The refresh token lives in an httpOnly cookie set by the backend, so it is
 * never readable from JavaScript. Only the short-lived access token is held
 * here, in memory — a page reload re-derives it from the cookie via /refresh.
 */
/** The deployed API on Render. */
const PRODUCTION_API = 'https://campus-os-harikrishna-1.onrender.com';

// VITE_API_URL wins when set — an empty value means "same origin", which is
// how the Docker image runs (nginx proxies /api). Otherwise a production build talks to Render
// and `npm run dev` to the local backend. On an institute's subdomain the
// tenant lookup (lib/tenant.ts) replaces this with that institute's own
// backend before the app renders.
export let API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? (import.meta.env.PROD ? PRODUCTION_API : 'http://localhost:4000');

/** On a shared pool (Phase 2), the institute named on every request. */
let TENANT: string | null = null;
const tenantHeader = (): Record<string, string> => (TENANT ? { 'X-Tenant': TENANT } : {});

/** The pooled institute this page talks to, if any. */
export const currentTenantCode = () => TENANT;

export function setApiBase(url: string, tenant: string | null = null) {
  API_BASE = url.replace(/\/$/, '');
  TENANT = tenant;
}

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when the session cannot be renewed, so the app can show login. */
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: (() => void) | null) => {
  onAuthLost = fn;
};

/**
 * One shared refresh. Several requests 401-ing at once must not each start
 * their own rotation — the backend revokes a whole token family on reuse,
 * so a stampede would log the user out.
 */
let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: tenantHeader(),
      });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  anonymous?: boolean;
  _retried?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous, _retried } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...tenantHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(!anonymous && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !anonymous && !_retried) {
    const fresh = await refreshSession();
    if (fresh) return api<T>(path, { ...options, _retried: true });
    accessToken = null;
    onAuthLost?.();
    throw new ApiError(401, 'Your session has ended. Please sign in again.', 'unauthorized');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = (payload as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code, err?.details);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
