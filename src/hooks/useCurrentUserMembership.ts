import {
  useQuery,
  type UseQueryOptions,
  type QueryObserverResult,
} from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { strapiFetch } from "../api/strapi-client";

interface UseCurrentUserMembershipOptions
  extends Pick<
    UseQueryOptions<Record<string, unknown>, Error>,
    "enabled" | "refetchInterval" | "refetchIntervalInBackground" | "staleTime" | "cacheTime"
  > {
  tokenOverride?: string | null;
}

interface UseCurrentUserMembershipResult {
  me: Record<string, unknown> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<
    QueryObserverResult<Record<string, unknown>, Error>
  >;
}

export function useCurrentUserMembership(
  options: UseCurrentUserMembershipOptions = {},
): UseCurrentUserMembershipResult {
  const { token: contextToken } = useAuth();
  const token = options.tokenOverride ?? contextToken;

  const query = useQuery<Record<string, unknown>, Error>({
    queryKey: ["current-user-membership", token],
    enabled: Boolean(token) && (options.enabled ?? true),
    refetchOnWindowFocus: false,
    staleTime: options.staleTime,
    cacheTime: options.cacheTime,
    refetchInterval: options.refetchInterval,
    refetchIntervalInBackground: options.refetchIntervalInBackground,
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token");
      }
      return strapiFetch<Record<string, unknown>>(
        "/api/profile?populate[0]=membership",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    },
  });

  return {
    me: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export type { UseCurrentUserMembershipResult };
