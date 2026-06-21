import DatabaseSingleton from "../config/database";
import crypto from "crypto";

export class DsfinvkService {
  private static instance: DsfinvkService;
  private db = DatabaseSingleton.getInstance();

  private static readonly DEFAULT_BASE_URL = "https://dsfinvk.fiskaly.com";
  

  private constructor() {}

  public static getInstance(): DsfinvkService {
    if (!DsfinvkService.instance) {
      DsfinvkService.instance = new DsfinvkService();
    }
    return DsfinvkService.instance;
  }

  private getBaseUrl(): string {
    const envUrl = String(process.env.DSFINVK_BASE_URL || "").trim();
    return envUrl || DsfinvkService.DEFAULT_BASE_URL;
  }

  private decodeJwtPayload(token: string): any | null {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      const raw = parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
      const json = Buffer.from(raw, "base64").toString("utf8");
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }

  private extractOrganizationIdFromToken(token: string): string | null {
    const payload = this.decodeJwtPayload(token);
    if (!payload || typeof payload !== "object") return null;

    const directCandidates = [
      (payload as any).organization_id,
      (payload as any).organizationId,
      (payload as any).org_id,
      (payload as any).orgId,
      (payload as any).managed_organization_id,
      (payload as any).managedOrganizationId,
    ];

    for (const c of directCandidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }

    const nestedCandidates = [(payload as any).organization, (payload as any).managed_organization];
    for (const n of nestedCandidates) {
      if (!n || typeof n !== "object") continue;
      const id = (n as any).id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }

    return null;
  }

  private extractOrganizationsFromListResponse(resp: any): Array<any> {
    if (!resp) return [];
    if (Array.isArray(resp)) return resp;
    if (Array.isArray(resp.data)) return resp.data;
    if (Array.isArray(resp.organizations)) return resp.organizations;
    if (Array.isArray(resp.items)) return resp.items;
    return [];
  }

  private normalizeOptionalString(value: any): string | undefined {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  }

