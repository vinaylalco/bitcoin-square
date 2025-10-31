import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMembership } from "../hooks/useMembership";
import { readMembershipEmail } from "../utils/membershipStorage";

type ProtectedRouteProps = {
  children?: React.ReactNode;
  loadingFallback?: React.ReactNode;
};

function resolveMembershipEmail(candidateUserEmail: string | undefined): string {
  const normalizedUserEmail = candidateUserEmail?.trim();
  if (normalizedUserEmail) {
    return normalizedUserEmail;
  }
  return readMembershipEmail();
}

export default function ProtectedRoute({
  children,
  loadingFallback,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { user } = useAuth();
  const membershipEmail = resolveMembershipEmail(user?.email);
  const membershipQuery = useMembership(membershipEmail);

  const isChecking =
    membershipEmail.length > 0 &&
    (membershipQuery.isLoading || membershipQuery.isFetching || membershipQuery.isRefetching);

  if (!membershipEmail) {
    return <Navigate to="/membership" replace state={{ from: location }} />;
  }

  if (isChecking) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-16 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">
        Checking membership…
      </div>
    );
  }

  if (membershipQuery.isError || !membershipQuery.isSubscribed) {
    return <Navigate to="/membership" replace state={{ from: location }} />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
