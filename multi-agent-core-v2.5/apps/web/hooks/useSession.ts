"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMe, loginSession, logoutSession, refreshSession, registerSession, type LoginInput, type RegisterInput, type SessionUser } from "../lib/api";

export interface UseSessionState {
  csrfToken: string | null;
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  signIn(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  signOut(): Promise<void>;
}

export function useSession(): UseSessionState {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const result = await fetchMe();
      if (!active) return;
      if (result.data) {
        setUser(result.data.user);
        setCsrfToken(result.data.csrfToken);
        setError(null);
      } else {
        const refreshed = await refreshSession();
        if (refreshed.data) {
          setUser(refreshed.data.user);
          setCsrfToken(refreshed.data.csrfToken);
          setError(null);
        }
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    setLoading(true);
    setError(null);
    const result = await loginSession(input);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error ?? "Сессия не создана"); return; }
    setCsrfToken(result.data.csrfToken);
    setUser(result.data.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    setLoading(true);
    setError(null);
    const result = await registerSession(input);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error ?? "Пользователь не создан"); return; }
    setCsrfToken(result.data.csrfToken);
    setUser(result.data.user);
  }, []);

  const signOut = useCallback(async () => {
    await logoutSession(csrfToken);
    setCsrfToken(null);
    setUser(null);
    setError(null);
  }, [csrfToken]);

  return useMemo(() => ({ csrfToken, user, loading, error, signIn, register, signOut }), [csrfToken, user, loading, error, signIn, register, signOut]);
}
