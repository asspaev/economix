import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthApiError } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { AuthShell } from "../components/AuthShell";
import { Field } from "../components/Field";
import { PasswordInput } from "../components/PasswordInput";

export function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [login, setLogin] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pwdMatch = pwd.length > 0 && pwd === pwd2;
  const pwdMismatch = pwd2.length > 0 && pwd !== pwd2;
  const canSubmit = login.trim().length > 0 && pwd.length >= 6 && pwdMatch && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signUp({ username: login.trim(), password: pwd });
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof AuthApiError ? err.message : "Не удалось создать аккаунт. Попробуйте ещё раз.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const strength = (() => {
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 10) s++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
    if (/\d/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return Math.min(s, 4);
  })();
  const strengthLabel = ["Слабый", "Слабый", "Средний", "Хороший", "Сильный"][strength];
  const strengthColor = ["var(--fg-4)", "var(--danger)", "#E6B144", "var(--accent)", "var(--success)"][strength];

  return (
    <AuthShell
      eyebrow="Регистрация"
      title="Создайте аккаунт"
      subtitle="Сохраняйте снапшоты, следите за капиталом и сравнивайте план с фактом."
    >
      <form className="col gap-4" onSubmit={submit}>
        <Field label="Логин" hint="Латиница, цифры и _ — без пробелов">
          <input
            className="input"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value.replace(/\s+/g, ""))}
            placeholder="Введите логин"
            autoComplete="username"
            autoFocus
          />
        </Field>

        <Field
          label="Пароль"
          right={
            pwd.length > 0 ? (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: strengthColor,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {strengthLabel}
              </span>
            ) : null
          }
        >
          <PasswordInput
            value={pwd}
            onChange={setPwd}
            placeholder="Минимум 6 символов"
            autoComplete="new-password"
          />
          <div className="row gap-1" style={{ marginTop: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 999,
                  background: i < strength ? strengthColor : "var(--bg-3)",
                  transition: "background 160ms ease",
                  boxShadow: i < strength ? "0 0 8px rgba(255,232,10,0.25)" : "none",
                }}
              />
            ))}
          </div>
        </Field>

        <Field
          label="Повторите пароль"
          right={
            pwdMismatch ? (
              <span
                className="mono neg"
                style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                не совпадает
              </span>
            ) : pwdMatch ? (
              <span
                className="mono pos"
                style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                совпадает
              </span>
            ) : null
          }
        >
          <PasswordInput
            value={pwd2}
            onChange={setPwd2}
            placeholder="Ещё раз тот же пароль"
            autoComplete="new-password"
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="t-small"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--r-md)",
              background: "var(--danger-dim)",
              border: "1px solid rgba(255,106,92,0.35)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn--primary btn--lg"
          aria-disabled={!canSubmit}
          style={{ marginTop: 8, width: "100%", cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {submitting ? "Создаём…" : "Создать аккаунт"}
        </button>

        <Link
          to="/login"
          className="btn btn--ghost"
          style={{ width: "100%", height: 40, textDecoration: "none" }}
        >
          У меня уже есть аккаунт
        </Link>
      </form>
    </AuthShell>
  );
}
