import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Instagram } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import { useAuth } from "../context/AuthContext";
import { useLessonPlans } from "../hooks/useLessonPlans";
import { resolveLocale } from "../utils/locale";

export default function Footer() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();

  const isAdmin = Boolean(user?.isAdmin);
  const isAuthenticated = Boolean(user);

  const isCommunityRoute = /^\/community(?:\/|$)/i.test(location.pathname);
  const locale = resolveLocale(i18n.language);
  const lessonPlanLocale = locale === "es" || locale === "id" ? locale : "en";
  const {
    data: lessonPlans,
    isLoading: lessonPlansLoading,
    isError: lessonPlansError,
  } = useLessonPlans(lessonPlanLocale);
  const educationMenu = useMemo(() => {
    const normalized = (lessonPlans ?? [])
      .map((course) => {
        const rawSlug =
          course.slug || course.documentId || (course.id != null ? String(course.id) : "");
        const slug = rawSlug ? String(rawSlug).replace(/^\/+/, "") : "";
        if (!slug) return null;

        const label = course.title?.trim() || slug.replace(/-/g, " ");

        return {
          label,
          to: `/education/${slug}`,
        };
      })
      .filter((item): item is { label: string; to: string } => Boolean(item));

    if (normalized.length > 0) {
      return {
        items: normalized,
        status: "ready" as const,
      };
    }

    if (lessonPlansLoading) {
      return { items: [], status: "loading" as const };
    }

    if (lessonPlansError) {
      return { items: [], status: "empty" as const };
    }

    return { items: [], status: "empty" as const };
  }, [lessonPlans, lessonPlansError, lessonPlansLoading]);

  const educationItems = Array.isArray(educationMenu.items) ? educationMenu.items : [];

  if (isCommunityRoute) {
    return null;
  }

  return (
    <footer className="mt-16 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 text-center text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] sm:px-6">
        <nav className="flex flex-wrap justify-center gap-4 sm:gap-6">
          <NavLink to="/" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.home")}
          </NavLink>
          <NavLink to="/education" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.education")}
          </NavLink>
          {educationItems.length > 0 ? (
            educationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }
              >
                {item.label}
              </NavLink>
            ))
          ) : (
            <span className="text-[var(--fg-muted)]">
              {educationMenu.status === "loading" ? "Loading..." : "No lessons available"}
            </span>
          )}
          <NavLink to="/newsletter" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.newsletter")}
          </NavLink>
          <NavLink to="/community" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.community")}
          </NavLink>
          <NavLink to="/shop" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.shop")}
          </NavLink>
          {!isAuthenticated ? (
            <NavLink to="/membership" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
              {t("nav.membership")}
            </NavLink>
          ) : null}
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.settings")}
          </NavLink>
          <NavLink to="/tools/miner-quote" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
            {t("nav.minerQuotation")}
          </NavLink>
          <NavLink
            to="/tools/btc-buying-strategies"
            className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }
          >
            BTC Buying Strategies Guide
          </NavLink>
          <NavLink
            to="/tools/btc-buying-strategies?tab=dca"
            className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }
          >
            DCA Buying BTC
          </NavLink>
          <NavLink
            to="/tools/btc-buying-strategies?tab=bulk"
            className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }
          >
            Bulk Buying BTC
          </NavLink>
          {isAdmin ? (
            <>
              <NavLink to="/affiliate" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
                {t("nav.affiliateProgram")}
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "text-brand" : "hover:text-brand") }>
                {t("nav.affiliateAdmin")}
              </NavLink>
            </>
          ) : null}
        </nav>
        <LanguageSwitcher size="sm" />
        <p className="text-[var(--fg-muted)]">
          &copy; {new Date().getFullYear()} Bitcoin Square. {t("app.brandTagline")}
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://www.tiktok.com/@elbitcoiner"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] transition hover:border-brand hover:bg-brand/10"
          >
            <svg className="h-5 w-5 text-[var(--fg-default)] dark:text-white" fill="currentColor" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.656 1.029c1.637-.025 3.262-.012 4.886-.025.054 2.031.878 3.859 2.189 5.213 1.411 1.271 3.247 2.095 5.271 2.235v5.036c-1.912-.048-3.71-.489-5.331-1.247-.784-.377-1.447-.764-2.077-1.196v10.934c-.103 1.853-.719 3.543-1.707 4.954-1.652 2.366-4.328 3.919-7.371 4.011-.123.006-.268.009-.414.009-1.73 0-3.347-.482-4.725-1.319-2.508-1.509-4.238-4.091-4.558-7.094-.025-.625-.037-1.25-.012-1.862.49-4.779 4.494-8.476 9.361-8.476.547 0 1.083.047 1.604.136.025 1.849-.05 3.699-.05 5.548-.423-.153-.911-.242-1.42-.242-1.868 0-3.457 1.194-4.045 2.861-.133.427-.21.918-.21 1.426 0 .206.013.41.037.61.332 2.046 2.086 3.59 4.201 3.59.061 0 .121-.001.181-.004 1.463-.044 2.733-.831 3.451-1.994.267-.372.45-.822.511-1.311.125-2.237.075-4.461.087-6.698.012-5.036-.012-10.06.025-15.083z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com/elbitcoiner"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] transition hover:border-brand hover:bg-brand/10"
          >
            <Instagram className="h-5 w-5" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </footer>
  );
}
