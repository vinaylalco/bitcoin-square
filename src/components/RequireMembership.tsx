import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  extractGrandfatheredFlag,
  normalizeMembershipStatus,
} from "../utils/membership";
import { useCurrentUserMembership } from "../hooks/useCurrentUserMembership";

interface RequireMembershipProps {
  children: ReactNode;
}

export default function RequireMembership({
  children,
}: RequireMembershipProps) {
  const { token } = useAuth();
  const location = useLocation();
  const membershipQuery = useCurrentUserMembership({
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <Navigate
        to="/membership"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  }

  const { me, loading, error } = membershipQuery;

  const membershipStatus = normalizeMembershipStatus(me);
  const grandfathered =
    extractGrandfatheredFlag(
      me?.["grandfathered"] ?? me?.["isGrandfathered"],
    ) || extractGrandfatheredFlag(me?.["membership"]);

  const hasNostrPublicKey =
    typeof me?.nostrPublicKey === "string" && me.nostrPublicKey.trim().length > 0;

  const allowAccess =
    grandfathered || (membershipStatus.isActive && hasNostrPublicKey);
  const stillLoading = loading && !error;

  if (stillLoading) {
    return (
      <div className="flex w-full items-center justify-center py-16 text-sm text-[var(--fg-muted)]">
        Checking membership…
      </div>
    );
  }

  if (error) {
    return <Navigate to="/membership" replace />;
  }

  if (!allowAccess) {
    return <Navigate to="/membership" replace />;
  }

  return <>{children}</>;
}
