import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface AdminOnlyProps {
  children: ReactNode;
}

export default function AdminOnly({ children }: AdminOnlyProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/membership?view=login" replace />;
  }

  if (!user.isAdmin) {
    return (
      <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
              Admin Area
            </p>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Access Restricted</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              You need admin access to view this page.
            </p>
          </header>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
