import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import * as analyticsApi from "../api/analytics";
import type {
  AnalyticsOverview,
  AnalyticsPlanVsActualBlock,
  AnalyticsPlanVsActualRow,
  AnalyticsScenarioPoint,
  AnalyticsSnapshotOption,
} from "../api/analytics";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { currencySymbol, formatMoney } from "../lib/format";

export function Analytics() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await analyticsApi.getOverview(accessToken);
        if (cancelled) return;
        setData(next);
        if (next.snapshot_options.length > 0) {
          setView(next.snapshot_options[0].snapshot_key);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof analyticsApi.AnalyticsApiError
            ? err.message
            : "Не удалось загрузить аналитику",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const sym = currencySymbol(data?.currency);
  const currentBlock =
    data && view ? data.plan_vs_actual[view] ?? null : null;

  return (
    <AppShell active="analytics" pageLabel="Аналитика">
      {loading ? (
        <CenteredMessage text="Загружаем аналитику…" />
      ) : error && !data ? (
        <CenteredMessage text={error} tone="danger" />
      ) : data && !data.has_any_snapshot ? (
        <EmptyState />
      ) : data ? (
        <>
          <Hero />
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
          <SnapshotTabs
            options={data.snapshot_options}
            view={view}
            setView={setView}
          />
          <div style={{ marginTop: 16 }}>
            {currentBlock ? (
              <PlanVsActual block={currentBlock} sym={sym} />
            ) : (
              <CenteredMessage text="Нет данных для этого периода" />
            )}
          </div>
          <PlanExecutedScenario scenario={data.scenario} sym={sym} />
        </>
      ) : null}
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

function EmptyState() {
  return (
    <div style={{ padding: "120px 0", display: "flex", justifyContent: "center" }}>
      <div
        className="card anim-fade-up"
        style={{
          padding: 32,
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span className="t-eyebrow">У вас пока нет снапшотов</span>
        <h2 className="t-h2" style={{ margin: 0 }}>
          Создайте первый снапшот
        </h2>
        <p className="t-body" style={{ margin: 0 }}>
          Аналитика появится, как только будет хотя бы один план или факт.
        </p>
      </div>
    </div>
  );
}

/* ====== Hero ====== */
function Hero() {
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
        <span className="t-eyebrow">Аналитика · 12 месяцев</span>
        <h1 className="t-h1" style={{ margin: 0 }}>
          Сравнение план / факт
        </h1>
        <span className="t-body">
          Закрытый снапшот рядом с текущим прогнозом и накопительный сценарий —
          если бы каждый месяц закрывался ровно по плану.
        </span>
      </div>
    </div>
  );
}

/* ====== Snapshot tabs ====== */
function StatePill({
  kind,
  label,
  dim,
}: {
  kind: "fact" | "pending";
  label: string;
  dim?: boolean;
}) {
  const isFact = kind === "fact";
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 20,
        padding: "0 7px",
        background: isFact ? "rgba(107,227,154,0.10)" : "rgba(255,232,10,0.10)",
        border: `1px solid ${
          isFact ? "rgba(107,227,154,0.30)" : "rgba(255,232,10,0.30)"
        }`,
        color: isFact ? "var(--success)" : "var(--accent)",
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 600,
        opacity: dim ? 0.7 : 1,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: isFact ? "var(--success)" : "var(--accent)",
          boxShadow: isFact ? "none" : "0 0 6px var(--accent-glow)",
        }}
      />
      {label}
    </span>
  );
}

