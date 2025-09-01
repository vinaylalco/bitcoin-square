import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Book, User, Menu, Home } from "lucide-react"; 
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";

export default function App() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { t } = useTranslation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-white text-black dark:bg-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <button onClick={() => setOpen(true)} aria-label={t("common.menu")}>
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="font-semibold text-lg">Bitcoin Square</h1>
      </header>

      {/* Slide-in menu */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-neutral-100 dark:bg-neutral-800 shadow-lg transform transition-transform duration-300 z-50 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          className="absolute top-3 right-3"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        <nav className="mt-12 px-4 space-y-4">
          {/* ✅ Home link */}
          <a href="/" className="block hover:text-brand flex items-center gap-2">
            <Home className="h-5 w-5" />
            <span>Home</span>
          </a>

          <a href="/education" className="block hover:text-brand">
            {t("nav.education")}
          </a>

          {user ? (
            <a href="/profile" className="block hover:text-brand">
              {t("nav.profile")}
            </a>
          ) : (
            <a href="/login" className="block hover:text-brand">
              Login
            </a>
          )}

          <a href="/settings" className="block hover:text-brand">
            Settings
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="flex justify-around border-t border-neutral-200 dark:border-neutral-800 py-2 bg-white dark:bg-neutral-900">
        <a href="/" className="flex flex-col items-center">
          <Home className="h-6 w-6" />
          <span className="text-xs">Home</span>
        </a>

        <a href="/education" className="flex flex-col items-center">
          <Book className="h-6 w-6" />
          <span className="text-xs">{t("nav.education")}</span>
        </a>

        {user && (
          <a href="/profile" className="flex flex-col items-center">
            <User className="h-6 w-6" />
            <span className="text-xs">{t("nav.profile")}</span>
          </a>
        )}
      </nav>
    </div>
  );
}
