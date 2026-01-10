import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import id from "./locales/id.json";
import th from "./locales/th.json";
import ru from "./locales/ru.json";
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
    es: { translation: es },
    id: { translation: id },
    th: { translation: th },
    ru: { translation: ru },
  },
  lng: initialLocale,
  fallbackLng: "en",
  supportedLngs: ["en", "es", "id", "th", "ru"],
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: (key) => key,
});

i18n.on("languageChanged", (lng) => {
  const locale = resolveLocale(lng);
  persistLocale(locale);
  applyDocumentLocale(locale);
});

export default i18n;
