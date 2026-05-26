import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import * as categoriesApi from "../api/categories";
import type { Category, CategoryType } from "../api/categories";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";

const MAIN_ACCOUNT_NAME = "Основной счёт";

type Kind = "income" | "expense" | "savings";

const KIND_TO_TYPE: Record<Kind, CategoryType> = {
  income: "INCOME",
  expense: "EXPENSE",
  savings: "ACCOUNT",
};

type GroupItem = {
  id: string;
  categoryId: number;
  name: string;
  archived: boolean;
  fixed?: boolean;
  isNew?: boolean;
  /* Доходы / расходы — нет фактических агрегатов на этой странице. */
  fact?: number;
  expected?: number;
  periods?: number;
  /* Сбережения / счета — стартовый капитал отображается как «капитал». */
  capital?: number;
  change?: number;
};

const KIND_CONFIG: Record<
  Kind,
  { accent: string; glow: string; dim: string; soft: string }
> = {
  income: {
    accent: "#FFE80A",
    glow: "rgba(255,232,10,0.35)",
    dim: "rgba(255,232,10,0.10)",
    soft: "rgba(255,232,10,0.04)",
  },
  expense: {
    accent: "#FF6A5C",
    glow: "rgba(255,106,92,0.35)",
    dim: "rgba(255,106,92,0.10)",
    soft: "rgba(255,106,92,0.04)",
  },
  savings: {
    accent: "#6BE39A",
    glow: "rgba(107,227,154,0.35)",
    dim: "rgba(107,227,154,0.10)",
    soft: "rgba(107,227,154,0.04)",
  },
};

function fmtMoney(n: number | undefined): string {
  return "$" + Math.round(n || 0).toLocaleString("en-US");
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return forms[1];
  return forms[2];
}

function toGroup(category: Category): GroupItem {
  const isAccount = category.type === "ACCOUNT";
  return {
    id: `${category.type}_${category.category_id}`,
    categoryId: category.category_id,
    name: category.name,
    archived: category.is_archived,
    fixed: isAccount && category.name === MAIN_ACCOUNT_NAME,
    fact: 0,
    expected: 0,
    periods: 0,
    capital: isAccount ? category.initial_capital ?? 0 : undefined,
    change: isAccount ? 0 : undefined,
  };
}

