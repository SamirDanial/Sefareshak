/**
 * cashregister.csv
 *
 * Builds the payload for upserting a cash register (Kasse) in Fiskaly DSFinV-K.
 * This is submitted via insertCashRegister and populates cashregister.csv
 * in the DSFinV-K export.
 */
export function buildCashRegisterPayload(params: {
  cashRegisterExportId: string;
  tssId: string;
  baseCurrencyCode: string;
  softwareBrand: string;
  softwareVersion: string;
  operatorBrand?: string | null;
  model?: string | null;
  fiscalName?: string | null;
  fiscalStreet?: string | null;
  fiscalZip?: string | null;
  fiscalCity?: string | null;
  fiscalCountry?: string | null;
  vatId?: string | null;
  taxNumber?: string | null;
}): Record<string, any> {
  const normalizeOptionalString = (value: unknown): string | undefined => {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  };
  const normalizeCountryCode = (value: unknown): string => {
    const normalized = String(value ?? "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) && normalized !== "VAT" ? normalized : "DEU";
  };

  const body: Record<string, any> = {
    cash_register_export_id: params.cashRegisterExportId,
    cash_register_type: { type: "MASTER", tss_id: params.tssId },
    base_currency_code: params.baseCurrencyCode,
    software: {
      brand: params.softwareBrand,
      version: params.softwareVersion,
    },
  };

  if (params.operatorBrand) body.brand = params.operatorBrand;
  if (params.model) body.model = params.model;

  const fiscalName = normalizeOptionalString(params.fiscalName);
  const fiscalStreet = normalizeOptionalString(params.fiscalStreet);
  const fiscalZip = normalizeOptionalString(params.fiscalZip);
  const fiscalCity = normalizeOptionalString(params.fiscalCity);
  const fiscalCountry = normalizeCountryCode(params.fiscalCountry);
  const vatId = normalizeOptionalString(params.vatId);
  const taxNumber = normalizeOptionalString(params.taxNumber);

  body.metadata = {
    ...(taxNumber ? { tax_number: taxNumber } : {}),
    ...(vatId ? { vat_id_number: vatId } : {}),
    ...(fiscalName ? { fiscal_name: fiscalName } : {}),
    ...(fiscalStreet ? { fiscal_street: fiscalStreet } : {}),
    ...(fiscalZip ? { fiscal_postal_code: fiscalZip } : {}),
    ...(fiscalCity ? { fiscal_city: fiscalCity } : {}),
    fiscal_country_code: fiscalCountry,
  };

  if (Object.keys(body.metadata).length === 0) {
    delete body.metadata;
  }

  return body;
}
