import React from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

const LENGTH_ERROR_KEY = "bitcoin-square:length-error-reload-at";
const RELOAD_WINDOW_MS = 30_000;
const RELOAD_DELAY_MS = 3_000;
const LENGTH_ERROR_PATTERN =
  /reading 'length'|property 'length' of undefined/i;

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  error: Error | null;
  isLengthError: boolean;
}

class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  private reloadTimeout: number | null = null;

  private shouldSuppressRouteErrors() {
    return (
      window.location.pathname.startsWith("/tools/btc-buying-strategies")
    );
  }

  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { error: null, isLengthError: false };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    const message = String(error?.message ?? "");
    const isLengthError = LENGTH_ERROR_PATTERN.test(message);
    return { error, isLengthError };
  }

  componentDidCatch(error: Error) {
    const message = String(error?.message ?? "");
    if (!LENGTH_ERROR_PATTERN.test(message)) {
      return;
    }
    if (this.shouldSuppressRouteErrors()) {
      return;
    }
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem(LENGTH_ERROR_KEY) ?? 0);
    if (lastReload && now - lastReload < RELOAD_WINDOW_MS) {
      return;
    }
    sessionStorage.setItem(LENGTH_ERROR_KEY, String(now));
    this.reloadTimeout = window.setTimeout(() => {
      window.location.reload();
    }, RELOAD_DELAY_MS);
  }

  componentWillUnmount() {
    if (this.reloadTimeout) {
      window.clearTimeout(this.reloadTimeout);
    }
  }

  render() {
    const { error, isLengthError } = this.state;

    if (!error) {
      return this.props.children;
    }

    if (this.shouldSuppressRouteErrors()) {
      return (
        <div
          className="flex w-full items-center justify-center py-16"
          data-testid="global-error-spinner"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[var(--fg-muted)]" aria-hidden />
        </div>
      );
    }

    if (isLengthError) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
            <h1 className="text-2xl font-bold mb-2">We hit a loading hiccup</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Refreshing in a moment to fix it…
            </p>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg border dark:border-neutral-700"
                onClick={() => window.location.reload()}
              >
                Reload now
              </button>
              <Link
                to="/"
                className="px-4 py-2 rounded-lg bg-brand text-white border border-brand/70"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
            Please try again.
          </p>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg border dark:border-neutral-700"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <Link
              to="/"
              className="px-4 py-2 rounded-lg bg-brand text-white border border-brand/70"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
