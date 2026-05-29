import { notifyUnauthorized } from "./client";

export type SnapshotPayload = {
  incomes: Record<string, number>;
  expenses: Record<string, number>;
  savings_deposits: Record<string, number>;
  savings_withdrawals: Record<string, number>;
};

export type Snapshot = SnapshotPayload & {
  snapshot_key: string;
};

export type SnapshotsCollection = {
  planned: Snapshot[];
  actual: Snapshot[];
  currency: string;
};

export class SnapshotsApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "SnapshotsApiError";
  }
}

function authHeaders(token: string | null): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

async function parseError(response: Response): Promise<SnapshotsApiError> {
  if (response.status === 401) notifyUnauthorized();
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
  return new SnapshotsApiError(response.status, message, detail);
}

function normalizeBucket(
  map: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!map) return out;
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function normalizeSnapshot(raw: Snapshot): Snapshot {
  return {
    snapshot_key: raw.snapshot_key,
    incomes: normalizeBucket(raw.incomes),
    expenses: normalizeBucket(raw.expenses),
    savings_deposits: normalizeBucket(raw.savings_deposits),
    savings_withdrawals: normalizeBucket(raw.savings_withdrawals),
  };
}

export async function listSnapshots(
  token: string | null,
): Promise<SnapshotsCollection> {
  const response = await fetch("/api/v1/snapshots", {
    method: "GET",
    headers: authHeaders(token),
    credentials: "include",
  });
  if (!response.ok) throw await parseError(response);
  const raw = (await response.json()) as SnapshotsCollection;
  return {
    planned: raw.planned.map(normalizeSnapshot),
    actual: raw.actual.map(normalizeSnapshot),
    currency: raw.currency,
  };
}

export async function upsertPlanned(
  token: string | null,
  snapshotKey: string,
  payload: SnapshotPayload,
): Promise<Snapshot> {
  const response = await fetch(
    `/api/v1/snapshots/planned/${encodeURIComponent(snapshotKey)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw await parseError(response);
  return normalizeSnapshot((await response.json()) as Snapshot);
}

export async function upsertActual(
  token: string | null,
  snapshotKey: string,
  payload: SnapshotPayload,
): Promise<Snapshot> {
  const response = await fetch(
    `/api/v1/snapshots/actual/${encodeURIComponent(snapshotKey)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw await parseError(response);
  return normalizeSnapshot((await response.json()) as Snapshot);
}
