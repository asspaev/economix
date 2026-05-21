import type { AuthCache } from "../auth/storage";

export type CurrencyCode = "RUB" | "USD" | "EUR";
export type SnapshotType = "WEEKLY" | "MONTLY";

export type OnboardingInitialSnapshot = {
  incomes: Record<string, number>;
  expenses: Record<string, number>;
  savings_deposits: Record<string, number>;
  savings_withdrawals: Record<string, number>;
};

export type OnboardingState = {
  currency: CurrencyCode | null;
  snapshot_type: SnapshotType | null;
  income_categories: string[] | null;
  expense_categories: string[] | null;
  accounts: string[] | null;
  initial_capital: Record<string, number> | null;
  initial_snapshot: OnboardingInitialSnapshot | null;
};

export type OnboardingStatePatch = Partial<OnboardingState>;

export class OnboardingApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "OnboardingApiError";
  }
}

function authHeaders(token: string | null): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

async function parseError(response: Response): Promise<OnboardingApiError> {
  let detail: unknown = null;
  let message = `Ошибка сервера (${response.status})`;
  try {
    const data = (await response.json()) as { detail?: unknown };
    detail = data.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (detail && typeof detail === "object" && "message" in detail) {
      const m = (detail as { message?: unknown }).message;
      if (typeof m === "string") message = m;
    }
  } catch {
    /* keep default message */
  }
  return new OnboardingApiError(response.status, message, detail);
}

export async function getState(token: string | null): Promise<OnboardingState> {
  const response = await fetch("/api/v1/onboarding/state", {
    method: "GET",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as OnboardingState;
}

export async function patchState(
  token: string | null,
  patch: OnboardingStatePatch,
): Promise<OnboardingState> {
  const response = await fetch("/api/v1/onboarding/state", {
    method: "PATCH",
    headers: authHeaders(token),
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as OnboardingState;
}

export async function complete(token: string | null): Promise<AuthCache> {
  const response = await fetch("/api/v1/onboarding/complete", {
    method: "POST",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AuthCache;
}
