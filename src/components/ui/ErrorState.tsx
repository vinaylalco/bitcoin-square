import React, { type ReactNode } from "react";

const defaultActionLabel = "Retry";

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  actionLabel?: string;
  children?: ReactNode;
};

export default function ErrorState({
  message,
  onRetry,
  actionLabel = defaultActionLabel,
  children,
}: ErrorStateProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <p className="text-brand">{message}</p>
      {(onRetry || children) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
            >
              {actionLabel}
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
