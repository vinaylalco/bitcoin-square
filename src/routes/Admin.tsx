import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  exportCommissionReport,
  fetchAllCommissions,
  type Commission,
} from "../api/commissions";
import { useAuth } from "../context/AuthContext";
import { StrapiConfigError } from "../api/strapi-client";

function formatBtc(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

function formatOptionalNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return value.toLocaleString();
}

function formatCurrencyAmount(amount?: number | null, currency?: string | null): string {
  if (amount == null || Number.isNaN(amount)) {
    return "--";
  }
  if (currency && currency.trim()) {
    return `${amount.toLocaleString()} ${currency.trim()}`;
  }
  return amount.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;

  const encodedMatch = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return encodedMatch[1].trim().replace(/^"|"$/g, "");
    }
  }

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface GroupedTotal {
  referrerId: string;
  totalBtc: number;
}

export default function Admin() {
  const { user } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<{
    exported: number;
    missingAddress: number;
    zeroAmount: number;
    skippedStatus: number;
    hasDiagnostics: boolean;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExport = async () => {
    setExportError(null);
    setExportSummary(null);
    setIsExporting(true);

    try {
      const response = await exportCommissionReport({
        status: "pending",
        format: "nowpayments",
      });

      if (response.status === 401) {
        setExportError("Your session expired. Please log in again.");
        return;
      }

      if (response.status === 403) {
        setExportError("You must be an admin to export commissions.");
        return;
      }

      if (!response.ok) {
        setExportError(`Export failed with status ${response.status}.`);
        return;
      }

      const exportedHeader = response.headers.get("X-Exported-Rows");
      const missingAddressHeader = response.headers.get("X-Skipped-Missing-Address");
      const zeroAmountHeader = response.headers.get("X-Skipped-Zero-Amount");
      const skippedStatusHeader = response.headers.get("X-Skipped-Status");
      const exported = Number(exportedHeader ?? "0");
      const missingAddress = Number(missingAddressHeader ?? "0");
      const zeroAmount = Number(zeroAmountHeader ?? "0");
      const skippedStatus = Number(skippedStatusHeader ?? "0");
      const hasDiagnostics =
        exportedHeader !== null ||
        missingAddressHeader !== null ||
        zeroAmountHeader !== null ||
        skippedStatusHeader !== null;
      setExportSummary({
        exported,
        missingAddress,
        zeroAmount,
        skippedStatus,
        hasDiagnostics,
      });

      const blob = await response.blob();
      const fallbackDate = new Date().toISOString().split("T")[0];
      const filename =
        parseContentDispositionFilename(response.headers.get("content-disposition")) ??
        `nowpayments_payouts_${fallbackDate}.csv`;

      downloadBlob(blob, filename);
    } catch (error) {
      if (error instanceof StrapiConfigError) {
        setExportError(error.message);
        return;
      }
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
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
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
        </header>
        {exportError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {exportError}
          </div>
        )}
        {exportSummary && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              exportSummary.exported === 0 &&
              (exportSummary.missingAddress +
                exportSummary.zeroAmount +
                exportSummary.skippedStatus >
                0 ||
                !exportSummary.hasDiagnostics)
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
            }`}
          >
            <p className="font-semibold">
              Exported {exportSummary.exported} payouts.
            </p>
            {exportSummary.missingAddress +
              exportSummary.zeroAmount +
              exportSummary.skippedStatus >
              0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {exportSummary.missingAddress > 0 && (
                  <li>
                    Skipped {exportSummary.missingAddress} payout
                    {exportSummary.missingAddress === 1 ? "" : "s"} missing an
                    address.
                  </li>
                )}
                {exportSummary.zeroAmount > 0 && (
                  <li>
                    Skipped {exportSummary.zeroAmount} payout
                    {exportSummary.zeroAmount === 1 ? "" : "s"} with zero amount.
                  </li>
                )}
                {exportSummary.skippedStatus > 0 && (
                  <li>
                    Skipped {exportSummary.skippedStatus} payout
                    {exportSummary.skippedStatus === 1 ? "" : "s"} due to status.
                  </li>
                )}
              </ul>
            )}
            {exportSummary.exported === 0 && !exportSummary.hasDiagnostics && (
              <p className="mt-2 text-sm">
                No export diagnostics were returned. Check the selected status or
                filters and try again.
              </p>
            )}
          </div>
        )}

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
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Commission Rate</th>
                  <th className="px-3 py-2">Commission Amount</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Referrer ID</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 && !isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-neutral-600 dark:text-neutral-300" colSpan={12}>
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
                        {formatCurrencyAmount(commission.paidAmount, commission.paidCurrency)}
                      </td>
                      <td className="px-3 py-3">{formatOptionalNumber(commission.commissionRate)}</td>
                      <td className="px-3 py-3">
                        {formatCurrencyAmount(
                          commission.commissionAmount,
                          commission.commissionCurrency,
                        )}
                      </td>
                      <td className="px-3 py-3">{formatOptionalNumber(commission.commissionLevel)}</td>
                      <td className="px-3 py-3">{commission.commissionTierAtCreation || "--"}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {commission.status ?? "--"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{commission.referrerId != null ? commission.referrerId : "--"}</td>
                      <td className="px-3 py-3">{formatDate(commission.createdAt)}</td>
                      <td className="px-3 py-3">
                        <details className="text-xs text-neutral-600 dark:text-neutral-300">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                            View
                          </summary>
                          <dl className="mt-2 space-y-1">
                            <div>
                              <dt className="uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Paid</dt>
                              <dd>{formatCurrencyAmount(commission.paidAmount, commission.paidCurrency)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Commission Rate</dt>
                              <dd>{formatOptionalNumber(commission.commissionRate)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Commission Amount</dt>
                              <dd>{formatCurrencyAmount(commission.commissionAmount, commission.commissionCurrency)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Level</dt>
                              <dd>{formatOptionalNumber(commission.commissionLevel)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Tier</dt>
                              <dd>{commission.commissionTierAtCreation || "--"}</dd>
                            </div>
                          </dl>
                        </details>
                      </td>
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
