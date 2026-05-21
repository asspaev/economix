import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthApiError } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { AuthShell } from "../components/AuthShell";
import { Field } from "../components/Field";
import { PasswordInput } from "../components/PasswordInput";

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = login.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn({ username: login.trim(), password });
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof AuthApiError ? err.message : "Не удалось войти. Попробуйте ещё раз.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Вход"
      title="С возвращением"
      subtitle="Войдите, чтобы продолжить работу со своими снапшотами и планом."
    >
      <form className="col gap-4" onSubmit={submit}>
        <Field label="Логин">
          <input
            className="input"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Введите логин"
            autoComplete="username"
            autoFocus
          />
        </Field>

        <Field label="Пароль">
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Введите пароль"
            autoComplete="current-password"
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
          {submitting ? "Входим…" : "Войти"}
        </button>

        <div className="row" style={{ alignItems: "center", gap: 12, margin: "4px 0" }}>
          <div className="hr grow" />
          <span className="t-small dim" style={{ fontSize: 12, letterSpacing: "0.04em" }}>
            или
          </span>
          <div className="hr grow" />
        </div>

        <Link to="/register" className="btn btn--lg" style={{ width: "100%", textDecoration: "none" }}>
          Создать аккаунт
        </Link>
      </form>
    </AuthShell>
  );
}
