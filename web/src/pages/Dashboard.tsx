import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import * as dashboardApi from "../api/dashboard";
import type {
  AccountSummary,
  CapitalChartPoint,
  DashboardOverview,
  ExpectedBlock as ExpectedBlockData,
  RecentSnapshot,
  SnapshotStatus,
} from "../api/dashboard";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { currencySymbol, formatMoney } from "../lib/format";

function greetingFor(hours: number): string {
  if (hours < 6) return "Доброй ночи";
  if (hours < 12) return "Доброе утро";
  if (hours < 18) return "Добрый день";
  return "Добрый вечер";
}

function directionColor(now: number, expected: number): string {
  if (expected > now) return "var(--success)";
  if (expected < now) return "var(--danger)";
  return "var(--fg-0)";
}

function directionGlow(now: number, expected: number): string | null {
  if (expected > now) return "rgba(107,227,154,0.35)";
  if (expected < now) return "rgba(255,106,92,0.35)";
  return null;
}

export function Dashboard() {
  const { accessToken, user } = useAuth();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await dashboardApi.getOverview(accessToken);
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof dashboardApi.DashboardApiError
              ? err.message
              : "Не удалось загрузить обзор",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const username = user?.username ?? "";
  const sym = currencySymbol(data?.currency);

  return (
    <AppShell active="overview" pageLabel="Обзор">
      {loading ? (
        <CenteredMessage text="Загружаем обзор…" />
      ) : error ? (
        <CenteredMessage text={error} tone="danger" />
      ) : data && !data.has_any_snapshot ? (
        <EmptyState />
      ) : data ? (
        <>
          <Hero username={username} monthLabel={data.current_month_label} />
          <div style={{ marginTop: 8 }}>
            <CapitalChart
              points={data.capital_chart}
              currentKey={data.current_snapshot_key}
              sym={sym}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <OverviewCapital
              capital={data.capital}
              hasPlan={data.has_current_plan}
              sym={sym}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 16,
            }}
          >
            <ExpectedBlockCard data={data.expected_income} tone="income" sym={sym} />
            <ExpectedBlockCard data={data.expected_expense} tone="expense" sym={sym} />
          </div>
          <div style={{ marginTop: 16 }}>
            <RecentSnapshotsBlock items={data.recent_snapshots} sym={sym} />
          </div>
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
          Добавьте плановый снапшот, чтобы увидеть капитал, прогноз и сравнение план / факт.
        </p>
        <button type="button" className="btn btn--primary" style={{ marginTop: 6 }}>
          Создать снапшот
        </button>
      </div>
    </div>
  );
}

/* ====== Hero ====== */
function Hero({ username, monthLabel }: { username: string; monthLabel: string }) {
  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
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
        <span className="t-eyebrow">{monthLabel} · идёт</span>
        <h1 className="t-h1" style={{ margin: 0 }}>
          {greeting}
          {username ? `, ${username}` : ""}
        </h1>
        <span className="t-body">
          Капитал и план текущего периода. Закрытые снапшоты — слева, прогноз — справа.
        </span>
      </div>
    </div>
  );
}

/* ====== Sparkline ====== */
function Sparkline({
  data,
  color,
  glow,
  w = 72,
  h = 28,
}: {
  data: number[];
  color: string;
  glow?: string | null;
  w?: number;
  h?: number;
}) {
  if (data.length < 2) {
    return <svg width={w} height={h} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / Math.max(0.0001, max - min)) * (h - 4) - 2,
  ] as const);
  const d = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1))
    .join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <path
        d={d}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={glow ? { filter: `drop-shadow(0 0 4px ${glow})` } : undefined}
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

