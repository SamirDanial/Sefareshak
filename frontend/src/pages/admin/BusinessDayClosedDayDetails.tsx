import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiReceipt } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import { businessDayService, type BusinessDayReport } from "@/services/businessDayService";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

const BusinessDayClosedDayDetails: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { getToken } = useAuth();
  const { settings } = useSettings();
  const { can } = usePermissions();

  const canViewReports =
    can(RESOURCES.CLOSED_DAYS, ACTIONS.VIEW) ||
    can(RESOURCES.END_OF_DAY, ACTIONS.VIEW) ||
    can(RESOURCES.REPORTS, ACTIONS.VIEW);

  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [rawReportSearch, setRawReportSearch] = useState("");
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const rawReportJson = useMemo(() => {
    if (!report?.data) return "";
    return JSON.stringify(report.data, null, 2);
  }, [report]);

  const filteredRawReportJson = useMemo(() => {
    const q = rawReportSearch.trim().toLowerCase();
    if (!q) return { text: rawReportJson, matchCount: null as number | null };
    const lines = rawReportJson.split("\n");
    const matched = lines.filter((l) => l.toLowerCase().includes(q));
    return { text: matched.join("\n"), matchCount: matched.length };
  }, [rawReportJson, rawReportSearch]);

  const sessionMeta = useMemo(() => {
    const data = report?.data as any;
    return data?.session || null;
  }, [report]);

  const businessName = useMemo(() => {
    const data = report?.data as any;
    return data?.session?.branchName || data?.session?.branch?.name || null;
  }, [report]);

  const headerTitle = useMemo(() => {
    const bn = String((settings as any)?.businessName || "").trim();
    const branchName = String(businessName || "").trim();
    if (bn && branchName) return `${bn} - ${branchName}`;
    return bn || branchName || null;
  }, [settings, businessName]);

  const zReport = useMemo(() => {
    const data = report?.data as any;
    return data?.zReport || null;
  }, [report]);

  const reportOrders = useMemo(() => {
    const data = report?.data as any;
    return Array.isArray(data?.orders) ? (data.orders as any[]) : [];
  }, [report]);

  const dsfinvk = useMemo(() => {
    const data = report?.data as any;
    return data?.dsfinvk || null;
  }, [report]);

  const taxInclusive = useMemo(() => {
    const ti = (report as any)?.data?.session?.branch?.taxInclusive;
    return ti !== null && ti !== undefined ? Boolean(ti) : false;
  }, [report]);

  const vatRevenue = (b: any) => (taxInclusive ? b?.gross : b?.net);

  const businessAddressLine = useMemo(() => {
    const b = (sessionMeta as any)?.branch;
    const raw = String(b?.businessAddress || b?.address || "").trim();
    const zip = String(b?.zipCode || "").trim();
    const city = String(b?.city || "").trim();
    const line2 = [zip, city].filter(Boolean).join(" ").trim();
    return [raw, line2].filter(Boolean).join(" | ").trim() || null;
  }, [sessionMeta]);

  const businessPhoneLine = useMemo(() => {
    const b = (sessionMeta as any)?.branch;
    const phone = String(b?.businessPhone || "").trim();
    return phone ? `Tel: ${phone}` : null;
  }, [sessionMeta]);

  const paymentsByProvider = useMemo(() => {
    return (zReport as any)?.payments?.byProvider || {};
  }, [zReport]);

  const paymentsByProviderAndOrderType = useMemo(() => {
    return (zReport as any)?.payments?.byProviderAndOrderType || {};
  }, [zReport]);

  const refresh = async () => {
    if (!sessionId) return;
    try {
      setIsLoading(true);
      const token = await getToken();
      const rep = await businessDayService.getReport(sessionId, token || undefined);
      setReport(rep);
    } catch (e: any) {
      toast.error(e?.message || t("admin.businessDayClosedDayDetails.errors.loadReport"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    if (!receiptRef.current) return;

    let printRoot = document.getElementById("print-root");
    if (!printRoot) {
      printRoot = document.createElement("div");
      printRoot.id = "print-root";
      document.body.appendChild(printRoot);
    }

    printRoot.innerHTML = `<div class="zreport-print-root">${receiptRef.current.outerHTML}</div>`;

    const cleanup = () => {
      window.removeEventListener("afterprint", cleanup);
      const el = document.getElementById("print-root");
      if (el) el.innerHTML = "";
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  const formatDateTime = (value: string | Date | undefined | null) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hours24 = d.getHours();
    const hours12 = hours24 % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours24 >= 12 ? "PM" : "AM";
    return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()} ${hours12}:${minutes} ${ampm}`;
  };

  const formatMoney = (value: any) => {
    const num = Number(value || 0);
    if (Number.isNaN(num)) return String(value);
    return num.toFixed(2);
  };

  const formatMaybeMoney = (value: any) => {
    if (value === null || value === undefined) return "—";
    return formatMoney(value);
  };

  const buildOrderVatGroups = (items: any[]) => {
    const toNum = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const map = new Map<number, { key: string; label: string; amount: number }[]>();

    for (const it of items || []) {
      const itemType = String(it?.itemType || "");
      const baseRateForAddons = toNum(it?.taxPercentage);

      if (itemType !== "DEAL") {
        const rate = toNum(it?.taxPercentage);
        const qty = toNum(it?.quantity || 0);
        const unit = toNum(it?.unitPrice || 0);
        const lineTotal = unit * qty;
        const baseName =
          itemType === "DEAL_COMPONENT"
            ? it?.dealComponent?.name || it?.dealComponentName
            : it?.meal?.name || it?.deal?.name;
        const label = `${qty}x ${baseName || "Item"}${it?.selectedSize ? ` (${it.selectedSize})` : ""}`;
        map.set(rate, [...(map.get(rate) || []), { key: String(it?.id || label), label, amount: lineTotal }]);
      }

      for (const a of it?.orderItemAddOns || []) {
        const addonRate = a?.taxPercentage !== undefined && a?.taxPercentage !== null ? toNum(a?.taxPercentage) : baseRateForAddons;
        const addonQty = toNum(a?.quantity || 1);
        const addonTotal = toNum(a?.addOnPrice || 0) * addonQty;
        const addonLabel = `+ ${a?.addOnName || "Add-on"}${addonQty > 1 ? ` x${addonQty}` : ""}`;
        map.set(addonRate, [...(map.get(addonRate) || []), { key: `${it?.id || "item"}:${a?.id || addonLabel}`, label: addonLabel, amount: addonTotal }]);
      }
    }

    return Array.from(map.entries())
      .map(([rate, lines]) => ({
        rate,
        lines,
        subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
      }))
      .filter((g) => g.lines.length > 0)
      .sort((a, b) => a.rate - b.rate);
  };

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, canViewReports]);

  if (!canViewReports) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.businessDayClosedDayDetails.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">{t("common.accessDenied")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        #print-root { display: none; }
        @media print {
          @page { margin: 0; }
          html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* Print isolation: hide the app UI and print only #print-root */
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }

          #print-root .zreport-print-root {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
          }

          /* Receipt styling overrides */
          #print-root #bill-preview {
            width: 80mm !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/business-day/closed")}
            className="border-border bg-background text-foreground hover:bg-accent"
          >
            <Icon path={mdiArrowLeft} size={0.7} className="mr-2" />
            {t("common.back")}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon path={mdiReceipt} size={0.9} className="text-pink-500 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-pink-500 truncate">
              {t("admin.businessDayClosedDayDetails.title")}
            </h2>
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            disabled={!report || isLoading}
            className="bg-pink-500 hover:bg-pink-600 text-white flex-shrink-0"
          >
            {t("admin.businessDayClosedDayDetails.billPreview")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.businessDayClosedDayDetails.sessionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!sessionMeta ? (
            <div className="text-sm text-muted-foreground">{t("admin.businessDayClosedDayDetails.loadingSession")}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t("admin.businessDayClosedDayDetails.sessionLabel")}</div>
                <div className="text-sm font-semibold">#{sessionMeta.sequenceNumber}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t("admin.businessDayClosedDayDetails.startedLabel")}</div>
                <div className="text-sm font-semibold">{formatDateTime(sessionMeta.startedAt)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t("admin.businessDayClosedDayDetails.endedLabel")}</div>
                <div className="text-sm font-semibold">{formatDateTime(sessionMeta.endedAt)}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.businessDayClosedDayDetails.dailyReportTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.businessDayClosedDayDetails.grossSales")}</div>
                  <div className="text-sm font-semibold">
                    {report?.data?.totals?.grossSales?.toFixed?.(2) ?? report?.data?.totals?.grossSales}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t("zReport.drinks", { defaultValue: "Drinks" })}</div>
                  <div className="text-sm font-semibold">
                    {report?.data?.totals?.drinksGross?.toFixed?.(2) ?? report?.data?.totals?.drinksGross ?? "0.00"}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.businessDayClosedDayDetails.taxTotal")}</div>
                  <div className="text-sm font-semibold">
                    {report?.data?.totals?.taxTotal?.toFixed?.(2) ?? report?.data?.totals?.taxTotal}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  {t("admin.businessDayClosedDayDetails.byPaymentMethod")}
                </div>
                <div className="space-y-1">
                  {Object.entries(report?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold">{Number(v).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {dsfinvk ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground mb-2">{t("admin.fiskaly.dsfinvk.title")}</div>
                  {dsfinvk?.ok ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t("admin.fiskaly.dsfinvk.cashRegisterId")}</span>
                        <span className="font-semibold text-right break-all">
                          {String(dsfinvk?.data?.cashRegisterId || "—")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t("admin.fiskaly.dsfinvk.cashPointClosingId")}</span>
                        <span className="font-semibold text-right break-all">
                          {String(dsfinvk?.data?.cashPointClosingExportId || "—")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t("admin.fiskaly.dsfinvk.exportId")}</span>
                        <span className="font-semibold text-right break-all">
                          {String(dsfinvk?.data?.exportId || "—")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {String(dsfinvk?.error || t("admin.fiskaly.dsfinvk.submissionFailed"))}
                    </div>
                  )}
                </div>
              ) : null}

              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("admin.businessDayClosedDayDetails.rawReportData")}
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={rawReportSearch}
                      onChange={(e) => setRawReportSearch(e.target.value)}
                      placeholder={t("common.search", { defaultValue: "Search" })}
                      className="h-8"
                    />
                    {rawReportSearch.trim() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRawReportSearch("")}
                        className="h-8"
                      >
                        {t("common.clear", { defaultValue: "Clear" })}
                      </Button>
                    ) : null}
                  </div>
                  {filteredRawReportJson.matchCount !== null ? (
                    <div className="text-xs text-muted-foreground">
                      {t("common.results", { defaultValue: "Results" })}: {filteredRawReportJson.matchCount}
                    </div>
                  ) : null}
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {filteredRawReportJson.text}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.businessDayClosedDayDetails.dailyReportTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">{t("admin.businessDayClosedDayDetails.noReportLoaded")}</div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("admin.businessDayClosedDayDetails.billPreview")}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-auto">
            <div
              id="bill-preview"
              ref={receiptRef}
              className="mx-auto w-[80mm] bg-white text-black rounded-md border border-black/10 shadow-sm"
            >
              <div className="px-3 py-3 font-mono text-[11px] leading-4">
                <>
                  <div className="text-center font-semibold">
                    {t("zReport.zReport", { defaultValue: "Z-Report" })}: {t("zReport.number", { defaultValue: "No." })}{" "}
                    {sessionMeta?.sequenceNumber ?? "—"}
                  </div>
                  <div className="text-center">
                    {formatDateTime(sessionMeta?.startedAt)} {t("zReport.to", { defaultValue: "-" })}{" "}
                    {formatDateTime(sessionMeta?.endedAt)}
                  </div>
                  <div className="text-center">
                    {t("zReport.performedAt", { defaultValue: "Performed at" })} {formatDateTime(sessionMeta?.endedAt)}
                  </div>
                  {headerTitle && <div className="mt-1 text-center font-semibold">{headerTitle}</div>}

                  <div className="mt-1 text-center text-black/70">{businessAddressLine || "—"}</div>
                  <div className="text-center text-black/70">{businessPhoneLine || "—"}</div>
                  <div className="text-center text-black/70">
                    {t("zReport.taxLine", { defaultValue: "—" })}
                  </div>

                  {dsfinvk ? (
                    <>
                      <div className="my-2 border-t border-dashed border-black/40" />
                      <div className="font-semibold">{t("admin.fiskaly.dsfinvk.title")}</div>
                      {dsfinvk?.ok ? (
                        <div className="mt-1 space-y-0.5">
                          <div className="flex justify-between">
                            <span>{t("admin.fiskaly.dsfinvk.cashRegisterId")}</span>
                            <span className="text-right break-all pl-2">
                              {String(dsfinvk?.data?.cashRegisterId || "—")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t("admin.fiskaly.dsfinvk.cashPointClosingId")}</span>
                            <span className="text-right break-all pl-2">
                              {String(dsfinvk?.data?.cashPointClosingExportId || "—")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t("admin.fiskaly.dsfinvk.exportId")}</span>
                            <span className="text-right break-all pl-2">
                              {String(dsfinvk?.data?.exportId || "—")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-black/70">
                          {String(dsfinvk?.error || t("admin.fiskaly.dsfinvk.submissionFailed"))}
                        </div>
                      )}
                    </>
                  ) : null}

                <div className="my-2 border-t border-dashed border-black/40" />

                  <div className="flex justify-between">
                    <span>{t("zReport.totalOrders", { defaultValue: "Orders" })}</span>
                    <span>{String(zReport?.counts?.totalOrders ?? report?.data?.counts?.totalOrders ?? "—")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("zReport.cancelledOrders", { defaultValue: "Cancelled" })}</span>
                    <span>{String(zReport?.counts?.cancelledOrders ?? "—")}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>{t("zReport.articles", { defaultValue: "Artikel" })}</span>
                    <span>{formatMaybeMoney(zReport?.sales?.lines?.articlesGross)}</span>
                  </div>
                  {zReport?.sales?.lines?.foodsGross === null || zReport?.sales?.lines?.foodsGross === undefined ? null : (
                    <div className="flex justify-between">
                      <span>{t("zReport.foods", { defaultValue: "Foods" })}</span>
                      <span>{formatMaybeMoney(zReport?.sales?.lines?.foodsGross)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{t("zReport.discount", { defaultValue: "Rabatt" })}</span>
                    <span>{formatMaybeMoney(Number(zReport?.sales?.lines?.discountGross || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("zReport.drinks", { defaultValue: "Getränke" })}</span>
                    <span>{formatMaybeMoney(zReport?.sales?.lines?.drinksGross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("zReport.deliveryFee", { defaultValue: "Anfahrt" })}</span>
                    <span>{formatMaybeMoney(zReport?.sales?.lines?.deliveryFeeGross)}</span>
                  </div>
                  {(() => {
                    const takeaway = Number(zReport?.sales?.lines?.takeawayServiceFeeGross || 0);
                    if (Math.abs(takeaway) <= 0.0001) return null;
                    return (
                      <div className="flex justify-between">
                        <span>
                          {t("zReport.takeawayServiceFee", {
                            defaultValue: "Takeaway Servicegebühr",
                          })}
                        </span>
                        <span>{formatMaybeMoney(takeaway)}</span>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between">
                    <span>
                      {t("zReport.distance", { defaultValue: "Distance" })} {t("zReport.km", { defaultValue: "Km" })}
                    </span>
                    <span>{formatMaybeMoney(zReport?.sales?.lines?.distanceKm ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("zReport.sumCancelled", { defaultValue: "Summe davon Storniert" })}</span>
                    <span>
                      {formatMaybeMoney(
                        zReport?.sales?.sums?.sumCancelledGross ??
                          -(zReport?.sales?.sums?.refundedGross ?? report?.data?.totals?.refunded ?? 0)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>{t("zReport.totalRevenue", { defaultValue: "Gesamtumsatz" })}</span>
                    <span>
                      {formatMaybeMoney(
                        zReport?.sales?.sums?.totalRevenueGross ??
                          report?.data?.totals?.netSales ??
                          report?.data?.totals?.grossSales
                      )}
                    </span>
                  </div>

                {(() => {
                  const providers = [
                    { key: "STRIPE", title: t("zReport.providerStripe", { defaultValue: "Credit Card" }) },
                    { key: "PAYPAL", title: t("zReport.providerPayPal", { defaultValue: "PayPal" }) },
                    { key: "CASH", title: t("zReport.providerCash", { defaultValue: "Cash" }) },
                    { key: "CARD", title: t("zReport.providerCard", { defaultValue: "Card" }) },
                    { key: "OTHER", title: t("zReport.providerOther", { defaultValue: "Other" }) },
                  ] as Array<{ key: string; title: string }>;

                  const nonZeroProviders = providers.filter((p) => {
                    const total = Number((paymentsByProvider as any)?.[p.key] || 0);
                    return Math.abs(total) > 0.0001;
                  });

                  if (nonZeroProviders.length === 0) return null;

                  return (
                    <>
                      <div className="my-2 border-t border-dashed border-black/40" />

                      <div className="font-semibold">{t("zReport.payments", { defaultValue: "Payments" })}</div>
                      <div className="mt-1 space-y-0.5">
                        {nonZeroProviders.map((g) => {
                          const total = (paymentsByProvider as any)?.[g.key];
                          const byOt = (paymentsByProviderAndOrderType as any)?.[g.key] || {};
                          const pickup = byOt?.PICKUP;
                          const delivery = byOt?.DELIVERY;

                          return (
                            <React.Fragment key={g.key}>
                              <div className="flex justify-between font-semibold">
                                <span>{g.title}:</span>
                                <span>{formatMaybeMoney(total)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t("zReport.houseSale", { defaultValue: "Hausverkauft" })} {g.title}</span>
                                <span>{formatMaybeMoney(0)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t("zReport.pickup", { defaultValue: "Abholer" })} {g.title}</span>
                                <span>{formatMaybeMoney(pickup)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t("zReport.delivery", { defaultValue: "Lieferung" })} {g.title}</span>
                                <span>{formatMaybeMoney(delivery)}</span>
                              </div>
                              <div className="my-1 border-t border-dashed border-black/40" />
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                <div className="my-2 border-t border-dashed border-black/40" />

                  <div className="font-semibold">{t("zReport.vat", { defaultValue: "VAT" })}</div>
                  <div className="mt-1 space-y-1">
                    {(
                      [
                        { key: "BAR", title: t("zReport.cash", { defaultValue: "BAR" }) },
                        { key: "ONLINE", title: t("zReport.online", { defaultValue: "Online" }) },
                        { key: "EC", title: t("zReport.ec", { defaultValue: "EC" }) },
                      ] as Array<{ key: string; title: string }>
                    ).map((g) => {
                      const buckets = (zReport as any)?.vat?.byPaymentGroup?.[g.key];
                      if (!Array.isArray(buckets) || buckets.length === 0) return null;

                      const deliveryBucket = (zReport as any)?.vat?.delivery?.byPaymentGroup?.[g.key] || null;
                      const deliveryTax = deliveryBucket ? Number(deliveryBucket?.tax || 0) : 0;

                      const totalTax =
                        buckets.reduce((sum: number, b: any) => sum + Number(b?.tax || 0), 0) + deliveryTax;

                      return (
                        <React.Fragment key={g.key}>
                          {buckets.map((b: any) => (
                            <React.Fragment key={`${g.key}-${String(b?.rate)}`}>
                              <div className="flex justify-between font-semibold">
                                <span>
                                  {g.title} {t("zReport.vatRate", { defaultValue: "MwSt" })}
                                </span>
                                <span>{Number(b?.rate || 0).toFixed(2)}%</span>
                              </div>

                              <div className="flex justify-between">
                                <span>{t("zReport.articles", { defaultValue: "Artikel" })}:</span>
                                <span>
                                  {formatMaybeMoney(vatRevenue(b))} {formatMaybeMoney(b?.tax)}
                                </span>
                              </div>
                            </React.Fragment>
                          ))}

                          <div className="flex justify-between">
                            <span>{t("zReport.deliveryFee", { defaultValue: "Anfahrt" })}:</span>
                            {deliveryBucket ? (
                              <span>
                                {formatMaybeMoney(vatRevenue(deliveryBucket))} {formatMaybeMoney(deliveryBucket?.tax)}
                              </span>
                            ) : (
                              <span>
                                {formatMaybeMoney(0)} {formatMaybeMoney(0)}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span>{t("zReport.discount", { defaultValue: "Rabatt" })}:</span>
                            <span>
                              {formatMaybeMoney(0)} {formatMaybeMoney(0)}
                            </span>
                          </div>

                          <div className="flex justify-between font-semibold">
                            <span>
                              {t("zReport.totalVatByGroup", { defaultValue: "Gesamt" })} {g.title} {t("zReport.vatRate", { defaultValue: "MwSt" })}:
                            </span>
                            <span>{formatMaybeMoney(totalTax)}</span>
                          </div>
                          <div className="my-1 border-t border-dashed border-black/40" />
                        </React.Fragment>
                      );
                    })}

                    {Array.isArray((zReport as any)?.vat?.byRate) && (zReport as any).vat.byRate.length > 0 ? (
                      <>
                        {(zReport as any).vat.byRate.map((b: any) => (
                          <React.Fragment key={`overall-${String(b?.rate)}`}>
                            <div className="flex justify-between">
                              <span>
                                {t("zReport.revenueAtRate", { defaultValue: "Umsatz" })} {Number(b?.rate || 0).toFixed(2)}%:
                              </span>
                              <span>{formatMaybeMoney(vatRevenue(b))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>
                                {t("zReport.taxAtRate", { defaultValue: "Steuer" })} {Number(b?.rate || 0).toFixed(2)}%:
                              </span>
                              <span>{formatMaybeMoney(b?.tax)}</span>
                            </div>
                          </React.Fragment>
                        ))}

                        {(() => {
                          const deliveryTotals = (zReport as any)?.vat?.delivery?.totals;
                          const rate = Number((zReport as any)?.vat?.deliveryVatRate || 0);
                          if (!deliveryTotals || !rate) return null;

                          const tax = Number(deliveryTotals?.tax || 0);
                          const hasAny =
                            Math.abs(Number(deliveryTotals?.gross || 0)) > 0 ||
                            Math.abs(Number(deliveryTotals?.net || 0)) > 0 ||
                            Math.abs(tax) > 0;
                          if (!hasAny) return null;

                          return (
                            <>
                              <div className="flex justify-between">
                                <span>
                                  {t("zReport.deliveryFee", { defaultValue: "Anfahrt" })} {rate.toFixed(2)}%:
                                </span>
                                <span>{formatMaybeMoney(vatRevenue(deliveryTotals))}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>
                                  {t("zReport.deliveryTaxAtRate", { defaultValue: "Delivery tax" })} {rate.toFixed(2)}%:
                                </span>
                                <span>{formatMaybeMoney(tax)}</span>
                              </div>
                            </>
                          );
                        })()}

                        <div className="flex justify-between font-semibold">
                          <span>{t("zReport.totalTax", { defaultValue: "Gesamtsteuer" })}:</span>
                          <span>
                            {formatMaybeMoney(
                              (zReport as any).vat.byRate.reduce(
                                (sum: number, b: any) => sum + Number(b?.tax || 0),
                                0
                              ) + Number((zReport as any)?.vat?.delivery?.totals?.tax || 0)
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-black/60">—</div>
                    )}
                  </div>

                  <div className="mt-3 text-center text-[10px] text-black/70">
                    {t("receipt.poweredBy")} GMS Pro
                  </div>

                  {reportOrders.length > 0 ? (
                    <>
                      <div className="my-2 border-t border-dashed border-black/40" />
                      <div className="font-semibold">{t("zReport.totalOrders", { defaultValue: "Orders" })}</div>

                      <div className="mt-1 space-y-2">
                        {reportOrders.map((o: any) => {
                          const vatGroups = buildOrderVatGroups(o?.orderItems || []);
                          return (
                            <div key={String(o?.id || o?.orderNumber)}>
                              <div className="flex justify-between font-semibold">
                                <span>
                                  #{String(o?.orderNumber || "—")} {String(o?.orderType || "")}
                                </span>
                                <span>{formatMaybeMoney(o?.totalAmount)}</span>
                              </div>
                              {vatGroups.map((g: any) => (
                                <div key={`${String(o?.id)}:${String(g.rate)}`} className="mt-1">
                                  <div className="font-semibold">VAT {Number(g.rate || 0).toFixed(0)}%</div>
                                  <div className="space-y-0.5">
                                    {g.lines.map((l: any) => (
                                      <div key={l.key} className="flex justify-between">
                                        <span className="pr-2">{l.label}</span>
                                        <span>{formatMaybeMoney(l.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex justify-between font-semibold">
                                    <span>{t("common.subtotal", { defaultValue: "Subtotal" })}</span>
                                    <span>{formatMaybeMoney(g.subtotal)}</span>
                                  </div>
                                </div>
                              ))}

                              <div className="my-2 border-t border-dashed border-black/40" />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPreviewOpen(false)}
              className="border-border bg-background text-foreground hover:bg-accent"
            >
              {t("common.close")}
            </Button>
            <Button className="bg-pink-500 hover:bg-pink-600 text-white" onClick={handlePrint}>
              {t("common.print")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessDayClosedDayDetails;
