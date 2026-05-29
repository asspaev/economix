import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Logo } from "./Logo";

type NavId = "overview" | "snapshots" | "categories" | "analytics";

type NavItem = {
  id: NavId;
  label: string;
  to: string | null;
  icon: () => ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Обзор", to: "/dashboard", icon: HomeIcon },
  { id: "snapshots", label: "Снапшоты", to: "/snapshots", icon: SnapshotIcon },
  { id: "categories", label: "Категории", to: "/categories", icon: CategoriesIcon },
  { id: "analytics", label: "Аналитика", to: "/analytics", icon: AnalyticsIcon },
];

const RU_MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const RU_MONTHS_NOM = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function dayWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
  return "дней";
}

export function AppShell({
  active,
  pageLabel,
  children,
}: {
  active: NavId;
  pageLabel: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const username = user?.username ?? "";
  return (
    <div style={{ position: "relative", height: "100vh", display: "flex", overflow: "hidden" }}>
      <div className="bg-mesh" />
      <Sidebar active={active} username={username} onSignOut={signOut} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          position: "relative",
        }}
      >
        <TopBar pageLabel={pageLabel} />
        <main style={{ flex: 1, padding: "0 36px 36px", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  active,
  username,
  onSignOut,
}: {
  active: NavId;
  username: string;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: "1px solid var(--border-soft)",
        padding: "16px 10px 12px",
        background: "rgba(10, 10, 11, 0.6)",
        backdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
        overflowY: "auto",
        zIndex: 1,
      }}
    >
      <div style={{ padding: "4px 6px 2px" }}>
        <Logo />
      </div>

      <div className="col" style={{ gap: 1 }}>
        <div className="t-eyebrow" style={{ padding: "0 8px 6px" }}>
          Рабочая область
        </div>
        {NAV_ITEMS.map((it) => {
          const Icon = it.icon;
          const isActive = it.id === active;
          const clickable = it.to != null;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                if (clickable && it.to) navigate(it.to);
              }}
              style={{
                height: 32,
                padding: "0 10px",
                border: 0,
                background: isActive ? "var(--bg-2)" : "transparent",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: isActive ? "var(--fg-0)" : "var(--fg-1)",
                font: "inherit",
                fontSize: 13,
                cursor: clickable ? "pointer" : "default",
                position: "relative",
                transition: "background 120ms ease, color 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive && clickable) {
                  e.currentTarget.style.background = "var(--bg-1)";
                  e.currentTarget.style.color = "var(--fg-0)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive && clickable) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--fg-1)";
                }
              }}
            >
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: -10,
                    top: 6,
                    bottom: 6,
                    width: 3,
                    background: "var(--accent)",
                    borderRadius: "0 3px 3px 0",
                    boxShadow: "0 0 12px var(--accent-glow)",
                  }}
                />
              )}
              <Icon />
              <span style={{ flex: 1, textAlign: "left" }}>{it.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div className="col" style={{ gap: 6 }}>
        <div className="t-eyebrow" style={{ padding: "0 8px" }}>
          {username || "—"}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            height: 32,
            padding: "0 10px",
            border: 0,
            background: "transparent",
            borderRadius: 8,
            font: "inherit",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--danger)",
            cursor: "pointer",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,106,92,0.10)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M9.5 3.5H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5.5M10.5 5.5L13 8l-2.5 2.5M6.5 8H13"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Выйти из аккаунта
        </button>
      </div>
    </aside>
  );
}

function TopBar({ pageLabel }: { pageLabel: string }) {
  const today = useMemo(() => new Date(), []);
  const nextFiling = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((nextFiling.getTime() - today.getTime()) / msPerDay);
  const filingDateLabel = `${nextFiling.getDate()} ${RU_MONTHS_GEN[nextFiling.getMonth()]}`;
  const filingMonthIdx = (nextFiling.getMonth() + 11) % 12;
  const summaryForMonth = RU_MONTHS_NOM[filingMonthIdx];
  const urgent = daysLeft <= 3;

  return (
    <div
      style={{
        height: 52,
        padding: "0 36px",
        borderBottom: "1px solid var(--border-soft)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(10,10,11,0.6)",
        backdropFilter: "blur(20px)",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <nav className="row gap-2" style={{ alignItems: "center", fontSize: 13 }}>
        <span
          style={{
            color: "var(--fg-2)",
            padding: "4px 8px",
            marginLeft: -8,
            borderRadius: 6,
          }}
        >
          Economix
        </span>
        <span style={{ color: "var(--fg-3)", fontSize: 12, lineHeight: 1 }}>/</span>
        <span style={{ color: "var(--fg-0)", padding: "4px 8px" }}>{pageLabel}</span>
      </nav>

      <div
        className="row gap-3"
        style={{
          alignItems: "center",
          height: 32,
          padding: "0 4px",
          color: "var(--fg-1)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          <span style={{ color: "var(--fg-2)" }}>Итоги снапшота через</span>
          <span
            className="mono"
            style={{
              color: urgent ? "var(--danger)" : "var(--fg-0)",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
            }}
          >
            {daysLeft} {dayWord(daysLeft)}
          </span>
          <span style={{ color: "var(--fg-3)" }}>·</span>
          <span className="mono" style={{ color: "var(--fg-2)" }}>
            {filingDateLabel}
          </span>
          <span style={{ color: "var(--fg-3)" }}>за {summaryForMonth}</span>
        </span>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 8l6-5 6 5v7H3V8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.5 15v-4h3v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function SnapshotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="4.5" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.5 4.5L7.5 3h3l1 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect
        x="9.5"
        y="3"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="3"
        y="9.5"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="9.5"
        y="9.5"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 15V8M7 15V4M11 15v-5M15 15v-9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