function SnapshotTabs({
  options,
  view,
  setView,
}: {
  options: AnalyticsSnapshotOption[];
  view: string | null;
  setView: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((t) => t.snapshot_key === view) || options[0];
  if (!current) return null;
  const dotFor = (kind: "fact" | "pending") =>
    kind === "fact" ? "var(--success)" : "var(--accent)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 0 18px",
        borderTop: "1px solid var(--border-soft)",
        borderBottom: "1px solid var(--border-soft)",
        marginBottom: 20,
      }}
    >
      <div className="col gap-1">
        <span className="t-eyebrow">Снапшот периода</span>
        <span className="t-small" style={{ color: "var(--fg-1)" }}>
          Сравнивайте закрытый снапшот с текущим прогнозом
        </span>
      </div>

      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            minWidth: 280,
            height: 44,
            padding: "0 12px 0 14px",
            background: "var(--bg-2)",
            border: `1px solid ${open ? "var(--border-strong)" : "var(--border)"}`,
            borderRadius: 12,
            color: "var(--fg-0)",
            font: "inherit",
            fontSize: 14,
            cursor: "pointer",
            transition: "border-color 120ms ease, background 120ms ease",
            boxShadow: open ? "0 0 0 3px rgba(255,232,10,0.08)" : "none",
          }}
          onMouseEnter={(e) => {
            if (!open) e.currentTarget.style.borderColor = "var(--border-strong)";
          }}
          onMouseLeave={(e) => {
            if (!open) e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: dotFor(current.kind),
              boxShadow: `0 0 8px ${dotFor(current.kind)}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600 }}>{current.label}</span>
          <StatePill kind={current.kind} label={current.state_label} />
          <span style={{ flex: 1 }} />
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{
              transition: "transform 160ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              color: "var(--fg-2)",
            }}
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 320,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 6,
              boxShadow: "var(--shadow-pop)",
              zIndex: 10,
              animation: "fadeIn 140ms ease",
            }}
          >
            <div
              className="t-eyebrow"
              style={{ padding: "8px 10px 6px", fontSize: 10 }}
            >
              Выберите период
            </div>
            <div className="col" style={{ gap: 2 }}>
              {options.map((t) => {
                const active = view === t.snapshot_key;
                return (
                  <button
                    key={t.snapshot_key}
                    type="button"
                    onClick={() => {
                      setView(t.snapshot_key);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 10px",
                      border: 0,
                      borderRadius: 8,
                      background: active ? "var(--bg-2)" : "transparent",
                      color: "var(--fg-0)",
                      font: "inherit",
                      fontSize: 14,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--bg-1)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        e.currentTarget.style.background = active
                          ? "var(--bg-2)"
                          : "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: dotFor(t.kind),
                        boxShadow: active ? `0 0 8px ${dotFor(t.kind)}` : "none",
                        flexShrink: 0,
                      }}
                    />
                    <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: active ? 600 : 500 }}>
                        {t.label}
                      </span>
                      <span
                        className="mono t-small dim"
                        style={{ fontSize: 11 }}
                      >
                        {t.hint}
                      </span>
                    </div>
                    <StatePill kind={t.kind} label={t.state_label} dim={!active} />
                    {active && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        style={{ color: "var(--accent)" }}
                      >
                        <path
                          d="M3 7L6 10L11 4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== Sparkline (local copy of the Dashboard one) ====== */
function Sparkline({
  data,
  color,
  glow,
  accent,
  w = 72,
  h = 28,
}: {
  data: number[];
  color?: string;
  glow?: string | null;
  accent?: boolean;
  w?: number;
  h?: number;
}) {
  if (data.length < 2) {
    return <svg width={w} height={h} />;
  }
  const strokeColor = color ?? (accent ? "var(--accent)" : "var(--fg-1)");
  const strokeGlow = glow ?? (accent ? "rgba(255,232,10,0.45)" : null);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map(
    (v, i) =>
      [
        (i / (data.length - 1)) * w,
        h - ((v - min) / Math.max(0.0001, max - min)) * (h - 4) - 2,
      ] as const,
  );
  const d = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1))
    .join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <path
        d={d}
        stroke={strokeColor}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={strokeGlow ? { filter: `drop-shadow(0 0 4px ${strokeGlow})` } : undefined}
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="2.2"
        fill={strokeColor}
      />
    </svg>
  );
}

function Legend({
  color,
  label,
  dash,
}: {
  color: string;
  label: string;
  dash?: boolean;
}) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      {dash ? (
        <svg width="20" height="2">
          <line
            x1="0"
            y1="1"
            x2="20"
            y2="1"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </svg>
      ) : (
        <span
          style={{
            width: 14,
            height: 2,
            background: color,
            borderRadius: 2,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      )}
      <span className="t-small" style={{ color: "var(--fg-1)" }}>
        {label}
      </span>
    </div>
  );
}

/* ====== Plan vs Actual ====== */
function accentFor(row: { kind: string; plan: number; actual: number }): string {
  if (row.kind === "income") return row.actual >= row.plan ? "var(--success)" : "var(--fg-0)";
  if (row.kind === "expense") return row.actual > row.plan ? "var(--danger)" : "var(--fg-0)";
  return row.actual < row.plan ? "var(--danger)" : "var(--success)";
}

function glowFor(color: string): string | null {
  if (color === "var(--success)") return "rgba(107,227,154,0.35)";
  if (color === "var(--danger)") return "rgba(255,106,92,0.40)";
  return null;
}

function statusFor(row: {
  kind: string;
  plan: number;
  actual: number;
}): { label: string; color: string } {
  const dev = row.actual - row.plan;
  if (row.kind === "income") {
    if (dev > 0) return { label: "Выше плана", color: "var(--success)" };
    if (dev < 0) return { label: "Ниже плана", color: "var(--danger)" };
    return { label: "По плану", color: "neutral" };
  }
  if (row.kind === "expense") {
    if (dev > 0) return { label: "Перерасход", color: "var(--danger)" };
    if (dev < 0) return { label: "Экономия", color: "var(--success)" };
    return { label: "По плану", color: "neutral" };
  }
  if (dev > 0) return { label: "Выше плана", color: "var(--success)" };
  if (dev < 0) return { label: "Отстаёт от плана", color: "var(--danger)" };
  return { label: "По плану", color: "neutral" };
}

function StatusTag({ status }: { status: { label: string; color: string } }) {
  const isNeutral = status.color === "neutral";
  const bg =
    status.color === "var(--success)"
      ? "rgba(107,227,154,0.10)"
      : status.color === "var(--danger)"
        ? "rgba(255,106,92,0.10)"
        : "rgba(255,255,255,0.04)";
  const border =
    status.color === "var(--success)"
      ? "rgba(107,227,154,0.30)"
      : status.color === "var(--danger)"
        ? "rgba(255,106,92,0.30)"
        : "rgba(255,255,255,0.18)";
  const color = isNeutral ? "var(--fg-1)" : status.color;
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {status.label}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transition: "transform 160ms ease",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        color: "var(--fg-3)",
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
  );
}

function PlanVsActual({
  block,
  sym,
}: {
  block: AnalyticsPlanVsActualBlock;
  sym: string;
}) {
  const rows: AnalyticsPlanVsActualRow[] = [block.income, block.expense, block.capital];
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["Доходы", "Расходы", "Капитал"]),
  );
  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        alignItems: "stretch",
      }}
    >
      {rows.map((r) => {
        const dev = r.actual - r.plan;
        const accent = accentFor(r);
        const glow = glowFor(accent);
        const isAccented = accent !== "var(--fg-0)";
        const isOpen = expanded.has(r.name);
        const status = statusFor(r);
        const ratio = Math.min(1.4, r.actual / Math.max(r.plan, 1));
        const barColor = isAccented ? accent : "rgba(255,255,255,0.55)";
        const devSign = dev === 0 ? "" : dev > 0 ? "+" : "−";
        const subsSorted = [...r.subs].sort((a, b) => b.actual - a.actual);
        const blockMax = Math.max(
          1,
          ...r.subs.flatMap((s) => [s.plan, s.actual]),
        );
        const subsTotal = Math.max(
          1,
          r.subs.reduce((sum, s) => sum + s.actual, 0),
        );

        return (
          <div
            key={r.name}
            className="card"
            style={{
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              className="row between"
              style={{ alignItems: "flex-start", gap: 12 }}
            >
              <button
                type="button"
                onClick={() => toggle(r.name)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "block",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  className="row gap-2"
                  style={{ alignItems: "center", flexWrap: "wrap", rowGap: 6 }}
                >
                  <Chevron open={isOpen} />
                  <span
                    className="t-eyebrow"
                    style={{
                      color: accent,
                      textShadow: glow ? `0 0 14px ${glow}` : "none",
                    }}
                  >
                    {r.name}
                  </span>
                  <span className="mono dim" style={{ fontSize: 11 }}>
                    · {r.subs.length}
                  </span>
                  <StatusTag status={status} />
                </div>
              </button>
              <Sparkline
                data={r.spark}
                color={isAccented ? accent : "var(--fg-1)"}
                glow={glow}
              />
            </div>

            <div className="col gap-1">
              <div
                className="mono"
                style={{
                  fontSize: 30,
                  letterSpacing: "-0.025em",
                  color: accent,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  textShadow: glow ? `0 0 18px ${glow}` : "none",
                }}
              >
                {formatMoney(r.actual, sym)}
              </div>
              <div className="row gap-2" style={{ alignItems: "baseline" }}>
                <span className="mono dim" style={{ fontSize: 12 }}>
                  {formatMoney(r.plan, sym)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: accent,
                    opacity: isAccented ? 1 : 0.7,
                  }}
                >
                  · {devSign}
                  {formatMoney(Math.abs(dev), sym)}
                </span>
              </div>
              <span className="t-small dim" style={{ marginTop: 4 }}>
                {r.note}
              </span>
            </div>

            <div
              style={{
                position: "relative",
                height: 6,
                borderRadius: 999,
                background: "var(--bg-3)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${Math.min(100, (r.plan / Math.max(r.plan, r.actual, 1)) * 100)}%`,
                  background: "rgba(255,255,255,0.18)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${Math.min(100, ratio * 70)}%`,
                  background: barColor,
                  boxShadow: glow ? `0 0 12px ${glow}` : "none",
                  transition: "width 320ms ease",
                }}
              />
            </div>

            {isOpen && r.subs.length > 0 && (
              <div className="col gap-3" style={{ marginTop: 16 }}>
                {subsSorted.map((s) => {
                  const sDev = s.actual - s.plan;
                  const sAccent = accentFor({
                    kind: r.kind,
                    actual: s.actual,
                    plan: s.plan,
                  });
                  const sIsAccented = sAccent !== "var(--fg-0)";
                  const sSign = sDev === 0 ? "" : sDev > 0 ? "+" : "−";
                  const pct = Math.round((s.actual / subsTotal) * 100);
                  return (
                    <div
                      key={s.name}
                      className="row gap-3"
                      style={{ opacity: 0.78, alignItems: "flex-start" }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: "var(--fg-3)",
                          width: 32,
                          flexShrink: 0,
                          textAlign: "right",
                          paddingTop: 1,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {pct}%
                      </span>
                      <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="row between"
                          style={{ alignItems: "baseline" }}
                        >
                          <span style={{ fontSize: 12, color: "var(--fg-2)" }}>
                            {s.name}
                          </span>
                          <div
                            className="row gap-3"
                            style={{ alignItems: "baseline" }}
                          >
                            <span
                              className="mono"
                              style={{ fontSize: 11, color: "var(--fg-3)" }}
                            >
                              {formatMoney(s.plan, sym)}
                            </span>
                            <span
                              className="mono"
                              style={{
                                fontSize: 12,
                                fontVariantNumeric: "tabular-nums",
                                color: sAccent,
                              }}
                            >
                              {formatMoney(s.actual, sym)}
                            </span>
                            <span
                              className="mono"
                              style={{
                                fontSize: 11,
                                width: 80,
                                textAlign: "right",
                                color: sAccent,
                                opacity: sIsAccented ? 0.95 : 0.6,
                              }}
                            >
                              {sSign}
                              {formatMoney(Math.abs(sDev), sym)}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            position: "relative",
                            height: 2,
                            borderRadius: 999,
                            background: "var(--bg-3)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${Math.min(100, (s.plan / blockMax) * 100)}%`,
                              background: "rgba(255,255,255,0.08)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${Math.min(100, (s.actual / blockMax) * 100)}%`,
                              background: sIsAccented
                                ? sAccent
                                : "rgba(255,255,255,0.45)",
                              opacity: 0.7,
                              transition: "width 320ms ease",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ====== Plan-executed scenario ====== */
function PlanExecutedScenario({
  scenario,
  sym,
}: {
  scenario: AnalyticsOverview["scenario"];
  sym: string;
}) {
  const points: AnalyticsScenarioPoint[] = scenario.points;
  const months = points.map((p) => p.label);
  const plan = points.map((p) => p.plan / 1000);
  const actual = points.map((p) =>
    p.actual == null ? p.plan / 1000 : p.actual / 1000,
  );

  const planK = scenario.plan_total / 1000;
  const actualK = scenario.actual_total / 1000;
  const gapK = scenario.gap / 1000;
  const ahead = scenario.ahead;
  const gapColor = ahead ? "var(--success)" : "var(--danger)";
  const gapGlow = ahead ? "rgba(107,227,154,0.35)" : "rgba(255,106,92,0.40)";

  const fmtMoney = (k: number) => formatMoney(Math.round(k * 1000), sym);
  const fmtK = (k: number) => `${sym}${k.toFixed(1)}k`;

  const dev = actual.map((v, i) => +(v - plan[i]).toFixed(1));

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(720);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setW(Math.max(360, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 210;
  const PADX = 16;
  const PADTOP = 16;
  const PADBOT = 26;
  const zeroY = PADTOP + (H - PADTOP - PADBOT) / 2;
  const maxMag = Math.max(...dev.map((d) => Math.abs(d)), 0.5);
  const half = (H - PADTOP - PADBOT) / 2;
  const colW = months.length > 0 ? (W - PADX * 2) / months.length : W;
  const barW = Math.min(26, colW * 0.5);
  const barX = (i: number) => PADX + colW * i + colW / 2;
  const barH = (d: number) => (Math.abs(d) / maxMag) * (half - 6);

  const [hover, setHover] = useState<number | null>(null);

  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="row gap-2"
        style={{ alignItems: "center", padding: "0 0 14px" }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: 999, background: "var(--fg-3)" }}
        />
        <span className="t-eyebrow">Сценарий · план исполнен</span>
      </div>

      <div
        className="card"
        style={{
          padding: 0,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) 1fr",
          overflow: "hidden",
        }}
      >
        <div
          className="col"
          style={{
            padding: "28px 28px 26px",
            gap: 22,
            borderRight: "1px solid var(--border-soft)",
            background:
              "linear-gradient(160deg, rgba(255,255,255,0.018), transparent 60%)",
          }}
        >
          <div className="col gap-2">
            <span className="t-h3" style={{ color: "var(--fg-0)" }}>
              Если бы план был исполнен
            </span>
            <span
              className="t-small"
              style={{ color: "var(--fg-2)", maxWidth: 320 }}
            >
              Капитал, если бы каждый прошлый месяц закрывался ровно по плану — без
              перерасходов и без опережения.
            </span>
          </div>

          <div className="col gap-2">
            <span className="t-eyebrow" style={{ fontSize: 10 }}>
              Капитал по плану
            </span>
            <div className="row gap-2" style={{ alignItems: "baseline" }}>
              <span
                className="mono"
                style={{
                  fontSize: 46,
                  letterSpacing: "-0.035em",
                  lineHeight: 1,
                  color: "var(--fg-0)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtMoney(planK)}
              </span>
            </div>
          </div>

          <div className="hr" />

          <div className="col gap-3">
            <div className="row between" style={{ alignItems: "baseline" }}>
              <span className="t-small" style={{ color: "var(--fg-2)" }}>
                Фактический капитал
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 16,
                  color: "var(--accent)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtMoney(actualK)}
              </span>
            </div>
            <div className="row between" style={{ alignItems: "baseline" }}>
              <span className="t-small" style={{ color: "var(--fg-2)" }}>
                {ahead ? "Опережение плана" : "Отставание от плана"}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: gapColor,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 14px ${gapGlow}`,
                }}
              >
                {ahead ? "+" : "−"}
                {fmtMoney(Math.abs(gapK))}
              </span>
            </div>
          </div>

          <span
            className="t-small dim"
            style={{ fontSize: 12, lineHeight: 1.5 }}
          >
            {scenario.cross_month_label
              ? `Реальные снапшоты опережают плановый сценарий с ${scenario.cross_month_label}.`
              : ahead
                ? "Реальные снапшоты опережают плановый сценарий."
                : "Реальные снапшоты пока отстают от планового сценария."}
          </span>
        </div>

        <div className="col" style={{ padding: "22px 24px 18px", gap: 14 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div className="col gap-1">
              <span className="t-eyebrow" style={{ fontSize: 10 }}>
                Отклонение капитала от плана
              </span>
              <span className="t-small dim" style={{ fontSize: 12 }}>
                факт минус план, по месяцам
              </span>
            </div>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <Legend color="var(--success)" label="выше плана" />
              <Legend color="var(--danger)" label="ниже плана" />
            </div>
          </div>

          <div ref={wrapRef} style={{ width: "100%" }}>
            <svg
              width={W}
              height={H}
              style={{ display: "block" }}
              onMouseLeave={() => setHover(null)}
            >
              <line
                x1={PADX}
                y1={zeroY}
                x2={W - PADX}
                y2={zeroY}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
              />
              {dev.map((d, i) => {
                const up = d >= 0;
                const h = barH(d);
                const x = barX(i) - barW / 2;
                const yPos = up ? zeroY - h : zeroY;
                const isHover = hover === i;
                const col = up ? "var(--success)" : "var(--danger)";
                return (
                  <Fragment key={i}>
                    <rect
                      x={x}
                      y={yPos}
                      width={barW}
                      height={Math.max(2, h)}
                      rx="3"
                      fill={col}
                      opacity={hover == null ? 0.85 : isHover ? 1 : 0.32}
                      style={
                        isHover
                          ? {
                              filter: `drop-shadow(0 0 7px ${
                                up
                                  ? "rgba(107,227,154,0.55)"
                                  : "rgba(255,106,92,0.55)"
                              })`,
                            }
                          : undefined
                      }
                    />
                    <rect
                      x={barX(i) - colW / 2}
                      y={PADTOP}
                      width={colW}
                      height={H - PADTOP - PADBOT}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHover(i)}
                    />
                    <text
                      x={barX(i)}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="Geist Mono"
                      fill={isHover ? "var(--fg-0)" : "#55555E"}
                    >
                      {months[i]}
                    </text>
                  </Fragment>
                );
              })}
              {hover != null &&
                (() => {
                  const d = dev[hover];
                  const up = d >= 0;
                  const h = barH(d);
                  const fy = up ? zeroY - h - 8 : zeroY + h + 16;
                  return (
                    <text
                      x={barX(hover)}
                      y={fy}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="Geist Mono"
                      fill={up ? "#6BE39A" : "#FF6A5C"}
                      fontWeight="600"
                    >
                      {(d > 0 ? "+" : d < 0 ? "−" : "") +
                        fmtK(Math.abs(d)).slice(1)}
                    </text>
                  );
                })()}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