export function Categories() {
  const { accessToken } = useAuth();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await categoriesApi.listCategories(accessToken);
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof categoriesApi.CategoriesApiError
              ? err.message
              : "Не удалось загрузить категории",
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

  const groups = useMemo(() => {
    const empty = { income: [] as GroupItem[], expense: [] as GroupItem[], savings: [] as GroupItem[] };
    if (!categories) return empty;
    for (const c of categories) {
      const item = toGroup(c);
      if (newIds.has(c.category_id)) item.isNew = true;
      if (c.type === "INCOME") empty.income.push(item);
      else if (c.type === "EXPENSE") empty.expense.push(item);
      else empty.savings.push(item);
    }
    return empty;
  }, [categories, newIds]);

  const totals = useMemo(
    () => ({
      income: {
        active: groups.income.filter((g) => !g.archived).length,
        archived: groups.income.filter((g) => g.archived).length,
      },
      expense: {
        active: groups.expense.filter((g) => !g.archived).length,
        archived: groups.expense.filter((g) => g.archived).length,
      },
      savings: {
        active: groups.savings.filter((g) => !g.archived).length,
        archived: groups.savings.filter((g) => g.archived).length,
      },
    }),
    [groups],
  );

  const archivedTotal =
    totals.income.archived + totals.expense.archived + totals.savings.archived;

  const upsertCategory = (updated: Category) => {
    setCategories((prev) => {
      if (!prev) return [updated];
      const idx = prev.findIndex((c) => c.category_id === updated.category_id);
      if (idx === -1) return [...prev, updated];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  };

  const onToggleArchive = (categoryId: number, isArchived: boolean) => {
    void (async () => {
      try {
        const updated = await categoriesApi.archiveCategory(
          accessToken,
          categoryId,
          isArchived,
        );
        upsertCategory(updated);
      } catch (err) {
        const msg =
          err instanceof categoriesApi.CategoriesApiError
            ? err.message
            : "Не удалось изменить категорию";
        setError(msg);
      }
    })();
  };

  const onAdd = (kind: Kind, name: string) => {
    void (async () => {
      try {
        const created = await categoriesApi.createCategory(accessToken, {
          type: KIND_TO_TYPE[kind],
          name,
        });
        setCategories((prev) => (prev ? [...prev, created] : [created]));
        setNewIds((prev) => new Set(prev).add(created.category_id));
      } catch (err) {
        const msg =
          err instanceof categoriesApi.CategoriesApiError
            ? err.message
            : "Не удалось добавить категорию";
        setError(msg);
      }
    })();
  };

  return (
    <AppShell active="categories" pageLabel="Категории">
      {loading ? (
        <CenteredMessage text="Загружаем категории…" />
      ) : error && !categories ? (
        <CenteredMessage text={error} tone="danger" />
      ) : (
        <>
          <CategoriesHero totals={totals} />
          <CategoriesFilter
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            archivedTotal={archivedTotal}
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

          <div className="col" style={{ gap: 14 }}>
            <CategoryGroup
              kind="income"
              title="ДОХОДЫ"
              hint="Источники, которые приносят деньги: зарплата, фриланс, дивиденды и прочее."
              groups={groups.income}
              showArchived={showArchived}
              onToggleArchive={onToggleArchive}
              onAdd={(name) => onAdd("income", name)}
            />
            <CategoryGroup
              kind="expense"
              title="РАСХОДЫ"
              hint="Куда уходят деньги: жильё, продукты, транспорт, развлечения и так далее."
              groups={groups.expense}
              showArchived={showArchived}
              onToggleArchive={onToggleArchive}
              onAdd={(name) => onAdd("expense", name)}
            />
            <CategoryGroup
              kind="savings"
              title="СБЕРЕЖЕНИЯ"
              hint="Где хранятся накопления: основной счёт, накопительный, брокер, пенсия и т.п."
              groups={groups.savings}
              showArchived={showArchived}
              onToggleArchive={onToggleArchive}
              onAdd={(name) => onAdd("savings", name)}
            />
          </div>

          <div style={{ height: 80 }} />
        </>
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
function CategoriesHero({
  totals,
}: {
  totals: {
    income: { active: number; archived: number };
    expense: { active: number; archived: number };
    savings: { active: number; archived: number };
  };
}) {
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
        <span className="t-eyebrow">Справочник · структура учёта</span>
        <h1 className="t-h1" style={{ margin: 0 }}>
          Категории и группы
        </h1>
        <span className="t-body">
          Каркас, на который опираются все ваши снапшоты. Здесь живут источники дохода,
          статьи расходов и счета сбережений — добавляйте новые и архивируйте устаревшие.
        </span>
      </div>
      <div className="row" style={{ gap: 24, alignSelf: "stretch", alignItems: "flex-end" }}>
        <HeroStat label="Доходов" n={totals.income} color="#FFE80A" />
        <HeroStat label="Расходов" n={totals.expense} color="#FF6A5C" />
        <HeroStat label="Сбережений" n={totals.savings} color="#6BE39A" />
      </div>
    </div>
  );
}

function HeroStat({
  label,
  n,
  color,
}: {
  label: string;
  n: { active: number; archived: number };
  color: string;
}) {
  return (
    <div className="col gap-1" style={{ alignItems: "flex-end" }}>
      <span className="t-eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div className="row gap-2" style={{ alignItems: "baseline" }}>
        <span
          className="mono"
          style={{
            fontSize: 22,
            color,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {n.active}
        </span>
        {n.archived > 0 && (
          <span className="mono t-small" style={{ color: "var(--fg-3)" }}>
            +{n.archived} архив
          </span>
        )}
      </div>
    </div>
  );
}

/* ====== Filter bar ====== */
function CategoriesFilter({
  showArchived,
  setShowArchived,
  archivedTotal,
}: {
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  archivedTotal: number;
}) {
  return (
    <div
      className="row between"
      style={{
        padding: "10px 14px",
        background: "var(--bg-1)",
        border: "1px solid var(--border-soft)",
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      <div className="row gap-3" style={{ alignItems: "center" }}>
        <span className="t-eyebrow" style={{ fontSize: 10 }}>
          Фильтр
        </span>
        <span style={{ height: 14, width: 1, background: "var(--border-soft)" }} />
        <span className="t-small" style={{ color: "var(--fg-2)" }}>
          В архиве{" "}
          <span
            className="mono"
            style={{ color: archivedTotal > 0 ? "var(--fg-1)" : "var(--fg-3)" }}
          >
            {archivedTotal}
          </span>{" "}
          {pluralRu(archivedTotal, ["группа", "группы", "групп"])}
        </span>
      </div>

      <Toggle
        checked={showArchived}
        onChange={setShowArchived}
        label="Показывать архивированные"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 32,
        padding: "0 4px 0 10px",
        background: "transparent",
        border: 0,
        font: "inherit",
        fontSize: 13,
        color: checked ? "var(--fg-0)" : "var(--fg-2)",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 999,
          background: checked ? "var(--accent)" : "var(--bg-3)",
          border: `1px solid ${checked ? "transparent" : "var(--border)"}`,
          position: "relative",
          transition: "background 160ms ease, border-color 160ms ease",
          boxShadow: checked ? "0 0 0 3px rgba(255,232,10,0.10)" : "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: 1,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: checked ? "var(--accent-on)" : "var(--fg-2)",
            transform: `translateX(${checked ? 14 : 0}px)`,
            transition: "transform 160ms ease, background 160ms ease",
          }}
        />
      </span>
    </button>
  );
}

/* ====== Category group card ====== */
function CategoryGroup({
  kind,
  title,
  hint,
  groups,
  showArchived,
  onToggleArchive,
  onAdd,
}: {
  kind: Kind;
  title: string;
  hint: string;
  groups: GroupItem[];
  showArchived: boolean;
  onToggleArchive: (categoryId: number, isArchived: boolean) => void;
  onAdd: (name: string) => void;
}) {
  const cfg = KIND_CONFIG[kind];
  const isSavings = kind === "savings";

  const active = groups.filter((g) => !g.archived);
  const archivedCount = groups.length - active.length;
  const visible = showArchived ? groups : active;

  const totalFact = active.reduce((s, g) => s + (g.fact || 0), 0);
  const totalExpected = active.reduce((s, g) => s + (g.expected || 0), 0);
  const totalCapital = active.reduce((s, g) => s + (g.capital || 0), 0);
  const totalChange = active.reduce((s, g) => s + (g.change || 0), 0);

  const [adding, setAdding] = useState(false);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(90deg, ${cfg.soft}, transparent 35%), var(--bg-2)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: cfg.accent,
          boxShadow: `0 0 18px ${cfg.glow}`,
        }}
      />

      <div style={{ padding: "22px 24px" }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 24 }}>
          <div className="col gap-3" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: cfg.accent,
                  boxShadow: `0 0 12px ${cfg.glow}`,
                }}
              />
              <span className="t-eyebrow" style={{ color: cfg.accent, fontSize: 11 }}>
                {title}
              </span>
              <span className="t-small dim" style={{ marginLeft: 4 }}>
                · {active.length} {pluralRu(active.length, ["группа", "группы", "групп"])}
                {archivedCount > 0 && <> · {archivedCount} в архиве</>}
              </span>
            </div>

            <span className="t-small" style={{ color: "var(--fg-2)", maxWidth: 480 }}>
              {hint}
            </span>

            {isSavings ? (
              <div className="row" style={{ gap: 36, alignItems: "flex-end", marginTop: 4 }}>
                <KpiBlock
                  label="Текущий капитал"
                  big
                  accent={cfg.accent}
                  glow={cfg.glow}
                  value={fmtMoney(totalCapital)}
                />
                <KpiBlock
                  label="Δ к предыдущему снапшоту"
                  value={
                    <span
                      style={{
                        color:
                          totalChange > 0
                            ? "var(--success)"
                            : totalChange < 0
                              ? "var(--danger)"
                              : "var(--fg-1)",
                      }}
                    >
                      {totalChange > 0 ? "+" : totalChange < 0 ? "−" : ""}
                      {fmtMoney(Math.abs(totalChange))}
                    </span>
                  }
                />
              </div>
            ) : (
              <div className="row" style={{ gap: 36, alignItems: "flex-end", marginTop: 4 }}>
                <KpiBlock label="Факт за всё время" big value={fmtMoney(totalFact)} />
                <KpiBlock
                  label="Ожидание · до посл. факта"
                  accent={cfg.accent}
                  glow={cfg.glow}
                  value={fmtMoney(totalExpected)}
                  hint={
                    totalFact > 0 ? (
                      <span className="mono" style={{ color: "var(--fg-2)" }}>
                        +
                        {Math.round(((totalExpected - totalFact) / totalFact) * 100)}% к факту
                      </span>
                    ) : null
                  }
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 34,
              padding: "0 14px",
              background: cfg.dim,
              border: `1px solid ${cfg.accent}40`,
              borderRadius: 10,
              color: cfg.accent,
              font: "inherit",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 140ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = cfg.dim.replace("0.10", "0.18");
              e.currentTarget.style.borderColor = `${cfg.accent}80`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = cfg.dim;
              e.currentTarget.style.borderColor = `${cfg.accent}40`;
            }}
          >
            <PlusIcon /> Новая группа
          </button>
        </div>

        <div className="hr" style={{ margin: "20px 0 0" }} />

        <div className="row" style={{ padding: "12px 12px 6px", alignItems: "center" }}>
          <span className="t-eyebrow" style={{ fontSize: 9, flex: 1 }}>
            Группа
          </span>
          {isSavings ? (
            <>
              <span
                className="t-eyebrow"
                style={{ fontSize: 9, width: 140, textAlign: "right" }}
              >
                Капитал
              </span>
              <span
                className="t-eyebrow"
                style={{ fontSize: 9, width: 110, textAlign: "right" }}
              >
                Δ за месяц
              </span>
            </>
          ) : (
            <>
              <span
                className="t-eyebrow"
                style={{ fontSize: 9, width: 140, textAlign: "right" }}
              >
                Факт
              </span>
              <span
                className="t-eyebrow"
                style={{ fontSize: 9, width: 140, textAlign: "right" }}
              >
                Ожидание
              </span>
            </>
          )}
          <span style={{ width: 140 }} />
        </div>

        <div className="col">
          {visible.map((g, i) => (
            <GroupRow
              key={g.id}
              group={g}
              kind={kind}
              cfg={cfg}
              isFirst={i === 0}
              onToggleArchive={() => onToggleArchive(g.categoryId, !g.archived)}
            />
          ))}
          {adding && (
            <NewGroupRow
              cfg={cfg}
              kind={kind}
              onCancel={() => setAdding(false)}
              onSave={(name) => {
                onAdd(name);
                setAdding(false);
              }}
            />
          )}
          {visible.length === 0 && !adding && (
            <div
              className="col gap-2"
              style={{
                padding: "28px 12px",
                alignItems: "center",
                borderTop: "1px solid var(--border-soft)",
              }}
            >
              <span className="t-small dim">
                В этой категории пока нет ни одной активной группы.
              </span>
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={{
                  marginTop: 4,
                  padding: "6px 12px",
                  background: "transparent",
                  border: `1px solid ${cfg.accent}40`,
                  borderRadius: 8,
                  color: cfg.accent,
                  font: "inherit",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <PlusIcon /> Добавить первую
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiBlock({
  label,
  value,
  big,
  accent,
  glow,
  hint,
}: {
  label: string;
  value: ReactNode;
  big?: boolean;
  accent?: string;
  glow?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="col gap-1">
      <span className="t-eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div className="row gap-2" style={{ alignItems: "baseline" }}>
        <span
          className="mono"
          style={{
            fontSize: big ? 30 : 22,
            letterSpacing: "-0.02em",
            color: accent || "var(--fg-0)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            textShadow: glow ? `0 0 18px ${glow}` : "none",
          }}
        >
          {value}
        </span>
        {hint}
      </div>
    </div>
  );
}

/* ====== Row ====== */
function GroupRow({
  group,
  kind,
  cfg,
  isFirst,
  onToggleArchive,
}: {
  group: GroupItem;
  kind: Kind;
  cfg: (typeof KIND_CONFIG)[Kind];
  isFirst: boolean;
  onToggleArchive: () => void;
}) {
  const isSavings = kind === "savings";
  const archived = !!group.archived;
  const isNew = !!group.isNew;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="row"
      style={{
        padding: "14px 12px",
        borderTop: isFirst ? "0" : "1px solid var(--border-soft)",
        opacity: archived ? 0.42 : 1,
        background: hover ? "rgba(255,255,255,0.015)" : "transparent",
        transition: "opacity 220ms ease, background 120ms ease",
        alignItems: "center",
      }}
    >
      <div className="row gap-3" style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: archived ? "transparent" : cfg.accent,
            border: archived ? "1px dashed var(--fg-3)" : "none",
            boxShadow: archived ? "none" : `0 0 8px ${cfg.glow}`,
            flexShrink: 0,
          }}
        />
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <div className="row gap-2" style={{ alignItems: "baseline" }}>
            <span
              style={{
                fontSize: 14,
                color: "var(--fg-0)",
                textDecoration: archived ? "line-through" : "none",
                textDecorationColor: "var(--fg-3)",
              }}
            >
              {group.name}
            </span>
            {group.fixed && (
              <span
                title="Закреплённая группа"
                className="mono"
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-soft)",
                  color: "var(--fg-3)",
                  borderRadius: 4,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <LockIcon /> системная
              </span>
            )}
            {isNew && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  background: cfg.dim,
                  border: `1px solid ${cfg.accent}40`,
                  color: cfg.accent,
                  borderRadius: 4,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                новая
              </span>
            )}
          </div>
          <span className="t-small mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
            {archived ? (
              <>в архиве</>
            ) : isNew ? (
              <>появится в следующем снапшоте</>
            ) : isSavings ? (
              group.fixed ? (
                "счёт по умолчанию"
              ) : (
                "счёт сбережений"
              )
            ) : (
              <>
                {group.periods ?? 0}{" "}
                {pluralRu(group.periods ?? 0, ["снапшот", "снапшота", "снапшотов"])}
              </>
            )}
          </span>
        </div>
      </div>

      {isSavings ? (
        <>
          <span
            className="mono"
            style={{
              width: 140,
              textAlign: "right",
              fontSize: 16,
              letterSpacing: "-0.01em",
              color: archived ? "var(--fg-2)" : "var(--fg-0)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtMoney(group.capital)}
          </span>
          <span
            className="mono"
            style={{
              width: 110,
              textAlign: "right",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: archived
                ? "var(--fg-3)"
                : (group.change ?? 0) > 0
                  ? "var(--success)"
                  : (group.change ?? 0) < 0
                    ? "var(--danger)"
                    : "var(--fg-2)",
            }}
          >
            {archived || group.change == null
              ? "—"
              : group.change === 0
                ? "0"
                : (group.change > 0 ? "+" : "−") + fmtMoney(Math.abs(group.change))}
          </span>
        </>
      ) : (
        <>
          <span
            className="mono"
            style={{
              width: 140,
              textAlign: "right",
              fontSize: 16,
              letterSpacing: "-0.01em",
              color: archived ? "var(--fg-2)" : "var(--fg-0)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {(group.fact ?? 0) > 0 ? fmtMoney(group.fact) : "—"}
          </span>
          <span
            className="mono"
            style={{
              width: 140,
              textAlign: "right",
              fontSize: 14,
              color: archived ? "var(--fg-3)" : cfg.accent,
              fontVariantNumeric: "tabular-nums",
              textShadow: archived ? "none" : `0 0 10px ${cfg.glow}`,
            }}
          >
            {archived || (group.expected ?? 0) === 0 ? "—" : fmtMoney(group.expected)}
          </span>
        </>
      )}

      <div style={{ width: 140, display: "flex", justifyContent: "flex-end" }}>
        {group.fixed ? (
          <span className="t-small mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
            не архивируется
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleArchive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 10px",
              background: archived ? cfg.dim : "transparent",
              border: archived ? `1px solid ${cfg.accent}40` : "1px solid var(--border-soft)",
              borderRadius: 8,
              color: archived ? cfg.accent : "var(--fg-2)",
              font: "inherit",
              fontSize: 11.5,
              cursor: "pointer",
              transition: "all 140ms ease",
            }}
            onMouseEnter={(e) => {
              if (archived) e.currentTarget.style.background = cfg.dim.replace("0.10", "0.18");
              else {
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.color = "var(--fg-0)";
              }
            }}
            onMouseLeave={(e) => {
              if (archived) e.currentTarget.style.background = cfg.dim;
              else {
                e.currentTarget.style.borderColor = "var(--border-soft)";
                e.currentTarget.style.color = "var(--fg-2)";
              }
            }}
          >
            {archived ? (
              <>
                <RestoreIcon /> Вернуть
              </>
            ) : (
              <>
                <ArchiveIcon /> В архив
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ====== New group inline row ====== */
function NewGroupRow({
  cfg,
  kind,
  onCancel,
  onSave,
}: {
  cfg: (typeof KIND_CONFIG)[Kind];
  kind: Kind;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const save = () => {
    const v = name.trim();
    if (!v) return;
    onSave(v);
  };

  return (
    <div
      className="row gap-3"
      style={{
        padding: "14px 12px",
        borderTop: "1px solid var(--border-soft)",
        alignItems: "center",
        background: cfg.dim.replace("0.10", "0.04"),
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "transparent",
          border: `1px dashed ${cfg.accent}`,
          flexShrink: 0,
        }}
      />
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={
          kind === "income"
            ? "Например: Кэшбэк, Премии, Аренда квартиры…"
            : kind === "expense"
              ? "Например: Спорт, Курсы, Кафе…"
              : "Например: ИИС, Депозит в долларах…"
        }
        style={{
          flex: 1,
          height: 32,
          padding: "0 10px",
          background: "var(--bg-1)",
          border: `1px solid ${cfg.accent}40`,
          borderRadius: 8,
          color: "var(--fg-0)",
          font: "inherit",
          fontSize: 13,
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = cfg.accent;
          e.currentTarget.style.boxShadow = `0 0 0 3px ${cfg.dim}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = `${cfg.accent}40`;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      <button
        type="button"
        onClick={onCancel}
        style={{
          height: 28,
          padding: "0 10px",
          background: "transparent",
          border: "1px solid var(--border-soft)",
          borderRadius: 8,
          color: "var(--fg-2)",
          font: "inherit",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Отмена
      </button>
      <button
        type="button"
        onClick={save}
        disabled={!name.trim()}
        style={{
          height: 28,
          padding: "0 12px",
          background: cfg.accent,
          border: 0,
          borderRadius: 8,
          color: kind === "income" ? "var(--accent-on)" : "#0A0A0B",
          font: "inherit",
          fontSize: 12,
          fontWeight: 600,
          cursor: name.trim() ? "pointer" : "not-allowed",
          opacity: name.trim() ? 1 : 0.4,
          boxShadow: name.trim() ? `0 4px 16px -4px ${cfg.glow}` : "none",
        }}
      >
        Добавить
      </button>
    </div>
  );
}

/* ====== Icons ====== */
function ArchiveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect
        x="1.5"
        y="2.5"
        width="11"
        height="3"
        rx="0.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M2.5 5.5v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5.5 8.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7a4 4 0 1 1 1.2 2.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 4v3h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
      <rect
        x="1.5"
        y="5.5"
        width="8"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0v2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2.5v9M2.5 7h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
