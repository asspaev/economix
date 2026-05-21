import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "../api/auth";
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
  signIn: (credentials: { username: string; password: string }) => Promise<void>;
  signUp: (credentials: { username: string; password: string }) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user: cache?.user ?? null,
      accessToken: cache?.access_token ?? null,
      signIn,
      signUp,
      signOut,
    }),
    [cache, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
