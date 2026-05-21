import type { CurrencyCode, SnapshotType } from "../api/onboarding";
import { SparkIcon } from "./icons";
import {
  CategoryEditor,
  CURRENCIES,
  FreqCard,
  Header,
  type EditableItem,
} from "./shared";

export type PlanBuckets = {
  income: Record<string, string>;
  expense: Record<string, string>;
  assets: Record<string, string>;
  savingsOut: Record<string, string>;
};

export function StepCurrency({
  currency,
  setCurrency,
}: {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
}) {
  return (
    <div className="col gap-6">
      <Header
        eyebrow="01 / Валюта"
        title="В какой валюте ведёте учёт?"
        sub="Все снапшоты и планы будут отображаться в выбранной валюте. Это можно изменить позже в настройках."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {CURRENCIES.map((c) => {
          const active = c.code === currency;
          return (
            <button
              type="button"
              key={c.code}
              onClick={() => setCurrency(c.code)}
              style={{
                padding: "20px 18px",
                textAlign: "left",
                background: active ? "var(--accent-dim)" : "var(--bg-2)",
                border: `1px solid ${active ? "rgba(255,232,10,0.6)" : "var(--border)"}`,
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
                transition: "all 140ms ease",
                boxShadow: active ? "0 0 0 3px rgba(255,232,10,0.1)" : "none",
              }}
            >
              <div className="row between" style={{ marginBottom: 8 }}>
                <span
                  className="mono"
                  style={{ fontSize: 22, color: active ? "var(--accent)" : "var(--fg-0)" }}
                >
                  {c.symbol}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--fg-2)", letterSpacing: "0.08em" }}
                >
                  {c.code}
                </span>
              </div>
              <div style={{ fontSize: 14, color: active ? "var(--fg-0)" : "var(--fg-1)" }}>
                {c.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StepFrequency({
  freq,
  setFreq,
}: {
  freq: SnapshotType;
  setFreq: (f: SnapshotType) => void;
}) {
  const Spark = ({ density }: { density: number }) => (
    <div style={{ marginTop: 22, display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
      {Array.from({ length: density }).map((_, i) => {
        const h = 20 + Math.abs(Math.sin(i * 1.7)) * 28;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 2,
              background:
                i === density - 1 ? "var(--accent)" : "rgba(255,255,255,0.08)",
              boxShadow: i === density - 1 ? "0 0 8px var(--accent-glow)" : "none",
            }}
          />
        );
      })}
    </div>
  );
  return (
    <div className="col gap-6">
      <Header
        eyebrow="02 / Период"
        title="Как часто вы будете снимать снапшоты?"
        sub="Снапшот — это слепок ваших финансов на конец периода. Чем чаще, тем точнее аналитика, но больше времени на ввод."
      />
      <div className="row gap-3">
        <FreqCard
          active={freq === "WEEKLY"}
          onClick={() => setFreq("WEEKLY")}
          title="Еженедельно"
          sub="52 снапшота в год"
          hint="≈ 10 минут раз в неделю. Точная картина и быстрая реакция на отклонения."
          sparkline={<Spark density={12} />}
        />
        <FreqCard
          active={freq === "MONTLY"}
          onClick={() => setFreq("MONTLY")}
          title="Ежемесячно"
          sub="12 снапшотов в год"
          hint="≈ 15 минут раз в месяц. Спокойный режим — фокус на долгосрочных трендах."
          sparkline={<Spark density={6} />}
        />
      </div>
    </div>
  );
}

const STEP_CATEGORIES_META = {
  income: {
    eyebrow: "03 / Доходы",
    title: "Категории доходов",
    sub: "Группы, в которых вы будете отмечать поступления денег. Не углубляйтесь — 3–6 групп достаточно.",
    placeholder: "Например: Зарплата, Фриланс, Дивиденды...",
  },
  expense: {
    eyebrow: "04 / Расходы",
    title: "Категории расходов",
    sub: "Крупные ведро­образные категории. Цель — увидеть структуру, а не учитывать каждую кофейню.",
    placeholder: "Например: Аренда, Продукты, Транспорт...",
  },
  assets: {
    eyebrow: "05 / Сбережения",
    title: "Сбережения и счета",
    sub: "Места, где вы храните и копите деньги. «Основной счёт» закреплён системой — туда отправляются доходы и оттуда уходят расходы.",
    placeholder: "Например: Накопительный, Брокерский, Крипта...",
  },
} as const;

export function StepCategories({
  kind,
  items,
  setItems,
  suggestions,
  accent,
}: {
  kind: keyof typeof STEP_CATEGORIES_META;
  items: EditableItem[];
  setItems: (items: EditableItem[]) => void;
  suggestions: string[];
  accent: string;
}) {
  const meta = STEP_CATEGORIES_META[kind];
  return (
    <div className="col gap-6">
      <Header eyebrow={meta.eyebrow} title={meta.title} sub={meta.sub} />
      <div className="card" style={{ padding: 24 }}>
        <CategoryEditor
          items={items}
          setItems={setItems}
          placeholder={meta.placeholder}
          suggestions={suggestions}
          accentColor={accent}
        />
      </div>
      <div className="t-small mono dim">
        {items.length}{" "}
        {items.length === 1 ? "категория" : items.length < 5 ? "категории" : "категорий"} •
        рекомендуем 3–8
      </div>
    </div>
  );
}

export function StepCapital({
  assets,
  capital,
  setCapital,
  sym,
}: {
  assets: EditableItem[];
  capital: Record<string, string>;
  setCapital: (next: Record<string, string>) => void;
  sym: string;
}) {
  const value = (id: string) => capital[id] ?? "";
  const set = (id: string, v: string) =>
    setCapital({ ...capital, [id]: v.replace(/[^0-9.]/g, "") });

  const total = assets.reduce(
    (s, a) => s + (parseFloat(capital[a.id] || "0") || 0),
    0,
  );

  return (
    <div className="col gap-6">
      <Header
        eyebrow="06 / Стартовый капитал"
        title="Откуда стартуем?"
        sub="Введите остаток по каждому счёту из предыдущего шага. Приблизительных цифр достаточно — точность нужна только для трендов."
      />
      <div className="card" style={{ padding: 28 }}>
        <div className="col gap-4">
          {assets.map((a) => (
            <div key={a.id} className="col gap-2">
              <div className="row between" style={{ alignItems: "center" }}>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: a.fixed ? "var(--accent)" : "#6BE39A",
                      boxShadow: a.fixed
                        ? "0 0 8px var(--accent-glow)"
                        : "0 0 8px rgba(107,227,154,0.5)",
                    }}
                  />
                  <label style={{ fontSize: 15, fontWeight: 500 }}>{a.name}</label>
                  {a.fixed && (
                    <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--accent)" }}>
                      основной
                    </span>
                  )}
                </div>
                <span className="t-small dim">
                  {a.fixed
                    ? "Расчётный — доходы и расходы идут сюда"
                    : "Накопительный / инвестиционный"}
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <span
                  className="mono"
                  style={{
                    position: "absolute",
                    left: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--fg-3)",
                    fontSize: 18,
                    pointerEvents: "none",
                  }}
                >
                  {sym}
                </span>
                <input
                  className="input input--lg mono"
                  style={{ paddingLeft: 36, fontVariantNumeric: "tabular-nums" }}
                  type="text"
                  inputMode="decimal"
                  value={value(a.id)}
                  onChange={(e) => set(a.id, e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="hr" style={{ margin: "24px 0 20px" }} />
        <div className="row between">
          <div className="col">
            <span className="t-eyebrow">Капитал</span>
            <span className="t-small dim">
              Сумма по всем {assets.length} {assets.length === 1 ? "счёту" : "счетам"}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 32, letterSpacing: "-0.02em", color: "var(--accent)" }}
          >
            {sym}
            {total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </div>
  );
}

type PlanProps = {
  plan: PlanBuckets;
  setPlan: (next: PlanBuckets) => void;
  sym: string;
  freq: SnapshotType;
  income: EditableItem[];
  expense: EditableItem[];
  assets: EditableItem[];
};

export function StepPlan({
  plan,
  setPlan,
  sym,
  freq,
  income,
  expense,
  assets,
}: PlanProps) {
  const periodLabel = freq === "WEEKLY" ? "следующую неделю" : "следующий месяц";
  const periodShort = freq === "WEEKLY" ? "неделя" : "месяц";

  const otherAssets = assets.filter((a) => !a.fixed);
  const mainAsset = assets.find((a) => a.fixed) || assets[0];

  const setBucket = (bucket: keyof PlanBuckets, id: string, v: string) => {
    setPlan({
      ...plan,
      [bucket]: { ...(plan[bucket] || {}), [id]: v.replace(/[^0-9.]/g, "") },
    });
  };

  const sumOf = (bucket: keyof PlanBuckets, list: EditableItem[]) =>
    list.reduce(
      (s, it) => s + (parseFloat((plan[bucket] || {})[it.id] || "0") || 0),
      0,
    );

  const incomeTotal = sumOf("income", income);
  const expenseTotal = sumOf("expense", expense);
  const assetsTotal = sumOf("assets", otherAssets);
  const savingsOutTotal = sumOf("savingsOut", otherAssets);

  const mainRemainder = incomeTotal - expenseTotal - assetsTotal;
  const savingsDelta = assetsTotal - savingsOutTotal;
  const netDelta = mainRemainder + savingsDelta;

  return (
    <div className="col gap-5">
      <Header
        eyebrow="07 / Первый плановый снапшот"
        title={`Цели на ${periodLabel}`}
        sub="Распределите план по категориям. Сдача автоматически отправится на «Основной счёт»."
      />

      <PlanSection
        title="Плановые доходы"
        accent="var(--accent)"
        total={incomeTotal}
        sym={sym}
        items={income}
        bucket="income"
        plan={plan}
        setBucket={setBucket}
        placeholderHint="ожидаемая сумма за период"
      />

      <PlanSection
        title="Плановые расходы"
        accent="var(--danger)"
        total={expenseTotal}
        sym={sym}
        items={expense}
        bucket="expense"
        plan={plan}
        setBucket={setBucket}
        placeholderHint="бюджет на категорию"
      />

      {otherAssets.length > 0 && (
        <SavingsBlock
          sym={sym}
          assets={otherAssets}
          plan={plan}
          setBucket={setBucket}
          inTotal={assetsTotal}
          outTotal={savingsOutTotal}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: otherAssets.length > 0 ? "1fr 1fr" : "1fr",
          gap: 14,
        }}
      >
        <MainBreakdown
          sym={sym}
          periodShort={periodShort}
          mainAssetName={mainAsset?.name || "Основной счёт"}
          incomeTotal={incomeTotal}
          expenseTotal={expenseTotal}
          savingsIn={assetsTotal}
          mainRemainder={mainRemainder}
        />
        {otherAssets.length > 0 && (
          <SavingsResult
            sym={sym}
            periodShort={periodShort}
            savingsIn={assetsTotal}
            savingsOut={savingsOutTotal}
            savingsDelta={savingsDelta}
          />
        )}
      </div>

      <div className="card" style={{ padding: 20, background: "var(--bg-1)" }}>
        <div className="row gap-3" style={{ alignItems: "flex-start" }}>
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 8,
              background: "var(--accent-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
            }}
          >
            <SparkIcon />
          </div>
          <div className="col gap-1" style={{ flex: 1 }}>
            <div className="row between" style={{ alignItems: "baseline" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Прогноз изменения капитала
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 18,
                  color: netDelta >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {netDelta >= 0 ? "+" : "−"}
                {sym}
                {Math.abs(netDelta).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="t-small">
              Свободный остаток основного счёта + изменение сбережений. За один {periodShort}а — в
              конце периода зафиксируете факт, Economix покажет отклонения по каждой категории.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanSection({
  title,
  accent,
  total,
  sym,
  items,
  bucket,
  plan,
  setBucket,
  placeholderHint,
}: {
  title: string;
  accent: string;
  total: number;
  sym: string;
  items: EditableItem[];
  bucket: keyof PlanBuckets;
  plan: PlanBuckets;
  setBucket: (b: keyof PlanBuckets, id: string, v: string) => void;
  placeholderHint: string;
}) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="row between" style={{ marginBottom: 14, alignItems: "center" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 10px ${accent}`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
          <span className="t-small dim">· {items.length}</span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 18,
            letterSpacing: "-0.01em",
            color: total > 0 ? "var(--fg-0)" : "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sym}
          {total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="col gap-2">
        {items.map((it) => {
          const val = (plan[bucket] || {})[it.id] ?? "";
          return (
            <div key={it.id} className="row gap-3" style={{ alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 14 }}>{it.name}</span>
              <span className="t-small dim" style={{ minWidth: 0 }}>
                {placeholderHint}
              </span>
              <div style={{ position: "relative", width: 180 }}>
                <span
                  className="mono"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--fg-3)",
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  {sym}
                </span>
                <input
                  className="input mono"
                  style={{
                    height: 38,
                    paddingLeft: 28,
                    textAlign: "right",
                    paddingRight: 14,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 15,
                  }}
                  type="text"
                  inputMode="decimal"
                  value={val}
                  onChange={(e) => setBucket(bucket, it.id, e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MainBreakdown({
  sym,
  periodShort,
  mainAssetName,
  incomeTotal,
  expenseTotal,
  savingsIn,
  mainRemainder,
}: {
  sym: string;
  periodShort: string;
  mainAssetName: string;
  incomeTotal: number;
  expenseTotal: number;
  savingsIn: number;
  mainRemainder: number;
}) {
  const fmt = (n: number) =>
    Math.abs(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });

  return (
    <div
      className="card"
      style={{ padding: 22, position: "relative", overflow: "hidden", height: "100%" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(120% 80% at 0% 0%, rgba(255,232,10,0.10), transparent 55%)",
        }}
      />

      <div
        className="row between"
        style={{ position: "relative", alignItems: "center", marginBottom: 14 }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--accent)",
              boxShadow: "0 0 10px var(--accent-glow)",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>{mainAssetName}</span>
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--accent)" }}>
            авто
          </span>
        </div>
        <span className="t-small dim">за {periodShort}</span>
      </div>

      <div className="col gap-2" style={{ position: "relative" }}>
        <LedgerRow
          label="Доходы"
          sign="+"
          value={fmt(incomeTotal)}
          sym={sym}
          color="var(--accent)"
          muted={incomeTotal === 0}
        />
        <LedgerRow
          label="Расходы"
          sign="−"
          value={fmt(expenseTotal)}
          sym={sym}
          color="var(--danger)"
          muted={expenseTotal === 0}
        />
        <LedgerRow
          label="Пополнения сбережений"
          sign="−"
          value={fmt(savingsIn)}
          sym={sym}
          color="#6BE39A"
          muted={savingsIn === 0}
        />

        <div className="hr" style={{ margin: "8px 0 4px" }} />

        <div className="row between" style={{ alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>= Свободный остаток</span>
          <span
            className="mono"
            style={{
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: mainRemainder >= 0 ? "var(--accent)" : "var(--danger)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {mainRemainder >= 0 ? "+" : "−"}
            {sym}
            {fmt(mainRemainder)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SavingsResult({
  sym,
  periodShort,
  savingsIn,
  savingsOut,
  savingsDelta,
}: {
  sym: string;
  periodShort: string;
  savingsIn: number;
  savingsOut: number;
  savingsDelta: number;
}) {
  const fmt = (n: number) =>
    Math.abs(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  const positive = savingsDelta >= 0;
  const accent = positive ? "#6BE39A" : "#FF6A5C";

  return (
    <div
      className="card"
      style={{ padding: 22, position: "relative", overflow: "hidden", height: "100%" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(120% 80% at 100% 0%, ${
            positive ? "rgba(107,227,154,0.10)" : "rgba(255,106,92,0.10)"
          }, transparent 55%)`,
        }}
      />

      <div
        className="row between"
        style={{ position: "relative", alignItems: "center", marginBottom: 14 }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 10px ${accent}`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Сбережения</span>
          <span className="t-eyebrow" style={{ fontSize: 9, color: accent }}>
            авто
          </span>
        </div>
        <span className="t-small dim">за {periodShort}</span>
      </div>

      <div className="col gap-2" style={{ position: "relative" }}>
        <LedgerRow
          label="Пополнения"
          sign="+"
          value={fmt(savingsIn)}
          sym={sym}
          color="#6BE39A"
          muted={savingsIn === 0}
        />
        <LedgerRow
          label="Траты сбережений"
          sign="−"
          value={fmt(savingsOut)}
          sym={sym}
          color="#FF6A5C"
          muted={savingsOut === 0}
        />

        <div style={{ height: 22 }} />

        <div className="hr" style={{ margin: "8px 0 4px" }} />

        <div className="row between" style={{ alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>= Изменение сбережений</span>
          <span
            className="mono"
            style={{
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: accent,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {positive ? "+" : "−"}
            {sym}
            {fmt(savingsDelta)}
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
  sym,
  color,
  muted,
}: {
  label: string;
  sign: string;
  value: string;
  sym: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="row between" style={{ alignItems: "baseline" }}>
      <div className="row gap-2" style={{ alignItems: "baseline" }}>
        <span
          className="mono"
          style={{
            fontSize: 14,
            color: muted ? "var(--fg-3)" : color || "var(--fg-1)",
            width: 12,
            display: "inline-block",
            textAlign: "center",
          }}
        >
          {sign}
        </span>
        <span style={{ fontSize: 14, color: muted ? "var(--fg-3)" : "var(--fg-0)" }}>
          {label}
        </span>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 15,
          color: muted ? "var(--fg-3)" : "var(--fg-0)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {sym}
        {value}
      </span>
    </div>
  );
}

function SavingsBlock({
  sym,
  assets,
  plan,
  setBucket,
  inTotal,
  outTotal,
}: {
  sym: string;
  assets: EditableItem[];
  plan: PlanBuckets;
  setBucket: (b: keyof PlanBuckets, id: string, v: string) => void;
  inTotal: number;
  outTotal: number;
}) {
  const IN_ACCENT = "#6BE39A";
  const OUT_ACCENT = "#FF6A5C";

  const fmt = (n: number) =>
    `${sym}${(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
  const netSavings = inTotal - outTotal;

  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="row between" style={{ marginBottom: 16, alignItems: "center" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: IN_ACCENT,
              boxShadow: `0 0 10px ${IN_ACCENT}`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Сбережения</span>
          <span className="t-small dim">
            · {assets.length} {assets.length === 1 ? "счёт" : "счета"}
          </span>
        </div>
        <div className="row gap-3" style={{ alignItems: "baseline" }}>
          <span className="t-small dim">чистый поток</span>
          <span
            className="mono"
            style={{
              fontSize: 18,
              letterSpacing: "-0.01em",
              color:
                netSavings > 0 ? IN_ACCENT : netSavings < 0 ? OUT_ACCENT : "var(--fg-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {netSavings >= 0 ? "+" : "−"}
            {fmt(Math.abs(netSavings))}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
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
          title="Пополнение сбережений"
          hint="сколько отложить"
          accent={IN_ACCENT}
          total={inTotal}
          sym={sym}
          assets={assets}
          bucket="assets"
          plan={plan}
          setBucket={setBucket}
        />

        <SavingsColumn
          side="out"
          title="Траты сбережений"
          hint="сколько снять"
          accent={OUT_ACCENT}
          total={outTotal}
          sym={sym}
          assets={assets}
          bucket="savingsOut"
          plan={plan}
          setBucket={setBucket}
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
  sym,
  assets,
  bucket,
  plan,
  setBucket,
}: {
  side: "in" | "out";
  title: string;
  hint: string;
  accent: string;
  total: number;
  sym: string;
  assets: EditableItem[];
  bucket: keyof PlanBuckets;
  plan: PlanBuckets;
  setBucket: (b: keyof PlanBuckets, id: string, v: string) => void;
}) {
  const padSide = side === "in" ? { paddingRight: 18 } : { paddingLeft: 18 };
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
            fontSize: 14,
            color: total > 0 ? "var(--fg-0)" : "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sym}
          {total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)" }}>{title}</div>
      <div className="col gap-2">
        {assets.map((a) => {
          const val = (plan[bucket] || {})[a.id] ?? "";
          return (
            <div key={a.id} className="col gap-1">
              <span className="t-small" style={{ color: "var(--fg-1)" }}>
                {a.name}
              </span>
              <div style={{ position: "relative" }}>
                <span
                  className="mono"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--fg-3)",
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  {sym}
                </span>
                <input
                  className="input mono"
                  style={{
                    height: 36,
                    paddingLeft: 26,
                    textAlign: "right",
                    paddingRight: 12,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 14,
                    width: "100%",
                  }}
                  type="text"
                  inputMode="decimal"
                  value={val}
                  onChange={(e) => setBucket(bucket, a.id, e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          );
        })}
        <span className="t-small dim" style={{ marginTop: 2 }}>
          {hint}
        </span>
      </div>
    </div>
  );
}
