import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchMyCommissions, type Commission } from "../api/commissions";
import { useAuth } from "../context/AuthContext";
import { formatCurrencyAmount } from "../utils/formatCurrency";

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function Affiliate() {
  const { user } = useAuth();

  const referralLink = user ? `https://bitcoinsquare.io/?ref=${user.id}` : "";

  const { data, isLoading, isError, error } = useQuery<Commission[]>({
    queryKey: ["commissions", "me"],
    enabled: Boolean(user),
    queryFn: () => {
      if (!user) return Promise.resolve([]);
      return fetchMyCommissions();
    },
  });

  if (!user) {
    return <Navigate to="/membership?view=login" replace />;
  }

  const commissions = data ?? [];

  const pendingTotals = useMemo(() => {
    const totals = new Map<string, number>();

    commissions.forEach((commission) => {
      if (commission.commissionStatus !== "pending") return;
      const currency = commission.commissionCurrency?.trim() || "Unknown";
      const amount = commission.commissionAmount ?? 0;
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    });

    return Array.from(totals.entries());
  }, [commissions]);

  const paidTotals = useMemo(() => {
    const totals = new Map<string, number>();

    commissions.forEach((commission) => {
      if (commission.commissionStatus !== "paid") return;
      const currency = commission.commissionCurrency?.trim() || "Unknown";
      const amount = commission.commissionAmount ?? 0;
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    });

    return Array.from(totals.entries());
  }, [commissions]);

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
              Affiliate Dashboard
            </p>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Referral Earnings</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Track your referral link and commission payouts.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Your Referral Link</p>
            <p className="break-words font-semibold text-neutral-900 dark:text-white">{referralLink}</p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Pending Total</p>
            <div className="mt-2 space-y-1">
              {pendingTotals.length === 0 ? (
                <p className="text-3xl font-semibold text-neutral-900 dark:text-white">--</p>
              ) : (
                pendingTotals.map(([currency, total]) => (
                  <p key={currency} className="text-3xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrencyAmount(total, currency)}
                  </p>
                ))
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Paid Total</p>
            <div className="mt-2 space-y-1">
              {paidTotals.length === 0 ? (
                <p className="text-3xl font-semibold text-neutral-900 dark:text-white">--</p>
              ) : (
                paidTotals.map(([currency, total]) => (
                  <p key={currency} className="text-3xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrencyAmount(total, currency)}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Commissions</h2>
            {isLoading && <span className="text-sm text-neutral-600 dark:text-neutral-300">Loading…</span>}
            {isError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {error instanceof Error ? error.message : "Unable to load commissions"}
              </span>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-neutral-700 dark:text-neutral-200">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-[0.2em] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-3 py-2">Order ID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Commission Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 && !isLoading ? (
                  <tr>
                    <td
                      className="px-3 py-4 text-center text-sm text-neutral-600 dark:text-neutral-300"
                      colSpan={5}
                    >
                      No commissions found yet.
                    </td>
                  </tr>
                ) : (
                  commissions.map((commission) => (
                    <tr
                      key={commission.id}
                      className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                    >
                      <td className="px-3 py-3 font-medium text-neutral-900 dark:text-white">
                        {commission.orderId || "--"}
                      </td>
                      <td className="px-3 py-3">{commission.type || "--"}</td>
                      <td className="px-3 py-3">
                        {formatCurrencyAmount(commission.commissionAmount, commission.commissionCurrency)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {commission.commissionStatus ?? "--"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatDate(commission.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
