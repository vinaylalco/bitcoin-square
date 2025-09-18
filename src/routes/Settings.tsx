import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { usePreferences } from "../context/PreferencesContext";

export default function Settings() {
  const { theme, setTheme, toggle } = useTheme();
  const { thunderSoundEnabled, setThunderSoundEnabled } = usePreferences();
  const { i18n } = useTranslation();
  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const changeLanguage = (lng: "en" | "es") => {
    void i18n.changeLanguage(lng);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Settings</p>
        <h2 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          Tailor your experience
        </h2>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          Switch themes instantly and keep sound preferences locked in. Minimal interfaces, lightning-fast feedback.
        </p>
      </header>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">Theme</h3>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Choose a light or dark palette crafted around red, black, and white.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="inline-flex overflow-hidden rounded-full border border-brand/30">
            <button
              onClick={() => setTheme("light")}
              className={`px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] transition ${
                theme === "light" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] transition ${
                theme === "dark" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
              }`}
            >
              Dark
            </button>
          </div>
          <button
            onClick={toggle}
            className="inline-flex items-center justify-center rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
          >
            Toggle
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">Language</h3>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Switch between English and Spanish translations for every screen.
        </p>
        <div className="mt-5 inline-flex overflow-hidden rounded-full border border-brand/30 text-xs font-semibold uppercase tracking-[0.32em]">
          <button
            onClick={() => changeLanguage("en")}
            className={`px-5 py-2 transition ${
              lang === "en" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
            }`}
          >
            English
          </button>
          <button
            onClick={() => changeLanguage("es")}
            className={`px-5 py-2 transition ${
              lang === "es" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
            }`}
          >
            Español
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">Sound</h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)]">Thunder sound</p>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              Play a thunder strike whenever you earn new points.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={thunderSoundEnabled}
            onClick={() => setThunderSoundEnabled(!thunderSoundEnabled)}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              thunderSoundEnabled ? "bg-brand" : "bg-[var(--bg-muted)]"
            }`}
          >
            <span className="sr-only">Toggle thunder sound</span>
            <span
              className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition ${
                thunderSoundEnabled ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-4 text-xs text-[var(--fg-muted)]">
          This sound effect is off by default and saved to your preferences.
        </p>
      </section>
    </div>
  );
}
