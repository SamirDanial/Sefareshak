/**
 * Currency utility functions for mobile app
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

/**
 * Get locale based on currency for proper formatting
 */
const getLocaleForCurrency = (curr: string): string => {
  const currencyLocaleMap: { [key: string]: string } = {
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
    INR: "en-IN",
    AED: "ar-AE",
  };
  return currencyLocaleMap[curr] || "en-US";
};

/**
 * Format a price with currency
 * @param amount - The amount to format
 * @param currency - Currency code (e.g., "USD", "EUR"). Defaults to "USD" if not provided
 * @returns Formatted string with currency symbol and amount
 */
export const formatPrice = (amount: number | string, currency: string = "USD"): string => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) return formatPrice(0, currency);

  return new Intl.NumberFormat(getLocaleForCurrency(currency), {
    style: "currency",
    currency: currency,
  }).format(numAmount);
};

/**
 * Fetch currency from public settings
 * @returns Promise that resolves to currency code (defaults to "USD")
 */
export const fetchCurrency = async (): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/settings/public`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const result = await response.json();
      const settings = result?.data || {};
      return settings.currency || "USD";
    }
  } catch (error) {
    console.error("Failed to fetch currency:", error);
  }
  return "USD";
};

/**
 * Fetch public settings (currency and app status)
 * @returns Promise that resolves to settings object with currency and appStatus
 */
export const fetchPublicSettings = async (): Promise<{ currency: string; appStatus: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/settings/public`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const result = await response.json();
      const settings = result?.data || {};
      return {
        currency: settings.currency || "USD",
        appStatus: settings.appStatus || "LIVE",
      };
    }
  } catch (error) {
    console.error("Failed to fetch public settings:", error);
  }
  return { currency: "USD", appStatus: "LIVE" };
};
