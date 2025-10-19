import { create } from "zustand";

type TranslationMode = "auto" | "off";

interface TranslationPreferencesState {
  targetLang: string;
  mode: TranslationMode;
  setTargetLang: (lang: string) => void;
  setMode: (mode: TranslationMode) => void;
}

const detectBrowserLanguage = () => {
  if (typeof navigator === "undefined" || !navigator.language) {
    return "en";
  }
  const [lang] = navigator.language.split("-");
  return lang || "en";
};

export const useTranslationPreferences = create<TranslationPreferencesState>((set) => ({
  targetLang: detectBrowserLanguage(),
  mode: "auto",
  setTargetLang: (lang) =>
    set(() => ({
      targetLang: lang.trim().slice(0, 5) || "en",
    })),
  setMode: (mode) => set(() => ({ mode })),
}));
