const sanitizeLanguageTag = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;

  const [base] = normalized.split("-");
  if (!base || base.trim().length === 0) {
    return null;
  }

  return base;
};

export const extractLanguageTag = (tags?: string[][] | null): string | null => {
  if (!Array.isArray(tags)) {
    return null;
  }

  const entry = tags.find((tag) => Array.isArray(tag) && tag[0] === "lang" && typeof tag[1] === "string");
  if (!entry) {
    return null;
  }

  return sanitizeLanguageTag(entry[1]);
};

const TRANSLATABLE_LANGUAGES = new Set(["en", "es", "ru", "id", "th"]);

export const shouldTranslateForTargetLanguage = (
  originalLanguage: string | null | undefined,
  targetLanguage: string | null,
): boolean => {
  const normalizedTarget = sanitizeLanguageTag(targetLanguage);
  const normalizedOriginal = sanitizeLanguageTag(originalLanguage);

  if (!normalizedTarget || !TRANSLATABLE_LANGUAGES.has(normalizedTarget)) {
    return false;
  }

  return normalizedOriginal !== normalizedTarget;
};
