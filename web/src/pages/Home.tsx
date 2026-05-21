import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";

export function Home() {
  const { user, signOut } = useAuth();

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
        <button type="button" className="btn" onClick={signOut}>
          Выйти
        </button>
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
        <div className="anim-fade-up" style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <h1 className="t-h1" style={{ margin: 0 }}>
            Привет, {user?.username}
          </h1>
          <p className="t-body muted" style={{ marginTop: 12 }}>
            Аккаунт активен. Здесь будет ваш дашборд.
          </p>
        </div>
      </main>
    </div>
  );
}
