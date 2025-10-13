import React, { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Zap, X } from "lucide-react";

import type { LnurlPayResponse, ZapEndpoint } from "../../utils/zap";
import type { ProfileSummary } from "../../context/ProfileIdentityContext";

interface ZapDialogProps {
  open: boolean;
  target: {
    context: "feed" | "chat" | "profile";
    summary: ProfileSummary;
    snippet?: string | null;
    endpoint: ZapEndpoint;
  } | null;
  stage: "select" | "paying" | "invoice" | "success" | "error";
  lnurl: LnurlPayResponse | null;
  lnurlLoading: boolean;
  amountSats?: number;
  invoice?: string | null;
  error?: string | null;
  weblnTried?: boolean;
  onClose: () => void;
  onSubmit: (amount: number, comment?: string) => void;
  onRetry: () => void;
  onMarkPaid: () => void;
}

const DEFAULT_AMOUNTS = [21, 100, 500, 1000, 5000];

const formatRange = (lnurl: LnurlPayResponse | null) => {
  if (!lnurl) return "";
  const min = Math.round(lnurl.minSendable / 1000);
  const max = Math.round(lnurl.maxSendable / 1000);
  if (min === max) {
    return `${min.toLocaleString()} sats`;
  }
  return `${min.toLocaleString()} – ${max.toLocaleString()} sats`;
};

