import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the API lives.
 *
 * On a phone running Expo Go, `localhost` is the phone itself, not your
 * computer — so the host is derived from the Metro connection (`hostUri`),
 * which is already your machine's LAN address. EXPO_PUBLIC_API_URL (set in
 * .env to the deployed backend) overrides it, and a release build with no
 * setting talks to the deployed backend.
 */
const PRODUCTION_API = 'https://campus-os-harikrishna-1.onrender.com';

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (!__DEV__) return PRODUCTION_API;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host && Platform.OS !== 'web') return `http://${host}:4000`;
  return 'http://localhost:4000';
}

/** Replaced by the chosen institute's backend (see lib/institute.ts). */
export let API_BASE = resolveBaseUrl();

/** On a shared pool (Phase 2), the institute named on every request. */
let TENANT: string | null = null;
const tenantHeader = (): Record<string, string> => (TENANT ? { 'X-Tenant': TENANT } : {});

export function setApiBase(url: string, tenant: string | null = null) {
  API_BASE = url.replace(/\/$/, '');
  TENANT = tenant;
}

const ACCESS_KEY = 'campus.access';
const REFRESH_KEY = 'campus.refresh';

// SecureStore has no web implementation; fall back to localStorage there so
// `expo start --web` still works for development.
export const store = {
  async get(key: string) {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* private mode */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* private mode */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const tokens = {
  get access() {
    return store.get(ACCESS_KEY);
  },
  get refresh() {
    return store.get(REFRESH_KEY);
  },
  async save(access: string, refresh: string) {
    await Promise.all([store.set(ACCESS_KEY, access), store.set(REFRESH_KEY, refresh)]);
  },
  async clear() {
    await Promise.all([store.remove(ACCESS_KEY), store.remove(REFRESH_KEY)]);
  },
};

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

/** Called when refreshing fails, so the app can bounce to the login screen. */
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: (() => void) | null) => {
  onAuthLost = fn;
};

/**
 * Single in-flight refresh. Several requests failing with 401 at once must
 * not each start their own rotation — the first one wins and the rest await it.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const refreshToken = await tokens.refresh;
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { ...tenantHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await tokens.clear();
        return null;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await tokens.save(data.accessToken, data.refreshToken);
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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header — used by login itself. */
  anonymous?: boolean;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous, _retried } = options;

  const access = anonymous ? null : await tokens.access;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...tenantHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Access token expired — rotate once and replay the request.
  if (res.status === 401 && !anonymous && !_retried) {
    const fresh = await refreshAccessToken();
    if (fresh) return api<T>(path, { ...options, _retried: true });
    await tokens.clear();
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
