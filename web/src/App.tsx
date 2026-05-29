import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import {
  RedirectIfAuthed,
  RedirectIfOnboarded,
  RequireAuth,
  RequireOnboardingComplete,
} from "./auth/RequireAuth";
import { Analytics } from "./pages/Analytics";
import { Categories } from "./pages/Categories";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { Register } from "./pages/Register";
import { Snapshots } from "./pages/Snapshots";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <Register />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <RedirectIfOnboarded>
                  <Onboarding />
                </RedirectIfOnboarded>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <RequireOnboardingComplete>
                  <Dashboard />
                </RequireOnboardingComplete>
              </RequireAuth>
            }
          />
          <Route
            path="/categories"
            element={
              <RequireAuth>
                <RequireOnboardingComplete>
                  <Categories />
                </RequireOnboardingComplete>
              </RequireAuth>
            }
          />
          <Route
            path="/snapshots"
            element={
              <RequireAuth>
                <RequireOnboardingComplete>
                  <Snapshots />
                </RequireOnboardingComplete>
              </RequireAuth>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequireAuth>
                <RequireOnboardingComplete>
                  <Analytics />
                </RequireOnboardingComplete>
              </RequireAuth>
            }
          />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function RootRedirect() {
  return (
    <RequireAuth>
      <Navigate to="/dashboard" replace />
    </RequireAuth>
  );
}
