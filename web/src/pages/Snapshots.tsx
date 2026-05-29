import { useEffect, useMemo, useState, type CSSProperties } from "react";

import * as categoriesApi from "../api/categories";
import type { Category } from "../api/categories";
import * as snapshotsApi from "../api/snapshots";
import type { Snapshot, SnapshotPayload } from "../api/snapshots";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { currencySymbol, formatGrouped, formatMoney, parseGrouped } from "../lib/format";
import { SparkIcon } from "../onboarding/icons";

const MAIN_ACCOUNT_NAME = "Основной счёт";

const MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

type SnapStatus =
  | "passed"
  | "planned"
  | "needs_actual"
  | "unplanned"
  | "skipped";

type SnapStatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string | null;
  dashed?: boolean;
};

const SNAP_STATUS: Record<SnapStatus, SnapStatusMeta> = {
  passed: {
    label: "Пройден",
    color: "var(--success)",
    bg: "rgba(107,227,154,0.10)",
    border: "rgba(107,227,154,0.30)",
    glow: "rgba(107,227,154,0.35)",
  },
  planned: {
    label: "Запланирован",
    color: "var(--accent)",
    bg: "rgba(255,232,10,0.10)",
    border: "rgba(255,232,10,0.30)",
    glow: "rgba(255,232,10,0.40)",
  },
  needs_actual: {
    label: "Нужно заполнить",
    color: "var(--danger)",
    bg: "rgba(255,106,92,0.10)",
    border: "rgba(255,106,92,0.35)",
    glow: "rgba(255,106,92,0.35)",
  },
  unplanned: {
    label: "Не запланирован",
    color: "var(--fg-2)",
    bg: "transparent",
    border: "var(--fg-4)",
    glow: null,
    dashed: true,
  },
  skipped: {
    label: "Пропущен",
    color: "var(--fg-3)",
    bg: "transparent",
    border: "var(--border-soft)",
    glow: null,
    dashed: true,
  },
};

type SnapshotBuckets = {
  income: Record<string, number>;
  expense: Record<string, number>;
  deposits: Record<string, number>;
  withdrawals: Record<string, number>;
};

type SnapshotViewModel = {
  snapshotKey: string;
  year: number;
  month: number; // 0..11
  isPast: boolean;
  status: SnapStatus;
  planned: SnapshotBuckets;
  actual: SnapshotBuckets;
};

const EMPTY_BUCKETS = (): SnapshotBuckets => ({
  income: {},
  expense: {},
  deposits: {},
  withdrawals: {},
});

function snapshotToBuckets(snap: Snapshot | undefined): SnapshotBuckets {
  if (!snap) return EMPTY_BUCKETS();
  return {
    income: { ...snap.incomes },
    expense: { ...snap.expenses },
    deposits: { ...snap.savings_deposits },
    withdrawals: { ...snap.savings_withdrawals },
  };
}

function sumValues(map: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(map)) total += v || 0;
  return total;
}

// Чистое изменение капитала за период (по логике «Первый план» онбординга):
//   netDelta = доходы − расходы − траты сбережений
// Пополнения сбережений — перевод между своими счетами, общий капитал не меняют.
function periodNetDelta(b: SnapshotBuckets): number {
  return sumValues(b.income) - sumValues(b.expense) - sumValues(b.withdrawals);
}

type RunningCapital = { planCapital: number; actualCapital: number | null };
type CapMap = Map<string, RunningCapital>;

// Кумулятивная траектория плана и факта от стартового капитала.
// Фактическая обрывается на первом непройденном периоде в хронологическом порядке.
function computeCapitals(
  snaps: SnapshotViewModel[],
  startingCapital: number,
): CapMap {
  const ordered = [...snaps].sort((a, b) =>
    a.snapshotKey.localeCompare(b.snapshotKey),
  );
  const map: CapMap = new Map();
  let planRun = startingCapital;
  let actualRun = startingCapital;
  let actualLive = true;
  for (const s of ordered) {
    planRun += periodNetDelta(s.planned);
    let actualCapital: number | null = null;
    if (actualLive && s.status === "passed") {
      actualRun += periodNetDelta(s.actual);
      actualCapital = actualRun;
    } else {
      actualLive = false;
    }
    map.set(s.snapshotKey, { planCapital: planRun, actualCapital });
  }
  return map;
}

function buildSnapshotKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseSnapshotKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

function pluralSnapshots(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "снапшот";
  if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return "снапшота";
  return "снапшотов";
}

