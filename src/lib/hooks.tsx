import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Entitlements, User, Workspace } from '../../shared/types';
import { api, setCsrf } from './api';

export interface AuthState {
  user: Omit<User, 'passwordHash'> & { passwordHash?: never };
  workspace: Workspace;
  entitlements: Entitlements;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  auth: AuthState | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, workspaceName: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setWorkspace: (w: Workspace, e?: Entitlements) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<AuthState>('/auth/me');
      setCsrf((data as unknown as { csrfToken: string }).csrfToken ?? '');
      localStorage.setItem('tp_csrf', (data as unknown as { csrfToken: string }).csrfToken ?? '');
      setAuth({ user: data.user, workspace: data.workspace, entitlements: data.entitlements, mustChangePassword: data.mustChangePassword === true });
    } catch {
      setAuth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('tp_csrf');
    if (stored) setCsrf(stored);
    void refresh();
    const onUnauthorized = () => setAuth(null);
    window.addEventListener('tp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tp:unauthorized', onUnauthorized);
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api<AuthState & { csrfToken: string }>('/auth/login', { method: 'POST', body: { email, password } });
    setCsrf(data.csrfToken);
    localStorage.setItem('tp_csrf', data.csrfToken);
    setAuth({ user: data.user, workspace: data.workspace, entitlements: data.entitlements, mustChangePassword: data.mustChangePassword === true });
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, workspaceName: string) => {
    const data = await api<AuthState & { csrfToken: string }>('/auth/register', {
      method: 'POST',
      body: { name, email, password, workspaceName },
    });
    setCsrf(data.csrfToken);
    localStorage.setItem('tp_csrf', data.csrfToken);
    setAuth({ user: data.user, workspace: data.workspace, entitlements: data.entitlements, mustChangePassword: data.mustChangePassword === true });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* session may already be gone */
    }
    localStorage.removeItem('tp_csrf');
    setCsrf('');
    setAuth(null);
  }, []);

  const setWorkspace = useCallback((w: Workspace, e?: Entitlements) => {
    setAuth((prev) => (prev ? { ...prev, workspace: w, entitlements: e ?? prev.entitlements } : prev));
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api<{ ok: boolean; mustChangePassword: boolean }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    // Refresh auth state to pick up mustChangePassword=false
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ auth, loading, refresh, signIn, signUp, signOut, changePassword, setWorkspace }),
    [auth, loading, refresh, signIn, signUp, signOut, changePassword, setWorkspace],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useResource<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal })
      .then((res) => {
        if (!mounted.current) return;
        setData(res);
        setError(null);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(err.message);
      })
      .finally(() => {
        // Only settle loading when this effect's fetch actually finished; an aborted
        // fetch (StrictMode remount / path change) hands control to the next fetch.
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  return { data, loading, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('tp_theme') as Theme) ?? 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tp_theme', theme);
  }, [theme]);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

export interface Toast {
  id: number;
  message: string;
  tone: 'good' | 'bad' | 'info';
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);
  return { toasts, push, dismiss: (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)) };
}

export function useLiveRun(runId: string | null) {
  const [run, setRun] = useState<import('../../shared/types').Run | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`/api/runs/${runId}/stream`);
    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      try {
        setRun(JSON.parse(event.data));
      } catch {
        /* ignore malformed frame */
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [runId]);
  return { run, connected };
}
