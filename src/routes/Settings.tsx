import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { usePreferences } from "../context/PreferencesContext";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Settings() {
  const { theme, setTheme, toggle } = useTheme();
  const { thunderSoundEnabled, setThunderSoundEnabled } = usePreferences();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">{t("settings.label")}</p>
        <h2 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("settings.title")}
        </h2>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          {t("settings.description")}
        </p>
      </header>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">{t("settings.theme.title")}</h3>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          {t("settings.theme.description")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="inline-flex overflow-hidden rounded-full border border-brand/30">
            <button
              onClick={() => setTheme("light")}
              className={`px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] transition ${
                theme === "light" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
              }`}
            >
              {t("settings.theme.light")}
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] transition ${
                theme === "dark" ? "bg-brand text-white" : "text-[var(--fg-muted)] hover:text-brand"
              }`}
            >
              {t("settings.theme.dark")}
            </button>
          </div>
          <button
            onClick={toggle}
            className="inline-flex items-center justify-center rounded-full border border-brand/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
          >
            {t("settings.theme.toggle")}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">{t("settings.language.title")}</h3>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          {t("settings.language.description")}
        </p>
        <div className="mt-5">
          <LanguageSwitcher />
        </div>
      </section>

      <section className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">{t("settings.sound.title")}</h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)]">{t("settings.sound.label")}</p>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              {t("settings.sound.description")}
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
            <span className="sr-only">{t("settings.sound.toggleAria")}</span>
            <span
              className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition ${
                thunderSoundEnabled ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-4 text-xs text-[var(--fg-muted)]">
          {t("settings.sound.helper")}
        </p>
      </section>
    </div>
  );
}
