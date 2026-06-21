import crypto from "crypto";

export function round2(v: any): number {
  return Math.round(Number(v || 0) * 100) / 100;
}

export function toCents(v: any): number {
  return Math.round(Number(v || 0) * 100);
}

export function fromCents(cents: number): number {
  return round2(cents / 100);
}

export function vatPartsFromGrossCents(grossCents: number, rate: number) {
  const netCents =
    rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents;
  const vatCents = grossCents - netCents;

  return {
    excl_vat: fromCents(netCents),
    vat: fromCents(vatCents),
    incl_vat: fromCents(grossCents),
  };
}

export function sortByVatId<T extends { vat_id?: string | number; vat_definition_export_id?: string | number }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) =>
    String(a.vat_id || a.vat_definition_export_id || "").localeCompare(
      String(b.vat_id || b.vat_definition_export_id || ""),
      undefined,
      { numeric: true }
    )
  );
}

export function getVatKeyFromRate(rate: number): number {
  if (rate >= 19) return 1;
  if (rate >= 7) return 2;
  if (rate <= 0) return 5; // Key 5 is officially 0% / Exempt / Steuerfrei under DSFinV-K and Fiskaly
  return 3;
}

export function stableId(input: string): string {
  const h = crypto.createHash("sha256").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function dsfinvkPaymentTypeFromPaymentMethod(pm: any): string {
  const m = String(pm || "").trim().toUpperCase();
  if (m === "CASH" || m === "CASH_ON_DELIVERY") return "Bar";
  if (m === "CARD_ON_DELIVERY" || m === "ONLINE" || m === "ONLINE_PAYMENT") return "Unbar";
  return "Unbar";
}

export function dsfinvkPaymentTypeFromVoucher(hasVoucher: boolean): string {
  // DSFinV-K schema doesn't have a specific "Gutschein" payment type
  // Vouchers are treated as non-cash payments (Unbar)
  return hasVoucher ? "Unbar" : "";
}

export function getPaymentTypeName(type: string): string {
  const t = String(type || "").trim();
  if (t === "Bar") return "Bargeld";
  if (t === "Unbar") return "Kreditkarte";
  if (t === "Gutschein") return "Gutschein";
  return "Sonstiges";
}

export function getCurrencyCode(currency: any): string {
  const c = String(currency || "").trim().toUpperCase();
  if (c === "USD") return "USD";
  if (c === "EUR") return "EUR";
  return c || "EUR";
}
