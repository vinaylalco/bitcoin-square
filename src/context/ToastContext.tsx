import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastTone = "info" | "success" | "error";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ShowToastOptions {
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

const toneClasses: Record<ToastTone, string> = {
  info: "bg-[var(--bg-card)] text-[var(--fg-default)] border-[var(--border-subtle)]",
  success: "bg-emerald-500/90 text-white border-emerald-400/80",
  error: "bg-rose-500/95 text-white border-rose-400/80",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      setToasts((current) => {
        const id = crypto.randomUUID?.() ?? `toast-${Math.random().toString(36).slice(2)}`;
        const tone = options?.tone ?? "info";
        const duration = options?.durationMs ?? DEFAULT_DURATION;
        const nextToast: ToastItem = {
          id,
          message,
          tone,
        };
        const timerHost: Pick<typeof globalThis, "setTimeout"> =
          typeof window !== "undefined" ? window : globalThis;
        timerHost.setTimeout(() => removeToast(id), Math.max(2000, duration));
        return [...current, nextToast];
      });
    },
    [removeToast],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[999] flex justify-center px-4 sm:px-6">
        <div className="flex w-full max-w-md flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${toneClasses[toast.tone]}`}
              role="status"
              aria-live="polite"
            >
              <div className="flex-1">{toast.message}</div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)] transition hover:text-[var(--fg-default)]"
              >
                Close
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