export function Snapshots() {
  const { accessToken, registeredAt } = useAuth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [snapshots, setSnapshots] = useState<snapshotsApi.SnapshotsCollection | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cats, snaps] = await Promise.all([
          categoriesApi.listCategories(accessToken),
          snapshotsApi.listSnapshots(accessToken),
        ]);
        if (cancelled) return;
        setCategories(cats.items);
        setSnapshots(snaps);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof snapshotsApi.SnapshotsApiError) {
          setError(err.message);
        } else if (err instanceof categoriesApi.CategoriesApiError) {
          setError(err.message);
        } else {
          setError("Не удалось загрузить снапшоты");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const today = useMemo(() => new Date(), []);

  const symbol = useMemo(
    () => currencySymbol(snapshots?.currency),
    [snapshots?.currency],
  );

  const registrationBound = useMemo(() => {
    if (!registeredAt) return null;
    return {
      year: registeredAt.getFullYear(),
      month: registeredAt.getMonth(),
    };
  }, [registeredAt]);

  const startingCapital = useMemo(() => {
    if (!categories) return 0;
    let total = 0;
    for (const c of categories) {
      if (c.type !== "ACCOUNT") continue;
      if (c.initial_capital == null) continue;
      total += c.initial_capital;
    }
    return total;
  }, [categories]);

  const viewModel = useMemo<SnapshotViewModel[]>(() => {
    if (!snapshots) return [];
    const plannedMap = new Map(snapshots.planned.map((s) => [s.snapshot_key, s]));
    const actualMap = new Map(snapshots.actual.map((s) => [s.snapshot_key, s]));

    const knownKeys = new Set<string>([...plannedMap.keys(), ...actualMap.keys()]);
    let minYear = today.getFullYear();
    let maxYear = today.getFullYear();
    for (const key of knownKeys) {
      const parsed = parseSnapshotKey(key);
      if (!parsed) continue;
      if (parsed.year < minYear) minYear = parsed.year;
      if (parsed.year > maxYear) maxYear = parsed.year;
    }
    // Base horizon: 5 years total (current + 4 future).
    const baseHorizon = today.getFullYear() + 4;
    if (maxYear < baseHorizon) maxYear = baseHorizon;
    // Rolling horizon: пока декабрь последнего видимого года запланирован,
    // открываем следующий год для планирования.
    while (plannedMap.has(buildSnapshotKey(maxYear, 11))) {
      maxYear += 1;
    }

    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();

    const isBeforeRegistration = (y: number, m: number): boolean => {
      if (!registrationBound) return false;
      if (y < registrationBound.year) return true;
      if (y > registrationBound.year) return false;
      return m < registrationBound.month;
    };

    const rows: SnapshotViewModel[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      for (let m = 0; m <= 11; m++) {
        const key = buildSnapshotKey(y, m);
        const planned = plannedMap.get(key);
        const actual = actualMap.get(key);
        const isPast = y < todayYear || (y === todayYear && m < todayMonth);
        let status: SnapStatus;
        if (actual) status = "passed";
        else if (planned && isPast) status = "needs_actual";
        else if (planned) status = "planned";
        else if (isBeforeRegistration(y, m)) status = "skipped";
        else status = "unplanned";
        rows.push({
          snapshotKey: key,
          year: y,
          month: m,
          isPast,
          status,
          planned: snapshotToBuckets(planned),
          actual: snapshotToBuckets(actual),
        });
      }
    }
    return rows;
  }, [snapshots, today, registrationBound]);

  const capMap = useMemo(
    () => computeCapitals(viewModel, startingCapital),
    [viewModel, startingCapital],
  );

  const groupedByYear = useMemo(() => {
    const map = new Map<number, SnapshotViewModel[]>();
    for (const row of viewModel) {
      const bucket = map.get(row.year) ?? [];
      bucket.push(row);
      map.set(row.year, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b); // oldest first
  }, [viewModel]);

  const currentSnapshotKey = useMemo(
    () => buildSnapshotKey(today.getFullYear(), today.getMonth()),
    [today],
  );

  const onEdit = (snap: SnapshotViewModel) => {
    setEditing(snap.snapshotKey);
  };

  const onSaveOne = async (
    kind: "planned" | "actual",
    snapshotKey: string,
    payload: SnapshotPayload,
  ) => {
    const updated =
      kind === "planned"
        ? await snapshotsApi.upsertPlanned(accessToken, snapshotKey, payload)
        : await snapshotsApi.upsertActual(accessToken, snapshotKey, payload);
    setSnapshots((prev) => {
      if (!prev) return prev;
      const list = prev[kind];
      const idx = list.findIndex((s) => s.snapshot_key === snapshotKey);
      const next =
        idx === -1
          ? [...list, updated]
          : list.map((s, i) => (i === idx ? updated : s));
      next.sort((a, b) => a.snapshot_key.localeCompare(b.snapshot_key));
      return { ...prev, [kind]: next };
    });
  };

  const editingRow = useMemo(() => {
    if (!editing) return null;
    return viewModel.find((r) => r.snapshotKey === editing) ?? null;
  }, [editing, viewModel]);

  return (
    <AppShell active="snapshots" pageLabel="Снапшоты">
      {loading ? (
        <CenteredMessage text="Загружаем снапшоты…" />
      ) : error && !snapshots ? (
        <CenteredMessage text={error} tone="danger" />
      ) : (
        <>
          <SnapshotsHero
            today={today}
            currentSnapshotKey={currentSnapshotKey}
            snapshots={viewModel}
          />

          {error && (
            <div
              role="alert"
              className="t-small"
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                background: "var(--danger-dim)",
                border: "1px solid rgba(255,106,92,0.35)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <div className="col">
            {groupedByYear.map(([year, snaps]) => (
              <YearGroup
                key={year}
                year={year}
                snaps={snaps}
                caps={capMap}
                defaultOpen={year === today.getFullYear()}
                onEdit={onEdit}
                symbol={symbol}
              />
            ))}
          </div>

          <div style={{ height: 80 }} />
        </>
      )}

      {editing && editingRow && categories && (
        <SnapshotEditor
          key={editing}
          snap={editingRow}
          categories={categories}
          symbol={symbol}
          onClose={() => setEditing(null)}
          onSave={async ({ plan, actual }) => {
            if (plan) await onSaveOne("planned", editing, plan);
            if (actual) await onSaveOne("actual", editing, actual);
            setEditing(null);
          }}
        />
      )}
    </AppShell>
  );
}

function CenteredMessage({ text, tone }: { text: string; tone?: "danger" }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone === "danger" ? "var(--danger)" : "var(--fg-2)",
        padding: "48px 0",
      }}
    >
      {text}
    </div>
  );
}