/* ====== Capital chart ======
 * Принцип слайдера (обе границы определены данными):
 *   Ось графика строится бэком: 12 прошлых (с фактом до текущего) +
 *   (last_planned_offset + 6) будущих (только план). nowIdx — последний
 *   месяц с фактом (текущий), lastIdx — последняя будущая точка, она
 *   же «последний плановый снапшот + 6 месяцев».
 *
 *   Левый край окна жёстко зафиксирован на (nowIdx − 3) — «3 месяца +
 *   первый план». Правый край при slider=max упирается строго в lastIdx
 *   — «6 месяцев + последний плановый снапшот». Слайдер двигает только
 *   правый край: span (0..100) превращается в fwd через две линейные
 *   интерполяции с изломом в 50:
 *     fwd: span≤50 → 1..mid,  span>50 → mid..fwdMax
 *   где fwdMax = lastIdx − nowIdx, mid = min(6, fwdMax).
 *   Прошлое и будущее различаются не слайдером, а признаком actual === null.
 */
function CapitalChart({
  points,
  currentKey,
  sym,
}: {
  points: CapitalChartPoint[];
  currentKey: string;
  sym: string;
}) {
  const explicitNowIdx = points.findIndex((p) => p.month_key === currentKey);
  const fallbackNowIdx = (() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].actual != null) return i;
    }
    return Math.max(0, points.length - 1);
  })();
  const nowIdx = explicitNowIdx >= 0 ? explicitNowIdx : fallbackNowIdx;
  const lastIdx = Math.max(0, points.length - 1);

  const [span, setSpan] = useState(50);
  const back = 3;
  const fwdMax = Math.max(1, lastIdx - nowIdx);
  const fwdMid = Math.min(6, fwdMax);
  const fwd = span <= 50
    ? Math.round(1 + (span / 50) * (fwdMid - 1))
    : Math.round(fwdMid + ((span - 50) / 50) * (fwdMax - fwdMid));

  const startIdx = Math.max(0, nowIdx - back);
  const endIdx = Math.min(lastIdx, nowIdx + fwd);
  const sliced = points.slice(startIdx, endIdx + 1);
  const nowLocal = nowIdx - startIdx;

  const months = sliced.map((p) => p.label);
  const years = sliced.map((p) => p.year);
  const plan = sliced.map((p) => p.plan / 1000);
  const actual = sliced.map((p) => (p.actual == null ? null : p.actual / 1000));
  const hasActual = actual.some((v) => v != null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(900);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const w = Math.max(420, Math.round(entry.contentRect.width));
      setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 320;
  const PADX = 44;
  const PADY = 28;
  const nonNullActual = actual.filter((v): v is number => v != null);
  const allValues = nonNullActual.length ? [...plan, ...nonNullActual] : plan;
  const dataMin = allValues.length ? Math.min(...allValues) : 0;
  const dataMax = allValues.length ? Math.max(...allValues) : 1;
  const pad = Math.max(1, (dataMax - dataMin) * 0.18);
  const min = Math.floor((dataMin - pad) / 2) * 2;
  const max = Math.ceil((dataMax + pad) / 2) * 2;

  const x = (i: number) =>
    PADX + (i / Math.max(1, months.length - 1)) * (W - PADX * 2);
  const y = (v: number) =>
    PADY + (1 - (v - min) / Math.max(0.0001, max - min)) * (H - PADY * 2);

  const linePath = (arr: (number | null)[]) => {
    let d = "";
    let started = false;
    arr.forEach((v, i) => {
      if (v == null) return;
      d += (started ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1) + " ";
      started = true;
    });
    return d.trim();
  };
  let lastActualI = -1;
  actual.forEach((v, i) => {
    if (v != null) lastActualI = i;
  });
  const areaPath = lastActualI >= 0
    ? linePath(actual) +
      ` L${x(lastActualI).toFixed(1)},${H - PADY} L${x(0).toFixed(1)},${H - PADY} Z`
    : "";

  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    setHover(null);
  }, [span]);

  const active = hover;
  const fmtK = (v: number) => `${sym}${v.toFixed(1)}k`;
  const fmtSigned = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1) + "k";

  const isFuture = active != null && active > nowLocal;
  const TT_W = 178;
  const TT_H = 60;
  const anchorY = (() => {
    if (active == null) return PADY;
    const planY = y(plan[active]);
    const actualV = actual[active];
    return actualV == null ? planY : Math.min(planY, y(actualV));
  })();
  const ax = active != null ? x(active) : 0;
  const flipLeft = ax + 12 + TT_W > W - PADX;
  const ttX = flipLeft ? ax - 12 - TT_W : ax + 12;
  const ttY = Math.min(Math.max(anchorY - TT_H - 10, PADY - 4), H - PADY - TT_H - 4);

  const activeActual = active != null ? actual[active] : null;
  const activePlan = active != null ? plan[active] : 0;
  const delta = activeActual != null ? activeActual - activePlan : 0;
  const deltaColor = delta >= 0 ? "#6BE39A" : "#FF6A5C";

  const futureX0 = nowLocal < months.length - 1 ? x(nowLocal) : null;
  const rangeLabel = months.length
    ? `${months[0]} ${years[0]} — ${months[months.length - 1]} ${years[years.length - 1]}`
    : "";

  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div className="col gap-1">
          <span className="t-eyebrow">Капитал · план vs факт</span>
          <span className="t-h3" style={{ marginTop: 4 }}>{rangeLabel}</span>
        </div>
        <div className="row gap-4" style={{ alignItems: "center" }}>
          <Legend color="rgba(255,255,255,0.32)" dash label="План" />
          <Legend color="var(--accent)" label="Факт" />
        </div>
      </div>
      <div ref={wrapRef} style={{ width: "100%" }}>
        <svg width={W} height={H} style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="actualArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFE80A" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#FFE80A" stopOpacity="0" />
            </linearGradient>
          </defs>
          {futureX0 != null && (
            <rect
              x={futureX0}
              y={PADY - 4}
              width={W - PADX - futureX0}
              height={H - PADY * 2 + 8}
              fill="rgba(255,255,255,0.018)"
            />
          )}
          {[0, 1, 2, 3, 4].map((i) => {
            const yy = PADY + (i / 4) * (H - PADY * 2);
            const v = (max - (i / 4) * (max - min)).toFixed(0);
            return (
              <g key={i}>
                <line
                  x1={PADX}
                  y1={yy}
                  x2={W - PADX}
                  y2={yy}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="2 4"
                />
                {i < 4 && (
                  <text
                    x={PADX - 8}
                    y={yy + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="Geist Mono"
                    fill="#55555E"
                  >
                    {sym}
                    {v}k
                  </text>
                )}
              </g>
            );
          })}
          {futureX0 != null && (
            <g>
              <line
                x1={futureX0}
                x2={futureX0}
                y1={PADY - 4}
                y2={H - PADY + 2}
                stroke="rgba(255,232,10,0.35)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={futureX0}
                y={PADY - 10}
                textAnchor="middle"
                fontSize="9.5"
                fontFamily="Geist Mono"
                fill="#8A8A93"
                letterSpacing="0.08em"
              >
                СЕЙЧАС
              </text>
            </g>
          )}
          {months.map((_, i) => {
            if (i === 0 || years[i] === years[i - 1]) return null;
            const xx = x(i);
            return (
              <line
                key={"yd-" + i}
                x1={xx}
                x2={xx}
                y1={PADY}
                y2={H - PADY + 4}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            );
          })}
          {months.map((m, i) => {
            const showYear = i === 0 || years[i] !== years[i - 1];
            return (
              <g key={m + i}>
                <text
                  x={x(i)}
                  y={H - 20}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="Geist Mono"
                  fill={i === active ? "#FFE80A" : i > nowLocal ? "#46464E" : "#55555E"}
                >
                  {m}
                </text>
                {showYear && (
                  <text
                    x={x(i)}
                    y={H - 5}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="Geist Mono"
                    fill={i > nowLocal ? "#54545C" : "#6E6E78"}
                    letterSpacing="0.05em"
                    style={{ fontWeight: 600 }}
                  >
                    {years[i]}
                  </text>
                )}
              </g>
            );
          })}
          {areaPath && <path d={areaPath} fill="url(#actualArea)" />}
          <path
            d={linePath(plan)}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="4 4"
          />
          {hasActual && (
            <path
              d={linePath(actual)}
              stroke="#FFE80A"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 6px rgba(255,232,10,0.5))" }}
            />
          )}
          {active != null && (
            <line
              x1={ax}
              x2={ax}
              y1={PADY}
              y2={H - PADY}
              stroke="rgba(255,232,10,0.25)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          )}
          {plan.map((v, i) => {
            if (i <= nowLocal) return null;
            const isActive = i === active;
            return (
              <circle
                key={"p-" + i}
                cx={x(i)}
                cy={y(v)}
                r={isActive ? 4 : 2.2}
                fill="#16161B"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1.4}
              />
            );
          })}
          {actual.map((v, i) => {
            if (v == null) return null;
            const isActive = i === active;
            const isNow = i === nowLocal;
            const emphasized = isActive || (active == null && isNow);
            return (
              <circle
                key={"a-" + i}
                cx={x(i)}
                cy={y(v)}
                r={emphasized ? 4.5 : 2.5}
                fill={emphasized ? "#FFE80A" : "#0A0A0B"}
                stroke={emphasized ? "#0A0A0B" : "#FFE80A"}
                strokeWidth={emphasized ? 2 : 1.5}
                style={
                  emphasized
                    ? { filter: "drop-shadow(0 0 6px rgba(255,232,10,0.6))" }
                    : undefined
                }
              />
            );
          })}
          {months.map((_, i) => {
            const colW = (W - PADX * 2) / Math.max(1, months.length - 1);
            return (
              <rect
                key={"hit-" + i}
                x={x(i) - colW / 2}
                y={PADY - 4}
                width={colW}
                height={H - PADY * 2 + 8}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
              />
            );
          })}
          {active != null && (
            <g transform={`translate(${ttX}, ${ttY})`} style={{ pointerEvents: "none" }}>
              <rect
                width={TT_W}
                height={TT_H}
                rx="7"
                fill="#16161B"
                stroke="rgba(255,255,255,0.14)"
                style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.5))" }}
              />
              <text x="12" y="18" fontSize="11" fontFamily="Geist Mono" fill="#8A8A93">
                {months[active]} {years[active]}
              </text>
              {isFuture ? (
                <text
                  x={TT_W - 12}
                  y="18"
                  textAnchor="end"
                  fontSize="11"
                  fontFamily="Geist Mono"
                  fill="#8A8A93"
                >
                  прогноз
                </text>
              ) : activeActual != null ? (
                <text
                  x={TT_W - 12}
                  y="18"
                  textAnchor="end"
                  fontSize="11"
                  fontFamily="Geist Mono"
                  fill={deltaColor}
                >
                  {fmtSigned(delta)}
                </text>
              ) : null}
              <text x="12" y="36" fontSize="11" fontFamily="Geist Mono" fill="#8A8A93">
                план
              </text>
              <text
                x={TT_W - 12}
                y="36"
                textAnchor="end"
                fontSize="13"
                fontFamily="Geist Mono"
                fill="rgba(255,255,255,0.75)"
              >
                {fmtK(activePlan)}
              </text>
              <text x="12" y="52" fontSize="11" fontFamily="Geist Mono" fill="#8A8A93">
                факт
              </text>
              <text
                x={TT_W - 12}
                y="52"
                textAnchor="end"
                fontSize="13"
                fontFamily="Geist Mono"
                fill={activeActual != null ? "#FFE80A" : "#55555E"}
              >
                {activeActual != null ? fmtK(activeActual) : "—"}
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="col gap-2" style={{ marginTop: 18 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={span}
          onChange={(e) => setSpan(+e.target.value)}
          className="cap-slider"
          aria-label="Диапазон периода"
        />
        <div className="row between" style={{ alignItems: "center" }}>
          <span
            className="t-small dim"
            style={{ fontFamily: "Geist Mono, monospace", fontSize: 11 }}
          >
            −{back} мес
          </span>
          <span
            className="t-small"
            style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: "var(--fg-2)" }}
          >
            {months.length} месяцев в окне
          </span>
          <span
            className="t-small dim"
            style={{ fontFamily: "Geist Mono, monospace", fontSize: 11 }}
          >
            прогноз +{fwd} мес
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      {dash ? (
        <svg width="20" height="2">
          <line x1="0" y1="1" x2="20" y2="1" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
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

/* ====== Overview · Capital ====== */
function NowExpectedPair({
  now,
  expected,
  sym,
  accent,
}: {
  now: number;
  expected: number;
  sym: string;
  accent?: boolean;
}) {
  const dirColor = directionColor(now, expected);
  const dirGlow = directionGlow(now, expected);
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
      <div className="col gap-2" style={{ minWidth: 0 }}>
        <span className="mono t-eyebrow" style={{ fontSize: 10, color: "var(--fg-2)" }}>
          сейчас
        </span>
        <div
          className="mono"
          style={{
            fontSize: accent ? 38 : 22,
            letterSpacing: "-0.02em",
            color: "var(--fg-0)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {formatMoney(now, sym)}
        </div>
      </div>
      <svg
        width="22"
        height="14"
        viewBox="0 0 22 14"
        fill="none"
        style={{ marginBottom: accent ? 8 : 4, flexShrink: 0 }}
      >
        <path
          d="M2 7H20M14 2L20 7L14 12"
          stroke={dirColor}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="col gap-2" style={{ minWidth: 0 }}>
        <span className="mono t-eyebrow" style={{ fontSize: 10, color: dirColor }}>
          ожидается
        </span>
        <div
          className="mono"
          style={{
            fontSize: accent ? 38 : 22,
            letterSpacing: "-0.02em",
            color: dirColor,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            textShadow: accent && dirGlow ? `0 0 24px ${dirGlow}` : "none",
            whiteSpace: "nowrap",
          }}
        >
          ≈ {formatMoney(expected, sym)}
        </div>
      </div>
    </div>
  );
}

function PrimaryCapitalCard({
  netCapital,
  mainAccount,
  hasPlan,
  sym,
}: {
  netCapital: { now: number; expected: number };
  mainAccount: AccountSummary;
  hasPlan: boolean;
  sym: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div className="col gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: directionColor(netCapital.now, netCapital.expected),
            }}
          />
          <span
            className="t-eyebrow"
            style={{ color: directionColor(netCapital.now, netCapital.expected) }}
          >
            Капитал
          </span>
        </div>
        <NowExpectedPair now={netCapital.now} expected={netCapital.expected} sym={sym} accent />
        <span className="t-small dim">
          {hasPlan ? "прогноз к закрытию текущего снапшота" : "плана на текущий период пока нет"}
        </span>
      </div>

      <div className="hr" />

      <div className="col gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: directionColor(mainAccount.now, mainAccount.expected),
            }}
          />
          <span
            className="t-eyebrow"
            style={{ color: directionColor(mainAccount.now, mainAccount.expected) }}
          >
            {mainAccount.name}
          </span>
        </div>
        <NowExpectedPair now={mainAccount.now} expected={mainAccount.expected} sym={sym} />
      </div>
    </div>
  );
}

