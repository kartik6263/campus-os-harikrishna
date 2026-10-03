import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from './api';

export type Role =
  | 'STUDENT'
  | 'PARENT'
  | 'FACULTY'
  | 'OFFICE'
  | 'PRINCIPAL'
  | 'REGISTRAR'
  | 'ADMIN'
  | 'VENDOR';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  /** Set when the IT Cell issued the password; the user must replace it. */
  mustChangePassword?: boolean;
  student?: { id: string; name: string; enrolmentNo: string } | null;
  faculty?: { id: string; name: string; designation: string; department: string; isHod: boolean; employeeId: string } | null;
  office?: { id: string; name: string; designation: string; employeeId: string } | null;
  vendor?: { id: string; name: string; code: string; status: string } | null;
}

/** The name to greet a user by: their own record's, else their email's local part. */
export function displayName(u: SessionUser | null | undefined): string {
  if (!u) return '';
  return u.student?.name ?? u.faculty?.name ?? u.office?.name ?? u.vendor?.name ?? ROLE_TITLES[u.role] ?? u.email.split('@')[0]!;
}

export const ROLE_TITLES: Record<Role, string> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  FACULTY: 'Faculty',
  OFFICE: 'College Office',
  PRINCIPAL: 'Principal',
  REGISTRAR: 'Registrar',
  ADMIN: 'Administrator',
  VENDOR: 'Vendor',
};

interface AuthValue {
  user: SessionUser | null;
  /** True until the cookie session has been checked on first paint. */
  loading: boolean;
  signIn: (email: string, password: string, turnstileToken?: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  /** Takes a session the API has already issued (e.g. on IT Cell setup). */
  adoptSession: (payload: { accessToken: string; user: SessionUser }) => Promise<SessionUser>;
  /** Updates the signed-in user after a change such as a new password. */
  patchUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  signIn: async () => {
    throw new Error('AuthProvider missing');
  },
  signOut: async () => {},
  adoptSession: async () => {
    throw new Error('AuthProvider missing');
  },
  patchUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // A reload has no access token, but may still hold the refresh cookie.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await refreshSession();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api<SessionUser>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setAuthLostHandler(null);
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      const res = await api<{ accessToken: string; user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password, turnstileToken },
      });
      setAccessToken(res.accessToken);
      setUser(res.user);
      await queryClient.invalidateQueries();
      return res.user;
    },
    [queryClient],
  );

  const adoptSession = useCallback(
    async (payload: { accessToken: string; user: SessionUser }) => {
      setAccessToken(payload.accessToken);
      setUser(payload.user);
      await queryClient.invalidateQueries();
      return payload.user;
    },
    [queryClient],
  );

  const patchUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clearing locally matters more than the server acknowledging it.
    }
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, adoptSession, patchUser }),
    [user, loading, signIn, signOut, adoptSession, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
