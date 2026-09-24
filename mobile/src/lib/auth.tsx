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
import { api, setAuthLostHandler, tokens } from './api';

export interface SessionUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'PARENT' | 'FACULTY' | 'OFFICE' | 'PRINCIPAL' | 'REGISTRAR' | 'ADMIN';
  /** Set when the IT Cell issued the password; it must be replaced first. */
  mustChangePassword?: boolean;
  student?: { id: string; name: string; enrolmentNo: string } | null;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface AuthValue {
  user: SessionUser | null;
  /** True until the stored session has been checked on cold start. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Updates the signed-in user, e.g. after a password change. */
  patchUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  patchUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Restore a session from secure storage on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const access = await tokens.access;
      if (!access) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api<SessionUser>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        await tokens.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // When a refresh fails mid-session, drop the user so the router redirects.
  useEffect(() => {
    setAuthLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setAuthLostHandler(null);
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password },
      });
      await tokens.save(res.accessToken, res.refreshToken);
      setUser(res.user);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    const refreshToken = await tokens.refresh;
    try {
      await api('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // Logging out locally matters more than the server acknowledging it.
    }
    await tokens.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const patchUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, patchUser }),
    [user, loading, signIn, signOut, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
