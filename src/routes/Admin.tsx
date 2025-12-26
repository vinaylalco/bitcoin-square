import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchAllCommissions, type Commission } from "../api/commissions";
import { useAuth } from "../context/AuthContext";

function formatBtc(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

interface GroupedTotal {
  referrerId: string;
  totalBtc: number;
}

export default function Admin() {
  const { user } = useAuth();

  const { data, isLoading, isError, error } = useQuery<Commission[]>({
    queryKey: ["admin-commissions"],
    queryFn: fetchAllCommissions,
    enabled: Boolean(user?.isAdmin),
  });

  if (!user) {
    return <Navigate to="/membership?view=login" replace />;
  }

  if (!user.isAdmin) {
    return (
      <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
              Admin Area
            </p>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Access Restricted</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">You need admin access to view commissions.</p>
          </header>
        </main>
      </div>
    );
  }

  const commissions = data ?? [];

  const groupedTotals = useMemo(() => {
    const accumulator = new Map<string, number>();

    commissions.forEach((commission) => {
      const key = commission.referrerId != null ? String(commission.referrerId) : "unknown";
      const amount = commission.amountBtc ?? 0;
      accumulator.set(key, (accumulator.get(key) ?? 0) + amount);
    });

    return Array.from(accumulator.entries()).map(([referrerId, totalBtc]) => ({
      referrerId,
      totalBtc,
    }));
  }, [commissions]);

  const handleExport = () => {
    const exportableTotals = groupedTotals.filter((row) => row.totalBtc > 0);
    if (exportableTotals.length === 0) return;

    const header = "referrerId,totalBtc";
    const rows = exportableTotals.map((row) => `${JSON.stringify(row.referrerId)},${row.totalBtc}`);
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "referral-commissions.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">Admin Dashboard</p>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Commission Oversight</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">Review and export all referral commissions.</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
          >
            Export CSV
          </button>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Grouped Totals</h2>
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
                  <th className="px-3 py-2">Referrer ID</th>
                  <th className="px-3 py-2">Total BTC</th>
                </tr>
              </thead>
              <tbody>
                {groupedTotals.length === 0 && !isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-neutral-600 dark:text-neutral-300" colSpan={2}>
                      No commissions found.
                    </td>
                  </tr>
                ) : (
                  groupedTotals.map((group: GroupedTotal) => (
                    <tr key={group.referrerId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                      <td className="px-3 py-3 font-medium text-neutral-900 dark:text-white">{group.referrerId}</td>
                      <td className="px-3 py-3">{formatBtc(group.totalBtc)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">All Commissions</h2>
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
                  <th className="px-3 py-2">Amount (BTC)</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Referrer ID</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 && !isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-neutral-600 dark:text-neutral-300" colSpan={6}>
                      No commission records available.
                    </td>
                  </tr>
                ) : (
                  commissions.map((commission) => (
                    <tr key={commission.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                      <td className="px-3 py-3 font-medium text-neutral-900 dark:text-white">{commission.orderId || "--"}</td>
                      <td className="px-3 py-3">{commission.type || "--"}</td>
                      <td className="px-3 py-3">{formatBtc(commission.amountBtc ?? 0)}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {commission.status ?? "--"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{commission.referrerId != null ? commission.referrerId : "--"}</td>
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
