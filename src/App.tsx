import React, { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Menu, X, Home as HomeIcon, BookOpen, User, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "./lib/supabase";
import { useRole } from "./hooks/useRole";
import FocusTrap from "./components/FocusTrap";
import { useSwipe } from "./hooks/useSwipe";
import { useTheme } from "./context/ThemeContext";
import Footer from "./components/Footer";

export default function App() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const [user, setUser] = useState<any>(null);
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const { role } = useRole();
  const { theme } = useTheme(); // ensures theme context is mounted

  const isCMS = loc.pathname.startsWith("/cms");
  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const changeLang = (lng: "en" | "es") => i18n.changeLanguage(lng);

  // Close drawer on route change
  useEffect(() => setOpen(false), [loc.pathname]);

  // Supabase auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

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

            <NavLink to="/education" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
              <BookOpen className="h-5 w-5" />
              <span>{t("nav.education") || "Education"}</span>
            </NavLink>

            {user ? (
              <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
                <User className="h-5 w-5" />
                <span>{t("nav.profile") || "Profile"}</span>
              </NavLink>
            ) : (
              <NavLink to="/login" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
                <User className="h-5 w-5" />
                <span>Login</span>
              </NavLink>
            )}

            <NavLink to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 hover:text-brand">
              <Settings className="h-5 w-5" />
              <span>Settings</span>
            </NavLink>

            {role === "admin" && (
              <NavLink to="/cms" onClick={() => setOpen(false)} className="flex items-center gap-2 font-semibold hover:text-brand">
                CMS
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

      {/* Main content (pad bottom if bottom nav visible) */}
      <main className={`flex-1 ${!isCMS ? "pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0" : ""}`}>
        <Outlet />
        {!isCMS && <Footer />}
      </main>

      {/* Bottom nav (hidden on CMS routes and desktop) */}
      {!isCMS && (
        <nav
          role="navigation"
          aria-label="App navigation"
          className="
            fixed bottom-0 left-0 right-0 z-40 sm:hidden
            border-t border-neutral-200 dark:border-neutral-800
            bg-white/95 dark:bg-neutral-900/95 backdrop-blur
            py-2 pb-[calc(8px+env(safe-area-inset-bottom))]
          "
        >
          <div className="mx-auto max-w-screen-sm flex justify-around">
            <NavLink to="/" className="flex flex-col items-center">
              <HomeIcon className="h-6 w-6" />
              <span className="text-xs">Home</span>
            </NavLink>

            <NavLink to="/education" className="flex flex-col items-center">
              <BookOpen className="h-6 w-6" />
              <span className="text-xs">{t("nav.education") || "Education"}</span>
            </NavLink>

            {user && (
              <NavLink to="/profile" className="flex flex-col items-center">
                <User className="h-6 w-6" />
                <span className="text-xs">{t("nav.profile") || "Profile"}</span>
              </NavLink>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
