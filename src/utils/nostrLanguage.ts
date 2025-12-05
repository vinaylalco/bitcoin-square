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

export const shouldTranslateForTargetLanguage = (
  originalLanguage: string | null | undefined,
  targetLanguage: string | null,
): boolean => {
  const normalizedTarget = targetLanguage ? normalizeLocale(targetLanguage) : undefined;
  const normalizedOriginal = originalLanguage ? normalizeLocale(originalLanguage) : null;

  if (!normalizedTarget || !TRANSLATABLE_LANGUAGES.has(normalizedTarget)) {
    return false;
  }

  if (!normalizedOriginal || !TRANSLATABLE_LANGUAGES.has(normalizedOriginal)) {
    return false;
  }

  return normalizedOriginal !== normalizedTarget;
};
