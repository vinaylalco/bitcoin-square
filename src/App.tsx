import React, { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Menu,
  X,
  Home as HomeIcon,
  BookOpen,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import FocusTrap from "./components/FocusTrap";
import { useSwipe } from "./hooks/useSwipe";
import { useTheme } from "./context/ThemeContext";
import { useAuth } from "./context/AuthContext";
import Footer from "./components/Footer";

export default function App() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const { theme } = useTheme(); // ensures theme context is mounted
  const { user, logout } = useAuth();
  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const changeLang = (lng: "en" | "es") => i18n.changeLanguage(lng);

  // Close drawer on route change
  useEffect(() => setOpen(false), [loc.pathname]);


  // Body scroll lock while drawer open
  useEffect(() => {
    const el = document.documentElement;
    if (open) {
      el.classList.add("overflow-hidden");
    } else {
      el.classList.remove("overflow-hidden");
    }
    return () => el.classList.remove("overflow-hidden");
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Swipe-to-close (mobile)
  useSwipe(drawerRef, {
    enabled: open,
    axis: "x",
    onMove: (dx) => {
      // drag only to the right (close gesture)
      if (dx > 0 && drawerRef.current) {
        drawerRef.current.style.transform = `translateX(${Math.min(dx, 72)}px)`;
      }
    },
    onEnd: (dx) => {
      if (!drawerRef.current) return;
      drawerRef.current.style.transform = "";
      if (dx > 60) setOpen(false); // threshold
    },
  });

  return (
    <div className="min-h-screen bg-white text-black dark:bg-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? (t("common.close") || "Close menu") : (t("common.menu") || "Open menu")}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <h1 className="font-semibold text-lg">Bitcoin Square</h1>
        <div className="w-6" />
      </header>

      {/* Overlay (click-outside to close) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full w-72 bg-neutral-100 dark:bg-neutral-900 shadow-lg transform transition-transform duration-300 z-50 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
      >
        <FocusTrap active={open} onDeactivate={() => setOpen(false)} returnFocusRef={triggerRef}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold opacity-70">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-sm"
                aria-label="Close menu"
              >
                Close
              </button>
            </div>

            <NavLink to="/" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
              <HomeIcon className="h-5 w-5" />
              <span>Home</span>
            </NavLink>

            <NavLink
              to="/education"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 hover:text-brand"
            >
              <BookOpen className="h-5 w-5" />
              <span>{t("nav.education") || "Education"}</span>
            </NavLink>
            <NavLink to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
              <Settings className="h-5 w-5" />
              <span>Settings</span>
            </NavLink>
            {user ? (
              <>
                <NavLink
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 hover:text-brand"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  <span>Dashboard</span>
                </NavLink>
                <button
                  onClick={() => {
                    logout();
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 hover:text-brand"
                >
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 hover:text-brand"
              >
                <span>Login</span>
              </NavLink>
            )}

            {/* Manual Language Selector */}
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">Language</p>
              <div className="inline-flex rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <button
                  onClick={() => changeLang("en")}
                  className={`px-3 py-1.5 text-sm ${lang === "en" ? "bg-brand text-white" : ""}`}
                  aria-pressed={lang === "en"}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLang("es")}
                  className={`px-3 py-1.5 text-sm ${lang === "es" ? "bg-brand text-white" : ""}`}
                  aria-pressed={lang === "es"}
                >
                  ES
                </button>
              </div>
            </div>
          </div>
        </FocusTrap>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
        <Footer />
      </main>
    </div>
  );
}
