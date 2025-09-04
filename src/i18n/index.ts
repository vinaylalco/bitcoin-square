import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import id from "./locales/id.json";

// Detect browser language
let browserLang = navigator.language.split("-")[0];
let lng = browserLang === "es" ? "es" : browserLang === "id" ? "id" : "en";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, id: { translation: id } },
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export default i18n;