/* ====== Hero ====== */
function SnapshotsHero({
  today,
  currentSnapshotKey,
  snapshots,
}: {
  today: Date;
  currentSnapshotKey: string;
  snapshots: SnapshotViewModel[];
}) {
  const totals = useMemo(() => {
    let passed = 0;
    let planned = 0;
    let needsActual = 0;
    let unplanned = 0;
    let skipped = 0;
    for (const s of snapshots) {
      if (s.status === "passed") passed++;
      else if (s.status === "planned") planned++;
      else if (s.status === "needs_actual") needsActual++;
      else if (s.status === "skipped") skipped++;
      else unplanned++;
    }
    return { passed, planned, needsActual, unplanned, skipped };
  }, [snapshots]);

  const current = snapshots.find((s) => s.snapshotKey === currentSnapshotKey);
  const currentLabel = `${MONTHS_RU[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div
      style={{
        padding: "28px 0 20px",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
      }}
    >
      <div className="col gap-2">
        <span className="t-eyebrow">Лента периодов · план и факт</span>
        <h1 className="t-h1" style={{ margin: 0 }}>
          Снапшоты
        </h1>
        <span className="t-body">
          Здесь живёт хронология ваших периодов: что было запланировано, что
          фактически произошло и где остались пробелы. Текущий месяц —{" "}
          <span style={{ color: "var(--fg-0)" }}>{currentLabel}</span>
          {current && current.status === "planned" && " · план уже на месте."}
          {current && current.status === "unplanned" && " · план ещё не задан."}
        </span>
      </div>
      <div
        className="row"
        style={{ gap: 24, alignSelf: "stretch", alignItems: "flex-end" }}
      >
        <HeroStat label="Пройдено" value={totals.passed} color="var(--success)" />
        <HeroStat label="В плане" value={totals.planned} color="var(--accent)" />
        <HeroStat
          label="Нужно заполнить"
          value={totals.needsActual}
          color="var(--danger)"
        />
        <HeroStat label="Без плана" value={totals.unplanned} color="var(--fg-3)" />
        {totals.skipped > 0 && (
          <HeroStat
            label="Пропущено"
            value={totals.skipped}
            color="var(--fg-3)"
          />
        )}
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="col gap-1" style={{ alignItems: "flex-end" }}>
      <span className="t-eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 22,
          color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ====== Status pill ====== */
function SnapStatusBadge({ kind }: { kind: SnapStatus }) {
  const s = SNAP_STATUS[kind];
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 9px",
        background: s.bg,
        border: `1px ${s.dashed ? "dashed" : "solid"} ${s.border}`,
        color: s.color,
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background:
            kind === "unplanned" || kind === "skipped"
              ? "transparent"
              : s.color,
          border:
            kind === "unplanned" || kind === "skipped"
              ? `1px dashed ${s.color}`
              : "none",
          boxShadow: s.glow ? `0 0 6px ${s.glow}` : "none",
        }}
      />
      {s.label}
    </span>
  );
}

/* ====== Single metric trio (plan + actual + delta) ====== */
function MetricTriad({
  label,
  kind,
  plan,
  actual,
  hasActual,
  currency = "$",
}: {
  label: string;
  kind: "income" | "expense" | "capital";
  plan: number;
  actual: number;
  hasActual: boolean;
  currency?: string;
}) {
  const dev = (actual || 0) - (plan || 0);
  const colorFor = (): string => {
    if (!hasActual || plan === 0) return "var(--fg-1)";
    if (kind === "income") return dev >= 0 ? "var(--success)" : "var(--danger)";
    if (kind === "expense") return dev <= 0 ? "var(--success)" : "var(--danger)";
    return dev >= 0 ? "var(--success)" : "var(--danger)";
  };
  const accent = colorFor();
  const sign = dev === 0 ? "" : dev > 0 ? "+" : "−";
  const fmt = (n: number) => formatMoney(Math.round(n), currency ?? "");

  const labelColor =
    kind === "income"
      ? "var(--success)"
      : kind === "expense"
        ? "var(--danger)"
        : "var(--accent)";

  return (
    <div className="col gap-2" style={{ minWidth: 0, flex: 1 }}>
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: labelColor,
            flexShrink: 0,
          }}
        />
        <span className="t-eyebrow" style={{ fontSize: 9, color: labelColor }}>
          {label}
        </span>
      </div>
      <div className="col" style={{ gap: 2 }}>
        {hasActual ? (
          <>
            <span
              className="mono"
              style={{
                fontSize: 18,
                fontVariantNumeric: "tabular-nums",
                color: "var(--fg-0)",
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              {fmt(actual)}
            </span>
            <div className="row gap-2" style={{ alignItems: "baseline" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                план {fmt(plan)}
              </span>
              <span
                className="mono"
                style={{ fontSize: 11, color: accent, fontWeight: 500 }}
              >
                {sign}
                {fmt(Math.abs(dev))}
              </span>
            </div>
          </>
        ) : (
          <>
            <span
              className="mono"
              style={{
                fontSize: 18,
                fontVariantNumeric: "tabular-nums",
                color: plan > 0 ? "var(--fg-1)" : "var(--fg-3)",
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
                fontStyle: plan > 0 ? "normal" : "italic",
              }}
            >
              {plan > 0 ? `≈ ${fmt(plan)}` : "—"}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
              {plan > 0 ? "ожидается" : "не заполнено"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ====== Snapshot row card ====== */
function SnapshotRow({
  snap,
  onEdit,
  symbol,
  cap,
}: {
  snap: SnapshotViewModel;
  onEdit: (snap: SnapshotViewModel) => void;
  symbol: string;
  cap: RunningCapital | undefined;
}) {
  const isPassed = snap.status === "passed";
  const isUnplanned = snap.status === "unplanned";
  const isSkipped = snap.status === "skipped";
  const isFutureUnplanned = isUnplanned && !snap.isPast;
  const isMuted = isFutureUnplanned || isSkipped;
  const isPastNoActual =
    snap.status === "needs_actual" || (isUnplanned && snap.isPast);
  const showMetrics = !isFutureUnplanned && !isSkipped;

  const planIncome = sumValues(snap.planned.income);
  const planExpense = sumValues(snap.planned.expense);
  const planCapital = cap ? cap.planCapital : 0;
  const actIncome = sumValues(snap.actual.income);
  const actExpense = sumValues(snap.actual.expense);
  const actCapital = cap && cap.actualCapital != null ? cap.actualCapital : 0;

  let buttonLabel: string;
  if (isFutureUnplanned) buttonLabel = "Запланировать";
  else if (isSkipped) buttonLabel = "Заполнить";
  else if (isPastNoActual) buttonLabel = "Отчитаться";
  else buttonLabel = "Редактировать";

  const buttonStyle: CSSProperties = (() => {
    if (isFutureUnplanned) {
      return {
        background: "var(--accent)",
        color: "var(--accent-on)",
        border: 0,
        fontWeight: 600,
      };
    }
    if (isSkipped) {
      return {
        background: "transparent",
        color: "var(--fg-2)",
        border: "1px dashed var(--border-soft)",
        fontWeight: 500,
      };
    }
    if (isPastNoActual) {
      return {
        background: "var(--bg-3)",
        color: "var(--fg-2)",
        border: "1px solid var(--border-soft)",
        fontWeight: 500,
      };
    }
    return {
      background: "var(--bg-3)",
      color: "var(--fg-0)",
      border: "1px solid var(--border)",
      fontWeight: 500,
    };
  })();

  return (
    <div
      className="card"
      style={{
        padding: "18px 20px",
        display: "flex",
        alignItems: "stretch",
        gap: 20,
        borderStyle: isMuted ? "dashed" : "solid",
        borderColor: isMuted ? "var(--border-soft)" : "var(--border)",
        background: isMuted ? "transparent" : undefined,
        opacity: isSkipped ? 0.65 : isFutureUnplanned ? 0.85 : 1,
        transition: "border-color 140ms ease, background 140ms ease",
      }}
    >
      {/* Month label */}
      <div
        className="col gap-2"
        style={{ minWidth: 152, flexShrink: 0, justifyContent: "center" }}
      >
        <div
          className="row gap-2"
          style={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: isPassed ? "var(--fg-0)" : "var(--fg-1)",
              letterSpacing: "-0.01em",
            }}
          >
            {MONTHS_RU[snap.month]}
          </span>
        </div>
        <SnapStatusBadge kind={snap.status} />
      </div>

      {/* Vertical divider */}
      <div
        style={{ width: 1, background: "var(--border-soft)", flexShrink: 0 }}
      />

      {/* Metrics */}
      <div
        className="row"
        style={{ flex: 1, alignItems: "stretch", gap: 24, minWidth: 0 }}
      >
        {!showMetrics ? (
          <div
            className="col"
            style={{
              flex: 1,
              justifyContent: "center",
              color: "var(--fg-3)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {isSkipped
              ? "Этот месяц был до вашей регистрации — заполнять его не обязательно."
              : "План на этот месяц не заполнен. Нажмите «Запланировать», чтобы задать ожидаемые значения."}
          </div>
        ) : (
          <>
            <MetricTriad
              label="Доходы"
              kind="income"
              plan={planIncome}
              actual={actIncome}
              hasActual={isPassed}
              currency={symbol}
            />
            <MetricTriad
              label="Расходы"
              kind="expense"
              plan={planExpense}
              actual={actExpense}
              hasActual={isPassed}
              currency={symbol}
            />
            <MetricTriad
              label="Капитал"
              kind="capital"
              plan={planCapital}
              actual={actCapital}
              hasActual={isPassed && cap?.actualCapital != null}
              currency={symbol}
            />
          </>
        )}
      </div>

      {/* Edit button */}
      <div
        className="row"
        style={{
          alignItems: "center",
          flexShrink: 0,
          width: 160,
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={() => onEdit(snap)}
          className="btn"
          style={{
            height: 36,
            padding: "0 14px",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: "pointer",
            minWidth: 148,
            ...buttonStyle,
          }}
        >
          {buttonLabel}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 8.5L8 2.5M5.5 2.5H8.5V5.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ====== Year group ====== */
function YearGroup({
  year,
  snaps,
  caps,
  onEdit,
  defaultOpen,
  symbol,
}: {
  year: number;
  snaps: SnapshotViewModel[];
  caps: CapMap;
  onEdit: (snap: SnapshotViewModel) => void;
  defaultOpen: boolean;
  symbol: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const passed = snaps.filter((s) => s.status === "passed").length;
  const planned = snaps.filter((s) => s.status === "planned").length;
  const needsActual = snaps.filter((s) => s.status === "needs_actual").length;
  const unplanned = snaps.filter((s) => s.status === "unplanned").length;
  const skipped = snaps.filter((s) => s.status === "skipped").length;

  const lastPassed = [...snaps].reverse().find((s) => s.status === "passed");
  const yearCapital =
    lastPassed && caps.get(lastPassed.snapshotKey)?.actualCapital != null
      ? caps.get(lastPassed.snapshotKey)!.actualCapital
      : null;

  return (
    <section className="col gap-3" style={{ marginBottom: 28 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 4px",
          cursor: "pointer",
          borderBottom: "1px solid var(--border-soft)",
          paddingBottom: 14,
          marginBottom: 4,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transition: "transform 160ms ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            color: "var(--fg-2)",
            flexShrink: 0,
          }}
        >
          <path
            d="M4.5 3L7.5 6L4.5 9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="mono"
          style={{
            fontSize: 28,
            letterSpacing: "-0.02em",
            color: "var(--fg-0)",
            fontWeight: 500,
          }}
        >
          {year}
        </span>
        <span className="t-small" style={{ color: "var(--fg-2)" }}>
          · {snaps.length} {pluralSnapshots(snaps.length)}
        </span>
        <div style={{ flex: 1 }} />
        <div className="row gap-3" style={{ alignItems: "center" }}>
          {passed > 0 && (
            <span
              className="mono t-small"
              style={{ color: "var(--success)", fontSize: 11 }}
            >
              ● {passed} пройдено
            </span>
          )}
          {planned > 0 && (
            <span
              className="mono t-small"
              style={{ color: "var(--accent)", fontSize: 11 }}
            >
              ● {planned} в плане
            </span>
          )}
          {needsActual > 0 && (
            <span
              className="mono t-small"
              style={{ color: "var(--danger)", fontSize: 11 }}
            >
              ● {needsActual} нужно заполнить
            </span>
          )}
          {unplanned > 0 && (
            <span
              className="mono t-small"
              style={{ color: "var(--fg-3)", fontSize: 11 }}
            >
              ○ {unplanned} не спл.
            </span>
          )}
          {skipped > 0 && (
            <span
              className="mono t-small"
              style={{ color: "var(--fg-3)", fontSize: 11, opacity: 0.7 }}
            >
              ◌ {skipped} пропущено
            </span>
          )}
          {yearCapital != null && (
            <span
              className="mono"
              style={{
                fontSize: 13,
                color: "var(--fg-1)",
                fontVariantNumeric: "tabular-nums",
                paddingLeft: 12,
                borderLeft: "1px solid var(--border-soft)",
              }}
            >
              капитал {formatMoney(yearCapital, symbol)}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="col gap-2 anim-fade-in">
          {snaps.map((s) => (
            <SnapshotRow
              key={s.snapshotKey}
              snap={s}
              onEdit={onEdit}
              symbol={symbol}
              cap={caps.get(s.snapshotKey)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ====== Editor ====== */

type FlowDraft = {
  income: Record<string, string>;
  expense: Record<string, string>;
  savingsIn: Record<string, string>;
  savingsOut: Record<string, string>;
};

type FlowTotals = {
  income: number;
  expense: number;
  savingsIn: number;
  savingsOut: number;
  mainRemainder: number;
  savingsDelta: number;
  netDelta: number;
};

function sumDraftBucket(map: Record<string, string>): number {
  let total = 0;
  for (const v of Object.values(map)) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return Math.round(total);
}

function flowTotals(draft: FlowDraft): FlowTotals {
  const income = sumDraftBucket(draft.income);
  const expense = sumDraftBucket(draft.expense);
  const savingsIn = sumDraftBucket(draft.savingsIn);
  const savingsOut = sumDraftBucket(draft.savingsOut);
  return {
    income,
    expense,
    savingsIn,
    savingsOut,
    mainRemainder: income - expense - savingsIn,
    savingsDelta: savingsIn - savingsOut,
    netDelta: income - expense - savingsOut,
  };
}

function bucketsToFlowDraft(
  buckets: SnapshotBuckets,
  incomes: Category[],
  expenses: Category[],
  otherAccounts: Category[],
): FlowDraft {
  const pull = (
    src: Record<string, number>,
    items: Category[],
  ): Record<string, string> =>
    Object.fromEntries(
      items.map((c) => [c.name, src[c.name] ? String(src[c.name]) : ""]),
    );
  return {
    income: pull(buckets.income, incomes),
    expense: pull(buckets.expense, expenses),
    savingsIn: pull(buckets.deposits, otherAccounts),
    savingsOut: pull(buckets.withdrawals, otherAccounts),
  };
}

function flowDraftToPayload(draft: FlowDraft): SnapshotPayload {
  const collect = (src: Record<string, string>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === MAIN_ACCOUNT_NAME) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) out[k] = Math.round(n);
    }
    return out;
  };
  return {
    incomes: collect(draft.income),
    expenses: collect(draft.expense),
    savings_deposits: collect(draft.savingsIn),
    savings_withdrawals: collect(draft.savingsOut),
  };
}

function payloadHasValues(p: SnapshotPayload): boolean {
  return (
    Object.keys(p.incomes).length > 0 ||
    Object.keys(p.expenses).length > 0 ||
    Object.keys(p.savings_deposits).length > 0 ||
    Object.keys(p.savings_withdrawals).length > 0
  );
}

function namesReferencedInBuckets(
  ...buckets: Array<Record<string, number>>
): Set<string> {
  const names = new Set<string>();
  for (const bucket of buckets) {
    for (const [name, value] of Object.entries(bucket)) {
      if (value && Number.isFinite(value)) names.add(name);
    }
  }
  return names;
}

function buildCategoryList({
  categories,
  type,
  preserveArchived,
  referencedNames,
}: {
  categories: Category[];
  type: Category["type"];
  preserveArchived: boolean;
  referencedNames: Set<string>;
}): Category[] {
  const active = categories.filter((c) => c.type === type && !c.is_archived);
  if (!preserveArchived) return active;
  const archivedWithData = categories.filter(
    (c) => c.type === type && c.is_archived && referencedNames.has(c.name),
  );
  return [...active, ...archivedWithData];
}

function SnapshotEditor({
  snap,
  categories,
  symbol,
  onClose,
  onSave,
}: {
  snap: SnapshotViewModel;
  categories: Category[];
  symbol: string;
  onClose: () => void;
  onSave: (data: {
    plan: SnapshotPayload | null;
    actual: SnapshotPayload | null;
  }) => Promise<void>;
}) {
  const preserveArchived = snap.status === "passed";

  const incomes = useMemo(
    () =>
      buildCategoryList({
        categories,
        type: "INCOME",
        preserveArchived,
        referencedNames: namesReferencedInBuckets(
          snap.planned.income,
          snap.actual.income,
        ),
      }),
    [categories, preserveArchived, snap.planned.income, snap.actual.income],
  );
  const expenses = useMemo(
    () =>
      buildCategoryList({
        categories,
        type: "EXPENSE",
        preserveArchived,
        referencedNames: namesReferencedInBuckets(
          snap.planned.expense,
          snap.actual.expense,
        ),
      }),
    [categories, preserveArchived, snap.planned.expense, snap.actual.expense],
  );
  const accounts = useMemo(
    () =>
      buildCategoryList({
        categories,
        type: "ACCOUNT",
        preserveArchived,
        referencedNames: namesReferencedInBuckets(
          snap.planned.deposits,
          snap.planned.withdrawals,
          snap.actual.deposits,
          snap.actual.withdrawals,
        ),
      }),
    [
      categories,
      preserveArchived,
      snap.planned.deposits,
      snap.planned.withdrawals,
      snap.actual.deposits,
      snap.actual.withdrawals,
    ],
  );
  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.name !== MAIN_ACCOUNT_NAME),
    [accounts],
  );
  const mainAccountName = useMemo(
    () =>
      accounts.find((a) => a.name === MAIN_ACCOUNT_NAME)?.name ??
      MAIN_ACCOUNT_NAME,
    [accounts],
  );

  const showActual = snap.isPast || snap.status === "passed";

  const hadPlanInitially =
    snap.status === "planned" ||
    snap.status === "passed" ||
    snap.status === "needs_actual";
  const hadActualInitially = snap.status === "passed";

  const [planDraft, setPlanDraft] = useState<FlowDraft>(() =>
    bucketsToFlowDraft(snap.planned, incomes, expenses, otherAccounts),
  );
  const [actualDraft, setActualDraft] = useState<FlowDraft>(() =>
    bucketsToFlowDraft(snap.actual, incomes, expenses, otherAccounts),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll + ESC to close
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const setPlanField = (
    bucket: keyof FlowDraft,
    name: string,
    value: string,
  ) => {
    const clean = parseGrouped(value).replace(/[^0-9.]/g, "");
    setPlanDraft((d) => ({ ...d, [bucket]: { ...d[bucket], [name]: clean } }));
  };
  const setActualField = (
    bucket: keyof FlowDraft,
    name: string,
    value: string,
  ) => {
    const clean = parseGrouped(value).replace(/[^0-9.]/g, "");
    setActualDraft((d) => ({ ...d, [bucket]: { ...d[bucket], [name]: clean } }));
  };

  const planTotals = flowTotals(planDraft);
  const actualTotals = flowTotals(actualDraft);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const planPayload = flowDraftToPayload(planDraft);
      const actualPayload = showActual ? flowDraftToPayload(actualDraft) : null;

      const shouldSavePlan = hadPlanInitially || payloadHasValues(planPayload);
      const shouldSaveActual =
        actualPayload !== null &&
        (hadActualInitially || payloadHasValues(actualPayload));

      await onSave({
        plan: shouldSavePlan ? planPayload : null,
        actual: shouldSaveActual ? actualPayload : null,
      });
    } catch (err) {
      if (err instanceof snapshotsApi.SnapshotsApiError) {
        setError(err.message);
      } else {
        setError("Не удалось сохранить снапшот");
      }
    } finally {
      setSaving(false);
    }
  };

  const title = `${MONTHS_RU[snap.month]} ${snap.year}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(5, 5, 7, 0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeIn 160ms ease",
      }}
    >
      <div
        className="card anim-fade-up"
        style={{
          width: "100%",
          maxWidth: showActual ? 1240 : 660,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-1)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        {/* Header */}
        <div
          className="row between"
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-soft)",
            flexShrink: 0,
          }}
        >
          <div className="col gap-2">
            <span className="t-eyebrow">Редактирование снапшота</span>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <h2 className="t-h2" style={{ margin: 0 }}>
                {title}
              </h2>
              <SnapStatusBadge kind={snap.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost btn--icon"
            aria-label="Закрыть"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {error && (
            <div
              role="alert"
              className="t-small"
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--danger-dim)",
                border: "1px solid rgba(255,106,92,0.35)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: showActual ? "1fr 1fr" : "1fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            <PlanEditorColumn
              title="Ожидаемые значения"
              hint="что планировали в начале периода"
              accent="var(--accent)"
              dotGlow="var(--accent-glow)"
              draft={planDraft}
              totals={planTotals}
              incomes={incomes}
              expenses={expenses}
              otherAccounts={otherAccounts}
              mainAccountName={mainAccountName}
              onChange={setPlanField}
              symbol={symbol}
            />
            {showActual && (
              <PlanEditorColumn
                title="Фактические значения"
                hint="что получилось по итогам периода"
                accent="var(--success)"
                dotGlow="rgba(107,227,154,0.45)"
                draft={actualDraft}
                totals={actualTotals}
                incomes={incomes}
                expenses={expenses}
                otherAccounts={otherAccounts}
                mainAccountName={mainAccountName}
                onChange={setActualField}
                symbol={symbol}
              />
            )}
          </div>

          {showActual && (
            <div
              className="card"
              style={{
                marginTop: 18,
                padding: 18,
                background: "var(--bg-2)",
              }}
            >
              <span
                className="t-eyebrow"
                style={{ marginBottom: 14, display: "block" }}
              >
                Отклонения · факт против плана
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 18,
                }}
              >
                <DeltaCell
                  label="Доходы"
                  kind="income"
                  plan={planTotals.income}
                  actual={actualTotals.income}
                  symbol={symbol}
                />
                <DeltaCell
                  label="Расходы"
                  kind="expense"
                  plan={planTotals.expense}
                  actual={actualTotals.expense}
                  symbol={symbol}
                />
                <DeltaCell
                  label="Изменение сбережений"
                  kind="savings"
                  plan={planTotals.savingsDelta}
                  actual={actualTotals.savingsDelta}
                  symbol={symbol}
                />
                <DeltaCell
                  label="Изменение капитала"
                  kind="capital"
                  plan={planTotals.netDelta}
                  actual={actualTotals.netDelta}
                  symbol={symbol}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="row between"
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-soft)",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <span className="t-small dim">
            {showActual
              ? "Изменения сохранятся в обоих столбцах — план и факт"
              : "Когда период завершится, рядом появится столбец с фактическими значениями"}
          </span>
          <div className="row gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn"
              disabled={saving}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="btn btn--primary"
              disabled={saving}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7.5L6 10.5L11 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====== One full step-7 plan editor column ====== */
function PlanEditorColumn({
  title,
  hint,
  accent,
  dotGlow,
  draft,
  totals,
  incomes,
  expenses,
  otherAccounts,
  mainAccountName,
  onChange,
  symbol,
}: {
  title: string;
  hint: string;
  accent: string;
  dotGlow: string;
  draft: FlowDraft;
  totals: FlowTotals;
  incomes: Category[];
  expenses: Category[];
  otherAccounts: Category[];
  mainAccountName: string;
  onChange: (bucket: keyof FlowDraft, name: string, value: string) => void;
  symbol: string;
}) {
  return (
    <div className="col gap-3">
      <div className="col gap-1" style={{ paddingBottom: 2 }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 10px ${dotGlow}`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500, color: accent }}>
            {title}
          </span>
        </div>
        <span className="t-small dim">{hint}</span>
      </div>

      <FlowSection
        title="Доходы"
        accent="var(--success)"
        total={totals.income}
        items={incomes}
        values={draft.income}
        onChange={(name, v) => onChange("income", name, v)}
        hint="за период"
        symbol={symbol}
      />
      <FlowSection
        title="Расходы"
        accent="var(--danger)"
        total={totals.expense}
        items={expenses}
        values={draft.expense}
        onChange={(name, v) => onChange("expense", name, v)}
        hint="бюджет"
        symbol={symbol}
      />

      {otherAccounts.length > 0 && (
        <SavingsBlock
          otherAccounts={otherAccounts}
          draft={draft}
          onChange={onChange}
          inTotal={totals.savingsIn}
          outTotal={totals.savingsOut}
          symbol={symbol}
        />
      )}

      <ResultCard
        title={mainAccountName}
        glow="rgba(255,232,10,0.10)"
        glowAt="0% 0%"
        rows={[
          {
            label: "Доходы",
            sign: "+",
            value: totals.income,
            color: "var(--success)",
          },
          {
            label: "Расходы",
            sign: "−",
            value: totals.expense,
            color: "var(--danger)",
          },
          {
            label: "Пополнения сбережений",
            sign: "−",
            value: totals.savingsIn,
            color: "#6BE39A",
          },
        ]}
        resultLabel="= Свободный остаток"
        resultValue={totals.mainRemainder}
        resultColor={
          totals.mainRemainder >= 0 ? "var(--accent)" : "var(--danger)"
        }
        symbol={symbol}
      />
      {otherAccounts.length > 0 && (
        <ResultCard
          title="Сбережения"
          glow={
            totals.savingsDelta >= 0
              ? "rgba(107,227,154,0.10)"
              : "rgba(255,106,92,0.10)"
          }
          glowAt="100% 0%"
          rows={[
            {
              label: "Пополнения",
              sign: "+",
              value: totals.savingsIn,
              color: "#6BE39A",
            },
            {
              label: "Траты сбережений",
              sign: "−",
              value: totals.savingsOut,
              color: "#FF6A5C",
            },
          ]}
          resultLabel="= Изменение сбережений"
          resultValue={totals.savingsDelta}
          resultColor={totals.savingsDelta >= 0 ? "#6BE39A" : "#FF6A5C"}
          symbol={symbol}
        />
      )}
      <ForecastCard netDelta={totals.netDelta} symbol={symbol} />
    </div>
  );
}

/* ====== Income / Expense section ====== */
function FlowSection({
  title,
  accent,
  total,
  items,
  values,
  onChange,
  hint,
  symbol,
}: {
  title: string;
  accent: string;
  total: number;
  items: Category[];
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  hint: string;
  symbol: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="row between"
        style={{ marginBottom: 12, alignItems: "center" }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
          <span className="t-small dim">· {items.length}</span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 15,
            color: total > 0 ? "var(--fg-0)" : "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(total, symbol)}
        </span>
      </div>
      <div className="col gap-2">
        {items.map((it) => (
          <div
            key={it.category_id}
            className="row gap-3"
            style={{ alignItems: "center" }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: it.is_archived ? "var(--fg-2)" : "var(--fg-1)",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {it.name}
              </span>
              {it.is_archived && (
                <span
                  className="t-eyebrow"
                  style={{
                    fontSize: 9,
                    color: "var(--fg-3)",
                    letterSpacing: "0.06em",
                  }}
                  title="Категория архивирована — оставляем для исторических данных"
                >
                  архив
                </span>
              )}
            </span>
            <span className="t-small dim" style={{ flexShrink: 0 }}>
              {hint}
            </span>
            <FlowInput
              value={values[it.name] ?? ""}
              onChange={(v) => onChange(it.name, v)}
              symbol={symbol}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ====== Savings: deposits ↗ + withdrawals ↘ in one card ====== */
function SavingsBlock({
  otherAccounts,
  draft,
  onChange,
  inTotal,
  outTotal,
  symbol,
}: {
  otherAccounts: Category[];
  draft: FlowDraft;
  onChange: (bucket: keyof FlowDraft, name: string, value: string) => void;
  inTotal: number;
  outTotal: number;
  symbol: string;
}) {
  const IN_ACCENT = "#6BE39A";
  const OUT_ACCENT = "#FF6A5C";
  const net = inTotal - outTotal;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="row between"
        style={{ marginBottom: 14, alignItems: "center" }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: IN_ACCENT,
              boxShadow: `0 0 8px ${IN_ACCENT}`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Сбережения</span>
          <span className="t-small dim">· {otherAccounts.length}</span>
        </div>
        <div className="row gap-2" style={{ alignItems: "baseline" }}>
          <span className="t-small dim">чистый поток</span>
          <span
            className="mono"
            style={{
              fontSize: 15,
              color:
                net > 0 ? IN_ACCENT : net < 0 ? OUT_ACCENT : "var(--fg-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {net >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(net), symbol)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--border-soft)",
            transform: "translateX(-0.5px)",
          }}
        />
        <SavingsColumn
          side="in"
          title="Пополнение"
          hint="сколько отложить"
          accent={IN_ACCENT}
          total={inTotal}
          items={otherAccounts}
          values={draft.savingsIn}
          onChange={(name, v) => onChange("savingsIn", name, v)}
          symbol={symbol}
        />
        <SavingsColumn
          side="out"
          title="Траты"
          hint="сколько снять"
          accent={OUT_ACCENT}
          total={outTotal}
          items={otherAccounts}
          values={draft.savingsOut}
          onChange={(name, v) => onChange("savingsOut", name, v)}
          symbol={symbol}
        />
      </div>
    </div>
  );
}

function SavingsColumn({
  side,
  title,
  hint,
  accent,
  total,
  items,
  values,
  onChange,
  symbol,
}: {
  side: "in" | "out";
  title: string;
  hint: string;
  accent: string;
  total: number;
  items: Category[];
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  symbol: string;
}) {
  const padSide = side === "in" ? { paddingRight: 16 } : { paddingLeft: 16 };
  return (
    <div className="col gap-3" style={padSide}>
      <div className="row between" style={{ alignItems: "center" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
          <span className="t-eyebrow" style={{ fontSize: 10, color: accent }}>
            {side === "in" ? "↗ приток" : "↘ отток"}
          </span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 13,
            color: total > 0 ? "var(--fg-0)" : "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(total, symbol)}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-1)" }}>
        {title}
      </div>
      <div className="col gap-2">
        {items.map((a) => (
          <div key={a.category_id} className="col gap-1">
            <span
              className="t-small"
              style={{
                color: a.is_archived ? "var(--fg-2)" : "var(--fg-1)",
                display: "inline-flex",
                alignItems: "baseline",
                gap: 6,
              }}
            >
              {a.name}
              {a.is_archived && (
                <span
                  className="t-eyebrow"
                  style={{
                    fontSize: 9,
                    color: "var(--fg-3)",
                    letterSpacing: "0.06em",
                  }}
                  title="Категория архивирована — оставляем для исторических данных"
                >
                  архив
                </span>
              )}
            </span>
            <FlowInput
              value={values[a.name] ?? ""}
              onChange={(v) => onChange(a.name, v)}
              symbol={symbol}
              fullWidth
            />
          </div>
        ))}
        <span className="t-small dim" style={{ marginTop: 2 }}>
          {hint}
        </span>
      </div>
    </div>
  );
}

function FlowInput({
  value,
  onChange,
  symbol,
  fullWidth,
}: {
  value: string;
  onChange: (next: string) => void;
  symbol: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: fullWidth ? "100%" : 132,
        flexShrink: 0,
      }}
    >
      <span
        className="mono"
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--fg-3)",
          fontSize: 13,
          pointerEvents: "none",
        }}
      >
        {symbol}
      </span>
      <input
        className="input mono"
        style={{
          height: 34,
          paddingLeft: 22,
          paddingRight: 10,
          textAlign: "right",
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          width: "100%",
        }}
        type="text"
        inputMode="decimal"
        value={formatGrouped(value)}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* ====== Auto result card (ledger rows + computed total) ====== */
type LedgerEntry = {
  label: string;
  sign: string;
  value: number;
  color: string;
};

function ResultCard({
  title,
  glow,
  glowAt,
  rows,
  resultLabel,
  resultValue,
  resultColor,
  symbol,
}: {
  title: string;
  glow: string;
  glowAt: string;
  rows: LedgerEntry[];
  resultLabel: string;
  resultValue: number;
  resultColor: string;
  symbol: string;
}) {
  return (
    <div
      className="card"
      style={{ padding: 16, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(120% 80% at ${glowAt}, ${glow}, transparent 55%)`,
        }}
      />
      <div
        className="row between"
        style={{
          position: "relative",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: resultColor,
              boxShadow: `0 0 8px ${resultColor}`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        </div>
        <span
          className="t-eyebrow"
          style={{ fontSize: 9, color: resultColor }}
        >
          авто
        </span>
      </div>

      <div className="col gap-2" style={{ position: "relative" }}>
        {rows.map((r, i) => (
          <LedgerRow key={i} {...r} symbol={symbol} />
        ))}
        <div className="hr" style={{ margin: "6px 0 2px" }} />
        <div className="row between" style={{ alignItems: "baseline" }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{resultLabel}</span>
          <span
            className="mono"
            style={{
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: resultColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {resultValue >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(resultValue), symbol)}
          </span>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  sign,
  value,
  color,
  symbol,
}: LedgerEntry & { symbol: string }) {
  const muted = !value;
  return (
    <div className="row between" style={{ alignItems: "baseline" }}>
      <div className="row gap-2" style={{ alignItems: "baseline" }}>
        <span
          className="mono"
          style={{
            fontSize: 13,
            color: muted ? "var(--fg-3)" : color,
            width: 11,
            display: "inline-block",
            textAlign: "center",
          }}
        >
          {sign}
        </span>
        <span
          style={{
            fontSize: 13,
            color: muted ? "var(--fg-3)" : "var(--fg-0)",
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 13,
          color: muted ? "var(--fg-3)" : "var(--fg-0)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatMoney(value, symbol)}
      </span>
    </div>
  );
}

/* ====== Capital forecast card ====== */
function ForecastCard({
  netDelta,
  symbol,
}: {
  netDelta: number;
  symbol: string;
}) {
  const positive = netDelta >= 0;
  return (
    <div className="card" style={{ padding: 16, background: "var(--bg-1)" }}>
      <div className="row gap-3" style={{ alignItems: "flex-start" }}>
        <div
          style={{
            width: 26,
            height: 26,
            flexShrink: 0,
            borderRadius: 8,
            background: "var(--accent-dim)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SparkIcon />
        </div>
        <div className="col gap-1" style={{ flex: 1 }}>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              Изменение капитала
            </span>
            <span
              className="mono"
              style={{
                fontSize: 18,
                color: positive ? "var(--success)" : "var(--danger)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {positive ? "+" : "−"}
              {formatMoney(Math.abs(netDelta), symbol)}
            </span>
          </div>
          <span className="t-small">
            Свободный остаток основного счёта + изменение сбережений за период.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ====== Deviation cell (facts vs plan) ====== */
function DeltaCell({
  label,
  kind,
  plan,
  actual,
  symbol,
}: {
  label: string;
  kind: "income" | "expense" | "savings" | "capital";
  plan: number;
  actual: number;
  symbol: string;
}) {
  const dev = actual - plan;
  const sign = dev === 0 ? "" : dev > 0 ? "+" : "−";
  const color = (() => {
    if (dev === 0) return "var(--fg-2)";
    if (kind === "expense") return dev <= 0 ? "var(--success)" : "var(--danger)";
    return dev >= 0 ? "var(--success)" : "var(--danger)";
  })();
  return (
    <div className="col gap-2">
      <span className="t-eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 18,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {sign}
        {formatMoney(Math.abs(dev), symbol)}
      </span>
      <span
        className="mono"
        style={{ fontSize: 11, color: "var(--fg-3)" }}
      >
        {formatMoney(plan, symbol)} → {formatMoney(actual, symbol)}
      </span>
    </div>
  );
}
