import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en.json";
import daTranslations from "./locales/da.json";

const languageDirections: Record<string, "ltr" | "rtl"> = {
  en: "ltr",
  da: "rtl",
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      da: {
        translation: daTranslations,
      },
    },
    fallbackLng: "en",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

// Update document direction when language changes
i18n.on("languageChanged", (lng) => {
  const direction = languageDirections[lng] || "ltr";
  document.documentElement.dir = direction;
  document.documentElement.lang = lng;
});

// Set initial direction
const initialLang = i18n.language || "en";
document.documentElement.dir = languageDirections[initialLang] || "ltr";
document.documentElement.lang = initialLang;

export default i18n;
