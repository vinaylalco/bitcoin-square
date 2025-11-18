import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  Home as HomeIcon,
  LayoutDashboard,
  Mail,
  Menu,
  Sparkles,
  Users,
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
import ProfileModalPortal from "./components/profile/ProfileModal";
import { cn } from "./utils/cn";
import { useLessonPlans } from "./hooks/useLessonPlans";
import { resolveLocale } from "./utils/locale";
import LanguageSwitcher from "./components/LanguageSwitcher";

export default function App() {
  const [open, setOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [mobileEducationOpen, setMobileEducationOpen] = useState(false);
  const [desktopEducationOpen, setDesktopEducationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const { theme } = useTheme(); // ensures theme context is mounted
  const { user, logout } = useAuth();

  const isCommunityRoute = loc.pathname.startsWith("/community");
  const hideFooterOnPage = /^\/education\/[\w-]+/.test(loc.pathname) || isCommunityRoute;

  const locale = resolveLocale(i18n.language);

  const lessonPlanLocale = locale === "es" ? "es" : "en";

  const { data: lessonPlans } = useLessonPlans(lessonPlanLocale);
  const educationChildren = (() => {
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
      return normalized;
    }

    return [
      {
        label: t("app.btcFullCourse"),
        to: "/education/full-btc-course",
      },
    ];
  })();

  const desktopNav = [
    { label: t("nav.education"), to: "/education", dropdown: educationChildren },
    { label: t("nav.shop"), to: "/shop" },
    { label: t("nav.membership"), to: "/membership" },
    { label: t("nav.community"), to: "/community" },
  ];

  const educationRootMatch = useMatch("/education");
  const educationDetailMatch = useMatch("/education/:slug");
  const isEducationActive = Boolean(educationRootMatch || educationDetailMatch);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMobileEducationOpen(false);
    setDesktopEducationOpen(false);
  }, [loc.pathname]);

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

  const communityMenuTrigger = (
    <button
      ref={triggerRef}
      onClick={() => setOpen((v) => !v)}
      aria-label={open ? t("app.mobileMenu.closeAria") : t("app.mobileMenu.openAria")}
      className="fixed left-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-50 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-white shadow-lg transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-brand sm:left-6 sm:top-[calc(1.5rem+env(safe-area-inset-top,0px))]"
    >
      {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
    </button>
  );

  return (
    <>
      {isCommunityRoute && isClient && createPortal(communityMenuTrigger, document.body)}
      <div className="gpu-accelerated scroll-smooth min-h-screen min-h-mobile-fill bg-[var(--bg-app)] text-[var(--fg-default)] transition-colors duration-300">
        {isCommunityRoute ? null : (
        <header
          data-app-header
          className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur"
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3 lg:gap-6">
              <button
                ref={triggerRef}
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? t("app.mobileMenu.closeAria") : t("app.mobileMenu.openAria")}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-default)] shadow-sm transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  !isCommunityRoute && "lg:hidden",
                )}
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <Link to="/" className="flex items-center gap-2">
                <span className="relative flex items-center gap-2 text-lg font-black uppercase tracking-[0.28em]">
                  <span className="flex items-center gap-2">
                    <img
                      src={theme === "dark" ? "/btc_B_white.png" : "/btc_B_orange.png"}
                      alt=""
                      aria-hidden
                      className="h-5 w-5 object-contain"
                    />
                    <span className="sr-only">Bitcoin</span>
                    <span>itcoin</span>
                  </span>
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white">Square</span>
                </span>
              </Link>
            </div>

            <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold uppercase tracking-[0.22em]">
              {desktopNav.map((item) => {
                if (item.dropdown && item.dropdown.length > 0) {
                  return (
                    <div
                      key={item.to}
                      className="relative"
                      onMouseEnter={() => setDesktopEducationOpen(true)}
                      onMouseLeave={() => setDesktopEducationOpen(false)}
                      onFocusCapture={() => setDesktopEducationOpen(true)}
                      onBlurCapture={(event) => {
                        const nextFocus = event.relatedTarget as Node | null;
                        if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                          setDesktopEducationOpen(false);
                        }
                      }}
                    >
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            "inline-flex items-center gap-2 py-2 transition",
                            item.highlight
                              ? "rounded-full border border-brand px-4 text-xs tracking-[0.32em] text-brand hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_30px_rgba(169,21,255,0.35)]"
                              : "text-[var(--fg-muted)] hover:text-brand",
                            (isActive || desktopEducationOpen) &&
                              (item.highlight ? "bg-brand text-white" : "text-brand"),
                          )
                        }
                        onClick={() => setDesktopEducationOpen(false)}
                      >
                        {item.label}
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 transition-transform",
                            desktopEducationOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </NavLink>
                      <div
                        className={cn(
                          "absolute left-1/2 top-full z-20 mt-3 hidden w-60 -translate-x-1/2 rounded-2xl border border-brand/30 bg-[var(--bg-card)] p-3 text-[0.6rem] font-semibold shadow-[0_24px_60px_rgba(169,21,255,0.25)]",
                          desktopEducationOpen && "block",
                        )}
                      >
                        <div className="flex flex-col gap-2">
                          {item.dropdown.map((child) => (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={({ isActive }) =>
                                cn(
                                  "block rounded-xl border border-transparent px-4 py-2 tracking-[0.32em] text-[var(--fg-muted)] transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand",
                                  isActive && "border-brand bg-brand/10 text-brand",
                                )
                              }
                              onClick={() => setDesktopEducationOpen(false)}
                            >
                              {child.label}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center gap-2 py-2 transition",
                        item.highlight
                          ? "rounded-full border border-brand px-4 text-xs tracking-[0.32em] text-brand hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_30px_rgba(169,21,255,0.35)]"
                          : "text-[var(--fg-muted)] hover:text-brand",
                        isActive && (item.highlight ? "bg-brand text-white" : "text-brand"),
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                );
              })}
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
                  to="/membership?view=login"
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
        )}

        {open && (
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm",
              !isCommunityRoute && "lg:hidden",
            )}
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}

        <aside
          ref={drawerRef}
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-80 transform border-r border-[var(--border-subtle)] bg-white text-neutral-900 shadow-[var(--shadow-soft)] transition-transform duration-300 dark:bg-black dark:text-white",
            !isCommunityRoute && "lg:hidden",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label={t("app.mobileMenu.ariaLabel")}
        >
          <FocusTrap active={open} onDeactivate={() => setOpen(false)} returnFocusRef={triggerRef}>
            <div className="flex h-full flex-col overflow-y-auto touch-momentum">
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
              <div
                className={cn(
                  "rounded-2xl border border-transparent transition hover:border-brand/40 hover:bg-brand/5",
                  (mobileEducationOpen || isEducationActive) && "border-brand bg-brand/10 text-brand",
                )}
              >
                <div className="flex items-center justify-between">
                  <NavLink
                    to="/education"
                    onClick={() => {
                      setOpen(false);
                      setMobileEducationOpen(false);
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-1 items-center gap-3 px-4 py-3",
                        isActive && "text-brand",
                      )
                    }
                  >
                    <BookOpen className="h-5 w-5" /> {t("nav.education")}
                  </NavLink>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMobileEducationOpen((prev) => !prev);
                    }}
                    aria-expanded={mobileEducationOpen}
                    aria-controls="mobile-education-submenu"
                    className="px-4 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-[var(--fg-muted)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label={t("app.mobileMenu.toggleEducation", {
                      defaultValue: "Toggle education submenu",
                    })}
                  >
                    {mobileEducationOpen ? "−" : "+"}
                  </button>
                </div>
                <div
                  id="mobile-education-submenu"
                  className={cn(
                    "mt-2 space-y-2 pb-3 text-[0.65rem] font-semibold",
                    mobileEducationOpen ? "block" : "hidden",
                  )}
                >
                  {educationChildren.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-2xl border border-transparent px-6 py-2 tracking-[0.4em] text-[var(--fg-muted)] transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand dark:text-white dark:hover:text-brand",
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
                to="/membership"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <Sparkles className="h-5 w-5" /> {t("nav.membership")}
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
                to="/community"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition hover:border-brand/40 hover:bg-brand/5",
                    isActive && "border-brand bg-brand/10 text-brand",
                  )
                }
              >
                <Users className="h-5 w-5" /> {t("nav.community")}
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
                  to="/membership?view=login"
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
              <LanguageSwitcher size="sm" />
            </div>
          </div>
        </FocusTrap>
      </aside>

      <main className="flex-1">
        <Outlet />
        {!hideFooterOnPage && <Footer />}
      </main>
      <ProfileModalPortal />
    </div>
  </>
);
}
