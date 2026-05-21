import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { accessToken, onboardingRequired } = useAuth();
  if (accessToken) {
    return <Navigate to={onboardingRequired ? "/onboarding" : "/"} replace />;
  }
  return <>{children}</>;
}

export function RequireOnboardingComplete({ children }: { children: ReactNode }) {
  const { onboardingRequired } = useAuth();
  if (onboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function RedirectIfOnboarded({ children }: { children: ReactNode }) {
  const { onboardingRequired } = useAuth();
  if (!onboardingRequired) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
