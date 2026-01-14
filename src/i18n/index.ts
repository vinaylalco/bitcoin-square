import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import {
  applyDocumentLocale,
  detectPreferredLocale,
  persistLocale,
  resolveLocale,
} from "../utils/locale";

const initialLocale = detectPreferredLocale();

applyDocumentLocale(initialLocale);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: initialLocale,
  fallbackLng: "en",
  supportedLngs: ["en"],
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: (key) => key,
});

i18n.on("languageChanged", (lng) => {
  const locale = resolveLocale(lng);
  persistLocale(locale);
  applyDocumentLocale(locale);
});

export default i18n;
