const UNKNOWN_LANGUAGE = "und";

const normalizeLanguageTag = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return UNKNOWN_LANGUAGE;

  const lowered = trimmed.toLowerCase();
  const [base] = lowered.split("-");
  if (!base || base.trim().length === 0) {
    return UNKNOWN_LANGUAGE;
  }

  return base;
};

export const getBrowserLanguageTag = (): string => {
  if (typeof navigator === "undefined") {
    return UNKNOWN_LANGUAGE;
  }

  const primary = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages[0]
    : navigator.language;

  if (typeof primary !== "string") {
    return UNKNOWN_LANGUAGE;
  }

  return normalizeLanguageTag(primary);
};
