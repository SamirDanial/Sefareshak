import { useTranslation } from "react-i18next";

/**
 * Get localized name based on current language
 * Returns Persian (nameFa) if language is Dari and field exists, otherwise returns English (name)
 */
export function getLocalizedName(
  name: string | null | undefined,
  nameFa: string | null | undefined,
  currentLanguage: string
): string {
  if (currentLanguage === "da" && nameFa && nameFa.trim() !== "") {
    return nameFa;
  }
  return name || "";
}

/**
 * Get localized description based on current language
 * Returns Persian (descriptionFa) if language is Dari and field exists, otherwise returns English (description)
 */
export function getLocalizedDescription(
  description: string | null | undefined,
  descriptionFa: string | null | undefined,
  currentLanguage: string
): string {
  if (currentLanguage === "da" && descriptionFa && descriptionFa.trim() !== "") {
    return descriptionFa;
  }
  return description || "";
}

/**
 * Hook to get localized name with current language from i18n
 */
export function useLocalizedName() {
  const { i18n } = useTranslation();
  
  return (
    name: string | null | undefined,
    nameFa: string | null | undefined
  ): string => {
    return getLocalizedName(name, nameFa, i18n.language);
  };
}

/**
 * Hook to get localized description with current language from i18n
 */
export function useLocalizedDescription() {
  const { i18n } = useTranslation();
  
  return (
    description: string | null | undefined,
    descriptionFa: string | null | undefined
  ): string => {
    return getLocalizedDescription(description, descriptionFa, i18n.language);
  };
}
