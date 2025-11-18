import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type LanguageCode } from "../config/languages";
import { resolveLocale } from "../utils/locale";
import { cn } from "../utils/cn";

interface LanguageSwitcherProps {
  className?: string;
  size?: "sm" | "md";
}

export function LanguageSwitcher({ className, size = "md" }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = resolveLocale(i18n.language);
  const padding = size === "sm" ? "pl-3 pr-8 py-2 text-xs" : "pl-4 pr-10 py-3 text-sm";

  return (
    <label className={cn("inline-flex flex-col gap-2", className)}>
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
        {t("common.language")}
      </span>
      <div className="relative inline-flex items-center">
        <select
          className={cn(
            "appearance-none rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)] shadow-sm transition focus:border-brand focus:outline-none",
            padding,
          )}
          value={current}
          onChange={(e) => {
            const next = e.target.value as LanguageCode;
            void i18n.changeLanguage(next);
          }}
          aria-label={t("common.language")}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[var(--fg-muted)]" />
      </div>
    </label>
  );
}

export default LanguageSwitcher;
