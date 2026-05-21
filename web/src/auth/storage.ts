export type CachedUser = {
  user_id: number;
  username: string;
};

export type AuthCache = {
  access_token: string;
  user: CachedUser;
};

const STORAGE_KEY = "economix:auth";

export function readAuthCache(): AuthCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthCache;
    if (
      typeof parsed?.access_token !== "string" ||
      typeof parsed?.user?.user_id !== "number" ||
      typeof parsed?.user?.username !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthCache(cache: AuthCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* noop — storage is best-effort */
  }
}

export function clearAuthCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
