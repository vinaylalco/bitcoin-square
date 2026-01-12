import { type ReactNode } from "react";
import { useIsFetching } from "@tanstack/react-query";

interface PageDataGateProps {
  children: ReactNode;
}

export default function PageDataGate({ children }: PageDataGateProps) {
  const isLoading = useIsFetching({
    predicate: (query) =>
      query.state.status === "pending" &&
      query.state.fetchStatus === "fetching" &&
      query.state.data === undefined,
  });

  if (isLoading > 0) {
    return (
      <div className="flex w-full items-center justify-center py-16 text-sm text-[var(--fg-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
