import React from "react";
import { isRouteErrorResponse, useRouteError, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function RouteError() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isCommunityPath = (path: string) => path.startsWith("/community");
  const shouldSuppress =
    import.meta.env.VITE_SILENT_BOOT_ERRORS === "true" && !isCommunityPath(pathname);

  if (shouldSuppress) {
    return (
      <div className="flex w-full items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--fg-muted)]" aria-hidden />
      </div>
    );
  }

  const err = useRouteError() as any;
  const isResp = isRouteErrorResponse(err);
  const status = isResp ? err.status : 500;
  const title = isResp ? (err.statusText || "Error") : "Something went wrong";
  const message =
    (isResp ? (err.data?.message || "") : (err?.message || "")) ||
    "Please try again.";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Oops!</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {status} — {title}
        </p>
        <p className="mb-6">{String(message)}</p>

        {import.meta.env.DEV && err && (
          <pre className="text-xs overflow-auto p-3 rounded bg-neutral-100 dark:bg-neutral-800 mb-4">
            {JSON.stringify(err, null, 2)}
          </pre>
        )}

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
