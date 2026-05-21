import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { CheckIcon, LockIcon, PlusIcon, XIcon } from "./icons";

export const CURRENCIES = [
  { code: "RUB", symbol: "₽", name: "Российский рубль" },
  { code: "USD", symbol: "$", name: "Доллар США" },
  { code: "EUR", symbol: "€", name: "Евро" },
] as const;

export type CurrencyOption = (typeof CURRENCIES)[number];

export type EditableItem = {
  id: string;
  name: string;
  fixed?: boolean;
};

export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <div className="row gap-3" style={{ width: "100%" }}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <div key={i} className="col gap-2" style={{ flex: 1 }}>
            <div
              style={{
                height: 3,
                borderRadius: 999,
                background:
                  state === "done"
                    ? "var(--accent)"
                    : state === "active"
                      ? "linear-gradient(90deg, var(--accent), rgba(255,232,10,0.2))"
                      : "var(--bg-3)",
                boxShadow: state !== "pending" ? "0 0 12px rgba(255,232,10,0.35)" : "none",
                transition: "all 240ms ease",
              }}
            />
            <div className="row between" style={{ alignItems: "center" }}>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: state === "pending" ? "var(--fg-3)" : "var(--fg-1)",
                  letterSpacing: "0.06em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color:
                    state === "pending"
                      ? "var(--fg-3)"
                      : state === "active"
                        ? "var(--accent)"
                        : "var(--fg-2)",
                  fontWeight: state === "active" ? 500 : 400,
                }}
              >
                {s}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type CategoryEditorProps = {
  items: EditableItem[];
  setItems: (items: EditableItem[]) => void;
  placeholder: string;
  suggestions?: string[];
  accentColor?: string;
};

export function CategoryEditor({
  items,
  setItems,
  placeholder,
  suggestions = [],
  accentColor,
}: CategoryEditorProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (val: string) => {
    const v = val.trim();
    if (!v) return;
    if (items.some((i) => i.name.toLowerCase() === v.toLowerCase())) return;
    setItems([...items, { name: v, id: Math.random().toString(36).slice(2) }]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (it?.fixed) return;
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="col gap-4">
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        {items.map((it) => (
          <div
            key={it.id}
            className="row gap-2 anim-fade-up"
            style={{
              height: 36,
              padding: "0 6px 0 12px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
              alignItems: "center",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: accentColor || "var(--accent)",
                boxShadow: `0 0 8px ${accentColor || "var(--accent-glow)"}`,
              }}
            />
            <span style={{ fontSize: 14 }}>{it.name}</span>
            {it.fixed ? (
              <span
                title="Закреплённая категория"
                style={{
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--fg-3)",
                }}
              >
                <LockIcon />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => remove(it.id)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: 0,
                  background: "transparent",
                  color: "var(--fg-3)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg-0)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-3)")}
              >
                <XIcon />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="t-small dim">Пока ничего. Добавьте первую категорию ниже ↓</div>
        )}
      </div>

      <div className="row gap-2">
        <input
          ref={inputRef}
          className="input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => add(input)}
          disabled={!input.trim()}
        >
          <PlusIcon /> Добавить
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="col gap-2">
          <div className="t-eyebrow">Популярное</div>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {suggestions
              .filter((s) => !items.some((i) => i.name.toLowerCase() === s.toLowerCase()))
              .map((s) => (
                <button key={s} type="button" className="chip" onClick={() => add(s)}>
                  <PlusIcon /> {s}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

type FreqCardProps = {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  hint: string;
  sparkline?: ReactNode;
};

export function FreqCard({ active, onClick, title, sub, hint, sparkline }: FreqCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        textAlign: "left",
        padding: 24,
        background: active
          ? "linear-gradient(180deg, rgba(255,232,10,0.07), rgba(255,232,10,0))"
          : "var(--bg-2)",
        border: `1px solid ${active ? "rgba(255,232,10,0.55)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        cursor: "pointer",
        color: "inherit",
        font: "inherit",
        flex: 1,
        transition: "all 160ms ease",
        boxShadow: active
          ? "0 0 0 4px rgba(255,232,10,0.08), 0 16px 32px -16px rgba(255,232,10,0.3)"
          : "none",
      }}
    >
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="t-eyebrow">{title}</span>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: `2px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
            background: active ? "var(--accent)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 160ms ease",
          }}
        >
          {active && <CheckIcon style={{ color: "var(--accent-on)", width: 12, height: 12 }} />}
        </span>
      </div>
      <div className="t-h2" style={{ marginBottom: 4 }}>
        {sub}
      </div>
      <div className="t-small">{hint}</div>
      {sparkline}
    </button>
  );
}

export function Header({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="col gap-3">
      <span className="t-eyebrow accent">{eyebrow}</span>
      <h1 className="t-h1" style={{ margin: 0 }}>
        {title}
      </h1>
      <p className="t-body" style={{ margin: 0, maxWidth: 560 }}>
        {sub}
      </p>
    </div>
  );
}
