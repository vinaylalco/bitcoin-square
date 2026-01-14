import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--fg-default)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent-red)]">
            Miner Quote
          </div>
          <nav aria-label="Primary">
            <NavLink
              to="/tools/miner-quote"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--accent-red)] text-white"
                    : "border border-[var(--border-subtle)] text-[var(--fg-default)] hover:bg-[var(--bg-elevated)]"
                }`
              }
            >
              {t("nav.minerQuotation", { defaultValue: "Miner Quote" })}
            </NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
