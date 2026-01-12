import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface RequireLoginProps {
  children: ReactNode;
  redirectTo: string;
}

export default function RequireLogin({
  children,
  redirectTo,
}: RequireLoginProps) {
  const { user, token } = useAuth();
  const location = useLocation();

  const authLoading = Boolean(token) && !user;

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-16 text-sm text-[var(--fg-muted)]">
        Checking sign-in…
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <Navigate
      to={redirectTo}
      replace
      state={{ from: location.pathname + location.search + location.hash }}
    />
  );
}
