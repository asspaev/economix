import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import * as onboardingApi from "../api/onboarding";
import type { CurrencyCode, OnboardingStatePatch, SnapshotType } from "../api/onboarding";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";
import { ArrowLeftIcon, ArrowRightIcon } from "../onboarding/icons";
import { CURRENCIES, Stepper, type EditableItem } from "../onboarding/shared";
import {
  StepCapital,
  StepCategories,
  StepCurrency,
  StepFrequency,
  StepPlan,
  type PlanBuckets,
} from "../onboarding/steps";

const ONB_STEPS = ["Валюта", "Период", "Доходы", "Расходы", "Сбережения", "Капитал", "Первый план"] as const;

const MAIN_ACCOUNT_NAME = "Основной счёт";

const INCOME_SUGGESTIONS = [
  "Зарплата",
  "Фриланс",
  "Дивиденды",
  "Аренда недвижимости",
  "Подработка",
  "Премия",
  "Проценты по вкладам",
];

const EXPENSE_SUGGESTIONS = [
  "Аренда",
  "Продукты",
  "Транспорт",
  "Коммунальные",
  "Подписки",
  "Кафе и рестораны",
  "Здоровье",
  "Развлечения",
  "Путешествия",
  "Одежда",
];

const ACCOUNT_SUGGESTIONS = [
  "Накопительный",
  "Брокерский счёт",
  "Крипта",
  "Наличные",
  "Депозит",
  "Недвижимость",
  "Пенсионный",
];

const newId = () => Math.random().toString(36).slice(2);

function makeItems(names: string[] | null | undefined, fallback: string[]): EditableItem[] {
  const list = names && names.length > 0 ? names : fallback;
  return list.map((name) => ({ id: newId(), name }));
}

function makeAccountItems(names: string[] | null | undefined): EditableItem[] {
  const list = names && names.length > 0 ? names : [MAIN_ACCOUNT_NAME, "Накопительный"];
  const hasMain = list.some((n) => n === MAIN_ACCOUNT_NAME);
  const ordered = hasMain ? list : [MAIN_ACCOUNT_NAME, ...list];
  return ordered.map((name) => ({
    id: name === MAIN_ACCOUNT_NAME ? "main" : newId(),
    name,
    fixed: name === MAIN_ACCOUNT_NAME,
  }));
}

