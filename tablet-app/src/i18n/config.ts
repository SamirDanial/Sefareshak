import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import enTranslations from "./locales/en.json";
import frTranslations from "./locales/fr.json";
import deTranslations from "./locales/de.json";
import esTranslations from "./locales/es.json";

// Supported languages
const supportedLanguages = ["en", "fr", "de", "es"];

// Get device language
const getDeviceLanguage = (): string => {
  try {
    const deviceLocale = Localization.getLocales()[0];
    const deviceLang = deviceLocale?.languageCode || "en";

    // Check if device language is supported
    if (supportedLanguages.includes(deviceLang)) {
      return deviceLang;
    }

    // Fallback to English
    return "en";
  } catch (error) {
    console.error("Error detecting device language:", error);
    return "en";
  }
};

// Initialize i18n synchronously with device language
const initialLanguage = getDeviceLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: enTranslations,
    },
    fr: {
      translation: frTranslations,
    },
    de: {
      translation: deTranslations,
    },
    es: {
      translation: esTranslations,
    },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  debug: false,
  returnNull: false,
  returnEmptyString: false,
  returnObjects: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// Load stored language preference asynchronously after initialization
(async () => {
  try {
    const storedLang = await AsyncStorage.getItem("userLanguage");
    if (storedLang && supportedLanguages.includes(storedLang)) {
      if (storedLang !== initialLanguage) {
        await i18n.changeLanguage(storedLang);
      }
    }
  } catch (error) {
    console.error("Error reading language preference:", error);
  }
})();

export default i18n;