function SavingsCard({ accounts, sym }: { accounts: AccountSummary[]; sym: string }) {
  const totalNow = accounts.reduce((s, a) => s + a.now, 0);
  const totalExpected = accounts.reduce((s, a) => s + a.expected, 0);
  if (accounts.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--fg-3)" }} />
          <span className="t-eyebrow" style={{ color: "var(--fg-2)" }}>
            Сбережения
          </span>
        </div>
        <span className="t-small dim">
          Накопительных счетов пока нет — добавьте их в категориях.
        </span>
      </div>
    );
  }
  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div className="row between" style={{ alignItems: "center" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: directionColor(totalNow, totalExpected),
            }}
          />
          <span
            className="t-eyebrow"
            style={{ color: directionColor(totalNow, totalExpected) }}
          >
            Сбережения
          </span>
          <span className="mono dim" style={{ fontSize: 11 }}>
            · {accounts.length} {accountsWord(accounts.length)}
          </span>
        </div>
      </div>

      <div className="col">
        {accounts.map((a, i) => {
          const rowColor = directionColor(a.now, a.expected);
          return (
            <div key={a.name + i}>
              <div className="col gap-2" style={{ padding: "10px 0" }}>
                <span style={{ fontSize: 13, color: "var(--fg-1)" }}>{a.name}</span>
                <div className="row between" style={{ alignItems: "baseline", gap: 12 }}>
                  <div className="col" style={{ gap: 2 }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: "var(--fg-3)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      сейчас
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 15,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--fg-0)",
                      }}
                    >
                      {formatMoney(a.now, sym)}
                    </span>
                  </div>
                  <svg
                    width="18"
                    height="10"
                    viewBox="0 0 22 14"
                    fill="none"
                    style={{ alignSelf: "center", flexShrink: 0 }}
                  >
                    <path
                      d="M2 7H20M14 2L20 7L14 12"
                      stroke={rowColor}
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: rowColor,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      ожидается
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 15,
                        fontVariantNumeric: "tabular-nums",
                        color: rowColor,
                      }}
                    >
                      ≈ {formatMoney(a.expected, sym)}
                    </span>
                  </div>
                </div>
              </div>
              {i < accounts.length - 1 && <div className="hr" style={{ opacity: 0.5 }} />}
            </div>
          );
        })}
      </div>

      <div className="hr" />

      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="t-eyebrow" style={{ color: "var(--fg-1)" }}>
          Итого
        </span>
        <div className="row gap-3" style={{ alignItems: "baseline" }}>
          <span
            className="mono"
            style={{
              fontSize: 15,
              fontVariantNumeric: "tabular-nums",
              color: "var(--fg-0)",
            }}
          >
            {formatMoney(totalNow, sym)}
          </span>
          <svg width="14" height="10" viewBox="0 0 22 14" fill="none" style={{ flexShrink: 0 }}>
            <path
              d="M2 7H20M14 2L20 7L14 12"
              stroke={directionColor(totalNow, totalExpected)}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="mono"
            style={{
              fontSize: 18,
              fontVariantNumeric: "tabular-nums",
              color: directionColor(totalNow, totalExpected),
            }}
          >
            ≈ {formatMoney(totalExpected, sym)}
          </span>
        </div>
      </div>
    </div>
  );
}

function accountsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "счёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "счёта";
  return "счетов";
}

function OverviewCapital({
  capital,
  hasPlan,
  sym,
}: {
  capital: DashboardOverview["capital"];
  hasPlan: boolean;
  sym: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 16,
        marginTop: 8,
      }}
    >
      <PrimaryCapitalCard
        netCapital={capital.net_capital}
        mainAccount={capital.main_account}
        hasPlan={hasPlan}
        sym={sym}
      />
      <SavingsCard accounts={capital.savings_accounts} sym={sym} />
    </div>
  );
}

/* ====== Expected income / expense ====== */
function ExpectedBlockCard({
  data,
  tone,
  sym,
}: {
  data: ExpectedBlockData;
  tone: "income" | "expense";
  sym: string;
}) {
  const toneColor = tone === "income" ? "var(--success)" : "var(--danger)";
  const toneGlow =
    tone === "income" ? "rgba(107,227,154,0.35)" : "rgba(255,106,92,0.35)";
  const label = tone === "income" ? "Ожидаемые доходы" : "Ожидаемые расходы";
  const isEmpty = data.total === 0 && data.subs.length === 0;
  const sortedSubs = [...data.subs].sort((a, b) => b.value - a.value);
  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div className="row between">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: toneColor,
              boxShadow: `0 0 8px ${toneGlow}`,
            }}
          />
          <span className="t-eyebrow" style={{ color: toneColor }}>
            {label}
          </span>
        </div>
        {!isEmpty && (
          <Sparkline
            data={sortedSubs.map((s) => s.value)}
            color={toneColor}
            glow={toneGlow}
          />
        )}
      </div>
      <div className="col gap-2">
        <div
          className="mono"
          style={{
            fontSize: 36,
            letterSpacing: "-0.025em",
            color: isEmpty ? "var(--fg-2)" : toneColor,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            textShadow: isEmpty ? "none" : `0 0 20px ${toneGlow}`,
          }}
        >
          {isEmpty ? "—" : `≈ ${formatMoney(data.total, sym)}`}
        </div>
        <span className="t-small dim">
          {isEmpty ? "плана на текущий период нет" : "ожидается к следующему снапшоту"}
        </span>
      </div>

      {!isEmpty && (
        <>
          <div className="hr" />
          <div className="col">
            <span className="t-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>
              По категориям
            </span>
            {sortedSubs.map((s, i) => {
              const share = data.total === 0 ? 0 : (s.value / data.total) * 100;
              return (
                <div key={s.name + i} className="col gap-1" style={{ padding: "10px 0" }}>
                  <div className="row between" style={{ alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, color: "var(--fg-1)" }}>{s.name}</span>
                    <div className="row gap-3" style={{ alignItems: "baseline" }}>
                      <span
                        className="mono dim"
                        style={{ fontSize: 11, width: 36, textAlign: "right" }}
                      >
                        {share.toFixed(0)}%
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--fg-1)",
                        }}
                      >
                        {formatMoney(s.value, sym)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: 3,
                      borderRadius: 999,
                      background: "var(--bg-3)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `${share}%`,
                        background: "rgba(255,255,255,0.45)",
                        opacity: 0.9,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ====== Recent Snapshots — SnapshotRow design ====== */
const ROW_STATUS_STYLES: Record<
  SnapshotStatus,
  { label: string; color: string; bg: string; border: string; dashed?: boolean; glow?: string }
> = {
  closed: {
    label: "Пройден",
    color: "var(--success)",
    bg: "rgba(107,227,154,0.10)",
    border: "rgba(107,227,154,0.30)",
    glow: "rgba(107,227,154,0.35)",
  },
  current: {
    label: "Запланирован",
    color: "var(--accent)",
    bg: "rgba(255,232,10,0.10)",
    border: "rgba(255,232,10,0.30)",
    glow: "rgba(255,232,10,0.40)",
  },
  planned: {
    label: "Запланирован",
    color: "var(--accent)",
    bg: "rgba(255,232,10,0.10)",
    border: "rgba(255,232,10,0.30)",
    glow: "rgba(255,232,10,0.40)",
  },
  unplanned: {
    label: "Не запланирован",
    color: "var(--fg-2)",
    bg: "transparent",
    border: "var(--fg-4)",
    dashed: true,
  },
};

function RowStatusBadge({ kind }: { kind: SnapshotStatus }) {
  const s = ROW_STATUS_STYLES[kind];
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
          background: kind === "unplanned" ? "transparent" : s.color,
          border: kind === "unplanned" ? `1px dashed ${s.color}` : "none",
          boxShadow: s.glow ? `0 0 6px ${s.glow}` : "none",
        }}
      />
      {s.label}
    </span>
  );
}

function MetricTriad({
  label,
  kind,
  plan,
  actual,
  hasActual,
  sym,
}: {
  label: string;
  kind: "income" | "expense" | "capital";
  plan: number;
  actual: number | null;
  hasActual: boolean;
  sym: string;
}) {
  const safeActual = actual ?? 0;
  const dev = safeActual - (plan || 0);
  const colorFor = () => {
    if (!hasActual || plan === 0) return "var(--fg-1)";
    if (kind === "income") return dev >= 0 ? "var(--success)" : "var(--danger)";
    if (kind === "expense") return dev <= 0 ? "var(--success)" : "var(--danger)";
    return dev >= 0 ? "var(--success)" : "var(--danger)";
  };
  const accent = colorFor();
  const sign = dev === 0 ? "" : dev > 0 ? "+" : "−";
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
        {hasActual && actual != null ? (
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
              {formatMoney(actual, sym)}
            </span>
            <div className="row gap-2" style={{ alignItems: "baseline" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                план {formatMoney(plan, sym)}
              </span>
              <span
                className="mono"
                style={{ fontSize: 11, color: accent, fontWeight: 500 }}
              >
                {sign}
                {formatMoney(Math.abs(dev), sym)}
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
              {plan > 0 ? `≈ ${formatMoney(plan, sym)}` : "—"}
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

function SnapshotRow({ snap, sym }: { snap: RecentSnapshot; sym: string }) {
  const isPassed = snap.status === "closed";
  const isUnplanned = snap.status === "unplanned";

  return (
    <div
      className="card"
      style={{
        padding: "18px 20px",
        display: "flex",
        alignItems: "stretch",
        gap: 20,
        borderStyle: isUnplanned ? "dashed" : "solid",
        borderColor: isUnplanned ? "var(--border-soft)" : "var(--border)",
        background: isUnplanned ? "transparent" : undefined,
        opacity: isUnplanned ? 0.85 : 1,
        transition: "border-color 140ms ease, background 140ms ease",
      }}
    >
      <div
        className="col gap-2"
        style={{ minWidth: 152, flexShrink: 0, justifyContent: "center" }}
      >
        <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: isPassed ? "var(--fg-0)" : "var(--fg-1)",
              letterSpacing: "-0.01em",
            }}
          >
            {snap.month_name}
          </span>
        </div>
        <RowStatusBadge kind={snap.status} />
      </div>

      <div style={{ width: 1, background: "var(--border-soft)", flexShrink: 0 }} />

      <div
        className="row"
        style={{ flex: 1, alignItems: "stretch", gap: 24, minWidth: 0 }}
      >
        {isUnplanned ? (
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
            План на этот месяц не заполнен.
          </div>
        ) : (
          <>
            <MetricTriad
              label="Доходы"
              kind="income"
              plan={snap.planned_income}
              actual={snap.actual_income}
              hasActual={snap.has_actual}
              sym={sym}
            />
            <MetricTriad
              label="Расходы"
              kind="expense"
              plan={snap.planned_expense}
              actual={snap.actual_expense}
              hasActual={snap.has_actual}
              sym={sym}
            />
            <MetricTriad
              label="Капитал"
              kind="capital"
              plan={snap.planned_capital}
              actual={snap.actual_capital}
              hasActual={snap.has_actual}
              sym={sym}
            />
          </>
        )}
      </div>
    </div>
  );
}

function RecentSnapshotsBlock({ items, sym }: { items: RecentSnapshot[]; sym: string }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div className="col gap-1">
          <span className="t-eyebrow">Последние снапшоты</span>
          <span className="t-small dim">от закрытых к будущим</span>
        </div>
      </div>
      <div className="col gap-2">
        {items.map((s) => (
          <SnapshotRow key={s.snapshot_key} snap={s} sym={sym} />
        ))}
      </div>
    </div>
  );
}

