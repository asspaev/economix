import { notifyUnauthorized } from "./client";

export type AnalyticsSnapshotKind = "fact" | "pending";
export type AnalyticsRowKind = "income" | "expense" | "capital";

export type AnalyticsSnapshotOption = {
  snapshot_key: string;
  label: string;
  kind: AnalyticsSnapshotKind;
  hint: string;
  state_label: string;
};

export type AnalyticsCategoryRow = {
  name: string;
  plan: number;
  actual: number;
};

export type AnalyticsPlanVsActualRow = {
  kind: AnalyticsRowKind;
  name: string;
  plan: number;
  actual: number;
  spark: number[];
  note: string;
  subs: AnalyticsCategoryRow[];
};

export type AnalyticsPlanVsActualBlock = {
  income: AnalyticsPlanVsActualRow;
  expense: AnalyticsPlanVsActualRow;
  capital: AnalyticsPlanVsActualRow;
};

export type AnalyticsScenarioPoint = {
  month_key: string;
  label: string;
  plan: number;
  actual: number | null;
};

export type AnalyticsScenario = {
  points: AnalyticsScenarioPoint[];
  plan_total: number;
  actual_total: number;
  gap: number;
  ahead: boolean;
  cross_month_label: string | null;
};

export type AnalyticsOverview = {
  currency: string;
  has_any_snapshot: boolean;
  snapshot_options: AnalyticsSnapshotOption[];
  plan_vs_actual: Record<string, AnalyticsPlanVsActualBlock>;
  scenario: AnalyticsScenario;
};

export class AnalyticsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AnalyticsApiError";
  }
}

function authHeaders(token: string | null): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export async function getOverview(token: string | null): Promise<AnalyticsOverview> {
  const response = await fetch("/api/v1/analytics/overview", {
    method: "GET",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    throw new AnalyticsApiError(response.status, `Ошибка сервера (${response.status})`);
  }
  return (await response.json()) as AnalyticsOverview;
}
