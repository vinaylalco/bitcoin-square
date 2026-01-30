import React from "react";
import { Loader2 } from "lucide-react";

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const MAX_ATTEMPTS = 6;
const CHUNK_RELOAD_KEY = "did_chunk_reload";
const CHUNK_RELOAD_DELAY_MS = 1500;

export function isChunkLoadError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
    message,
  );
}

interface SilentBootBoundaryProps {
  children: React.ReactNode;
}

interface SilentBootBoundaryState {
  hasError: boolean;
  attempt: number;
  retryKey: number;
}

export default class SilentBootBoundary extends React.Component<
  SilentBootBoundaryProps,
  SilentBootBoundaryState
> {
  private retryTimeout: number | null = null;

  constructor(props: SilentBootBoundaryProps) {
    super(props);
    this.state = { hasError: false, attempt: 0, retryKey: 0 };
  }

  static getDerivedStateFromError(): Partial<SilentBootBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error(error);
    }

    if (isChunkLoadError(error)) {
      const hasReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      if (!hasReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.setTimeout(() => {
          window.location.reload();
        }, CHUNK_RELOAD_DELAY_MS);
      }
    }

    if (this.state.attempt >= MAX_ATTEMPTS) {
      return;
    }

    if (this.retryTimeout) {
      window.clearTimeout(this.retryTimeout);
    }

    const delay = Math.min(
      BASE_DELAY_MS * 2 ** this.state.attempt,
      MAX_DELAY_MS,
    );

    this.retryTimeout = window.setTimeout(() => {
      this.setState((prev) => ({
        hasError: false,
        attempt: Math.min(prev.attempt + 1, MAX_ATTEMPTS),
        retryKey: prev.retryKey + 1,
      }));
    }, delay);
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      window.clearTimeout(this.retryTimeout);
    }
  }

  render() {
    const { hasError, retryKey } = this.state;

    if (hasError) {
      return (
        <div
          className="flex w-full items-center justify-center py-16"
          data-testid="silent-boot-spinner"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[var(--fg-muted)]" aria-hidden />
        </div>
      );
    }

    return <React.Fragment key={retryKey}>{this.props.children}</React.Fragment>;
  }
}
