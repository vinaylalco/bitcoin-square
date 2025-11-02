import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMembershipStatusByEmail } from "../api/membership";

export function useMembership(email: string) {
  const sanitizedEmail = useMemo(() => email.trim(), [email]);

  const query = useQuery({
    queryKey: ["membership-status", sanitizedEmail],
    queryFn: () => fetchMembershipStatusByEmail(sanitizedEmail),
    enabled: sanitizedEmail.length > 0,
    refetchInterval: (currentQuery) => {
      const isActive = currentQuery.state.data?.isActive;
      return isActive ? false : 15_000;
    },
    refetchIntervalInBackground: true,
  });

  return {
    ...query,
    membership: query.data ?? null,
    isSubscribed: query.data?.isActive ?? false,
    normalizedEmail: sanitizedEmail,
  };
}
