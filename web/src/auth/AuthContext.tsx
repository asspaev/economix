import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "../api/auth";
import { onUnauthorized } from "../api/client";
import { decodeJwt, type JwtClaims } from "./jwt";
import {
  clearAuthCache,
  readAuthCache,
  writeAuthCache,
  type AuthCache,
  type CachedUser,
} from "./storage";

type AuthContextValue = {
  user: CachedUser | null;
  accessToken: string | null;
  onboardingRequired: boolean;
  initialCapital: Record<string, number>;
  registeredAt: Date | null;
  signIn: (credentials: { username: string; password: string }) => Promise<void>;
  signUp: (credentials: { username: string; password: string }) => Promise<void>;
  signOut: () => void;
  updateAuth: (cache: AuthCache) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function claimsFor(cache: AuthCache | null): JwtClaims | null {
  if (!cache?.access_token) return null;
  return decodeJwt(cache.access_token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<AuthCache | null>(() => readAuthCache());

  const apply = useCallback((next: AuthCache) => {
    writeAuthCache(next);
    setCache(next);
  }, []);

  const signIn = useCallback(
    async (credentials: { username: string; password: string }) => {
      const next = await authApi.login(credentials);
      apply(next);
    },
    [apply],
  );

  const signUp = useCallback(
    async (credentials: { username: string; password: string }) => {
      const next = await authApi.register(credentials);
      apply(next);
    },
    [apply],
  );

  const signOut = useCallback(() => {
    clearAuthCache();
    setCache(null);
  }, []);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  const value = useMemo<AuthContextValue>(() => {
    const claims = claimsFor(cache);
    let registeredAt: Date | null = null;
    if (cache?.user?.created_at) {
      const parsed = new Date(cache.user.created_at);
      if (!Number.isNaN(parsed.getTime())) registeredAt = parsed;
    }
    if (registeredAt === null && typeof claims?.registered_at === "number") {
      registeredAt = new Date(claims.registered_at * 1000);
    }
    return {
      user: cache?.user ?? null,
      accessToken: cache?.access_token ?? null,
      onboardingRequired: Boolean(claims?.onboarding_required),
      initialCapital: claims?.initial_capital ?? {},
      registeredAt,
      signIn,
      signUp,
      signOut,
      updateAuth: apply,
    };
  }, [cache, signIn, signUp, signOut, apply]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
