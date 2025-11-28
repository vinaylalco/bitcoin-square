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

export const shouldTranslateForTargetLanguage = (
  originalLanguage: string | null | undefined,
  targetLanguage: string,
): boolean => {
  const normalizedTarget = normalizeLocale(targetLanguage) ?? targetLanguage;
  const normalizedOriginal = originalLanguage ? normalizeLocale(originalLanguage) : null;

  if (!normalizedOriginal) {
    return true;
  }

  return normalizedOriginal !== normalizedTarget;
};
