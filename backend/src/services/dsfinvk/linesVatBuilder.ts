/**
 * lines_vat.csv (Bonpos_USt) — DSFinV-K §16
 *
 * Columns: Z_KASSE_ID;Z_ERSTELLUNG;Z_NR;BON_ID;POS_ZEILE;UST_SCHLUESSEL;POS_BRUTTO;POS_NETTO;POS_UST
 *
 * This file is NOT built via a separate payload array. Instead, Fiskaly derives
 * lines_vat.csv automatically from the `amounts_per_vat_id` array embedded on
 * each line inside `data.lines[].business_case.amounts_per_vat_id`.
 *
 * That data is already correctly populated by linesBuilder.ts for every order
 * line item, delivery fee, and rounding line. No additional builder is needed.
 *
 * This function is kept as a no-op to satisfy the barrel export and document intent.
 */
export function buildLinesVat(): any[] {
  return [];
}