const buildSnippet = (snippet?: string | null) => {
  if (!snippet) return null;
  const trimmed = snippet.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}…`;
};

const ZapDialog: React.FC<ZapDialogProps> = ({
  open,
  target,
  stage,
  lnurl,
  lnurlLoading,
  amountSats,
  invoice,
  error,
  weblnTried,
  onClose,
  onSubmit,
  onRetry,
  onMarkPaid,
}) => {
  const [customAmount, setCustomAmount] = useState<string>("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [comment, setComment] = useState<string>("");
  const isLnurl = target?.endpoint.type === "lnurl";

  useEffect(() => {
    if (!open) {
      setSelectedAmount(null);
      setCustomAmount("");
      setComment("");
      return;
    }
    setCustomAmount("");
    setComment("");
    const base = lnurl
      ? DEFAULT_AMOUNTS.find((value) => {
          const msats = value * 1000;
          return msats >= lnurl.minSendable && msats <= lnurl.maxSendable;
        }) ?? Math.round(lnurl.minSendable / 1000)
      : DEFAULT_AMOUNTS[0];
    setSelectedAmount(base);
  }, [open, lnurl]);

  const snippet = useMemo(() => buildSnippet(target?.snippet), [target?.snippet]);

  const amountOptions = useMemo(() => {
    if (!lnurl) return DEFAULT_AMOUNTS;
    return DEFAULT_AMOUNTS.filter((value) => {
      const msats = value * 1000;
      return msats >= lnurl.minSendable && msats <= lnurl.maxSendable;
    });
  }, [lnurl]);

  const commentAllowed = lnurl?.commentAllowed ?? 0;
  const showComment = commentAllowed > 0;
  const commentLimit = commentAllowed;

  const customAmountNumber = Number.parseFloat(customAmount);
  const isCustomValid = Number.isFinite(customAmountNumber);
  const withinRange = !lnurl
    ? customAmountNumber > 0
    : customAmountNumber * 1000 >= lnurl.minSendable && customAmountNumber * 1000 <= lnurl.maxSendable;

  const resolvedAmount =
    isCustomValid && withinRange && customAmount.length > 0 ? Math.round(customAmountNumber) : selectedAmount;

  const disableSubmit =
    !resolvedAmount ||
    (lnurlLoading && isLnurl) ||
    stage === "paying" ||
    (lnurl && (resolvedAmount * 1000 < lnurl.minSendable || resolvedAmount * 1000 > lnurl.maxSendable));

  const handleCopyInvoice = () => {
    if (!invoice) return;
    void navigator.clipboard?.writeText(invoice).catch(() => undefined);
  };

  if (!open || !target) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-8">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">Zap</p>
              <p className="text-sm font-semibold text-[var(--fg-default)]">{target.summary.displayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:text-[var(--fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="sr-only">Close</span>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-6 px-6 py-6">
          {snippet && (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 text-sm text-[var(--fg-muted)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand/70">Context</p>
              <p className="mt-2 whitespace-pre-wrap text-[var(--fg-default)]">{snippet}</p>
            </div>
          )}

          {stage === "error" && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
              <p>{error ?? "Zap failed. Try again in a moment."}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {stage === "success" && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-600">
              <p className="font-semibold text-emerald-700">Zap sent!</p>
              <p className="mt-2 text-emerald-600/80">
                Thanks for supporting {target.summary.displayName}
                {amountSats ? ` with ${amountSats.toLocaleString()} sats` : ""}.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90"
              >
                Close
              </button>
            </div>
          )}

          {stage !== "error" && stage !== "success" && (
            <>
              {isLnurl && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                      Choose amount
                    </p>
                    {lnurlLoading ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading zap options…
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {amountOptions.map((amount) => {
                          const active = resolvedAmount === amount && customAmount.length === 0;
                          return (
                            <button
                              key={amount}
                              type="button"
                              onClick={() => {
                                setSelectedAmount(amount);
                                setCustomAmount("");
                              }}
                              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                                active
                                  ? "border-brand bg-brand/10 text-brand"
                                  : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                              }`}
                            >
                              {amount.toLocaleString()} sats
                            </button>
                          );
                        })}
                        <div className="relative">
                          <input
                            type="number"
                            min={lnurl ? Math.round(lnurl.minSendable / 1000) : 1}
                            max={lnurl ? Math.round(lnurl.maxSendable / 1000) : undefined}
                            value={customAmount}
                            onChange={(event) => {
                              setCustomAmount(event.target.value);
                              setSelectedAmount(null);
                            }}
                            className="w-28 rounded-full border border-[var(--border-subtle)] bg-transparent px-3 py-1 text-sm text-[var(--fg-default)] focus:border-brand focus:outline-none"
                            placeholder="Custom"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                            sats
                          </span>
                        </div>
                      </div>
                    )}
                    {lnurl && (
                      <p className="mt-2 text-xs text-[var(--fg-muted)]">Range: {formatRange(lnurl)}</p>
                    )}
                  </div>

                  {showComment && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]" htmlFor="zap-comment">
                        Add a message
                      </label>
                      <textarea
                        id="zap-comment"
                        maxLength={commentLimit}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-2xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-[var(--fg-default)] focus:border-brand focus:outline-none"
                        placeholder="Optional note"
                      />
                      <p className="mt-1 text-right text-[11px] text-[var(--fg-muted)]">{comment.length}/{commentLimit}</p>
                    </div>
                  )}
                </div>
              )}

              {stage === "invoice" && invoice && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--fg-muted)]">
                    {weblnTried
                      ? "WebLN payment was interrupted. Copy the invoice below to pay manually."
                      : amountSats
                        ? `Pay ${amountSats.toLocaleString()} sats from your Lightning wallet.`
                        : "Copy the invoice below to pay from your Lightning wallet."}
                  </p>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-3 text-xs text-[var(--fg-muted)]">
                    <p className="break-all font-mono">{invoice}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleCopyInvoice}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy invoice
                    </button>
                    <button
                      type="button"
                      onClick={onMarkPaid}
                      className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90"
                    >
                      Mark as paid
                    </button>
                  </div>
                </div>
              )}

              {stage === "paying" && (
                <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending zap…
                </div>
              )}

              {stage === "select" && isLnurl && (
                <button
                  type="button"
                  onClick={() => resolvedAmount && onSubmit(resolvedAmount, showComment ? comment : undefined)}
                  disabled={disableSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {stage === "paying" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Send {resolvedAmount?.toLocaleString() ?? ""} sats
                </button>
              )}

              {!isLnurl && stage !== "invoice" && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-4 text-sm text-[var(--fg-muted)]">
                  <p>This note only exposes a static invoice. Copy it below to complete the zap.</p>
                  {invoice && (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-3 text-xs text-[var(--fg-muted)]">
                        <p className="break-all font-mono">{invoice}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyInvoice}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy invoice
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ZapDialog;
