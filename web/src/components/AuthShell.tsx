import type { ReactNode } from "react";

import { Logo } from "./Logo";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="bg-mesh onboarding" />

      <header
        style={{
          position: "relative",
          padding: "28px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Logo subtitle="Траектория" />
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px 96px",
          position: "relative",
        }}
      >
        <div className="anim-fade-up" style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <span
              className="chip chip--dot"
              style={{
                color: "var(--accent-2)",
                background: "var(--accent-dim)",
                borderColor: "rgba(255,232,10,0.35)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                height: 26,
              }}
            >
              {eyebrow}
            </span>
          </div>

          <h1 className="t-h1" style={{ margin: 0, textAlign: "center" }}>
            {title}
          </h1>
          {subtitle && (
            <p
              className="t-body muted"
              style={{
                margin: "12px 0 0",
                textAlign: "center",
                maxWidth: 380,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {subtitle}
            </p>
          )}

          <div className="card" style={{ marginTop: 32, padding: 28 }}>
            {children}
          </div>

          {footer && <div style={{ marginTop: 20, textAlign: "center" }}>{footer}</div>}
        </div>
      </main>
    </div>
  );
}
