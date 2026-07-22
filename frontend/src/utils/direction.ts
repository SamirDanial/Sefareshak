import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { languageDirections } from "@/i18n/config";

export type TextDirection = "ltr" | "rtl";

/**
 * Determine the text direction for a given language code.
 * Falls back to the document direction if available, otherwise ltr.
 */
export function getDirectionForLanguage(language: string): TextDirection {
  if (languageDirections[language]) {
    return languageDirections[language];
  }
  const documentDir = document?.documentElement?.dir;
  if (documentDir === "rtl" || documentDir === "ltr") {
    return documentDir;
  }
  return "ltr";
}

/**
 * Check if the given language is RTL.
 */
export function isRtl(language?: string): boolean {
  if (language) {
    return getDirectionForLanguage(language) === "rtl";
  }
  const documentDir = document?.documentElement?.dir;
  if (documentDir) {
    return documentDir === "rtl";
  }
  return false;
}

/**
 * Hook that returns the current direction and RTL state.
 * Re-renders when i18n language changes.
 */
export function useDirection(): { direction: TextDirection; isRtl: boolean } {
  const { i18n } = useTranslation();

  return useMemo(() => {
    const direction = getDirectionForLanguage(i18n.language);
    return { direction, isRtl: direction === "rtl" };
  }, [i18n.language]);
}
