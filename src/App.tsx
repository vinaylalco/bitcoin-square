import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BookOpen,
  Home as HomeIcon,
  LayoutDashboard,
  Mail,
  Menu,
  Settings,
  ShoppingBag,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import FocusTrap from "./components/FocusTrap";
import { useSwipe } from "./hooks/useSwipe";
import { useTheme } from "./context/ThemeContext";
import { useAuth } from "./context/AuthContext";
import Footer from "./components/Footer";
import { cn } from "./utils/cn";
import { useLessonPlans } from "./hooks/useLessonPlans";

export default function App() {
  const [open, setOpen] = useState(false);
  const [mobileEducationOpen, setMobileEducationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const { t, i18n } = useTranslation();
  const loc = useLocation();
  useTheme(); // ensures theme context is mounted
  const { user, logout } = useAuth();

  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const { data: lessonPlans } = useLessonPlans(lang);
  const slugify = (value: unknown) =>
    `${value ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const fallbackCourseSlug = "btc-full-course";
  const btcCourseSlug = useMemo(() => {
    if (!lessonPlans?.length) return fallbackCourseSlug;
    const primaryMatch = lessonPlans.find((plan) => {
      const titleSlug = slugify(plan.title);
      const slugSlug = slugify(plan.slug);
      return (
        titleSlug === fallbackCourseSlug ||
        slugSlug === fallbackCourseSlug ||
        titleSlug.includes("btc-full-course") ||
        slugSlug.includes("btc-full-course")
      );
    });
    const btcPlan =
      primaryMatch ||
      lessonPlans.find((plan) => {
        const titleSlug = slugify(plan.title);
        const slugSlug = slugify(plan.slug);
        return titleSlug.includes("btc") || slugSlug.includes("btc");
      });
    if (!btcPlan) return fallbackCourseSlug;
    const slugFromTitle = slugify(btcPlan.title);
    const slugFromPlan = slugify(btcPlan.slug);
    return slugFromTitle || slugFromPlan || fallbackCourseSlug;
  }, [lessonPlans]);
  const changeLang = (lng: "en" | "es") => i18n.changeLanguage(lng);

  const educationChildren = [
    {
      label: t("app.btcFullCourse"),
      to: `/education/${btcCourseSlug}`,
    },
  ];

  const desktopNav = [
    { label: t("nav.home"), to: "/" },
    { label: t("nav.education"), to: "/education", dropdown: educationChildren },
    { label: t("nav.shop"), to: "/shop" },
    { label: t("nav.newsletter"), to: "/newsletter" },
    { label: t("nav.settings"), to: "/settings" },
  ];

  useEffect(() => setOpen(false), [loc.pathname]);

  useEffect(() => {
    const el = document.documentElement;
    if (open) {
      el.classList.add("overflow-hidden");
    } else {
      el.classList.remove("overflow-hidden");
    }
    return () => el.classList.remove("overflow-hidden");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useSwipe(drawerRef, {
    enabled: open,
    axis: "x",
    onMove: (dx) => {
      if (dx > 0 && drawerRef.current) {
        drawerRef.current.style.transform = `translateX(${Math.min(dx, 72)}px)`;
      }
    },
    onEnd: (dx) => {
      if (!drawerRef.current) return;
      drawerRef.current.style.transform = "";
      if (dx > 60) setOpen(false);
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--fg-default)] transition-colors duration-300">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 lg:gap-6">
            <button
              ref={triggerRef}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t("app.mobileMenu.closeAria") : t("app.mobileMenu.openAria")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-default)] shadow-sm transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link to="/" className="flex items-center gap-2">
              <span className="relative text-lg font-black uppercase tracking-[0.28em]">
                Bitcoin
                <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white">Square</span>
              </span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold uppercase tracking-[0.22em]">
            {desktopNav.map((item) => (
              <div key={item.to} className="relative group">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex items-center gap-2 py-2 transition",
                      "text-[var(--fg-muted)] hover:text-brand",
                      isActive && "text-brand",
                    )
                  }
                >
                  {item.label}
                </NavLink>
                {item.dropdown && (
                  <div className="pointer-events-none absolute top-full left-1/2 z-40 mt-3 w-56 -translate-x-1/2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 opacity-0 shadow-[var(--shadow-soft)] transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-1 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-1 group-focus-within:opacity-100">
                    {item.dropdown.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          cn(
                            "block rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] transition-colors hover:bg-brand/10 hover:text-brand",
                            isActive && "bg-brand/10 text-brand",
                          )
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {user ? (
              <>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    cn(
                      "rounded-full border border-brand/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_30px_rgba(169,21,255,0.35)]",
                      isActive && "bg-brand text-white",
                    )
                  }
                >
                  {t("nav.dashboard")}
                </NavLink>
                <button
                  onClick={logout}
                  className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] transition hover:text-brand hover:shadow-sm"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  cn(
                    "rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(169,21,255,0.35)]",
                    isActive ? "bg-brand" : "bg-gradient-to-r from-brand via-brand/90 to-[#FFF582]",
                  )
                }
              >
                {t("nav.login")}
              </NavLink>
            )}
          </div>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        ref={drawerRef}
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-80 transform border-r border-[var(--border-subtle)] bg-white text-neutral-900 shadow-[var(--shadow-soft)] transition-transform duration-300 dark:bg-black dark:text-white lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={t("app.mobileMenu.ariaLabel")}
      >
        <FocusTrap active={open} onDeactivate={() => setOpen(false)} returnFocusRef={triggerRef}>
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <span className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)] dark:text-white">
                {t("app.mobileMenu.title")}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs uppercase tracking-[0.32em] text-[var(--fg-muted)] transition hover:text-brand dark:text-white"
              >
                {t("app.mobileMenu.close")}
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-2 px-5 py-6 text-sm font-semibold uppercase tracking-[0.32em]">
              <NavLink
                to="/"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <HomeIcon className="h-5 w-5" /> {t("nav.home")}
              </NavLink>
              <div>
                <button
                  onClick={() => setMobileEducationOpen((prev) => !prev)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    mobileEducationOpen && "border-brand bg-brand/10 text-brand",
                  )}
                >
                  <span className="inline-flex items-center gap-3">
                    <BookOpen className="h-5 w-5" /> {t("nav.education")}
                  </span>
                  <span className="text-[0.65rem]">{mobileEducationOpen ? "−" : "+"}</span>
                </button>
                <div className={cn("mt-2 space-y-2 pl-10 text-[0.65rem] font-semibold", mobileEducationOpen ? "block" : "hidden")}
                >
                  {educationChildren.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-2xl border border-transparent px-3 py-2 tracking-[0.4em] text-[var(--fg-muted)] transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand dark:text-white dark:hover:text-brand",
                          isActive && "border-brand bg-brand/10 text-brand",
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
              <NavLink
                to="/shop"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <ShoppingBag className="h-5 w-5" /> {t("nav.shop")}
              </NavLink>
              <NavLink
                to="/newsletter"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <Mail className="h-5 w-5" /> {t("nav.newsletter")}
              </NavLink>
              <NavLink
                to="/settings"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <Settings className="h-5 w-5" /> {t("nav.settings")}
              </NavLink>
              {user ? (
                <>
                  <NavLink
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                        isActive && "border-brand bg-brand/10 text-brand",
                      )
                    }
                  >
                    <LayoutDashboard className="h-5 w-5" /> {t("nav.dashboard")}
                  </NavLink>
                  <button
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-left text-[var(--fg-muted)] transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                  >
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                  cn(
                    "inline-flex items-center justify-center gap-3 rounded-2xl border border-brand px-4 py-3 text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(169,21,255,0.35)]",
                    isActive ? "bg-brand" : "bg-gradient-to-r from-brand via-brand/90 to-[#FFF582]",
                  )
                  }
                >
                  {t("nav.login")}
                </NavLink>
              )}
            </nav>
            <div className="px-5 pb-6">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">{t("common.language")}</p>
              <div className="mt-3 inline-flex overflow-hidden rounded-full border border-[var(--border-subtle)]">
                <button
                  onClick={() => changeLang("en")}
                  className={cn(
                    "px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] transition",
                    lang === "en" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand",
                  )}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLang("es")}
                  className={cn(
                    "px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] transition",
                    lang === "es" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand",
                  )}
                >
                  ES
                </button>
              </div>
            </div>
          </div>
        </FocusTrap>
      </aside>

      <main className="flex-1">
        <Outlet />
        <Footer />
      </main>
    </div>
  );
}
