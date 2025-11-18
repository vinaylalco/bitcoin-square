export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "th", label: "ไทย" },
  { code: "ru", label: "Русский" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
