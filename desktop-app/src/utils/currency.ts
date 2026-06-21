const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AED: "د.إ",
};

export const getCurrencySymbol = (currency: string): string => {
  return currencySymbols[currency.toUpperCase()] || "$";
};

export const formatPrice = (
  amount: number | string,
  currency: string = "USD"
): string => {
  const symbol = getCurrencySymbol(currency);
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${symbol}${numAmount.toFixed(2)}`;
};

