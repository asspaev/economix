export type SnapshotStatus = "closed" | "current" | "planned" | "unplanned";

export type NowExpected = {
  now: number;
  expected: number;
};

export type AccountSummary = {
  name: string;
  now: number;
  expected: number;
};

export type CapitalSummary = {
  net_capital: NowExpected;
  main_account: AccountSummary;
  savings_accounts: AccountSummary[];
};

export type CategoryAmount = {
  name: string;
  value: number;
};

export type ExpectedBlock = {
  total: number;
  subs: CategoryAmount[];
};

export type CapitalChartPoint = {
  month_key: string;
  label: string;
  plan: number;
  actual: number | null;
};

export type RecentSnapshot = {
  snapshot_key: string;
  year: number;
  month: number;
  month_name: string;
  label: string;
  status: SnapshotStatus;
  has_plan: boolean;
  has_actual: boolean;
  planned_income: number;
  planned_expense: number;
  planned_capital: number;
  actual_income: number | null;
  actual_expense: number | null;
  actual_capital: number | null;
};

export type CurrencyCode = "RUB" | "USD" | "EUR";

export type DashboardOverview = {
  has_any_snapshot: boolean;
  has_current_plan: boolean;
  current_snapshot_key: string;
  current_month_label: string;
  currency: CurrencyCode | string;
  capital: CapitalSummary;
  capital_chart: CapitalChartPoint[];
  expected_income: ExpectedBlock;
  expected_expense: ExpectedBlock;
  recent_snapshots: RecentSnapshot[];
};

export class DashboardApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "DashboardApiError";
  }
}

function authHeaders(token: string | null): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export async function getOverview(token: string | null): Promise<DashboardOverview> {
  const response = await fetch("/api/v1/dashboard/overview", {
    method: "GET",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) {
    throw new DashboardApiError(response.status, `Ошибка сервера (${response.status})`);
  }
  return (await response.json()) as DashboardOverview;
}
