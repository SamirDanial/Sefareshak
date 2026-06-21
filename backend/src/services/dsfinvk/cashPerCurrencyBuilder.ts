/**
 * cash_per_currency.csv
 *
 * Builds the cash_amounts_by_currency array for the payment section.
 * DSFinV-K requires reporting cash totals broken down by currency code.
 * For German fiscal compliance, we always force EUR.
 */
export function buildCashAmountsByCurrency(cashAmount: number): Array<{ currency_code: string; amount: number }> {
  return [
    {
      currency_code: "EUR",
      amount: cashAmount,
    },
  ];
}
