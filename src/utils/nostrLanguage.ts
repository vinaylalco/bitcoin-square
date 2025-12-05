import { normalizeLocale } from "./locale";

export const extractLanguageTag = (tags?: string[][] | null): string | null => {
  if (!Array.isArray(tags)) {
    return null;
  }

  const entry = tags.find((tag) => Array.isArray(tag) && tag[0] === "lang" && typeof tag[1] === "string");
  if (!entry) {
    return null;
  }

  return normalizeLocale(entry[1]) ?? null;
};

const TRANSLATABLE_LANGUAGES = new Set(["en", "es", "ru", "id", "th"]);

const normalizeTranslatableLanguage = (value?: string | null): string | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeLocale(value);
  if (normalized) {
    return normalized;
  }

  const lower = value.trim().toLowerCase();
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("id")) return "id";
  if (lower.startsWith("th")) return "th";
  if (lower.startsWith("en")) return "en";
  return undefined;
};

export const shouldTranslateForTargetLanguage = (
  originalLanguage: string | null | undefined,
  targetLanguage: string | null,
): boolean => {
  const normalizedTarget = normalizeTranslatableLanguage(targetLanguage);
  const normalizedOriginal = normalizeTranslatableLanguage(originalLanguage);

  if (!normalizedTarget || !TRANSLATABLE_LANGUAGES.has(normalizedTarget)) {
    return false;
  }

  if (!normalizedOriginal || !TRANSLATABLE_LANGUAGES.has(normalizedOriginal)) {
    return false;
  }

  return normalizedOriginal !== normalizedTarget;
};