export function Onboarding() {
  const { accessToken, user, signOut, updateAuth } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>("RUB");
  const [freq, setFreq] = useState<SnapshotType>("MONTLY");
  const [income, setIncome] = useState<EditableItem[]>(() => makeItems(null, ["Зарплата", "Фриланс"]));
  const [expense, setExpense] = useState<EditableItem[]>(() =>
    makeItems(null, ["Аренда", "Продукты", "Транспорт"]),
  );
  const [assets, setAssets] = useState<EditableItem[]>(() => makeAccountItems(null));
  const [capital, setCapital] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<PlanBuckets>({
    income: {},
    expense: {},
    assets: {},
    savingsOut: {},
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await onboardingApi.getState(accessToken);
        if (cancelled) return;
        if (state.currency) setCurrency(state.currency);
        if (state.snapshot_type) setFreq(state.snapshot_type);
        if (state.income_categories?.length) {
          setIncome(makeItems(state.income_categories, []));
        }
        if (state.expense_categories?.length) {
          setExpense(makeItems(state.expense_categories, []));
        }
        if (state.accounts?.length) {
          setAssets(makeAccountItems(state.accounts));
        }
        if (state.initial_capital) {
          const next: Record<string, string> = {};
          const aList = state.accounts?.length
            ? makeAccountItems(state.accounts)
            : makeAccountItems(null);
          for (const a of aList) {
            const amount = state.initial_capital[a.name];
            if (typeof amount === "number") next[a.id] = String(amount);
          }
          setCapital(next);
        }
        if (state.initial_snapshot) {
          const buckets: PlanBuckets = {
            income: {},
            expense: {},
            assets: {},
            savingsOut: {},
          };
          const incomeItems = makeItems(state.income_categories, income.map((i) => i.name));
          const expenseItems = makeItems(state.expense_categories, expense.map((i) => i.name));
          const assetItems = state.accounts?.length
            ? makeAccountItems(state.accounts)
            : makeAccountItems(null);
          for (const it of incomeItems) {
            const v = state.initial_snapshot.incomes?.[it.name];
            if (typeof v === "number") buckets.income[it.id] = String(v);
          }
          for (const it of expenseItems) {
            const v = state.initial_snapshot.expenses?.[it.name];
            if (typeof v === "number") buckets.expense[it.id] = String(v);
          }
          for (const it of assetItems) {
            const v = state.initial_snapshot.savings_deposits?.[it.name];
            if (typeof v === "number") buckets.assets[it.id] = String(v);
            const w = state.initial_snapshot.savings_withdrawals?.[it.name];
            if (typeof w === "number") buckets.savingsOut[it.id] = String(w);
          }
          setPlan(buckets);
        }
      } catch (err) {
        console.error("Failed to load onboarding state", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const sym = useMemo(
    () => CURRENCIES.find((c) => c.code === currency)?.symbol || "₽",
    [currency],
  );

  const canNext = useMemo(() => {
    if (step === 2) return income.length >= 1;
    if (step === 3) return expense.length >= 1;
    if (step === 4) return assets.some((a) => a.name === MAIN_ACCOUNT_NAME);
    return true;
  }, [step, income, expense, assets]);

  const buildPatchForStep = useCallback(
    (current: number): OnboardingStatePatch => {
      switch (current) {
        case 0:
          return { currency };
        case 1:
          return { snapshot_type: freq };
        case 2:
          return { income_categories: income.map((i) => i.name) };
        case 3:
          return { expense_categories: expense.map((i) => i.name) };
        case 4:
          return { accounts: assets.map((a) => a.name) };
        case 5:
          return {
            initial_capital: Object.fromEntries(
              assets
                .map((a) => [a.name, parseFloat(capital[a.id] || "0") || 0] as const)
                .filter(([, v]) => v !== 0),
            ),
          };
        case 6:
          return {
            initial_snapshot: {
              incomes: mapByName(income, plan.income),
              expenses: mapByName(expense, plan.expense),
              savings_deposits: mapByName(
                assets.filter((a) => !a.fixed),
                plan.assets,
              ),
              savings_withdrawals: mapByName(
                assets.filter((a) => !a.fixed),
                plan.savingsOut,
              ),
            },
          };
        default:
          return {};
      }
    },
    [currency, freq, income, expense, assets, capital, plan],
  );

  const next = async () => {
    if (submitting) return;
    setError(null);
    try {
      setSubmitting(true);
      const patch = buildPatchForStep(step);
      await onboardingApi.patchState(accessToken, patch);
      if (step < ONB_STEPS.length - 1) {
        setStep(step + 1);
      } else {
        const auth = await onboardingApi.complete(accessToken);
        updateAuth(auth);
        navigate("/", { replace: true });
      }
    } catch (err) {
      if (err instanceof onboardingApi.OnboardingApiError) {
        setError(err.message);
      } else {
        setError("Не удалось сохранить шаг. Попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (loading) {
    return (
      <div style={{ position: "relative", minHeight: "100vh", display: "flex" }}>
        <div className="bg-mesh onboarding" />
        <div
          className="anim-fade-in"
          style={{
            margin: "auto",
            position: "relative",
            color: "var(--fg-2)",
          }}
        >
          Загрузка…
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <div className="bg-mesh onboarding" />

      <header
        style={{
          position: "relative",
          padding: "28px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo subtitle="Траектория" />
        <div className="row gap-3" style={{ alignItems: "center" }}>
          {user && <span className="t-small dim">{user.username}</span>}
          <button type="button" className="btn btn--ghost" onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>

      <div style={{ padding: "0 48px", maxWidth: 1240, margin: "0 auto", width: "100%" }}>
        <Stepper steps={ONB_STEPS} current={step} />
      </div>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px",
        }}
      >
        <div key={step} className="anim-fade-up" style={{ width: "100%", maxWidth: 720 }}>
          {step === 0 && <StepCurrency currency={currency} setCurrency={setCurrency} />}
          {step === 1 && <StepFrequency freq={freq} setFreq={setFreq} />}
          {step === 2 && (
            <StepCategories
              kind="income"
              items={income}
              setItems={setIncome}
              suggestions={INCOME_SUGGESTIONS}
              accent="#FFE80A"
            />
          )}
          {step === 3 && (
            <StepCategories
              kind="expense"
              items={expense}
              setItems={setExpense}
              suggestions={EXPENSE_SUGGESTIONS}
              accent="#FF6A5C"
            />
          )}
          {step === 4 && (
            <StepCategories
              kind="assets"
              items={assets}
              setItems={setAssets}
              suggestions={ACCOUNT_SUGGESTIONS}
              accent="#6BE39A"
            />
          )}
          {step === 5 && (
            <StepCapital assets={assets} capital={capital} setCapital={setCapital} sym={sym} />
          )}
          {step === 6 && (
            <StepPlan
              plan={plan}
              setPlan={setPlan}
              sym={sym}
              freq={freq}
              income={income}
              expense={expense}
              assets={assets}
            />
          )}

          {error && (
            <div
              role="alert"
              className="t-small"
              style={{
                marginTop: 24,
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
        </div>
      </main>

      <footer
        style={{
          position: "relative",
          padding: "24px 48px 36px",
          borderTop: "1px solid var(--border-soft)",
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.5))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          className="btn btn--ghost"
          onClick={prev}
          disabled={step === 0 || submitting}
        >
          <ArrowLeftIcon /> Назад
        </button>
        <div className="t-small mono">
          Шаг <span style={{ color: "var(--fg-0)" }}>{String(step + 1).padStart(2, "0")}</span>
          <span className="dim"> / {String(ONB_STEPS.length).padStart(2, "0")}</span>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={next}
          disabled={!canNext || submitting}
        >
          {step === ONB_STEPS.length - 1
            ? submitting
              ? "Открываем…"
              : "Открыть дашборд"
            : submitting
              ? "Сохраняем…"
              : "Продолжить"}
          <ArrowRightIcon />
        </button>
      </footer>
    </div>
  );
}

function mapByName(items: EditableItem[], record: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const v = parseFloat(record[it.id] || "0");
    if (!Number.isNaN(v) && v !== 0) out[it.name] = Math.round(v);
  }
  return out;
}
