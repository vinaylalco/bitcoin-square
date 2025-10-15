import React, { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, Zap, X } from "lucide-react";

import type { ProfileSummary } from "../../context/ProfileIdentityContext";
import {
  buildLightningUri,
  isBolt11,
  isLightningAddress,
  isLnurl,
} from "../../utils/zap";
import { recordTipAttempt } from "../../utils/analytics";

interface ManualTipDialogProps {
  open: boolean;
  context: "feed" | "chat";
  summary: ProfileSummary | null;
  snippet?: string | null;
  onClose: () => void;
}

const ManualTipDialog: React.FC<ManualTipDialogProps> = ({
  open,
  context,
  summary,
  snippet,
  onClose,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const displayName = summary?.displayName ?? "this member";

  useEffect(() => {
    if (open) {
      setValue("");
      setError(null);
    }
  }, [open]);

  const isValid = useMemo(() => {
    if (!value.trim()) return false;
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith("lightning:")) {
      return true;
    }
    return isBolt11(trimmed) || isLightningAddress(trimmed) || isLnurl(trimmed);
  }, [value]);

  const helperText = isValid
    ? null
    : value.trim().length === 0
      ? "Paste an invoice or Lightning address to continue."
      : "Enter a valid BOLT11 invoice or Lightning address.";

  const handleCopy = () => {
    if (!value.trim()) return;
    void navigator.clipboard?.writeText(value.trim()).catch(() => undefined);
  };

  const handleOpenWallet = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setError("Provide a Lightning invoice or address first.");
      return;
    }

    const uri = buildLightningUri(value);
    if (!uri) {
      setError("Unable to open the provided value. Try again.");
      return;
    }

    recordTipAttempt({ context, hasEndpoint: false, action: "manual-open" });

    try {
      window.open(uri, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = uri;
    }

    setError(null);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="absolute inset-0" aria-hidden onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">Send tip</p>
              <p className="text-sm font-semibold text-[var(--fg-default)]">{displayName}</p>
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
        <form className="space-y-6 px-6 py-6" onSubmit={handleOpenWallet}>
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 text-sm text-[var(--fg-muted)]">
            <p className="font-semibold text-[var(--fg-default)]">No Lightning address found.</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
              Paste a BOLT11 invoice or provide a Lightning address to tip {displayName}. We&apos;ll open your wallet using a
              <code className="mx-1 rounded bg-[var(--bg-muted)] px-1 py-0.5 text-[10px] uppercase tracking-[0.28em] text-[var(--fg-muted)]">lightning:</code>
              link.
            </p>
            {snippet && (
              <p className="mt-3 text-xs italic text-[var(--fg-muted)]/80">Context: {snippet}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]" htmlFor="manual-tip-value">
              Lightning invoice or address
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-4 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/50">
              <input
                id="manual-tip-value"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                }}
                className="flex-1 bg-transparent text-sm text-[var(--fg-default)] focus:outline-none"
                placeholder="lnbc1… or user@domain.com"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:text-[var(--fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="sr-only">Copy</span>
                <Clipboard className="h-4 w-4" />
              </button>
            </div>
            {error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : helperText ? (
              <p className="text-xs text-[var(--fg-muted)]">{helperText}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isValid}
            >
              <ExternalLink className="mr-2 h-4 w-4" />Open in wallet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualTipDialog;
