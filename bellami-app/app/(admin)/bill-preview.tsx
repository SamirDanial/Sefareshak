import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { type Order } from "@/src/services/orderService";
import { orderReceiptService } from "@/src/services/orderReceiptService";
import { buildEscPosBytes, buildReceiptText } from "@/src/utils/receiptBuilder";
import { printerService, type PairedPrinter } from "@/src/services/printerService";
import ApiService from "@/src/services/apiService";
import branchService, { type Branch } from "@/src/services/branchService";
import { businessDayService, type BusinessDayReport } from "@/src/services/businessDayService";

const IS_IOS = (Platform.OS as string) === "ios";

export default function BillPreviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderId = (params.id as string | undefined) || undefined;
  const sessionId = (params.sessionId as string | undefined) || undefined;
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);
  const [fiskalySignaturePayload, setFiskalySignaturePayload] = useState<any | null>(null);
  const [fiskalyCorrections, setFiskalyCorrections] = useState<any[]>([]);
  const [printing, setPrinting] = useState(false);

  const [printers, setPrinters] = useState<PairedPrinter[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const receiptText = useMemo(() => {
    if (!order && !report) return "";

    if (report && !order) {
      const data: any = report.data;
      const session = data?.session;
      const branch = session?.branch;
      const dsfinvk = data?.dsfinvk || null;

      const taxInclusive = (() => {
        const ti = (report as any)?.data?.session?.branch?.taxInclusive;
        return ti !== null && ti !== undefined ? Boolean(ti) : false;
      })();

      const vatRevenue = (b: any) => (taxInclusive ? b?.gross : b?.net);

      const fmt = (v: any) => {
        const num = Number(v || 0);
        if (Number.isNaN(num)) return String(v ?? "0");
        return num.toFixed(2);
      };

      const formatReceiptDateTime = (value: string | Date | undefined | null) => {
        if (!value) return "—";
        const d = value instanceof Date ? value : new Date(value);
        try {
          return d.toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch {
          return d.toLocaleString();
        }
      };

      const formatMaybeMoney = (value: any) => {
        if (value === null || value === undefined) return "—";
        return fmt(value);
      };

      const z: any = data?.zReport || null;
      const salesLines = z?.sales?.lines || {};
      const salesSums = z?.sales?.sums || {};
      const paymentsByProvider = z?.payments?.byProvider || {};
      const paymentsByProviderAndOrderType = z?.payments?.byProviderAndOrderType || {};

      const padRight = (s: string, len: number) => {
        if (s.length >= len) return s;
        return s + " ".repeat(len - s.length);
      };

      const safeLine = (s: string, width: number) => {
        const str = String(s || "");
        const out: string[] = [];
        let i = 0;
        while (i < str.length) {
          out.push(str.slice(i, i + width));
          i += width;
        }
        return out.length > 0 ? out : [""];
      };

      const lineWidth = 42;

      const buildOrderVatGroups = (items: any[]) => {
        const toNum = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const map = new Map<number, Array<{ label: string; amount: number }>>();
        for (const it of items || []) {
          const itemType = String((it as any)?.itemType || "");
          const baseRateForAddons = toNum((it as any)?.taxPercentage);

          // Deal parent is a container; components are the priced/taxed lines.
          if (itemType !== "DEAL") {
            const rate = toNum((it as any)?.taxPercentage);
            const qty = toNum((it as any)?.quantity || 0);
            const unit = toNum((it as any)?.unitPrice || 0);
            const lineTotal = unit * qty;
            const baseName =
              itemType === "DEAL_COMPONENT"
                ? (it as any)?.dealComponent?.name || (it as any)?.dealComponentName
                : (it as any)?.meal?.name || (it as any)?.deal?.name;
            const label = `${qty}x ${baseName || "Item"}${(it as any)?.selectedSize ? ` (${(it as any).selectedSize})` : ""}`;
            map.set(rate, [...(map.get(rate) || []), { label, amount: lineTotal }]);
          }

          for (const a of (it as any)?.orderItemAddOns || []) {
            const addonRate =
              (a as any)?.taxPercentage !== undefined && (a as any)?.taxPercentage !== null
                ? toNum((a as any)?.taxPercentage)
                : baseRateForAddons;
            const addonQty = toNum((a as any)?.quantity || 1);
            const addonTotal = toNum((a as any)?.addOnPrice || 0) * addonQty;
            const addonLabel = `+ ${(a as any)?.addOnName || "Add-on"}${addonQty > 1 ? ` x${addonQty}` : ""}`;
            map.set(addonRate, [...(map.get(addonRate) || []), { label: addonLabel, amount: addonTotal }]);
          }
        }

        return Array.from(map.entries())
          .map(([rate, groupLines]) => ({
            rate,
            lines: groupLines,
            subtotal: groupLines.reduce((s, l) => s + Number(l.amount || 0), 0),
          }))
          .filter((g) => g.lines.length > 0)
          .sort((a, b) => a.rate - b.rate);
      };

      const lines: string[] = [];
      lines.push(
        `${t("zReport.zReport", { defaultValue: "Z-Report" })}: ${t("zReport.number", { defaultValue: "No." })} ${session?.sequenceNumber ?? "—"}`
      );
      lines.push(
        `${formatReceiptDateTime(session?.startedAt)} ${t("zReport.to", { defaultValue: "-" })} ${formatReceiptDateTime(session?.endedAt)}`
      );
      lines.push(
        `${t("zReport.performedAt", { defaultValue: "Performed at" })} ${formatReceiptDateTime(session?.endedAt)}`
      );

      const settingsBusinessName = String((settings as any)?.businessName || "").trim();
      const branchName = String(branch?.name || session?.branchName || "").trim();
      const headerName = settingsBusinessName && branchName ? `${settingsBusinessName} - ${branchName}` : (settingsBusinessName || branchName);
      if (headerName) lines.push(headerName);

      const addr = String(branch?.businessAddress || branch?.address || "").trim();
      const zip = String(branch?.zipCode || "").trim();
      const city = String(branch?.city || "").trim();
      const line2 = [zip, city].filter(Boolean).join(" ").trim();
      const addressLine = [addr, line2].filter(Boolean).join(" | ").trim();
      if (addressLine) lines.push(addressLine);

      const phone = String(branch?.businessPhone || "").trim();
      if (phone) lines.push(`Tel: ${phone}`);

      lines.push(t("zReport.taxLine", { defaultValue: "—" }));

      if (dsfinvk) {
        lines.push("--------------------------------");
        lines.push(t("admin.fiskaly.dsfinvk.title", { defaultValue: "Fiskaly DSFinV-K" }));
        if (dsfinvk?.ok) {
          const cashRegisterId = String(dsfinvk?.data?.cashRegisterId || "—");
          const cashPointClosingId = String(dsfinvk?.data?.cashPointClosingExportId || "—");
          const exportId = String(dsfinvk?.data?.exportId || "—");

          for (const l of safeLine(
            `${t("admin.fiskaly.dsfinvk.cashRegisterId", { defaultValue: "Cash Register ID" })}: ${cashRegisterId}`,
            lineWidth
          ))
            lines.push(l);
          for (const l of safeLine(
            `${t("admin.fiskaly.dsfinvk.cashPointClosingId", { defaultValue: "Cash Point Closing ID" })}: ${cashPointClosingId}`,
            lineWidth
          ))
            lines.push(l);
          for (const l of safeLine(`${t("admin.fiskaly.dsfinvk.exportId", { defaultValue: "Export ID" })}: ${exportId}`, lineWidth))
            lines.push(l);
        } else {
          const err = String(dsfinvk?.error || t("admin.fiskaly.dsfinvk.submissionFailed", { defaultValue: "DSFinV-K submission failed" }));
          for (const l of safeLine(err, lineWidth)) lines.push(l);
        }
      }

      lines.push("--------------------------------");

      lines.push(
        `${t("zReport.totalOrders", { defaultValue: "Orders" })}: ${String(z?.counts?.totalOrders ?? data?.counts?.totalOrders ?? "—")}`
      );
      lines.push(
        `${t("zReport.cancelledOrders", { defaultValue: "Cancelled" })}: ${String(z?.counts?.cancelledOrders ?? "—")}`
      );
      lines.push("--------------------------------");

      lines.push(`${t("zReport.articles", { defaultValue: "Articles" })}: ${formatMaybeMoney(salesLines.articlesGross)}`);
      lines.push(`${t("zReport.discount", { defaultValue: "Discount" })}: ${formatMaybeMoney(Number(salesLines.discountGross || 0))}`);
      lines.push(`${t("zReport.drinks", { defaultValue: "Drinks" })}: ${formatMaybeMoney(salesLines.drinksGross)}`);
      lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })}: ${formatMaybeMoney(salesLines.deliveryFeeGross)}`);
      lines.push(`${t("zReport.distance", { defaultValue: "Distance" })} ${t("zReport.km", { defaultValue: "Km" })}: ${formatMaybeMoney(salesLines.distanceKm ?? 0)}`);
      lines.push("--------------------------------");

      lines.push(`${t("zReport.sumCancelled", { defaultValue: "Sum cancelled" })}: ${formatMaybeMoney(salesSums.sumCancelledGross ?? 0)}`);
      lines.push(`${t("zReport.totalRevenue", { defaultValue: "Total revenue" })}: ${formatMaybeMoney(salesSums.totalRevenueGross ?? data?.totals?.netSales ?? data?.totals?.grossSales)}`);

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

      if (nonZeroProviders.length > 0) {
        lines.push("--------------------------------");
        lines.push(t("zReport.payments", { defaultValue: "Payments" }));
        for (const g of nonZeroProviders) {
          const total = (paymentsByProvider as any)?.[g.key];
          const byOt = (paymentsByProviderAndOrderType as any)?.[g.key] || {};
          const pickup = byOt?.PICKUP;
          const delivery = byOt?.DELIVERY;
          lines.push(`${g.title}: ${formatMaybeMoney(total)}`);
          lines.push(`${t("zReport.houseSale", { defaultValue: "House sale" })} ${g.title} ${formatMaybeMoney(0)}`);
          lines.push(`${t("zReport.pickup", { defaultValue: "Pickup" })} ${g.title} ${formatMaybeMoney(pickup)}`);
          lines.push(`${t("zReport.delivery", { defaultValue: "Delivery" })} ${g.title} ${formatMaybeMoney(delivery)}`);
          lines.push("--------------------------------");
        }
      }

      lines.push(t("zReport.vat", { defaultValue: "VAT" }));

      const paymentGroups = [
        { key: "BAR", title: t("zReport.cash", { defaultValue: "BAR" }) },
        { key: "ONLINE", title: t("zReport.online", { defaultValue: "Online" }) },
        { key: "EC", title: t("zReport.ec", { defaultValue: "EC" }) },
      ] as Array<{ key: string; title: string }>;

      const vatByPaymentGroup = (z as any)?.vat?.byPaymentGroup || {};
      const deliveryByPaymentGroup = (z as any)?.vat?.delivery?.byPaymentGroup || {};

      for (const g of paymentGroups) {
        const buckets = vatByPaymentGroup?.[g.key];
        if (!Array.isArray(buckets) || buckets.length === 0) continue;

        const deliveryBucket = deliveryByPaymentGroup?.[g.key] || null;
        const deliveryTax = deliveryBucket ? Number(deliveryBucket?.tax || 0) : 0;
        const totalTax = buckets.reduce((sum: number, b: any) => sum + Number(b?.tax || 0), 0) + deliveryTax;

        for (const b of buckets) {
          lines.push(`${g.title} ${t("zReport.vatRate", { defaultValue: "VAT" })} ${Number(b?.rate || 0).toFixed(2)}%`);
          lines.push(`${t("zReport.articles", { defaultValue: "Articles" })}: ${formatMaybeMoney(vatRevenue(b))} ${formatMaybeMoney(b?.tax)}`);
        }

        if (deliveryBucket) {
          lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })}: ${formatMaybeMoney(vatRevenue(deliveryBucket))} ${formatMaybeMoney(deliveryBucket?.tax)}`);
        } else {
          lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })}: ${formatMaybeMoney(0)} ${formatMaybeMoney(0)}`);
        }
        lines.push(`${t("zReport.discount", { defaultValue: "Discount" })}: ${formatMaybeMoney(0)} ${formatMaybeMoney(0)}`);

        lines.push(`${t("zReport.totalVatByGroup", { defaultValue: "Total" })} ${g.title} ${t("zReport.vatRate", { defaultValue: "VAT" })}: ${formatMaybeMoney(totalTax)}`);
        lines.push("--------------------------------");
      }

      const overallByRate = (z as any)?.vat?.byRate;
      if (Array.isArray(overallByRate) && overallByRate.length > 0) {
        for (const b of overallByRate) {
          const rate = Number(b?.rate || 0);
          lines.push(`${t("zReport.revenueAtRate", { defaultValue: "Revenue" })} ${rate.toFixed(2)}%: ${formatMaybeMoney(vatRevenue(b))}`);
          lines.push(`${t("zReport.taxAtRate", { defaultValue: "Tax" })} ${rate.toFixed(2)}%: ${formatMaybeMoney(b?.tax)}`);
        }

        const deliveryTotals = (z as any)?.vat?.delivery?.totals;
        const rate = Number((z as any)?.vat?.deliveryVatRate || 0);
        if (deliveryTotals && rate) {
          const tax = Number(deliveryTotals?.tax || 0);
          const hasAny =
            Math.abs(Number(deliveryTotals?.gross || 0)) > 0 ||
            Math.abs(Number(deliveryTotals?.net || 0)) > 0 ||
            Math.abs(tax) > 0;
          if (hasAny) {
            lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })} ${rate.toFixed(2)}%: ${formatMaybeMoney(vatRevenue(deliveryTotals))}`);
            lines.push(`${t("zReport.deliveryTaxAtRate", { defaultValue: "Delivery tax" })} ${rate.toFixed(2)}%: ${formatMaybeMoney(tax)}`);
          }
        }

        const totalTax =
          overallByRate.reduce((sum: number, b: any) => sum + Number(b?.tax || 0), 0) +
          Number((z as any)?.vat?.delivery?.totals?.tax || 0);
        lines.push(`${t("zReport.totalTax", { defaultValue: "Total tax" })}: ${formatMaybeMoney(totalTax)}`);
      } else {
        lines.push("—");
      }

      const reportOrders = Array.isArray((data as any)?.orders) ? ((data as any).orders as any[]) : [];
      if (reportOrders.length > 0) {
        lines.push("--------------------------------");
        lines.push(t("zReport.totalOrders", { defaultValue: "Orders" }));

        for (const o of reportOrders) {
          lines.push(`Order #${String(o?.orderNumber || "—")} ${String(o?.orderType || "")}`);
          const vatGroups = buildOrderVatGroups(o?.orderItems || []);

          for (const g of vatGroups) {
            lines.push(`VAT ${Number(g.rate || 0).toFixed(0)}%`);
            for (const l of g.lines) {
              const price = fmt(Number(l.amount || 0));
              const left = String(l.label || "");
              const maxLeft = Math.max(0, lineWidth - price.length - 1);
              const leftTrimmed = left.length > maxLeft ? left.slice(0, maxLeft) : left;
              lines.push(`${padRight(leftTrimmed, maxLeft)} ${price}`);
            }
            const subtotalLabel = "Subtotal";
            const subtotalValue = fmt(Number(g.subtotal || 0));
            const maxLeft = Math.max(0, lineWidth - subtotalValue.length - 1);
            lines.push(`${padRight(subtotalLabel, maxLeft)} ${subtotalValue}`);
            lines.push("-");
          }

          lines.push("--------------------------------");
        }
      }

      lines.push(`${t("receipt.poweredBy", { defaultValue: "Powered by" })} GMS Pro`);
      return lines.join("\n");
    }

    if (!order) return "";

    const settingsBusinessName = String((settings as any)?.businessName || "").trim();
    const branchName = String(branchDetails?.name || order.branch?.name || "").trim();
    const businessName = (() => {
      if (settingsBusinessName && branchName && settingsBusinessName !== branchName) {
        return `${settingsBusinessName} - ${branchName}`;
      }
      return branchName || settingsBusinessName || "MISSED";
    })();

    const businessPhone = String((settings as any)?.businessPhone || "").trim();

    const rawAddr =
      String((branchDetails as any)?.address || "").trim() ||
      String((settings as any)?.addressLineOne || "").trim() ||
      String((settings as any)?.businessAddress || "").trim();

    const zip =
      String((branchDetails as any)?.zipCode || "").trim() ||
      String((settings as any)?.zipCode || "").trim() ||
      String((settings as any)?.postalCode || "").trim();

    const city =
      String((branchDetails as any)?.city || "").trim() ||
      String((settings as any)?.city || "").trim();

    const line2 = [zip, city].filter(Boolean).join(" ").trim();
    const businessAddressLines = [rawAddr, line2].map((v) => String(v || "").trim()).filter(Boolean);

    const receiptCurrency =
      String((branchDetails as any)?.currency || "").trim() ||
      String((settings as any)?.currency || "").trim() ||
      String((order as any)?.currency || "").trim() ||
      null;

    return buildReceiptText(order, {
      header: {
        businessName,
        businessAddressLines,
        businessPhone,
      },
      currency: receiptCurrency,
      translations: {
        orderQr: t("receipt.orderQr", { defaultValue: "Order (QR)" }),
        deliveryQr: t("receipt.deliveryAddress", { defaultValue: "Delivery address" }),
        technicalSecurity: t("receipt.technicalSecurity", { defaultValue: "Technical security" }),
        tssId: t("receipt.tssId", { defaultValue: "TSS ID" }),
        clientId: t("receipt.clientId", { defaultValue: "Client ID" }),
        transactionId: t("receipt.transactionId", { defaultValue: "Transaction ID" }),
        signatureCounter: t("receipt.signatureCounter", { defaultValue: "Signature Counter" }),
        start: t("receipt.start", { defaultValue: "Start" }),
        stop: t("receipt.stop", { defaultValue: "Stop" }),
        tssSerial: t("receipt.tssSerial", { defaultValue: "TSS Serial Number" }),
        signature: t("receipt.signature", { defaultValue: "Signature" }),
        fiskalyVerification: t("receipt.fiskalyVerification", { defaultValue: "Fiskaly Verification (QR)" }),
        fiskalyQrInstructions: t("receipt.fiskalyQrInstructions", {
          defaultValue: "Scan to verify transaction authenticity",
        }),
        transaction: t("receipt.transaction", { defaultValue: "Transaction" }),
      },
      fiskalySignaturePayload,
      billSnapshot: (order as any)?.billSnapshot || null,
    });
  }, [branchDetails, fiskalySignaturePayload, order, report, settings, t]);

  const previewTitle = useMemo(() => {
    if (report && !order) {
      return t("admin.businessDayClosedDayDetails.billPreview", {
        defaultValue: "Bill Preview",
      });
    }
    return t("admin.orderManagement.previewBillTitle", { defaultValue: "Bill Preview" });
  }, [order, report, t]);

  const orderDetailsQrPayload = useMemo(() => {
    if (!order) return null;
    const token = order.deliveryLinkToken;
    if (!token) return null;

    const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    const origin = base.replace(/\/+$/, "");
    return `${origin}/order/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order]);

  const deliveryAddressQrPayload = useMemo(() => {
    if (!order) return null;
    if (order.orderType !== "DELIVERY") return null;
    const token = order.deliveryLinkToken;
    if (!token) return null;

    const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    const origin = base.replace(/\/+$/, "");
    return `${origin}/delivery/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order, settings]);

  const receiptUi = useMemo(() => {
    if (report && !order) {
      return (
        <View style={styles.receiptRoot}>
          {String(receiptText || "")
            .split("\n")
            .filter((l) => l !== "")
            .map((l, idx) => (
              <Text key={`line-${idx}`} style={styles.receiptText}>
                {l}
              </Text>
            ))}
        </View>
      );
    }

    if (!order) return null;

    const settingsBusinessName = String((settings as any)?.businessName || "").trim();
    const branchName = String(branchDetails?.name || order.branch?.name || "").trim();
    const businessName = (() => {
      if (settingsBusinessName && branchName && settingsBusinessName !== branchName) {
        return `${settingsBusinessName} - ${branchName}`;
      }
      return branchName || settingsBusinessName || "MISSED";
    })();

    const businessPhone = String((settings as any)?.businessPhone || "").trim();

    const branchAddress = [
      order.branch?.address,
      order.branch?.city,
      order.branch?.state,
      order.branch?.country,
    ]
      .filter(Boolean)
      .join(", ");

    const rawAddr =
      String((branchDetails as any)?.address || "").trim() ||
      String((settings as any)?.addressLineOne || "").trim() ||
      String((settings as any)?.businessAddress || "").trim();

    const zip =
      String((branchDetails as any)?.zipCode || "").trim() ||
      String((settings as any)?.zipCode || "").trim() ||
      String((settings as any)?.postalCode || "").trim();

    const city =
      String((branchDetails as any)?.city || "").trim() ||
      String((settings as any)?.city || "").trim();

    const businessAddressLines = (() => {
      const out: string[] = [];

      const normalizeStreetLine = (value: string) => {
        const v = String(value || "").trim();
        const m = v.match(/^\s*(\d+[a-zA-Z]?)\s+(.+)$/);
        if (m) {
          const num = String(m[1] || "").trim();
          const name = String(m[2] || "").trim();
          if (name && num) return `${name} ${num}`;
        }
        return v;
      };

      const line1 = rawAddr ? normalizeStreetLine(rawAddr) : "";
      const line2 = [zip, city].filter(Boolean).join(" ").trim();

      if (line1) out.push(line1);
      if (line2) out.push(line2);
      if (out.length > 0) return out;
      if (branchAddress) return [branchAddress];
      return [] as string[];
    })();

    const createdAt = (() => {
      try {
        return new Date(order.createdAt).toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return order.createdAt;
      }
    })();

    const customerName = order.user
      ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() ||
        order.user.email
      : order.guestName || "Guest";

    const customerPhone =
      order.user?.phone ||
      order.guestPhone ||
      order.deliveryPhone ||
      order.pickupPhone ||
      "";

    const deliveryAddressLines = (() => {
      if (order.orderType !== "DELIVERY") return [] as string[];
      const rawStreet = (order as any).deliveryStreetAddress as string | undefined;
      const rawHouse = (order as any).deliveryHouseNumber as string | undefined;
      const postal = (order as any).deliveryPostalCode as string | undefined;
      const extraDetails = (order as any).deliveryExtraDetails as string | undefined;
      const parsedCity = (() => {
        const addr = String(order.deliveryAddress || "");
        if (!addr) return undefined;
        const m = addr.match(/\b(\d{5})\s+([^,\n]+)/);
        if (!m) return undefined;
        const cityPart = String(m[2] || "").trim();
        return cityPart || undefined;
      })();
      const fallbackCity =
        String((branchDetails as any)?.city || "").trim() ||
        String((settings as any)?.city || "").trim() ||
        undefined;

      const normalized = (() => {
        const looksLikeHouseNo = (v?: string) => !!v && /^\d+[a-zA-Z]?$/.test(v.trim());
        const looksLikeStreet = (v?: string) => !!v && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v);
        const s = rawStreet?.trim();
        const h = rawHouse?.trim();
        if (looksLikeHouseNo(s) && looksLikeStreet(h) && !looksLikeHouseNo(h)) {
          return { street: h, house: s };
        }
        return { street: s, house: h };
      })();

      const out: string[] = [];
      if (normalized.street && normalized.house)
        out.push(`${normalized.street} ${normalized.house}`);
      else if (normalized.street) out.push(normalized.street);

      if (postal && parsedCity) out.push(`${postal} ${parsedCity}`);
      else if (postal && fallbackCity) out.push(`${postal} ${fallbackCity}`);
      else if (postal) out.push(postal);

      if (extraDetails) {
        const baseTokens = new Set<string>(
          [
            normalized.street,
            normalized.house,
            postal,
            parsedCity,
            order.deliveryAddress,
          ]
            .filter(Boolean)
            .map((v) => String(v).trim())
        );

        const extraLines = String(extraDetails)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) => {
            if (baseTokens.has(l)) return false;
            if (postal && l.includes(String(postal))) return false;
            if (normalized.house && l.includes(String(normalized.house))) return false;
            return true;
          });

        out.push(...extraLines);
      }
      if (out.length === 0 && order.deliveryAddress) out.push(order.deliveryAddress);
      return out.map((l) => String(l || "").trim()).filter(Boolean);
    })();

    const orderTypeLabel =
      order.orderType === "PICKUP"
        ? t("admin.orderManagement.orderTypes.pickup", { defaultValue: "Pickup" })
        : t("admin.orderManagement.orderTypes.delivery", { defaultValue: "Delivery" });

    const paymentMethodShort = (() => {
      const m = order.paymentMethod;
      if (m === "CASH_ON_DELIVERY") return t("receipt.paymentMethodShort.cash", { defaultValue: "CASH" });
      if (m === "CARD_ON_DELIVERY") return t("receipt.paymentMethodShort.card", { defaultValue: "CARD" });
      if (m === "ONLINE_PAYMENT") return t("receipt.paymentMethodShort.online", { defaultValue: "ONLINE" });
      return String(m);
    })();

    const getQrUrl = (value: string, size: number = 140) => {
      const data = encodeURIComponent(value);
      return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
    };

    const fiskalyQrPayload = (() => {
      if (!fiskalySignaturePayload) return null;
      const baseSig = fiskalySignaturePayload as any;

      const isCancelledOrder = String((order as any)?.status || "") === "CANCELLED";
      const cancellationCorrection = isCancelledOrder
        ? (Array.isArray(fiskalyCorrections)
            ? (fiskalyCorrections as any[]).find(
                (c) =>
                  String((c as any)?.type || "") === "CANCELLATION" &&
                  Boolean((c as any)?.signaturePayload)
              )
            : null)
        : null;

      const sig = (cancellationCorrection as any)?.signaturePayload || baseSig;

      const officialQr =
        String(sig?.qrCodeData || sig?.qr_code_data || "").trim() ||
        String(sig?.response?.qr_code_data || sig?.response?.qrCodeData || "").trim() ||
        String(sig?.response?.schema?.standard_v1?.receipt?.qr_code_data || "").trim();
      if (officialQr) return officialQr;

      const tssId = String(sig?.tssId || "").trim();
      const txId = String(sig?.txId || "").trim();
      const clientId = String(sig?.clientId || "").trim();

      const signatureCounter =
        sig?.response?.signature?.counter ||
        sig?.response?.latest_revision ||
        sig?.signature?.counter ||
        sig?.signatureCounter;

      const signatureCandidates = [
        sig?.response?.signature?.value,
        sig?.response?.signature_value,
        sig?.signature?.value,
        sig?.signatureValue,
        sig?.response?.data?.signature?.value,
        sig?.response?.result?.signature?.value,
      ];
      const signatureValue =
        signatureCandidates.find(
          (s) => s && typeof s === "string" && s.trim() !== ""
        ) || "";

      const receiptNumber = String(sig?.receiptNumber || "").trim();
      const receiptDate = sig?.receiptDate;
      const amount = sig?.amount;
      const currency = sig?.currency;

      return JSON.stringify({
        provider: "fiskaly",
        tss_id: tssId,
        client_id: clientId,
        tx_id: txId,
        signature_counter: signatureCounter,
        signature: signatureValue,
        receipt_number: receiptNumber,
        receipt_date: receiptDate,
        amount,
        currency,
        verification_url: "https://verify.fiskaly.com/",
      });
    })();

    const fiskalyQrUrl = fiskalyQrPayload ? getQrUrl(fiskalyQrPayload, 160) : null;

    const orderDetailsQrPayload = (() => {
      const token = order.deliveryLinkToken;
      if (!token) return null;

      const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
      const origin = base.replace(/\/+$/, "");
      return `${origin}/order/${order.id}?token=${encodeURIComponent(token)}`;
    })();

    const deliveryAddressQrPayload = (() => {
      if (order.orderType !== "DELIVERY") return null;
      const token = order.deliveryLinkToken;
      if (!token) return null;

      const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
      const origin = base.replace(/\/+$/, "");
      return `${origin}/delivery/${order.id}?token=${encodeURIComponent(token)}`;
    })();

    const total = Number(order.totalAmount || 0);
    const tax = Number(order.taxAmount || 0);
    const deliveryFee = Number(order.deliveryFee || 0);
    const net = Math.max(0, total - tax);

    const isTaxInclusiveReceipt = Boolean((order as any)?.taxInclusive);

    const deliveryVatAmount = (() => {
      const v = (order as any).deliveryTaxAmount;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v);
        if (Number.isFinite(n)) return n;
      }
      return null;
    })();

    const deliveryTaxRate = (() => {
      if (!deliveryFee) return null;
      if (deliveryVatAmount === null) return null;
      const netDelivery = Math.max(0, deliveryFee - deliveryVatAmount);
      if (!netDelivery) return null;
      return (deliveryVatAmount / netDelivery) * 100;
    })();

    const deliveryNetAmount = (() => {
      if (!deliveryFee) return null;
      if (deliveryVatAmount === null) return null;
      return Math.max(0, deliveryFee - deliveryVatAmount);
    })();

    const vatLines = (() => {
      const map = new Map<number, number>();
      const toNum = (v: any) => {
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string") {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      for (const it of order.orderItems || []) {
        // Same rule as React frontend receipt: ignore DEAL parent tax; components carry the tax.
        if ((it as any).itemType !== "DEAL") {
          const rate = toNum((it as any).taxPercentage);
          const amt = toNum((it as any).taxAmount) || 0;
          if (rate !== null && amt) {
            map.set(rate, (map.get(rate) || 0) + amt);
          }
        }
        for (const a of it.orderItemAddOns || []) {
          const ar = toNum((a as any).taxPercentage);
          const aa = toNum((a as any).taxAmount) || 0;
          if (ar !== null && aa) {
            map.set(ar, (map.get(ar) || 0) + aa);
          }
        }
      }

      return Array.from(map.entries())
        .map(([rate, amount]) => ({ rate, amount }))
        .filter((l) => l.amount !== 0)
        .sort((a, b) => a.rate - b.rate);
    })();

    const formatMoney = (amount: number) => {
      const cur =
        String((branchDetails as any)?.currency || "").trim() ||
        String((settings as any)?.currency || "").trim() ||
        String((order as any)?.currency || "").trim() ||
        "USD";
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: cur,
          maximumFractionDigits: 2,
        }).format(Number(amount || 0));
      } catch {
        return `${Number(amount || 0).toFixed(2)} ${cur}`;
      }
    };

    const items = order.orderItems || [];
    const itemCount = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

    const toNum = (v: any) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string") {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const itemsGroupedByVat = (() => {
      const map = new Map<number, Array<{ key: string; label: string; amount: number }>>();

      for (const it of items) {
        const baseRateForAddons = toNum((it as any).taxPercentage) ?? 0;

        // For deals, the deal parent is a container. The actual items/tax are represented by DEAL_COMPONENT children.
        if ((it as any).itemType !== "DEAL") {
          const rate = toNum((it as any).taxPercentage) ?? 0;
          const lineTotal = Number(it.totalPrice ?? it.unitPrice * it.quantity);
          const baseName =
            (it as any).itemType === "DEAL_COMPONENT"
              ? ((it as any).dealComponent?.name || (it as any).dealComponentName)
              : it.meal?.name || (it as any)?.deal?.name;
          const label = `${it.quantity}x ${baseName || "Item"}${it.selectedSize ? ` (${it.selectedSize})` : ""}`;
          map.set(rate, [...(map.get(rate) || []), { key: it.id, label, amount: lineTotal }]);
        }

        for (const a of it.orderItemAddOns || []) {
          const addonRate = toNum((a as any).taxPercentage) ?? baseRateForAddons;
          const addonTotal = Number(a.addOnPrice || 0) * Number(a.quantity || 1);
          const addonLabel = `+ ${a.addOnName}${a.quantity && a.quantity > 1 ? ` x${a.quantity}` : ""}`;
          map.set(addonRate, [...(map.get(addonRate) || []), { key: `${it.id}:${a.id}`, label: addonLabel, amount: addonTotal }]);
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
    })();

    const formatReceiptDateTime = (iso: string) => {
      try {
        return new Date(iso).toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return iso;
      }
    };

    return (
      <View style={styles.receiptRoot}>
        <View style={styles.receiptHeaderRow}>
          <View style={styles.receiptHeaderLeft}>
            <Text style={styles.receiptBusinessName}>{businessName}</Text>
            {businessAddressLines.length > 0 ? (
              <View style={styles.receiptBusinessAddressBlock}>
                {businessAddressLines[0] ? (
                  <Text style={styles.receiptBusinessAddressLine}>{businessAddressLines[0]}</Text>
                ) : null}
                {businessAddressLines[1] ? (
                  <Text style={styles.receiptBusinessAddressLine}>{businessAddressLines[1]}</Text>
                ) : null}
              </View>
            ) : null}
            {businessPhone ? (
              <Text style={styles.receiptBusinessPhoneLine}>Tel. {businessPhone}</Text>
            ) : null}
          </View>
          <View style={styles.receiptHeaderRight}>
            <Text style={styles.receiptInvoiceTitle}>
              {t("receipt.documentTitle", { defaultValue: "Invoice" })}
            </Text>
            {order.status === "CANCELLED" ? (
              <>
                <Text style={styles.receiptCancelledLabel}>
                  {t("receipt.cancelledDocumentLabel", {
                    defaultValue: "Storno / Cancelled",
                  })}
                </Text>
                <Text style={styles.receiptCancellationReason}>
                  {t("receipt.cancellationReasonLabel", {
                    defaultValue: "Cancellation reason",
                  })}: {order.cancellationReason || t("receipt.cancellationReasonNotProvided", {
                    defaultValue: "Not provided",
                  })}
                </Text>
              </>
            ) : null}
            <Text style={styles.receiptHeaderMeta}>
              {t("receipt.orderNumber", { defaultValue: "Order No" })}: {order.orderNumber}
            </Text>
            <Text style={styles.receiptHeaderMeta}>
              {t("receipt.date", { defaultValue: "Date" })}: {createdAt}
            </Text>
          </View>
        </View>

        <View style={styles.receiptSpacer} />

        <View style={styles.receiptKeyValueRow}>
          <Text style={styles.receiptMuted}>
            {t("receipt.orderType", { defaultValue: "Order type" })}
          </Text>
          <Text style={styles.receiptBold}>{orderTypeLabel}</Text>
        </View>

        <View style={styles.receiptDivider} />

        <View style={styles.receiptBlock}>
          <Text style={styles.receiptBlockTitle}>
            {t("receipt.customer", { defaultValue: "Customer" })}
          </Text>
          <Text style={styles.receiptBodySmall}>{customerName}</Text>
          {customerPhone ? (
            <Text style={styles.receiptBodySmall}>
              {t("receipt.phone", { defaultValue: "Phone" })}: {customerPhone}
            </Text>
          ) : null}
        </View>

        {order.orderType === "DELIVERY" && (order.deliveryAddress || deliveryAddressLines.length > 0) ? (
          <View style={styles.receiptBlock}>
            <Text style={styles.receiptBlockTitle}>
              {t("receipt.deliveryAddress", { defaultValue: "Delivery address" })}
            </Text>
            {deliveryAddressLines.length > 0
              ? deliveryAddressLines.map((l, idx) => (
                  <Text key={`delivery-addr-${idx}`} style={styles.receiptText}>
                    {l}
                  </Text>
                ))
              : order.deliveryAddress
              ? <Text style={styles.receiptText}>{order.deliveryAddress}</Text>
              : null}
          </View>
        ) : null}

        {orderDetailsQrPayload ? (
          <View style={styles.receiptBlock}>
            <Text style={styles.receiptBlockTitle}>
              {t("receipt.orderQr", { defaultValue: "Order (QR)" })}
            </Text>
            <View style={styles.qrRow}>
              <Image
                source={{ uri: getQrUrl(orderDetailsQrPayload, 160) }}
                style={styles.qrImage}
              />
            </View>
          </View>
        ) : null}

        {deliveryAddressQrPayload ? (
          <View style={styles.receiptBlock}>
            <Text style={styles.receiptBlockTitle}>
              {t("receipt.deliveryAddressQr", {
                defaultValue: "Delivery Address (QR)",
              })}
            </Text>
            <View style={styles.qrRow}>
              <Image
                source={{ uri: getQrUrl(deliveryAddressQrPayload, 160) }}
                style={styles.qrImage}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.receiptDivider} />

        <View style={styles.receiptBlock}>
          {itemsGroupedByVat.map((group) => (
            <View key={`vat-group-${group.rate}`} style={styles.vatGroup}>
              <Text style={styles.vatGroupHeader}>
                {t("receipt.vat", { defaultValue: "MwSt." })}: {Number(group.rate).toFixed(0)}
              </Text>
              <View style={styles.vatGroupLines}>
                {group.lines.map((l) => (
                  <View key={l.key} style={styles.itemRow}>
                    <Text style={styles.itemLeft} numberOfLines={3}>
                      {l.label}
                    </Text>
                    <Text style={styles.itemRight}>{formatMoney(l.amount)}</Text>
                  </View>
                ))}
              </View>
              <View style={[styles.receiptKeyValueRow, styles.vatGroupSubtotalRow]}>
                <Text style={styles.receiptBold}>{t("receipt.subtotal", { defaultValue: "Summe" })}:</Text>
                <Text style={styles.receiptBold}>{formatMoney(group.subtotal)}</Text>
              </View>
              <View style={styles.vatGroupDivider} />
            </View>
          ))}
        </View>

        <View style={styles.receiptDivider} />

        <View style={styles.receiptTotals}>
          <View style={styles.receiptTotalsHeader}>
            <Text style={styles.receiptBold}>
              {t("receipt.payment", { defaultValue: "Payment" })}
            </Text>
            <Text style={styles.receiptBold}>{paymentMethodShort}</Text>
          </View>

          <View style={styles.receiptKeyValueRow}>
            <Text style={styles.receiptBold}>
              {t("receipt.grossTotal", { defaultValue: "Brutto Gesamt" })}:
            </Text>
            <Text style={styles.receiptBold}>{formatMoney(total)}</Text>
          </View>

          <View style={styles.receiptKeyValueRow}>
            <Text style={styles.receiptText}>
              {t("receipt.netAmount", { defaultValue: "Net amount" })}
            </Text>
            <Text style={styles.receiptText}>{formatMoney(net)}</Text>
          </View>

          {vatLines.length > 0 ? (
            vatLines.map((l) => (
              <View key={l.rate} style={styles.receiptKeyValueRow}>
                <Text style={styles.receiptText}>
                  {isTaxInclusiveReceipt
                    ? `${t("receipt.includedVat", { defaultValue: "Enth. MwSt" })} ${l.rate.toFixed(1)}%`
                    : `${t("receipt.vat", { defaultValue: "MwSt." })} ${l.rate.toFixed(1)}%`}
                </Text>
                <Text style={styles.receiptText}>{formatMoney(l.amount)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.receiptKeyValueRow}>
              <Text style={styles.receiptText}>
                {isTaxInclusiveReceipt
                  ? t("receipt.includedVat", { defaultValue: "Enth. MwSt" })
                  : t("receipt.vat", { defaultValue: "MwSt." })}
              </Text>
              <Text style={styles.receiptText}>{formatMoney(tax)}</Text>
            </View>
          )}

          <View style={styles.receiptKeyValueRow}>
            <Text style={styles.receiptText}>
              {t("receipt.vatTotal", { defaultValue: "MwSt Gesamt" })}:
            </Text>
            <Text style={styles.receiptText}>{formatMoney(tax)}</Text>
          </View>

          {deliveryFee ? (
            <>
              <View style={styles.receiptKeyValueRow}>
                <Text style={styles.receiptText}>
                  {t("receipt.deliveryFee", { defaultValue: "Delivery fee" })}
                </Text>
                <Text style={styles.receiptText}>{formatMoney(deliveryFee)}</Text>
              </View>
              {deliveryVatAmount !== null && deliveryTaxRate !== null ? (
                <View style={styles.receiptKeyValueRow}>
                  <Text style={styles.receiptText}>
                    {t("receipt.deliveryVat", { defaultValue: "Delivery VAT" })} {deliveryTaxRate.toFixed(1)}%
                  </Text>
                  <Text style={styles.receiptText}>{formatMoney(deliveryVatAmount)}</Text>
                </View>
              ) : null}
              {deliveryNetAmount !== null ? (
                <View style={styles.receiptKeyValueRow}>
                  <Text style={styles.receiptText}>
                    {t("receipt.deliveryNet", { defaultValue: "Net delivery" })}
                  </Text>
                  <Text style={styles.receiptText}>{formatMoney(deliveryNetAmount)}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {order.orderType === "PICKUP" &&
          (order as any).takeawayServiceFee !== undefined &&
          (order as any).takeawayServiceFee !== null &&
          Number((order as any).takeawayServiceFee) > 0 ? (
            <>
              <View style={styles.receiptKeyValueRow}>
                <Text style={styles.receiptText}>
                  {t("receipt.takeawayServiceFee", {
                    defaultValue: "Takeaway service fee",
                  })}
                </Text>
                <Text style={styles.receiptText}>
                  {formatMoney(Number((order as any).takeawayServiceFee))}
                </Text>
              </View>
              {!isTaxInclusiveReceipt &&
              (order as any).takeawayServiceTaxAmount !== undefined &&
              (order as any).takeawayServiceTaxAmount !== null &&
              Number((order as any).takeawayServiceTaxAmount) > 0 ? (
                <View style={[styles.receiptKeyValueRow, { paddingLeft: 12 }]}>
                  <Text style={styles.receiptText}>
                    {t("receipt.takeawayServiceTax", {
                      defaultValue: "Takeaway service tax",
                    })}
                  </Text>
                  <Text style={styles.receiptText}>
                    {formatMoney(Number((order as any).takeawayServiceTaxAmount))}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.receiptDivider} />

        <View style={styles.receiptFooter}>
          <Text style={styles.receiptFooterBold}>
            {t("receipt.itemsCount", { defaultValue: "Items count" })}: {itemCount}
          </Text>
          {order.orderType === "PICKUP" && order.pickupNotes ? (
            <Text style={styles.receiptFooterText}>
              {t("receipt.note", { defaultValue: "Pickup Note" })}: {order.pickupNotes}
            </Text>
          ) : null}
          {order.orderType === "DELIVERY" && order.deliveryNotes ? (
            <Text style={styles.receiptFooterText}>
              {t("receipt.note", { defaultValue: "Delivery Note" })}: {order.deliveryNotes}
            </Text>
          ) : null}

          <Text style={styles.receiptFooterBold}>
            {t("receipt.technicalSecurity", { defaultValue: "Technical security" })}
          </Text>

          {fiskalySignaturePayload ? (
            <>
              {(() => {
                const isCancelledOrder = String((order as any)?.status || "") === "CANCELLED";
                const cancellationCorrection = isCancelledOrder
                  ? (Array.isArray(fiskalyCorrections)
                      ? (fiskalyCorrections as any[]).find(
                          (c) => String((c as any)?.type || "") === "CANCELLATION"
                        )
                      : null)
                  : null;
                const cancellationSig = (cancellationCorrection as any)?.signaturePayload || null;

                if (!isCancelledOrder || !cancellationSig) {
                  return (
                    <>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.tssId", { defaultValue: "TSS ID" })}: {String((fiskalySignaturePayload as any)?.tssId || "-")}
                      </Text>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.clientId", { defaultValue: "Client ID" })}: {String((fiskalySignaturePayload as any)?.clientId || "-")}
                      </Text>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.transactionId", { defaultValue: "Transaction ID" })}: {String((fiskalySignaturePayload as any)?.txId || "-")}
                      </Text>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                          ((fiskalySignaturePayload as any)?.response?.signature?.counter ||
                            (fiskalySignaturePayload as any)?.response?.latest_revision ||
                            (fiskalySignaturePayload as any)?.signature?.counter ||
                            (fiskalySignaturePayload as any)?.signatureCounter) ?? "-"
                        )}
                      </Text>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.start", { defaultValue: "Start" })}: {formatReceiptDateTime(
                          (fiskalySignaturePayload as any)?.response?.start_time || order.createdAt
                        )}
                      </Text>
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                          (fiskalySignaturePayload as any)?.response?.end_time ||
                            order.updatedAt ||
                            order.createdAt
                        )}
                      </Text>
                    </>
                  );
                }

                const originalSig = fiskalySignaturePayload as any;
                const cancellationTxId = String(
                  (cancellationSig as any)?.txId || (cancellationSig as any)?.response?.tx_id || "-"
                );
                const cancellationCounter =
                  (cancellationSig as any)?.response?.signature?.counter ||
                  (cancellationSig as any)?.response?.latest_revision ||
                  (cancellationSig as any)?.signature?.counter ||
                  (cancellationSig as any)?.signatureCounter;
                const cancellationStop =
                  (cancellationSig as any)?.response?.end_time ||
                  (cancellationSig as any)?.response?.time_end;

                return (
                  <>
                    <Text style={styles.receiptFooterText}>
                      {t("receipt.tssId", { defaultValue: "TSS ID" })}: {String(originalSig?.tssId || "-")}
                    </Text>
                    <Text style={styles.receiptFooterText}>
                      {t("receipt.clientId", { defaultValue: "Client ID" })}: {String(originalSig?.clientId || "-")}
                    </Text>
                    <Text style={styles.receiptFooterText}>
                      {t("receipt.fiskalyOriginalTransaction", {
                        defaultValue: "Original transaction",
                      })}: {String(originalSig?.txId || "-")}
                    </Text>
                    <Text style={styles.receiptFooterText}>
                      {t("receipt.fiskalyCancellationTransaction", {
                        defaultValue: "Cancellation transaction",
                      })}: {cancellationTxId}
                    </Text>
                    <Text style={styles.receiptFooterText}>
                      {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                        cancellationCounter ?? "-"
                      )}
                    </Text>
                    {cancellationStop ? (
                      <Text style={styles.receiptFooterText}>
                        {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                          cancellationStop
                        )}
                      </Text>
                    ) : null}
                  </>
                );
              })()}

              {(() => {
                const sig = fiskalySignaturePayload as any;
                const candidates = [
                  sig?.response?.signature?.value,
                  sig?.response?.signature_value,
                  sig?.signature?.value,
                  sig?.signatureValue,
                  sig?.response?.data?.signature?.value,
                  sig?.response?.result?.signature?.value,
                ];
                const signatureValue =
                  candidates.find(
                    (s) => s && typeof s === "string" && String(s).trim() !== ""
                  ) || "";
                return signatureValue ? (
                  <Text style={styles.receiptFooterText}>
                    {t("receipt.signature", { defaultValue: "Signature" })}: {String(signatureValue)}
                  </Text>
                ) : null;
              })()}

              <View style={{ marginTop: 15, alignItems: "center" }}>
                <Text style={styles.receiptFooterBold}>
                  {t("receipt.fiskalyVerification", { defaultValue: "Fiskaly Verification (QR)" })}
                </Text>
                <View style={styles.qrRow}>
                  {fiskalyQrUrl ? (
                    <Image source={{ uri: fiskalyQrUrl }} style={styles.qrImage} />
                  ) : null}
                </View>
                <Text
                  style={[styles.receiptFooterText, { fontSize: 10, textAlign: "center" }]}
                >
                  {t("receipt.fiskalyQrInstructions", {
                    defaultValue: "Scan to verify transaction authenticity",
                  })}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.receiptFooterText}>
                {t("receipt.start", { defaultValue: "Start" })}: {formatReceiptDateTime(order.createdAt)}
              </Text>
              <Text style={styles.receiptFooterText}>
                {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(order.updatedAt || order.createdAt)}
              </Text>
              <Text style={styles.receiptFooterText}>
                {t("receipt.transaction", { defaultValue: "Transaction" })}: {String(order.orderNumber || "")}
              </Text>
            </>
          )}

          <Text style={styles.receiptPoweredBy}>
            {t("receipt.poweredBy", { defaultValue: "Powered by" })}: GMS pro
          </Text>
        </View>
      </View>
    );
  }, [branchDetails, fiskalySignaturePayload, order, settings, t]);

  useEffect(() => {
    let cancelled = false;

    const safeSet = <T,>(fn: (v: T) => void, value: T) => {
      if (!cancelled) fn(value);
    };

    const run = async () => {
      try {
        safeSet(setLoading, true);
        safeSet(setOrder, null);
        safeSet(setReport, null);
        safeSet(setBranchDetails, null);

        const token = await getToken();

        // Non-blocking side fetches
        safeSet(setSettings, null);

        printerService
          .getLastPrinterAddress()
          .then((addr) => safeSet(setSelectedAddress, addr as any))
          .catch(() => safeSet(setSelectedAddress, null));

        // Fetch the main payload first to get the preview on screen ASAP
        if (orderId) {
          const payload = await orderReceiptService.getOrderReceiptPayload(
            orderId,
            token || undefined
          );
          const o = (payload as any)?.order as Order | undefined;
          const sig = (payload as any)?.fiskaly?.signaturePayload;
          const corrections = Array.isArray((payload as any)?.fiskalyCorrections)
            ? ((payload as any).fiskalyCorrections as any[])
            : [];
          safeSet(setOrder, o || null);
          safeSet(setFiskalySignaturePayload, sig || null);
          safeSet(setFiskalyCorrections, corrections);
          safeSet(setReport, null);
          safeSet(setLoading, false);

          const bid = o?.branch?.id;
          if (bid) {
            ApiService.getInstance()
              .getSettings(token || undefined, bid)
              .then((raw) => (raw as any)?.data?.data ?? (raw as any)?.data ?? raw)
              .then((s) => safeSet(setSettings, s as any))
              .catch(() => safeSet(setSettings, null));

            branchService
              .getBranch(bid, token || undefined)
              .then((b) => safeSet(setBranchDetails, b as any))
              .catch(() => safeSet(setBranchDetails, null));
          }
          return;
        }

        if (sessionId) {
          const rep = await businessDayService.getReport(sessionId, token || undefined);
          safeSet(setReport, rep);
          safeSet(setOrder, null);
          safeSet(setBranchDetails, null);
          safeSet(setLoading, false);

          const repBranchId = (rep as any)?.data?.session?.branch?.id;
          if (repBranchId) {
            ApiService.getInstance()
              .getSettings(token || undefined, String(repBranchId))
              .then((raw) => (raw as any)?.data?.data ?? (raw as any)?.data ?? raw)
              .then((s) => safeSet(setSettings, s as any))
              .catch(() => safeSet(setSettings, null));
          }
          return;
        }

        safeSet(setLoading, false);
      } catch (e: any) {
        Alert.alert(t("common.error", { defaultValue: "Error" }), e?.message || t("common.error", { defaultValue: "Error" }));
        router.back();
        safeSet(setLoading, false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, orderId, router, sessionId, t]);

  const refreshPrinters = async () => {
    try {
      if (IS_IOS) {
        return;
      }

      if (!printerService.isAvailable()) {
        Alert.alert(
          "Printing",
          "Bluetooth printing is not available in this build."
        );
        return;
      }
      const list = await printerService.listPairedPrinters();
      setPrinters(list);
      setSelectOpen(true);
    } catch (e: any) {
      Alert.alert("Bluetooth", e?.message || "Failed to list printers");
    }
  };

  const handlePrint = async () => {
    try {
      if (!receiptText) return;

      if (IS_IOS) {
        return;
      }

      setPrinting(true);
      const bytes = order
        ? buildEscPosBytes(receiptText, {
            qrDataByPlaceholder: {
              __QR_ORDER__: orderDetailsQrPayload,
              __QR_ADDRESS__: deliveryAddressQrPayload,
              __QR_FISKALY__: (() => {
                if (!fiskalySignaturePayload) return null;
                const sig = fiskalySignaturePayload as any;
                const tssId = String(sig?.tssId || "").trim();
                const txId = String(sig?.txId || "").trim();
                const clientId = String(sig?.clientId || "").trim();
                const signatureCounter =
                  sig?.response?.signature?.counter ||
                  sig?.response?.latest_revision ||
                  sig?.signature?.counter ||
                  sig?.signatureCounter;
                const signatureCandidates = [
                  sig?.response?.signature?.value,
                  sig?.response?.signature_value,
                  sig?.signature?.value,
                  sig?.signatureValue,
                  sig?.response?.data?.signature?.value,
                  sig?.response?.result?.signature?.value,
                ];
                const signatureValue =
                  signatureCandidates.find(
                    (s) => s && typeof s === "string" && s.trim() !== ""
                  ) || "";
                const receiptNumber = String(sig?.receiptNumber || "").trim();
                const receiptDate = sig?.receiptDate;
                const amount = sig?.amount;
                const currency = sig?.currency;
                return JSON.stringify({
                  provider: "fiskaly",
                  tss_id: tssId,
                  client_id: clientId,
                  tx_id: txId,
                  signature_counter: signatureCounter,
                  signature: signatureValue,
                  receipt_number: receiptNumber,
                  receipt_date: receiptDate,
                  amount,
                  currency,
                  verification_url: "https://verify.fiskaly.com/",
                });
              })(),
            },
            qrSize: 6,
            qrErrorCorrection: "M",
          })
        : buildEscPosBytes(receiptText);

      if (!printerService.isAvailable()) {
        Alert.alert(
          "Printing",
          "Bluetooth printing is not available in this build."
        );
        return;
      }

      const addr = selectedAddress;
      if (!addr) {
        await refreshPrinters();
        return;
      }

      await printerService.printBytes(addr, bytes);
      Alert.alert("Printed", "Receipt sent to printer");
    } catch (e: any) {
      Alert.alert("Print failed", e?.message || "Failed to print");
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{previewTitle}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
        </View>
      </View>
    );
  }

  if (!order && !report) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{previewTitle}</Text>
        <View style={styles.headerBtn} />
      </View>

      {IS_IOS ? null : (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={refreshPrinters}
            disabled={printing}
          >
            <MaterialCommunityIcons name="bluetooth" size={18} color="#fff" />
            <Text style={styles.actionText}>{t("common.select", { defaultValue: "Select" })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, printing && styles.disabled]}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={18} color="#fff" />
                <Text style={styles.actionText}>{t("common.print", { defaultValue: "Print" })}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.paper}>
          {receiptUi ? (
            receiptUi
          ) : (
            <View style={{ paddingVertical: 18, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          )}
        </View>
      </ScrollView>

      {IS_IOS ? null : (
        <Modal visible={selectOpen} transparent animationType="fade" onRequestClose={() => setSelectOpen(false)}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectOpen(false)} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t("common.select", { defaultValue: "Select" })} Bluetooth printer</Text>
              <ScrollView style={{ maxHeight: 360 }}>
                {printers.length === 0 ? (
                  <Text style={styles.modalEmpty}>No paired Bluetooth devices found.</Text>
                ) : (
                  printers.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.printerRow}
                      onPress={async () => {
                        const addr = p.address || p.id;
                        setSelectedAddress(addr);
                        await printerService.setLastPrinterAddress(addr);
                        setSelectOpen(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.printerName}>{p.name || "Printer"}</Text>
                        <Text style={styles.printerAddr}>{p.address || p.id}</Text>
                      </View>
                      {selectedAddress && (p.address || p.id) === selectedAddress ? (
                        <MaterialCommunityIcons name="check" size={20} color="#22c55e" />
                      ) : null}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSelectOpen(false)}>
                <Text style={styles.modalCloseText}>{t("common.close", { defaultValue: "Close" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: {
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButton: { backgroundColor: "#ec4899" },
  secondaryButton: { backgroundColor: "#374151" },
  disabled: { opacity: 0.7 },
  actionText: { color: "#fff", fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 12 },
  paper: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
  },
  paperText: { color: "#111827", fontFamily: IS_IOS ? "Courier" : "monospace" },
  receiptRoot: {
    width: "100%",
  },
  receiptHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  receiptHeaderLeft: {
    flex: 1,
    minWidth: 0,
    maxWidth: "58%",
  },
  receiptHeaderRight: {
    maxWidth: "42%",
    minWidth: 120,
    alignItems: "flex-end",
  },
  receiptBusinessName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptBusinessAddressBlock: {
    marginTop: 4,
    gap: 2,
  },
  receiptBusinessAddressLine: {
    fontSize: 10,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptBusinessPhoneLine: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptInvoiceTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 2,
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptCancelledLabel: {
    marginTop: 2,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "900",
    color: "#dc2626",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptCancellationReason: {
    fontSize: 10,
    lineHeight: 14,
    color: "#dc2626",
    marginBottom: 4,
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptHeaderMeta: {
    fontSize: 10,
    color: "#111827",
    marginTop: 2,
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptCenterText: {
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    textAlign: "center",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptCenterBold: {
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    textAlign: "center",
    fontWeight: "800",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptSmall: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptSpacer: {
    height: 10,
  },
  receiptDivider: {
    marginVertical: 12,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#9CA3AF",
  },
  receiptKeyValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  receiptMuted: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptBodySmall: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptBold: {
    fontSize: 12,
    lineHeight: 16,
    color: "#111827",
    fontWeight: "800",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptBlock: {
    marginBottom: 8,
  },
  receiptBlockTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  qrRow: {
    alignItems: "center",
    paddingTop: 6,
  },
  qrImage: {
    width: 160,
    height: 160,
    backgroundColor: "#fff",
  },
  itemBlock: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  itemLeft: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  itemRight: {
    fontSize: 12,
    lineHeight: 16,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  addonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingLeft: 10,
    marginTop: 2,
  },
  addonLeft: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  addonRight: {
    fontSize: 11,
    lineHeight: 14,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptTotals: {
    gap: 4,
  },
  receiptTotalsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  vatGroup: {
    marginBottom: 6,
  },
  vatGroupHeader: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  vatGroupLines: {
    marginTop: 4,
    gap: 2,
  },
  vatGroupSubtotalRow: {
    marginTop: 6,
  },
  vatGroupDivider: {
    marginTop: 8,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  receiptFooter: {
    gap: 3,
  },
  receiptFooterBold: {
    fontSize: 10,
    lineHeight: 13,
    color: "#111827",
    fontWeight: "800",
    fontFamily: IS_IOS ? "Courier" : "monospace",
    marginTop: 2,
  },
  receiptFooterText: {
    fontSize: 10,
    lineHeight: 13,
    color: "#111827",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  receiptPoweredBy: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 13,
    color: "#6B7280",
    fontFamily: IS_IOS ? "Courier" : "monospace",
  },
  modalOverlay: { flex: 1, justifyContent: "center", padding: 16 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject as any, backgroundColor: "rgba(0,0,0,0.6)" },
  modalCard: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
  },
  modalTitle: { color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 10 },
  modalEmpty: { color: "#9CA3AF", paddingVertical: 10 },
  printerRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#374151",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  printerName: { color: "#fff", fontWeight: "700" },
  printerAddr: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  modalClose: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1f2937",
    alignItems: "center",
  },
  modalCloseText: { color: "#fff", fontWeight: "700" },
});
