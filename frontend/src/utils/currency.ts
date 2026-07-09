/**
 * Currency utility functions
 */

/**
 * Currency symbols mapping
 */
const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AED: "د.إ",
  AFN: "؋",
};

/**
 * Get the symbol for a currency code
 * @param currency - Currency code (e.g., "USD", "EUR")
 * @returns Currency symbol (e.g., "$", "€")
 */
export const getCurrencySymbol = (currency: string): string => {
  return currencySymbols[currency.toUpperCase()] || "$";
};

/**
 * Format a price with currency symbol
 * @param amount - The amount to format
 * @param currency - Currency code (e.g., "USD", "EUR")
 * @returns Formatted string with currency symbol and amount
 */
export const formatPrice = (
  amount: number | string,
  currency: string = "USD"
): string => {
  const symbol = getCurrencySymbol(currency);
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${symbol}${numAmount.toFixed(2)}`;
};

/**
 * Get the currency code from settings or use default
 * @param currency - Currency from settings (optional)
 * @returns Valid currency code
 */
export const getCurrency = (currency?: string): string => {
  if (!currency) return "USD";
  const validCurrencies = ["USD", "EUR", "GBP", "INR", "AED", "AFN"];
  return validCurrencies.includes(currency.toUpperCase())
    ? currency.toUpperCase()
    : "USD";
};
