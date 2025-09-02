import React, { useEffect, useState } from "react";
import { useRole } from "../../hooks/useRole";

/**
 * CMSGate
 * - Assumes parent route is wrapped by <RequireAdmin />.
 * - Still reads role to know when it's resolved (so we don't start loading data too early).
 * - Preloads the page data, shows ONE skeleton during that time.
 * - Renders the page content ONCE, after both role + data are ready, to avoid flicker.
 */
export default function CMSGate<T>({
  loader,
  render,
  skeleton,
}: {
  loader: () => Promise<T>;
  render: (data: T) => JSX.Element;
  skeleton?: React.ReactNode;
}) {
  const { loading: roleLoading, role } = useRole();
  const [data, setData] = useState<T | null>(null);
  const [pending, setPending] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (roleLoading) return; // wait for role
      if (role !== "admin") return; // RequireAdmin will redirect; just don't load data here
      try {
        setPending(true);
        const res = await loader();
        if (!alive) return;
        setData(res);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || String(e));
      } finally {
        if (alive) setPending(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [roleLoading, role, loader]);

  if (roleLoading || pending) {
    return (
      <div className="p-6 space-y-4">
        {/* single consistent skeleton */}
        {skeleton ?? (
          <>
            <div className="h-6 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-10 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-64 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
          </>
        )}
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6">
        <p className="text-brand font-medium">Failed to load CMS data.</p>
        <p className="text-sm opacity-70 mt-1">{err}</p>
      </div>
    );
  }

  // At this point role is admin and data is ready — mount editor ONCE
  return render(data as T);
}
