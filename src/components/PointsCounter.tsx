import React from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { usePoints } from "../context/PointsContext";
import { useAuth } from "../context/AuthContext";

export default function PointsCounter() {
  const { points } = usePoints();
  const { user } = useAuth();

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 hidden md:flex">
      <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Points
          </span>
          <span className="text-xl font-bold text-neutral-900 dark:text-neutral-50" aria-live="polite">
            {points}
          </span>
        </div>
        {user ? (
          <Link
            to="/dashboard"
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Dashboard
          </Link>
        ) : (
          <Link
            to="/login"
            className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Log in to save
          </Link>
        )}
      </div>
    </div>
  );
}