  private normalizeCountryCode(value: any): string {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(normalized) && normalized !== "VAT") return normalized;
    return "DEU";
  }

  private async authenticate(prisma: any, organizationId: string): Promise<string> {
    const settings = await prisma.settings.findFirst({
      where: { organizationId },
      select: {
        fiskalyClientId: true,
        fiskalyClientSecret: true,
      },
    });

    const apiKey = String(settings?.fiskalyClientId || "").trim();
    const apiSecret = String(settings?.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Fiskaly credentials for DSFinV-K: fiskalyClientId and fiskalyClientSecret"
      );
    }

    const baseUrl = this.getBaseUrl();
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
      }),
    });

    const text = await resp.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const token = String(json?.access_token || "").trim();
    if (!resp.ok || !token) {
      const msg =
        json?.error?.message || json?.message || text || `Auth failed (${resp.status})`;
      const err: any = new Error(msg);
      err.httpStatus = resp.status;
      err.fiskalyMessage = msg;
      err.response = { data: json ?? text };
      err.request = { method: "POST", url: `${baseUrl.replace(/\/+$/, "")}/api/v1/auth` };
      throw err;
    }

    return token;
  }

  public async getTokenAndOrganizationId(params: { internalOrganizationId: string }): Promise<{
    token: string;
    fiskalyOrganizationId: string;
  }> {
    const prisma = this.db.getPrisma() as any;
    const token = await this.authenticate(prisma, params.internalOrganizationId);
    const fiskalyOrganizationId = this.extractOrganizationIdFromToken(token) || "";
    return { token, fiskalyOrganizationId };
  }

  public async resolveFiskalyOrganizationContext(params: {
    internalOrganizationId: string;
  }): Promise<{ token: string; fiskalyOrganizationId: string }> {
    const prisma = this.db.getPrisma() as any;
    const token = await this.authenticate(prisma, params.internalOrganizationId);
    const fromToken = this.extractOrganizationIdFromToken(token) || "";
    return { token, fiskalyOrganizationId: fromToken };
  }

  public async getToken(params: { internalOrganizationId: string }): Promise<string> {
    const prisma = this.db.getPrisma() as any;
    return this.authenticate(prisma, params.internalOrganizationId);
  }

  private async request<T>(params: {
    baseUrl: string;
    path: string;
    method: string;
    token: string;
    body?: any;
    query?: Record<string, string | number | boolean | undefined | null>;
  }): Promise<T> {
    const url = new URL(params.baseUrl.replace(/\/+$/, "") + params.path);
    if (params.query) {
      for (const [k, v] of Object.entries(params.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const resp = await fetch(url.toString(), {
      method: params.method,
      headers: {
        authorization: `Bearer ${params.token}`,
        "content-type": "application/json",
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });

    const text = await resp.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!resp.ok) {
      const msg =
        (data as any)?.error?.message ||
        (data as any)?.message ||
        (typeof data === "string" ? data : "") ||
        `DSFinV-K request failed (${resp.status})`;
      console.error("[DSFinV-K] request failed", {
        method: params.method,
        url: url.toString(),
        status: resp.status,
        response: data,
      });
      const err: any = new Error(msg);
      err.httpStatus = resp.status;
      err.fiskalyMessage = msg;
      err.request = { method: params.method, url: url.toString() };
      err.response = { data };
      throw err;
    }

    return (data ?? {}) as T;
  }

  public async insertCashRegister(params: {
    internalOrganizationId: string;
    fiskalyOrganizationId: string;
    cashRegisterId: string;
    cashRegisterExportId: string;
    brand?: string | null;
    model?: string | null;
    softwareBrand?: string | null;
    softwareVersion?: string | null;
    taxNumber?: string | null;
    vatId?: string | null;
    token?: string;
  }) {
    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const settings = await prisma.settings.findFirst({
      where: { organizationId: params.internalOrganizationId },
      select: {
        fiskalyTssId: true,
        businessName: true,
        fiscalName: true,
        fiscalStreet: true,
        fiscalZip: true,
        fiscalCity: true,
        fiscalCountry: true,
        vatId: true,
        taxNumber: true,
      },
    });

    const tssId = String(settings?.fiskalyTssId || "").trim();
    if (!tssId) {
      throw new Error(
        "Missing Fiskaly TSS id (fiskalyTssId) required for DSFinV-K cash_register_type. Provision the organization TSS first and save settings."
      );
    }

    const baseUrl = this.getBaseUrl();

    const baseCurrencyCodeRaw = String(process.env.DSFINVK_BASE_CURRENCY_CODE || "EUR")
      .trim()
      .toUpperCase();
    const baseCurrencyCode = baseCurrencyCodeRaw || "EUR";

    // KASSE_SW_BRAND: Prefer passed parameter (organization name), then env vars, then default
    const softwareBrand = params.softwareBrand 
      ? String(params.softwareBrand).trim()
      : String(process.env.DSFINVK_SOFTWARE_BRAND || process.env.APP_NAME || "pos-system").trim();
    // KASSE_SW_VERSION: Prefer passed parameter, then env var, then default
    const softwareVersion = params.softwareVersion
      ? String(params.softwareVersion).trim()
      : String(process.env.DSFINVK_SOFTWARE_VERSION || "").trim() || "unknown";

    // KASSE_BRAND: the operator/business that owns this cash register (per DSFinV-K spec)
    // Prefer fiscalName if available (DSFinV-K specific), fall back to businessName
    const operatorBrand = params.brand || settings?.fiscalName || settings?.businessName || undefined;

    const body: any = {
      cash_register_export_id: params.cashRegisterExportId,
      cash_register_type: { type: "MASTER", tss_id: tssId },
      base_currency_code: baseCurrencyCode,
      software: {
        brand: softwareBrand,
        version: softwareVersion,
      },
      brand: operatorBrand,
      model: params.model || undefined,
      software_version: params.softwareVersion || undefined,
    };

    const vatIdValue = this.normalizeOptionalString(params.vatId ?? settings?.vatId);
    const taxNumberValue = this.normalizeOptionalString(params.taxNumber ?? settings?.taxNumber);
    const fiscalName = this.normalizeOptionalString(settings?.fiscalName);
    const fiscalStreet = this.normalizeOptionalString(settings?.fiscalStreet);
    const fiscalZip = this.normalizeOptionalString(settings?.fiscalZip);
    const fiscalCity = this.normalizeOptionalString(settings?.fiscalCity);
    const fiscalCountry = this.normalizeCountryCode(settings?.fiscalCountry);

    if (taxNumberValue) body.tax_number = taxNumberValue;
    if (vatIdValue) body.vat_id_number = vatIdValue;

    if (taxNumberValue || vatIdValue || fiscalName || fiscalStreet || fiscalZip || fiscalCity) {
      body.location = {
        ...(fiscalName ? { name: fiscalName } : {}),
        ...(fiscalStreet ? { street: fiscalStreet } : {}),
        ...(fiscalZip ? { postal_code: fiscalZip } : {}),
        ...(fiscalCity ? { city: fiscalCity } : {}),
        country_code: fiscalCountry,
        ...(taxNumberValue ? { tax_number: taxNumberValue } : {}),
        ...(vatIdValue ? { vat_id_number: vatIdValue } : {}),
      };
    }

    body.metadata = {
      ...(taxNumberValue ? { tax_number: taxNumberValue } : {}),
      ...(vatIdValue ? { vat_id_number: vatIdValue } : {}),
      ...(taxNumberValue ? { stnr: taxNumberValue } : {}),
      ...(vatIdValue ? { ustid: vatIdValue } : {}),
      ...(vatIdValue ? { vat_id: vatIdValue } : {}),
      ...(fiscalName ? { fiscal_name: fiscalName } : {}),
      ...(fiscalStreet ? { fiscal_street: fiscalStreet } : {}),
      ...(fiscalZip ? { fiscal_postal_code: fiscalZip } : {}),
      ...(fiscalCity ? { fiscal_city: fiscalCity } : {}),
      fiscal_country_code: fiscalCountry,
    };

    if (Object.keys(body.metadata).length === 0) {
      delete body.metadata;
    }

    // ── DEBUG: log exactly what we're sending for tax/vat ────────────────────
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] cashRegisterId=${params.cashRegisterId}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] params.taxNumber=${JSON.stringify(params.taxNumber)}, params.vatId=${JSON.stringify(params.vatId)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] settings.taxNumber=${JSON.stringify(settings?.taxNumber)}, settings.vatId=${JSON.stringify(settings?.vatId)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] resolved taxNumberValue=${JSON.stringify(taxNumberValue)}, vatIdValue=${JSON.stringify(vatIdValue)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] body.metadata=${JSON.stringify(body.metadata)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] body.location=${JSON.stringify(body.location)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] full body (keys):`, Object.keys(body));
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] body.tax_number=${JSON.stringify(body.tax_number)}, body.vat_id_number=${JSON.stringify(body.vat_id_number)}`);
    // ─────────────────────────────────────────────────────────────────────────

    const response = await this.request<any>({
      baseUrl,
      path: `/api/v1/cash_registers/${params.cashRegisterId}`,
      method: "PUT",
      token,
      body,
    });

    // ── DEBUG: log what Fiskaly returned for tax/vat ─────────────────────────
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] response.tax_number=${JSON.stringify((response as any)?.tax_number)}, response.vat_id_number=${JSON.stringify((response as any)?.vat_id_number)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] response.location=${JSON.stringify((response as any)?.location)}`);
    console.log(`[DSFinV-K][DEBUG][insertCashRegister] response.metadata=${JSON.stringify((response as any)?.metadata)}`);
    // ─────────────────────────────────────────────────────────────────────────

    return response;
  }

  public async retrieveCashRegister(params: {
    internalOrganizationId: string;
    fiskalyOrganizationId: string;
    cashRegisterId: string;
    token?: string;
  }) {
    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const baseUrl = this.getBaseUrl();
    return this.request<any>({
      baseUrl,
      path: `/api/v1/cash_registers/${params.cashRegisterId}`,
      method: "GET",
      token,
    });
  }

  public async retrieveCashPointClosingDetails(params: {
    internalOrganizationId: string;
    closingId: string;
    token?: string;
  }) {
    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const baseUrl = this.getBaseUrl();
    return this.request<any>({
      baseUrl,
      path: `/api/v1/cash_point_closings/${params.closingId}`,
      method: "GET",
      token,
    });
  }

  public async insertCashPointClosing(params: {
    internalOrganizationId: string;
    fiskalyOrganizationId: string;
    cashRegisterId: string;
    cashPointClosingExportId: string;
    cashPointClosingExportNumber: number;
    payload: any;
    token?: string;
  }) {

    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const baseUrl = this.getBaseUrl();

    console.log('payload:', JSON.stringify(params.payload, null, 2))

    const response = await this.request<any>({
      baseUrl,
      path: `/api/v1/cash_point_closings/${params.cashPointClosingExportId}`,
      method: "PUT",
      token,
      body: {
        ...(params.payload || {}),
        client_id: params.cashRegisterId,
        cash_point_closing_export_id: Number(params.cashPointClosingExportNumber ?? 0),
      },
    });

    return response;
  }

  public async triggerExport(params: {
    internalOrganizationId: string;
    exportId: string;
    cashRegisterId: string;
    startDate: number;
    endDate: number;
    token?: string;
  }) {
    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const baseUrl = this.getBaseUrl();

    console.log(`[DSFinV-K][DEBUG][triggerExport] startDate=${params.startDate} endDate=${params.endDate}`);

    const body = {
      start_date: params.startDate,
      end_date: params.endDate,
      cash_register_id: params.cashRegisterId,
      selection_mode: "ByCreationDate",
    };


    return this.request<any>({
      baseUrl,
      path: `/api/v1/exports/${params.exportId}`,
      method: "PUT",
      token,
      body,
    });
  }

  public async retrieveExportDetails(params: {
    internalOrganizationId: string;
    exportId: string;
    token?: string;
  }) {
    const prisma = this.db.getPrisma() as any;
    const token = params.token || (await this.authenticate(prisma, params.internalOrganizationId));

    const baseUrl = this.getBaseUrl();
    return this.request<any>({
      baseUrl,
      path: `/api/v1/exports/${params.exportId}`,
      method: "GET",
      token,
    });
  }

  public static stableId(input: string): string {
    const h = crypto.createHash("sha256").update(input).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

}

export default DsfinvkService;
