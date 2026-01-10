import { useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { getUsdtToBtcQuotes, type Quote } from "../lib/trocador";

export default function DcaBuysAdmin() {
  const { user } = useAuth();
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [amount, setAmount] = useState<string>("");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [preferNoKyc, setPreferNoKyc] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string>("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesError, setQuotesError] = useState<string>("");
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  const allowed = useMemo(() => Boolean(user?.isAdmin), [user]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">
        Not found.
      </div>
    );
  }

  const sortedQuotes = useMemo(() => {
    const data = Array.isArray(quotes) ? quotes : [];
    const copy = data.slice();
    copy.sort((a, b) => {
      if (preferNoKyc) {
        const aKyc = a.kycRequired ? 1 : 0;
        const bKyc = b.kycRequired ? 1 : 0;
        if (aKyc !== bKyc) {
          return aKyc - bKyc;
        }
        const aPrivacy = a.privacyScore ?? 0;
        const bPrivacy = b.privacyScore ?? 0;
        if (aPrivacy !== bPrivacy) {
          return bPrivacy - aPrivacy;
        }
      }
      return (b.estimatedBtc ?? 0) - (a.estimatedBtc ?? 0);
    });
    return copy;
  }, [preferNoKyc, quotes]);

  const handleGetBestOptions = async () => {
    setSavedMessage("");
    setQuotesError("");
    setSelectedQuote(null);
    setQuotesLoading(true);
    const parsedAmount = Number.parseFloat(amount || "0");
    const amountUsdt = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const data = await getUsdtToBtcQuotes({
      amountUsdt,
      preferPrivacy: preferNoKyc,
    });
    const nextQuotes = Array.isArray(data) ? data : [];
    setQuotes(nextQuotes);
    if (nextQuotes.length === 0) {
      setQuotesError("No quotes available right now. Please try again.");
    }
    setQuotesLoading(false);
  };

  const handleSaveDraft = () => {
    setSavedMessage("Saved (draft).");
  };

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
            Tools
          </p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Bitcoin DCA Buys (Draft)</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Draft-only configuration for USDT → BTC DCA plans.
          </p>
        </header>

        <section className="rounded-2xl border border-amber-200/70 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-100">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">
            Security notice
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Never enter seed phrases.</li>
            <li>Verify BTC address carefully.</li>
            <li>Draft/admin-only.</li>
            <li>BTC is volatile; DCA isn’t guaranteed profit.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <form className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200" htmlFor="dca-frequency">
                Frequency
              </label>
              <select
                id="dca-frequency"
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={frequency}
                onChange={(event) =>
                  setFrequency((event.target.value as "daily" | "weekly" | "monthly") ?? "weekly")
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200" htmlFor="dca-amount">
                Amount (USDT)
              </label>
              <input
                id="dca-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={amount}
                onChange={(event) => setAmount(event.target.value ?? "")}
                placeholder="e.g. 250"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200" htmlFor="dca-destination">
                Destination BTC address
              </label>
              <input
                id="dca-destination"
                type="text"
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value ?? "")}
                placeholder="bc1..."
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand/40 dark:border-neutral-700"
                  checked={preferNoKyc}
                  onChange={(event) => setPreferNoKyc(Boolean(event.target.checked))}
                />
                Prefer no-KYC / best privacy exchanges
              </label>
              <label className="inline-flex items-center gap-3 text-sm text-neutral-400 dark:text-neutral-500">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand/40 dark:border-neutral-700"
                  disabled
                />
                Fiat → BTC (coming soon)
              </label>
            </div>

            <div className="rounded-lg border border-dashed border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Pair: USDT → BTC only (v1)
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleGetBestOptions}
                disabled={quotesLoading}
                className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
              >
                {quotesLoading ? "Loading…" : "Get Best Options"}
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-700 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              >
                Save Plan (Draft)
              </button>
            </div>

            {savedMessage ? (
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {savedMessage}
              </p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Best exchange options</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
              USDT → BTC only
            </p>
          </div>

          {quotesError ? (
            <p className="mt-4 text-sm text-rose-500">{quotesError}</p>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.18em] text-neutral-500 dark:bg-neutral-950/60 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Estimated BTC</th>
                  <th className="px-4 py-3">Fees</th>
                  <th className="px-4 py-3">KYC</th>
                  <th className="px-4 py-3">Privacy</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {(Array.isArray(sortedQuotes) ? sortedQuotes : []).map((quote) => (
                  <tr key={quote.providerId} className="text-neutral-700 dark:text-neutral-200">
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                      {quote.providerName}
                    </td>
                    <td className="px-4 py-3">{quote.estimatedBtc.toFixed(8)}</td>
                    <td className="px-4 py-3">{quote.feeText ?? "—"}</td>
                    <td className="px-4 py-3">
                      {quote.kycRequired == null ? "—" : quote.kycRequired ? "Required" : "No KYC"}
                    </td>
                    <td className="px-4 py-3">{quote.privacyScore ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedQuote(quote)}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-700 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedQuotes.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-neutral-500" colSpan={6}>
                      Run “Get Best Options” to see available exchanges.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {selectedQuote ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-200">
              Selected provider
            </h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p>
                <span className="font-semibold">Provider:</span> {selectedQuote.providerName}
              </p>
              <p>
                <span className="font-semibold">Estimated BTC:</span>{" "}
                {selectedQuote.estimatedBtc.toFixed(8)}
              </p>
              <p>
                <span className="font-semibold">Fees:</span> {selectedQuote.feeText ?? "—"}
              </p>
              <p>
                <span className="font-semibold">KYC:</span>{" "}
                {selectedQuote.kycRequired == null
                  ? "Unknown"
                  : selectedQuote.kycRequired
                    ? "Required"
                    : "No KYC"}
              </p>
              <p>
                <span className="font-semibold">Privacy score:</span>{" "}
                {selectedQuote.privacyScore ?? "—"}
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
