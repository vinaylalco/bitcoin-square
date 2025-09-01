import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Book, User, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "./lib/supabase"; // adjust if your path differs

export default function App() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { t, i18n } = useTranslation();
  const loc = useLocation();

  // close drawer when route changes
  useEffect(() => setOpen(false), [loc.pathname]);

  // auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  const changeLang = (lang: "en" | "es") => i18n.changeLanguage(lang);
  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";

  return (
    <div className="min-h-screen bg-white text-black dark:bg-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <button onClick={() => setOpen(true)} aria-label={t("common.menu") || "Menu"}>
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="font-semibold text-lg">Bitcoin Square</h1>
      </header>

      {/* Slide-in hamburger menu */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-neutral-100 dark:bg-neutral-800 shadow-lg transform transition-transform duration-300 z-50 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          className="absolute top-3 right-3"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          ✕
        </button>

        <nav className="mt-12 px-4 space-y-4">
          <Link to="/education" className="block hover:text-brand">
            <div className="flex items-center gap-2">
              <Book className="h-5 w-5" />
              <span>{t("nav.education") || "Education"}</span>
            </div>
          </Link>

          {user ? (
            <Link to="/profile" className="block hover:text-brand">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <span>{t("nav.profile") || "Profile"}</span>
              </div>
            </Link>
          ) : (
            <Link to="/login" className="block hover:text-brand">
              <span>Login</span>
            </Link>
          )}

          <Link to="/settings" className="block hover:text-brand">
            <span>Settings</span>
          </Link>

          {/* Manual Language Selector (Hamburger only) */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              Language
            </p>
            <div className="inline-flex rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <button
                onClick={() => changeLang("en")}
                className={`px-3 py-1.5 text-sm ${
                  lang === "en" ? "bg-brand text-white" : "bg-transparent text-neutral-800 dark:text-neutral-200"
                }`}
                aria-pressed={lang === "en"}
              >
                EN
              </button>
              <button
                onClick={() => changeLang("es")}
                className={`px-3 py-1.5 text-sm ${
                  lang === "es" ? "bg-brand text-white" : "bg-transparent text-neutral-800 dark:text-neutral-200"
                }`}
                aria-pressed={lang === "es"}
              >
                ES
              </button>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main content: pad bottom so fixed nav never overlaps content */}
      <main
        className="
          flex-1
          pb-[calc(64px+env(safe-area-inset-bottom))]
          sm:pb-[calc(64px+env(safe-area-inset-bottom))]
        "
      >
        <Outlet />
      </main>

      {/* Fixed bottom nav (viewport-fixed, not document) */}
      <nav
        role="navigation"
        aria-label="App bottom navigation"
        className="
          fixed bottom-0 left-0 right-0 z-40
          border-t border-neutral-200 dark:border-neutral-800
          bg-white/95 dark:bg-neutral-900/95 backdrop-blur
          py-2
          pb-[calc(8px+env(safe-area-inset-bottom))]
        "
      >
        <div className="mx-auto max-w-screen-sm flex justify-around">
          <Link to="/education" className="flex flex-col items-center">
            <Book className="h-6 w-6" />
            <span className="text-xs">{t("nav.education") || "Education"}</span>
          </Link>

          {user && (
            <Link to="/profile" className="flex flex-col items-center">
              <User className="h-6 w-6" />
              <span className="text-xs">{t("nav.profile") || "Profile"}</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
