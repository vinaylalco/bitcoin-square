import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { strapiFetch } from "../api/strapi-client";
import {
  extractGrandfatheredFlag,
  normalizeMembershipStatus,
} from "../utils/membership";

interface RequireMembershipProps {
  children: ReactNode;
}

export default function RequireMembership({
  children,
}: RequireMembershipProps) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return (
      <Navigate
        to="/membership"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  }

  const { data, error, isLoading, isFetching } = useQuery<
    Record<string, unknown>,
    Error
  >({
    queryKey: ["require-membership", token],
    enabled: Boolean(token),
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token");
      }
      return strapiFetch<Record<string, unknown>>(
        "/api/users/me?populate[0]=membership",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    },
  });

  const membershipStatus = normalizeMembershipStatus(data?.["membership"]);
  const grandfathered =
    extractGrandfatheredFlag(
      data?.["grandfathered"] ?? data?.["isGrandfathered"],
    ) || extractGrandfatheredFlag(data?.["membership"]);

  const allowAccess = grandfathered || membershipStatus.isActive;
  const stillLoading =
    isLoading ||
    isFetching ||
    (!data && !error);

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
