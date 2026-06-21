import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import ApiService from "@/services/apiService";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";

type PublicOrderDetailsResponse = {
  success: boolean;
  data?: any;
  error?: string;
};

const PublicOrderDetails: React.FC = () => {
  const { t } = useTranslation();
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);

  const api = useMemo(() => ApiService.getInstance(), []);

  const organizationName = useMemo(() => {
    const businessName = (order as any)?.branch?.organization?.settings?.businessName as
      | string
      | null
      | undefined;
    const orgName = (order as any)?.branch?.organization?.name as string | null | undefined;
    const raw = String(businessName ?? orgName ?? "").trim();
    return raw || "";
  }, [order]);

  const organizationLogo = useMemo(() => {
    const logo = (order as any)?.branch?.organization?.settings?.businessLogo as
      | string
      | null
      | undefined;
    const raw = String(logo ?? "").trim();
    return raw || "";
  }, [order]);

  const organizationLogoSrc = useMemo(() => {
    if (!organizationLogo) return "";
    return isExternalImage(organizationLogo)
      ? organizationLogo
      : getOptimizedImageUrl(organizationLogo, "thumbnail");
  }, [organizationLogo]);

  useEffect(() => {
    const title = (organizationName || "").trim();
    if (!title) return;
    try {
      document.title = title;
    } catch {
      // ignore
    }
  }, [organizationName]);

  useEffect(() => {
    const rawHref = (organizationLogoSrc || "").trim();
    if (!rawHref) return;

    const cacheBustedHref = rawHref.startsWith("data:")
      ? rawHref
      : `${rawHref}${rawHref.includes("?") ? "&" : "?"}v=${encodeURIComponent(
          (order as any)?.id || "order"
        )}`;

    try {
      document
        .querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
        )
        .forEach((n) => n.parentNode?.removeChild(n));

      const create = (rel: string) => {
        const el = document.createElement("link");
        el.rel = rel;
        el.href = cacheBustedHref;
        document.head.appendChild(el);
      };

      create("icon");
      create("shortcut icon");
      create("apple-touch-icon");
    } catch {
      // ignore
    }
  }, [order, organizationLogoSrc]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!orderId) {
          setError(t("common.error", { defaultValue: "Error" }));
          return;
        }

        if (!token) {
          setError(
            t("deliveryLink.missingToken", {
              defaultValue: "Missing token. Please scan the QR code again.",
            })
          );
          return;
        }

        const res = (await api.get(
          `/api/user/order/${orderId}?token=${encodeURIComponent(token)}`
        )) as PublicOrderDetailsResponse;

        if (!res?.success || !res.data) {
          setError(res?.error || t("common.error", { defaultValue: "Error" }));
          return;
        }

        setOrder(res.data);
      } catch (e: any) {
        setError(e?.message || t("common.error", { defaultValue: "Error" }));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [api, orderId, t, token]);

  const currency = order?.currency || "EUR";
  const formatCurrency = useMemo(() => {
    return (amount: number) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(Number(amount || 0));
  }, [currency]);

  const scheduledInfo = useMemo(() => {
    if (!order?.isScheduledOrder) return null;
    if (!order?.scheduledDate) return null;
    const d = new Date(order.scheduledDate);
    if (Number.isNaN(d.getTime())) return null;
    return {
      date: d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }, [order?.isScheduledOrder, order?.scheduledDate]);

  const isTaxInclusive = Boolean(order?.taxInclusive ?? false);

  const topItems = useMemo(() => {
    if (!order?.orderItems) return [];
    return (order.orderItems as any[]).filter(
      (it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId
    );
  }, [order]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingPrepMs = useMemo(() => {
    if (!order) return null;
    const prepMin = order.preparationTime != null ? Number(order.preparationTime) : NaN;
    if (!Number.isFinite(prepMin) || prepMin <= 0) return null;
    const eligibleStatuses = new Set([
      "CONFIRMED",
      "PREPARING",
      "READY_FOR_DELIVERY",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "PICKED_UP",
    ]);
    const anchorRaw =
      order.confirmedAt || (eligibleStatuses.has(String(order.status)) ? order.createdAt : null);
    if (!anchorRaw) return null;
    const anchor = new Date(anchorRaw);
    if (Number.isNaN(anchor.getTime())) return null;
    const end = anchor.getTime() + prepMin * 60 * 1000;
    return Math.max(0, end - nowMs);
  }, [order, nowMs]);

  const formatRemaining = (ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  const vatGroups = useMemo(() => {
    const map = new Map<number, { key: string; label: string; amount: number }[]>();
    const items = (order?.orderItems as any[]) || [];

    const toNum = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    for (const it of items) {
      const baseRateForAddons = toNum(it?.taxPercentage);

      if (it?.itemType !== "DEAL") {
        const rate = toNum(it?.taxPercentage);
        const lineTotal = toNum(it?.totalPrice ?? toNum(it?.unitPrice) * toNum(it?.quantity));
        const baseName =
          it?.itemType === "DEAL_COMPONENT"
            ? it?.dealComponent?.name || it?.dealComponentName
            : it?.meal?.name || it?.deal?.name;
        const label = `${toNum(it?.quantity)}x ${baseName || "Item"}${it?.selectedSize ? ` (${it.selectedSize})` : ""}`;
        map.set(rate, [...(map.get(rate) || []), { key: it?.id || label, label, amount: lineTotal }]);
      }

      for (const a of it?.orderItemAddOns || []) {
        const addonRate = a?.taxPercentage !== undefined && a?.taxPercentage !== null ? toNum(a?.taxPercentage) : baseRateForAddons;
        const addonTotal = toNum(a?.addOnPrice) * toNum(a?.quantity || 1);
        const addonLabel = `+ ${a?.addOnName || "Add-on"}${a?.quantity && Number(a.quantity) > 1 ? ` x${Number(a.quantity)}` : ""}`;
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
  }, [order]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {organizationName || organizationLogoSrc ? (
          <div className="mb-4 flex items-center gap-3">
            {organizationLogoSrc ? (
              <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted border">
                <img
                  src={organizationLogoSrc}
                  alt={organizationName || "Logo"}
                  className="h-full w-full object-contain"
                  loading="eager"
                />
              </div>
            ) : null}
            {organizationName ? (
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">
                  {organizationName}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-4">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            {t("common.back", { defaultValue: "Back" })}
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xl">
                {t("orders.orderNumber", { defaultValue: "Order" })}{" "}
                {order?.orderNumber ? `#${order.orderNumber}` : ""}
              </CardTitle>
              {order?.isMerged ? (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                {t("common.loading", { defaultValue: "Loading..." })}
              </div>
            ) : error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="font-semibold">
                  {t("common.error", { defaultValue: "Error" })}
                </div>
                <div className="mt-1">{error}</div>
              </div>
            ) : order ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {t("admin.orderManagement.orderInformation", {
                      defaultValue: "Order information",
                    })}
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.orderType", {
                          defaultValue: "Order Type",
                        })}
                      </span>
                      <span className="font-medium">
                        {order.orderType === "PICKUP"
                          ? t("admin.orderManagement.orderTypes.pickup", {
                              defaultValue: "Pickup",
                            })
                          : t("admin.orderManagement.orderTypes.delivery", {
                              defaultValue: "Delivery",
                            })}
                      </span>
                    </div>

                    {scheduledInfo && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {order.orderType === "PICKUP"
                            ? t("admin.orderManagement.scheduled.pickupFor", {
                                defaultValue: "Pickup Scheduled For",
                              })
                            : t("admin.orderManagement.scheduled.deliveryFor", {
                                defaultValue: "Delivery Scheduled For",
                              })}
                        </span>
                        <span className="font-medium">
                          {scheduledInfo.date} {t("admin.orderManagement.scheduled.at", { defaultValue: "at" })} {scheduledInfo.time}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.totalAmount", {
                          defaultValue: "Total amount",
                        })}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(Number(order.totalAmount || 0))}
                      </span>
                    </div>
                    {remainingPrepMs !== null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("admin.orderManagement.preparationTimeRemaining", {
                            defaultValue: "Preparation time remaining",
                          })}
                        </span>
                        <span className="font-semibold text-purple-400">
                          {formatRemaining(remainingPrepMs)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {t("orders.orderItems", { defaultValue: "Order Items" })}
                  </div>
                  <div className="space-y-2">
                    {topItems.map((item: any) => {
                      const isDeal = item?.itemType === "DEAL" || Boolean(item?.deal);
                      const name = item?.meal?.name || item?.deal?.name || "Item";
                      const qty = Number(item?.quantity || 0);

                      const imageRaw =
                        (item?.meal?.image as string | null | undefined) ||
                        (item?.deal?.image as string | null | undefined) ||
                        "";
                      const imageSrc = imageRaw
                        ? isExternalImage(imageRaw)
                          ? imageRaw
                          : getOptimizedImageUrl(imageRaw, "thumbnail")
                        : "";

                      const childItems = (order.orderItems as any[]).filter(
                        (ci: any) =>
                          ci?.itemType === "DEAL_COMPONENT" &&
                          String(ci?.parentDealItemId) === String(item.id)
                      );

                      return (
                        <div
                          key={item.id}
                          className="border rounded-lg overflow-hidden bg-card"
                        >
                          <div className="p-3 flex justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                {imageSrc ? (
                                  <div className="h-10 w-10 rounded-md overflow-hidden bg-muted border shrink-0">
                                    <img
                                      src={imageSrc}
                                      alt={name}
                                      className="h-full w-full object-cover"
                                      loading="eager"
                                    />
                                  </div>
                                ) : null}

                                <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {isDeal
                                  ? t("orders.deal", { defaultValue: "Deal" }) +
                                    ": " +
                                    name
                                  : name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t("orders.qty", { defaultValue: "Qty" })}: {qty}
                              </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-right font-semibold">
                              {formatCurrency(Number(item.totalPrice || 0))}
                            </div>
                          </div>

                          {isDeal && childItems.length > 0 && (
                            <div className="border-t bg-muted/30 px-3 py-2">
                              <div className="text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                {t("orders.dealComponents", {
                                  defaultValue: "Includes",
                                })}
                              </div>
                              <div className="space-y-1 text-xs">
                                {childItems.map((ci: any) => (
                                  <div
                                    key={ci.id}
                                    className="flex justify-between gap-3"
                                  >
                                    <span className="text-muted-foreground">
                                      {ci?.dealComponent?.name || "Component"}
                                      {ci?.quantity
                                        ? ` ×${Number(ci.quantity)}`
                                        : ""}
                                    </span>
                                    <span>
                                      {formatCurrency(Number(ci.totalPrice || 0))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {item?.orderItemAddOns && item.orderItemAddOns.length > 0 && (
                            <div className="border-t bg-muted/10 px-3 py-2">
                              <div className="text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                {t("orders.addons", { defaultValue: "Add-ons" })}
                              </div>
                              <div className="space-y-1 text-xs">
                                {item.orderItemAddOns.map((a: any) => (
                                  <div key={a?.id || a?.addOnName} className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">
                                      + {a?.addOnName || "Add-on"}
                                      {a?.quantity && Number(a.quantity) > 1
                                        ? ` x${Number(a.quantity)}`
                                        : ""}
                                    </span>
                                    <span>
                                      {formatCurrency(
                                        Number(a?.addOnPrice || 0) * Number(a?.quantity || 1)
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {t("orders.taxBreakdown", { defaultValue: "Tax breakdown" })}
                  </div>

                  <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
                    {vatGroups.length > 0 ? (
                      <div className="space-y-1">
                        {vatGroups.map((g) => (
                          <div key={g.rate} className="flex justify-between gap-4">
                            <span className="text-muted-foreground">
                              {isTaxInclusive
                                ? `${t("receipt.includedVat", { defaultValue: "Included VAT" })} ${Number(g.rate).toFixed(1)}%`
                                : `${t("receipt.vat", { defaultValue: "VAT" })} ${Number(g.rate).toFixed(1)}%`}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(
                                isTaxInclusive
                                  ? (Number(g.subtotal || 0) * Number(g.rate || 0)) /
                                      (100 + Number(g.rate || 0))
                                  : (Number(g.subtotal || 0) * Number(g.rate || 0)) / 100
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {isTaxInclusive
                            ? t("receipt.includedVat", { defaultValue: "Included VAT" })
                            : t("receipt.vat", { defaultValue: "VAT" })}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(Number(order.taxAmount || 0))}
                        </span>
                      </div>
                    )}

                    {order.orderType === "DELIVERY" ? (
                      <>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            {t("receipt.deliveryFee", { defaultValue: "Delivery fee" })}
                          </span>
                          <span className="font-medium">
                            {formatCurrency(Number(order.deliveryFee || 0))}
                          </span>
                        </div>
                        {!isTaxInclusive && Number(order.deliveryTaxAmount || 0) > 0 ? (
                          <div className="flex justify-between gap-4 ml-4">
                            <span className="text-xs text-muted-foreground">
                              {t("receipt.deliveryVat", { defaultValue: "Delivery VAT" })}
                            </span>
                            <span className="text-xs font-medium">
                              {formatCurrency(Number(order.deliveryTaxAmount || 0))}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {Number(order.takeawayServiceFee || 0) > 0 ? (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">
                              {t("receipt.takeawayServiceFee", {
                                defaultValue: "Takeaway service fee",
                              })}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(Number(order.takeawayServiceFee || 0))}
                            </span>
                          </div>
                        ) : null}

                        {!isTaxInclusive && Number(order.takeawayServiceTaxAmount || 0) > 0 ? (
                          <div className="flex justify-between gap-4 ml-4">
                            <span className="text-xs text-muted-foreground">
                              {t("receipt.takeawayServiceTax", {
                                defaultValue: "Takeaway service tax",
                              })}
                            </span>
                            <span className="text-xs font-medium">
                              {formatCurrency(Number(order.takeawayServiceTaxAmount || 0))}
                            </span>
                          </div>
                        ) : null}
                      </>
                    )}

                    <div className="flex justify-between gap-4 border-t pt-2">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.tax", {
                          defaultValue: "Tax",
                        })}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(Number(order.taxAmount || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicOrderDetails;
