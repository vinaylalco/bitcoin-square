const SUPPORTED_LOCALES = ["en", "es"] as const;

const LOCALE_STORAGE_KEY = "pref:locale";

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

function sanitizeLocale(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

export function normalizeLocale(value?: string | null): AppLocale | undefined {
  if (!value || typeof value !== "string") return undefined;
  const normalized = sanitizeLocale(value);
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("en")) return "en";
  return undefined;
}

export function resolveLocale(value?: string | null): AppLocale {
  return normalizeLocale(value) ?? DEFAULT_LOCALE;
}

export function readPersistedLocale(): AppLocale | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!stored) return undefined;
    return normalizeLocale(stored) ?? undefined;
  } catch {
    return undefined;
  }
}

export function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function detectNavigatorLocale(): AppLocale | undefined {
  if (typeof navigator === "undefined") return undefined;

  const candidates: string[] = [];

  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages.filter((lng): lng is string => typeof lng === "string"));
  }

  const fallbackKeys = ["language", "userLanguage", "browserLanguage", "systemLanguage"] as const;

  const navigatorLike = navigator as Record<string, unknown>;
  for (const key of fallbackKeys) {
    const value = navigatorLike[key];
    if (typeof value === "string") {
      candidates.push(value);
    }
  }

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }

  return undefined;
}

function detectIntlLocale(): AppLocale | undefined {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return undefined;
  }

  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    return normalizeLocale(resolved) ?? undefined;
  } catch {
    return undefined;
  }
}

const ENV_LOCALE_KEYS = [
  "APP_LOCALE",
  "DEFAULT_LOCALE",
  "NEXT_LOCALE",
  "LOCALE",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_MESSAGES",
] as const;

function parseAcceptLanguageHeader(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part));
}

function detectEnvironmentLocale(): AppLocale | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }

  const acceptLanguage = process.env.HTTP_ACCEPT_LANGUAGE;
  if (typeof acceptLanguage === "string") {
    for (const candidate of parseAcceptLanguageHeader(acceptLanguage)) {
      const locale = normalizeLocale(candidate);
      if (locale) return locale;
    }
  }

  for (const key of ENV_LOCALE_KEYS) {
    const value = process.env[key];
    if (typeof value === "string") {
      const locale = normalizeLocale(value);
      if (locale) return locale;
    }
  }

  return undefined;
}

export function detectPreferredLocale(): AppLocale {
  return (
    readPersistedLocale() ||
    detectNavigatorLocale() ||
    detectIntlLocale() ||
    detectEnvironmentLocale() ||
    DEFAULT_LOCALE
  );
}
