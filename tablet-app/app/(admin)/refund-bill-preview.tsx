import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import {
  orderService,
  type FiskalySignaturePayload,
  type Order,
} from "@/src/services/orderService";
import { buildEscPosBytes, buildReceiptText } from "@/src/utils/receiptBuilder";
import { printerService, type PairedPrinter } from "@/src/services/printerService";
import ApiService from "@/src/services/apiService";
import branchService, { type Branch } from "@/src/services/branchService";

const IS_IOS = (Platform.OS as string) === "ios";

export default function RefundBillPreviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const refundId = (params.refundId as string | undefined) || undefined;
  const { getToken } = useAuthRole();
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [refund, setRefund] = useState<any>(null);
  const [fiskalyCorrection, setFiskalyCorrection] = useState<any>(null);
  const [originalFiskaly, setOriginalFiskaly] = useState<any>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);
  const [printing, setPrinting] = useState(false);

  const [printers, setPrinters] = useState<PairedPrinter[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const formatReceiptDateTime = (value: string | Date | number | undefined | null) => {
    if (!value) return "—";
    let d: Date;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'number') {
      // Check if it's in seconds (Unix timestamp before year 2001) or milliseconds
      d = value < 10000000000 ? new Date(value * 1000) : new Date(value);
    } else {
      d = new Date(value);
    }
    // Check if date is invalid
    if (isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString(undefined, {
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

  const getQrUrl = (value: string, size: number = 120) => {
    const data = encodeURIComponent(value);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
  };

  const getFiskalyQrData = () => {
    if (!fiskalyCorrection && !originalFiskaly) return "";

    const sig = fiskalyCorrection || originalFiskaly;

    const officialQr =
      String(sig?.qrCodeData || sig?.qr_code_data || "").trim() ||
      String(sig?.response?.qr_code_data || sig?.response?.qrCodeData || "").trim() ||
      String(sig?.response?.schema?.standard_v1?.receipt?.qr_code_data || "").trim();
    if (officialQr) return officialQr;

    const tssId = String(sig?.tssId || sig?.tss_id || "").trim();
    const txId = String(sig?.txId || sig?.tssTransactionId || sig?.transaction_id || "").trim();
    const clientId = String(sig?.clientId || sig?.client_id || "").trim();

    const signatureCounter = sig?.response?.signature?.counter ||
                            sig?.response?.latest_revision ||
                            sig?.signature?.counter ||
                            sig?.signatureCounter ||
                            sig?.signature_counter;

    const signatureCandidates = [
      sig?.response?.signature?.value,
      sig?.response?.signature_value,
      sig?.signature?.value,
      sig?.signatureValue,
      sig?.response?.data?.signature?.value,
      sig?.response?.result?.signature?.value
    ];

    const signatureValue = signatureCandidates.find(s =>
      s && typeof s === 'string' && s.trim() !== ''
    ) || "";

    const receiptNumber = String(sig?.receiptNumber || "").trim();
    const receiptDate = sig?.receiptDate;
    const amount = sig?.amount;
    const currency = sig?.currency;

    const qrData = {
      provider: "fiskaly",
      tss_id: tssId,
      client_id: clientId,
      tx_id: txId,
      signature_counter: signatureCounter,
      signature: signatureValue,
      receipt_number: receiptNumber,
      receipt_date: receiptDate,
      amount: amount,
      currency: currency,
      verification_url: `https://verify.fiskaly.com/`
    };

    return JSON.stringify(qrData);
  };

  const fiskalyQrPayload = useMemo(() => {
    if (!fiskalyCorrection && !originalFiskaly) return null;
    const payload = getFiskalyQrData();
    return payload ? payload : null;
  }, [fiskalyCorrection, originalFiskaly]);

  const fiskalyQrUrl = useMemo(() => {
    if (!fiskalyQrPayload) return null;
    return getQrUrl(fiskalyQrPayload, 120);
  }, [fiskalyQrPayload]);

  // CP858 encoding helper - MUST match receiptBuilder.ts exactly
  const cp858Map: Record<string, number> = {
    "€": 0xd5,
    "Ä": 0x8e,
    "Ö": 0x99,
    "Ü": 0x9a,
    "ä": 0x84,
    "ö": 0x94,
    "ü": 0x81,
    "ß": 0xe1,
    "é": 0x82,
    "è": 0x8a,
    "à": 0x85,
    "á": 0xa0,
    "ç": 0x87,
    "Ç": 0x80,
    "ñ": 0xa4,
    "Ñ": 0xa5,
    "í": 0xa1,
    "ó": 0xa2,
    "ú": 0xa3,
    "É": 0x90,
  };

  // Map CP858 byte codes to Unicode equivalents for preview display
  const cp858ToUnicodeMap: Record<number, string> = {
    0xd5: "€",
    0x8e: "Ä",
    0x99: "Ö",
    0x9a: "Ü",
    0x84: "ä",
    0x94: "ö",
    0x81: "ü",
    0xe1: "ß",
    0x82: "é",
    0x8a: "è",
    0x85: "à",
    0xa0: "á",
    0x87: "ç",
    0x80: "Ç",
    0xa4: "ñ",
    0xa5: "Ñ",
    0xa1: "í",
    0xa2: "ó",
    0xa3: "ú",
    0x90: "É",
  };

  const encodeCp858ForPreview = (input: string): string => {
    let out = "";
    for (let i = 0; i < input.length; i++) {
      const ch = input[i] as string;
      const code = input.charCodeAt(i);

      if (code <= 0x7f) {
        out += ch;
        continue;
      }

      const mapped = cp858Map[ch];
      if (typeof mapped === "number") {
        out += cp858ToUnicodeMap[mapped] || "?";
      } else {
        out += "?";
      }
    }
    return out;
  };

  const receiptUi = useMemo(() => {
    if (!order || !refund) return null;

    const orgBusinessNameFromOrder = String((order as any)?.branch?.organization?.settings?.businessName || "").trim();
    const orgNameFromOrder = String((order as any)?.branch?.organization?.name || "").trim();
    const settingsBusinessName =
      String((settings as any)?.businessName || "").trim() ||
      orgBusinessNameFromOrder ||
      orgNameFromOrder;
    const branchName = String(branchDetails?.name || order.branch?.name || "").trim();
    const businessName = (() => {
      if (settingsBusinessName && branchName) return `${settingsBusinessName} - ${branchName}`;
      return settingsBusinessName || branchName || "Bellami";
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
    const addressLine = [rawAddr, line2].filter(Boolean).join(" | ").trim();

    const receiptCurrency =
      String((branchDetails as any)?.currency || "").trim() ||
      String((settings as any)?.currency || "").trim() ||
      String((order as any)?.currency || "").trim() ||
      "USD";

    const formatMoney = (amount: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: receiptCurrency,
          maximumFractionDigits: 2,
        }).format(Number(amount || 0));
      } catch {
        return `${Number(amount || 0).toFixed(2)} ${receiptCurrency}`;
      }
    };

    const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
    const itemCount = items.reduce((sum: number, it: any) => sum + Number(it?.quantity || 0), 0);

    const isTaxInclusiveReceipt = (() => {
      const ti = (order as any)?.taxInclusive;
      return ti !== null && ti !== undefined ? Boolean(ti) : false;
    })();

    const total = Number(order?.totalAmount || 0);
    const tax = Number(order?.taxAmount || 0);
    const deliveryFee = Number(order?.deliveryFee || 0);
    const net = Math.max(0, total - tax);

    const vatGroups = (() => {
      const toNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const map = new Map<number, Array<{ label: string; amount: number }>>();
      for (const it of items) {
        const baseRateForAddons = toNum((it as any)?.taxPercentage);

        if (String((it as any)?.itemType || "") !== "DEAL") {
          const rate = toNum((it as any)?.taxPercentage);
          const lineTotal = Number((it as any)?.totalPrice ?? toNum((it as any)?.unitPrice) * toNum((it as any)?.quantity));
          const baseName =
            String((it as any)?.itemType || "") === "DEAL_COMPONENT"
              ? (it as any)?.dealComponent?.name || (it as any)?.dealComponentName
              : (it as any)?.meal?.name || (it as any)?.deal?.name;
          const label = `${toNum((it as any)?.quantity || 0)}x ${baseName || "Item"}${(it as any)?.selectedSize ? ` (${(it as any).selectedSize})` : ""}`;
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
        .map(([rate, lines]) => ({
          rate,
          lines,
          subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
        }))
        .filter((g) => g.lines.length > 0)
        .sort((a, b) => a.rate - b.rate);
    })();

    const handleDownload = async () => {
      try {
        const text = buildReceiptText(order as any, {
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
          fiskalySignaturePayload: fiskalyCorrection || originalFiskaly,
        });
        await Share.share({
          message: text,
          title: `${t("orders.billPreviewTitle", { defaultValue: "Bill Preview" })} #${String(order?.orderNumber || "")}`,
        });
      } catch {
        // ignore
      }
    };

    return (
      <View style={styles.receiptRoot}>
        <View style={styles.receiptHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.receiptHeaderTitle}>{businessName}</Text>
            <Text style={styles.receiptHeaderSubtitle}>
              {t("receipt.refundReceipt", { defaultValue: "REFUND RECEIPT / ERSTATTUNGSBELEG" })}
            </Text>
          </View>
        </View>
        <Text style={styles.receiptText}>-</Text>
        <Text style={styles.receiptText}>
          {t("receipt.refundTransaction", { defaultValue: "Refund Transaction" })}: {String(refund?.id || "").slice(0, 8)}
        </Text>
        <Text style={styles.receiptText}>
          {t("receipt.date", { defaultValue: "Date" })}: {formatReceiptDateTime(refund.createdAt || order.createdAt)}
        </Text>
        <Text style={styles.receiptText}>
          <Text style={{ fontWeight: "700", color: "#DC2626" }}>
            {t("receipt.refundReason", { defaultValue: "Refund Reason" })}:
          </Text> {String(refund?.reason || (refund as any)?.metadata?.reason || "-")}
        </Text>
        <Text style={styles.receiptText}>-</Text>

        {addressLine ? <Text style={styles.receiptText}>{addressLine}</Text> : null}
        {businessPhone ? <Text style={styles.receiptText}>Tel. {businessPhone}</Text> : null}

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>{t("receipt.originalOrder", { defaultValue: "Original Order" })}</Text>
        <Text style={styles.receiptFooterText}>
          {t("receipt.orderNumber", { defaultValue: "Order No" })}: {String(order?.orderNumber || "-")}
        </Text>
        <Text style={styles.receiptFooterText}>
          {t("receipt.orderDate", { defaultValue: "Order Date" })}: {formatReceiptDateTime(order?.createdAt)}
        </Text>
        <Text style={styles.receiptFooterText}>
          {t("receipt.paymentMethod", { defaultValue: "Payment Method" })}: {String(order?.paymentMethod || "-")}
        </Text>

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>{t("receipt.customer", { defaultValue: "Customer" })}</Text>
        <Text style={styles.receiptFooterText}>
          {String(order?.user?.firstName || "").trim() || String(order?.guestName || "Customer").trim()}
        </Text>

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>{t("receipt.refundedItems", { defaultValue: "Refunded Items" })}</Text>
        {items.map((it: any, idx: number) => {
          const baseName =
            String((it as any)?.itemType || "") === "DEAL_COMPONENT"
              ? (it as any)?.dealComponent?.name || (it as any)?.dealComponentName
              : (it as any)?.meal?.name || (it as any)?.deal?.name;
          const itemName = baseName || "Item";
          const quantity = Number((it as any)?.quantity || 0);
          const unitPrice = Number((it as any)?.unitPrice || 0);
          const totalPrice = Number((it as any)?.totalPrice || 0);
          const size = (it as any)?.selectedSize ? ` (${(it as any).selectedSize})` : "";
          
          return (
            <View key={`item-${idx}`} style={{ marginBottom: 6 }}>
              <Text style={styles.receiptText}>
                {quantity}x {itemName}{size}
              </Text>
              <View style={styles.receiptKeyValueRow}>
                <Text style={styles.receiptText}>
                  {t("receipt.unitPrice", { defaultValue: "Unit Price" })}: {formatMoney(unitPrice)}
                </Text>
                <Text style={styles.receiptText}>
                  {t("receipt.total", { defaultValue: "Total" })}: {formatMoney(totalPrice)}
                </Text>
              </View>
            </View>
          );
        })}

        <View style={styles.receiptDivider} />

        {vatGroups.map((g) => (
          <View key={`vat-${g.rate}`} style={{ marginBottom: 10 }}>
            <Text style={styles.receiptFooterBold}>VAT {Number(g.rate || 0).toFixed(0)}%</Text>
            {g.lines.map((l: any, idx: number) => (
              <View key={`line-${idx}`} style={styles.receiptKeyValueRow}>
                <Text style={styles.receiptText}>{String(l.label || "")}</Text>
                <Text style={styles.receiptText}>{formatMoney(Number(l.amount || 0))}</Text>
              </View>
            ))}
            <View style={[styles.receiptKeyValueRow, { marginTop: 6 }]}>
              <Text style={[styles.receiptText, { fontWeight: "800" }]}>
                {t("receipt.subtotal", { defaultValue: "Subtotal" })}
              </Text>
              <Text style={[styles.receiptText, { fontWeight: "800" }]}>
                {formatMoney(Number(g.subtotal || 0))}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.receiptDivider} />

        <View style={styles.receiptKeyValueRow}>
          <Text style={styles.receiptText}>{t("receipt.grossTotal", { defaultValue: "Gross total" })}</Text>
          <Text style={styles.receiptText}>{formatMoney(total)}</Text>
        </View>
        <View style={styles.receiptKeyValueRow}>
          <Text style={styles.receiptText}>{t("receipt.netAmount", { defaultValue: "Net amount" })}</Text>
          <Text style={styles.receiptText}>{formatMoney(net)}</Text>
        </View>
        <View style={styles.receiptKeyValueRow}>
          <Text style={styles.receiptText}>
            {isTaxInclusiveReceipt
              ? t("receipt.includedVat", { defaultValue: "Incl. VAT" })
              : t("receipt.vat", { defaultValue: "VAT" })}
          </Text>
          <Text style={styles.receiptText}>{formatMoney(tax)}</Text>
        </View>
        {deliveryFee ? (
          <View style={styles.receiptKeyValueRow}>
            <Text style={styles.receiptText}>{t("receipt.deliveryFee", { defaultValue: "Delivery fee" })}</Text>
            <Text style={styles.receiptText}>{formatMoney(deliveryFee)}</Text>
          </View>
        ) : null}

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>{t("receipt.refundDetails", { defaultValue: "Refund Details" })}</Text>
        <Text style={styles.receiptFooterText}>
          {t("receipt.refundType", { defaultValue: "Refund Type" })}: {String(refund?.refundType || "-")}
        </Text>
        <Text style={styles.receiptFooterText}>
          {t("receipt.refundAmount", { defaultValue: "Refund Amount" })}: {formatMoney(Number(refund?.amount || 0))}
        </Text>
        {(refund as any)?.metadata?.voucherRefundAmount > 0 ? (
          <>
            <Text style={styles.receiptFooterText}>
              <Text style={{ color: "#DC2626", fontWeight: "700" }}>
                {t("receipt.voucherRefund", { defaultValue: "Voucher Refund" })}:
              </Text> {formatMoney(Number((refund as any).metadata.voucherRefundAmount || 0))}
            </Text>
            <Text style={styles.receiptFooterText}>
              <Text style={{ color: "#DC2626", fontWeight: "700" }}>
                {t("receipt.cashOnlineRefund", { defaultValue: "Cash/Online Refund" })} ({String((refund as any).metadata.cashOnlinePaymentMethod || "-")}):
              </Text> {formatMoney(Number((refund as any).metadata.cashOnlineRefundAmount || 0))}
            </Text>
          </>
        ) : null}
        <Text style={styles.receiptFooterText}>
          {t("receipt.refundStatus", { defaultValue: "Refund Status" })}: {String(refund?.status || "-")}
        </Text>
        {refund?.stripeRefundId ? (
          <Text style={styles.receiptFooterText}>
            {t("receipt.stripeRefundId", { defaultValue: "Stripe Refund ID" })}: {String(refund.stripeRefundId)}
          </Text>
        ) : null}
        {refund?.paypalRefundId ? (
          <Text style={styles.receiptFooterText}>
            {t("receipt.paypalRefundId", { defaultValue: "PayPal Refund ID" })}: {String(refund.paypalRefundId)}
          </Text>
        ) : null}

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>
          {t("receipt.itemsCount", { defaultValue: "Items count" })}: {itemCount}
        </Text>

        <Text style={styles.receiptFooterBold}>
          {t("receipt.technicalSecurity", { defaultValue: "Technical security" })}
        </Text>

        {fiskalyCorrection || originalFiskaly ? (
          <>
            {originalFiskaly ? (
              <>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.originalTssId", { defaultValue: "Original TSS ID" })}: {String(originalFiskaly?.signaturePayload?.tssId || originalFiskaly?.tssId || originalFiskaly?.tss_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.originalClientTransactionId", { defaultValue: "Original Client Transaction ID" })}: {String(originalFiskaly?.clientTransactionId || originalFiskaly?.signaturePayload?.clientId || originalFiskaly?.clientId || originalFiskaly?.client_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.originalTssTransactionId", { defaultValue: "Original TSS Transaction ID" })}: {String(originalFiskaly?.tssTransactionId || originalFiskaly?.signaturePayload?.txId || originalFiskaly?.txId || originalFiskaly?.transaction_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                    originalFiskaly?.signaturePayload?.response?.signature?.counter ||
                    originalFiskaly?.signaturePayload?.response?.latest_revision ||
                    originalFiskaly?.signaturePayload?.signature?.counter ||
                    originalFiskaly?.signaturePayload?.signatureCounter || "-"
                  )}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.start", { defaultValue: "Start" })}: {formatReceiptDateTime(
                    originalFiskaly?.signaturePayload?.response?.time_start ||
                    originalFiskaly?.startedAt ||
                    order.createdAt
                  )}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                    originalFiskaly?.signaturePayload?.response?.time_end ||
                    originalFiskaly?.finishedAt ||
                    order.updatedAt
                  )}
                </Text>
                {originalFiskaly?.signaturePayload?.response?.tss_serial_number ? (
                  <Text style={styles.receiptFooterText}>
                    {t("receipt.tssSerial", { defaultValue: "TSS Serial" })}: {String(originalFiskaly.signaturePayload.response.tss_serial_number)}
                  </Text>
                ) : null}
                {originalFiskaly?.signaturePayload?.response?.client_serial_number ? (
                  <Text style={styles.receiptFooterText}>
                    {t("receipt.clientSerial", { defaultValue: "Client Serial" })}: {String(originalFiskaly.signaturePayload.response.client_serial_number)}
                  </Text>
                ) : null}
              </>
            ) : null}
            {fiskalyCorrection ? (
              <>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.refundTssId", { defaultValue: "Refund TSS ID" })}: {String(fiskalyCorrection?.signaturePayload?.tssId || fiskalyCorrection?.tssId || fiskalyCorrection?.tss_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.refundClientTransactionId", { defaultValue: "Refund Client Transaction ID" })}: {String(fiskalyCorrection?.clientTransactionId || fiskalyCorrection?.signaturePayload?.clientId || fiskalyCorrection?.clientId || fiskalyCorrection?.client_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.refundTssTransactionId", { defaultValue: "Refund TSS Transaction ID" })}: {String(fiskalyCorrection?.tssTransactionId || fiskalyCorrection?.signaturePayload?.txId || fiskalyCorrection?.txId || fiskalyCorrection?.transaction_id || "-")}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                    fiskalyCorrection?.signaturePayload?.response?.signature?.counter ||
                    fiskalyCorrection?.signaturePayload?.response?.latest_revision ||
                    fiskalyCorrection?.signaturePayload?.signature?.counter ||
                    fiskalyCorrection?.signaturePayload?.signatureCounter || "-"
                  )}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.start", { defaultValue: "Start" })}: {formatReceiptDateTime(
                    fiskalyCorrection?.signaturePayload?.response?.time_start ||
                    fiskalyCorrection?.startedAt ||
                    refund.createdAt
                  )}
                </Text>
                <Text style={styles.receiptFooterText}>
                  {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                    fiskalyCorrection?.signaturePayload?.response?.time_end ||
                    fiskalyCorrection?.finishedAt ||
                    refund.updatedAt
                  )}
                </Text>
                {fiskalyCorrection?.signaturePayload?.response?.tss_serial_number ? (
                  <Text style={styles.receiptFooterText}>
                    {t("receipt.tssSerial", { defaultValue: "TSS Serial" })}: {String(fiskalyCorrection.signaturePayload.response.tss_serial_number)}
                  </Text>
                ) : null}
                {fiskalyCorrection?.signaturePayload?.response?.client_serial_number ? (
                  <Text style={styles.receiptFooterText}>
                    {t("receipt.clientSerial", { defaultValue: "Client Serial" })}: {String(fiskalyCorrection.signaturePayload.response.client_serial_number)}
                  </Text>
                ) : null}
              </>
            ) : null}

            {(() => {
              const sig = fiskalyCorrection || originalFiskaly;
              const candidates = [
                sig?.response?.signature?.value,
                sig?.response?.signature_value,
                sig?.signature?.value,
                sig?.signatureValue,
                sig?.response?.data?.signature?.value,
                sig?.response?.result?.signature?.value,
              ];
              const signatureValue =
                candidates.find((s) => s && typeof s === "string" && String(s).trim() !== "") || "";
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
                {fiskalyQrUrl ? <Image source={{ uri: fiskalyQrUrl }} style={styles.qrImage} /> : null}
              </View>
              <Text style={[styles.receiptFooterText, { fontSize: 10, textAlign: "center" }]}>
                {t("receipt.fiskalyQrInstructions", {
                  defaultValue: "Scan to verify transaction authenticity",
                })}
              </Text>
            </View>
          </>
        ) : null}

        <Text style={styles.receiptPoweredBy}>
          {t("receipt.poweredBy", { defaultValue: "Powered by" })}: Next Foody
        </Text>
      </View>
    );
  }, [branchDetails, fiskalyCorrection, fiskalyQrUrl, order, originalFiskaly, refund, settings, t]);

  const receiptText = useMemo(() => {
    if (!order || !refund) return "";

    const orgBusinessNameFromOrder = String((order as any)?.branch?.organization?.settings?.businessName || "").trim();
    const orgNameFromOrder = String((order as any)?.branch?.organization?.name || "").trim();
    const settingsBusinessName =
      String((settings as any)?.businessName || "").trim() ||
      orgBusinessNameFromOrder ||
      orgNameFromOrder;
    const branchName = String(branchDetails?.name || order.branch?.name || "").trim();
    const businessName = (() => {
      if (settingsBusinessName && branchName) return `${settingsBusinessName} - ${branchName}`;
      return settingsBusinessName || branchName || "Bellami";
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
    const addressLine = [rawAddr, line2].filter(Boolean).join(" | ").trim();

    const receiptCurrency =
      String((branchDetails as any)?.currency || "").trim() ||
      String((settings as any)?.currency || "").trim() ||
      String((order as any)?.currency || "").trim() ||
      "USD";

    const formatMoney = (amount: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: receiptCurrency,
          maximumFractionDigits: 2,
        }).format(Number(amount || 0));
      } catch {
        return `${Number(amount || 0).toFixed(2)} ${receiptCurrency}`;
      }
    };

    const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
    const itemCount = items.reduce((sum: number, it: any) => sum + Number(it?.quantity || 0), 0);

    const isTaxInclusiveReceipt = (() => {
      const ti = (order as any)?.taxInclusive;
      return ti !== null && ti !== undefined ? Boolean(ti) : false;
    })();

    const total = Number(order?.totalAmount || 0);
    const tax = Number(order?.taxAmount || 0);
    const deliveryFee = Number(order?.deliveryFee || 0);
    const net = Math.max(0, total - tax);

    const vatGroups = (() => {
      const toNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const map = new Map<number, Array<{ label: string; amount: number }>>();
      for (const it of items) {
        const baseRateForAddons = toNum((it as any)?.taxPercentage);

        if (String((it as any)?.itemType || "") !== "DEAL") {
          const rate = toNum((it as any)?.taxPercentage);
          const lineTotal = Number((it as any)?.totalPrice ?? toNum((it as any)?.unitPrice) * toNum((it as any)?.quantity));
          const baseName =
            String((it as any)?.itemType || "") === "DEAL_COMPONENT"
              ? (it as any)?.dealComponent?.name || (it as any)?.dealComponentName
              : (it as any)?.meal?.name || (it as any)?.deal?.name;
          const label = `${toNum((it as any)?.quantity || 0)}x ${baseName || "Item"}${(it as any)?.selectedSize ? ` (${(it as any).selectedSize})` : ""}`;
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
        .map(([rate, lines]) => ({
          rate,
          lines,
          subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
        }))
        .filter((g) => g.lines.length > 0)
        .sort((a, b) => a.rate - b.rate);
    })();

    // Build text receipt matching the structured UI
    let lines: string[] = [];
    lines.push(businessName);
    lines.push(t("receipt.refundReceipt", { defaultValue: "REFUND RECEIPT / ERSTATTUNGSBELEG" }));
    lines.push("-");
    lines.push(`${t("receipt.refundTransaction", { defaultValue: "Refund Transaction" })}: ${String(refund?.id || "").slice(0, 8)}`);
    lines.push(`${t("receipt.date", { defaultValue: "Date" })}: ${formatReceiptDateTime(refund.createdAt || order.createdAt)}`);
    const refundReason = String(refund?.reason || (refund as any)?.metadata?.reason || "-");
    lines.push(`${t("receipt.refundReason", { defaultValue: "Refund Reason" })}: ${refundReason}`);
    lines.push("-");
    if (addressLine) lines.push(addressLine);
    if (businessPhone) lines.push(`Tel. ${businessPhone}`);
    lines.push("");
    lines.push(t("receipt.originalOrder", { defaultValue: "Original Order" }));
    lines.push(`${t("receipt.orderNumber", { defaultValue: "Order No" })}: ${String(order?.orderNumber || "-")}`);
    lines.push(`${t("receipt.orderDate", { defaultValue: "Order Date" })}: ${formatReceiptDateTime(order?.createdAt)}`);
    lines.push(`${t("receipt.paymentMethod", { defaultValue: "Payment Method" })}: ${String(order?.paymentMethod || "-")}`);
    lines.push("");
    lines.push(t("receipt.customer", { defaultValue: "Customer" }));
    lines.push(String(order?.user?.firstName || "").trim() || String(order?.guestName || "Customer").trim());
    lines.push("");
    lines.push(t("receipt.refundedItems", { defaultValue: "Refunded Items" }));
    items.forEach((it: any) => {
      const baseName =
        String((it as any)?.itemType || "") === "DEAL_COMPONENT"
          ? (it as any)?.dealComponent?.name || (it as any)?.dealComponentName
          : (it as any)?.meal?.name || (it as any)?.deal?.name;
      const itemName = baseName || "Item";
      const quantity = Number((it as any)?.quantity || 0);
      const unitPrice = Number((it as any)?.unitPrice || 0);
      const totalPrice = Number((it as any)?.totalPrice || 0);
      const size = (it as any)?.selectedSize ? ` (${(it as any).selectedSize})` : "";
      lines.push(`${quantity}x ${itemName}${size}`);
      lines.push(`  ${t("receipt.unitPrice", { defaultValue: "Unit Price" })}: ${formatMoney(unitPrice)}  ${t("receipt.total", { defaultValue: "Total" })}: ${formatMoney(totalPrice)}`);
    });
    lines.push("");
    vatGroups.forEach((g) => {
      lines.push(`VAT ${Number(g.rate || 0).toFixed(0)}%`);
      g.lines.forEach((l: any) => {
        lines.push(`  ${String(l.label || "")}  ${formatMoney(Number(l.amount || 0))}`);
      });
      lines.push(`  ${t("receipt.subtotal", { defaultValue: "Subtotal" })}  ${formatMoney(Number(g.subtotal || 0))}`);
    });
    lines.push("");
    lines.push(`${t("receipt.grossTotal", { defaultValue: "Gross total" })}  ${formatMoney(total)}`);
    lines.push(`${t("receipt.netAmount", { defaultValue: "Net amount" })}  ${formatMoney(net)}`);
    lines.push(`${isTaxInclusiveReceipt ? t("receipt.includedVat", { defaultValue: "Incl. VAT" }) : t("receipt.vat", { defaultValue: "VAT" })}  ${formatMoney(tax)}`);
    if (deliveryFee) {
      lines.push(`${t("receipt.deliveryFee", { defaultValue: "Delivery fee" })}  ${formatMoney(deliveryFee)}`);
    }
    lines.push("");
    lines.push(`${t("receipt.itemsCount", { defaultValue: "Items count" })}: ${itemCount}`);
    lines.push("");
    lines.push(t("receipt.refundDetails", { defaultValue: "Refund Details" }));
    lines.push(`${t("receipt.refundType", { defaultValue: "Refund Type" })}: ${String(refund?.refundType || "-")}`);
    lines.push(`${t("receipt.refundAmount", { defaultValue: "Refund Amount" })}: ${formatMoney(Number(refund?.amount || 0))}`);
    if ((refund as any)?.metadata?.voucherRefundAmount > 0) {
      lines.push(`${t("receipt.voucherRefund", { defaultValue: "Voucher Refund" })}: ${formatMoney(Number((refund as any).metadata.voucherRefundAmount || 0))}`);
      lines.push(`${t("receipt.cashOnlineRefund", { defaultValue: "Cash/Online Refund" })} (${String((refund as any).metadata.cashOnlinePaymentMethod || "-")}): ${formatMoney(Number((refund as any).metadata.cashOnlineRefundAmount || 0))}`);
    }
    lines.push(`${t("receipt.refundStatus", { defaultValue: "Refund Status" })}: ${String(refund?.status || "-")}`);
    if (refund?.stripeRefundId) {
      lines.push(`${t("receipt.stripeRefundId", { defaultValue: "Stripe Refund ID" })}: ${String(refund.stripeRefundId)}`);
    }
    if (refund?.paypalRefundId) {
      lines.push(`${t("receipt.paypalRefundId", { defaultValue: "PayPal Refund ID" })}: ${String(refund.paypalRefundId)}`);
    }
    lines.push("");
    lines.push(t("receipt.technicalSecurity", { defaultValue: "Technical security" }));
    if (originalFiskaly) {
      lines.push(`${t("receipt.originalTssId", { defaultValue: "Original TSS ID" })}: ${String(originalFiskaly?.signaturePayload?.tssId || originalFiskaly?.tssId || originalFiskaly?.tss_id || "-")}`);
      lines.push(`${t("receipt.originalClientTransactionId", { defaultValue: "Original Client Transaction ID" })}: ${String(originalFiskaly?.clientTransactionId || originalFiskaly?.signaturePayload?.clientId || originalFiskaly?.clientId || originalFiskaly?.client_id || "-")}`);
      lines.push(`${t("receipt.originalTssTransactionId", { defaultValue: "Original TSS Transaction ID" })}: ${String(originalFiskaly?.tssTransactionId || originalFiskaly?.signaturePayload?.txId || originalFiskaly?.txId || originalFiskaly?.transaction_id || "-")}`);
      lines.push(`${t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: ${String(
        originalFiskaly?.signaturePayload?.response?.signature?.counter ||
        originalFiskaly?.signaturePayload?.response?.latest_revision ||
        originalFiskaly?.signaturePayload?.signature?.counter ||
        originalFiskaly?.signaturePayload?.signatureCounter || "-"
      )}`);
      lines.push(`${t("receipt.start", { defaultValue: "Start" })}: ${formatReceiptDateTime(
        originalFiskaly?.signaturePayload?.response?.time_start ||
        originalFiskaly?.startedAt ||
        order.createdAt
      )}`);
      lines.push(`${t("receipt.stop", { defaultValue: "Stop" })}: ${formatReceiptDateTime(
        originalFiskaly?.signaturePayload?.response?.time_end ||
        originalFiskaly?.finishedAt ||
        order.updatedAt
      )}`);
      if (originalFiskaly?.signaturePayload?.response?.tss_serial_number) {
        lines.push(`${t("receipt.tssSerial", { defaultValue: "TSS Serial" })}: ${String(originalFiskaly.signaturePayload.response.tss_serial_number)}`);
      }
      if (originalFiskaly?.signaturePayload?.response?.client_serial_number) {
        lines.push(`${t("receipt.clientSerial", { defaultValue: "Client Serial" })}: ${String(originalFiskaly.signaturePayload.response.client_serial_number)}`);
      }
    }
    if (fiskalyCorrection) {
      lines.push(`${t("receipt.refundTssId", { defaultValue: "Refund TSS ID" })}: ${String(fiskalyCorrection?.signaturePayload?.tssId || fiskalyCorrection?.tssId || fiskalyCorrection?.tss_id || "-")}`);
      lines.push(`${t("receipt.refundClientTransactionId", { defaultValue: "Refund Client Transaction ID" })}: ${String(fiskalyCorrection?.clientTransactionId || fiskalyCorrection?.signaturePayload?.clientId || fiskalyCorrection?.clientId || fiskalyCorrection?.client_id || "-")}`);
      lines.push(`${t("receipt.refundTssTransactionId", { defaultValue: "Refund TSS Transaction ID" })}: ${String(fiskalyCorrection?.tssTransactionId || fiskalyCorrection?.signaturePayload?.txId || fiskalyCorrection?.txId || fiskalyCorrection?.transaction_id || "-")}`);
      lines.push(`${t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: ${String(
        fiskalyCorrection?.signaturePayload?.response?.signature?.counter ||
        fiskalyCorrection?.signaturePayload?.response?.latest_revision ||
        fiskalyCorrection?.signaturePayload?.signature?.counter ||
        fiskalyCorrection?.signaturePayload?.signatureCounter || "-"
      )}`);
      lines.push(`${t("receipt.start", { defaultValue: "Start" })}: ${formatReceiptDateTime(
        fiskalyCorrection?.signaturePayload?.response?.time_start ||
        fiskalyCorrection?.startedAt ||
        refund.createdAt
      )}`);
      lines.push(`${t("receipt.stop", { defaultValue: "Stop" })}: ${formatReceiptDateTime(
        fiskalyCorrection?.signaturePayload?.response?.time_end ||
        fiskalyCorrection?.finishedAt ||
        refund.updatedAt
      )}`);
      if (fiskalyCorrection?.signaturePayload?.response?.tss_serial_number) {
        lines.push(`${t("receipt.tssSerial", { defaultValue: "TSS Serial" })}: ${String(fiskalyCorrection.signaturePayload.response.tss_serial_number)}`);
      }
      if (fiskalyCorrection?.signaturePayload?.response?.client_serial_number) {
        lines.push(`${t("receipt.clientSerial", { defaultValue: "Client Serial" })}: ${String(fiskalyCorrection.signaturePayload.response.client_serial_number)}`);
      }
    }
    const sig = fiskalyCorrection || originalFiskaly;
    if (sig) {
      const candidates = [
        sig?.response?.signature?.value,
        sig?.response?.signature_value,
        sig?.signature?.value,
        sig?.signatureValue,
        sig?.response?.data?.signature?.value,
        sig?.response?.result?.signature?.value,
      ];
      const signatureValue = candidates.find((s) => s && typeof s === "string" && String(s).trim() !== "") || "";
      if (signatureValue) {
        lines.push(`${t("receipt.signature", { defaultValue: "Signature" })}: ${String(signatureValue)}`);
      }
    }
    lines.push("");
    lines.push(`${t("receipt.poweredBy", { defaultValue: "Powered by" })}: Next Foody`);

    return lines.join("\n");
  }, [branchDetails, fiskalyCorrection, order, originalFiskaly, refund, settings, t]);

  useEffect(() => {
    if (!refundId) {
      setError("Refund ID is required");
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await getToken();
        if (!token) {
          setError("Authentication required");
          setLoading(false);
          return;
        }

        const apiService = ApiService.getInstance();
        const settingsResponse = await apiService.getSettings(token);
        setSettings((settingsResponse as any)?.data ?? settingsResponse);

        const refundResponse = await orderService.getRefundReceiptPayload(refundId, token);

        if (refundResponse && refundResponse.refund && refundResponse.order) {
          setRefund(refundResponse.refund);
          setOrder(refundResponse.order);
          setFiskalyCorrection(refundResponse.fiskalyCorrection);
          setOriginalFiskaly(refundResponse.originalFiskaly);

          // Load branch details
          const branchId = refundResponse.order?.branchId;
          if (branchId) {
            const branches = await branchService.getBranches(token);
            const found = Array.isArray(branches)
              ? branches.find((b: any) => String(b.id) === String(branchId))
              : null;
            setBranchDetails(found as any || null);
          }
        } else {
          setError("Failed to load refund data");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load refund receipt");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refundId]);

  const handlePrint = async () => {
    try {
      if (!printerService.isAvailable()) {
        Alert.alert("Error", "Bluetooth printing is not available in this build.");
        return;
      }

      setPrinting(true);

      const receiptLines = receiptText.split("\n");
      const qrData = getFiskalyQrData();

      const bytes = buildEscPosBytes(receiptText, {
        qrDataByPlaceholder: {
          "__QR_FISKALY__": qrData || "",
        },
        printWidthChars: 48,
      });

      let addr = await printerService.getLastPrinterAddress();
      if (!addr) {
        const paired = await printerService.listPairedPrinters();
        if (!paired || paired.length === 0) {
          Alert.alert("No Printers Found", "Please pair a Bluetooth thermal printer in your device settings first.");
          setPrinting(false);
          return;
        }

        if (paired.length === 1) {
          addr = paired[0].address || paired[0].id;
          await printerService.setLastPrinterAddress(addr);
        } else {
          Alert.alert("Select Printer", "Multiple printers found. Please select the last used printer in settings.");
          setPrinting(false);
          return;
        }
      }

      if (addr) {
        await printerService.printBytes(addr, bytes);
        Alert.alert("Printed", "Refund receipt successfully printed!");
      }
    } catch (err: any) {
      Alert.alert("Print failed", err?.message || "Failed to print");
    } finally {
      setPrinting(false);
    }
  };

  const refreshPrinters = async () => {
    try {
      if (!printerService.isAvailable()) {
        Alert.alert("Error", "Bluetooth printing is not available in this build.");
        return;
      }

      const paired = await printerService.listPairedPrinters();
      setPrinters(paired || []);

      if (!paired || paired.length === 0) {
        Alert.alert("No Printers Found", "Please pair a Bluetooth thermal printer in your device settings first.");
        return;
      }

      if (paired.length === 1) {
        const addr = paired[0].address || paired[0].id;
        setSelectedAddress(addr);
        await printerService.setLastPrinterAddress(addr);
      } else {
        setSelectOpen(true);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to refresh printers");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("admin.orderManagement.refundBillPreview", { defaultValue: "Refund Bill Preview" })}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
        </View>
      </View>
    );
  }

  if (error || !order || !refund) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("admin.orderManagement.refundBillPreview", { defaultValue: "Refund Bill Preview" })}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error || "Refund not found"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="close" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("admin.orderManagement.refundBillPreview", { defaultValue: "Refund Bill Preview" })}</Text>
        <TouchableOpacity
          onPress={() => setShowPrintPreview(!showPrintPreview)}
          style={styles.headerBtn}
        >
          <MaterialCommunityIcons
            name={showPrintPreview ? "eye-off" : "eye"}
            size={20}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>

      {IS_IOS ? null : (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={refreshPrinters}
            disabled={printing}
          >
            <MaterialCommunityIcons name="bluetooth" size={18} color="#6b7280" />
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
                <MaterialCommunityIcons name="printer" size={18} color="#6b7280" />
                <Text style={styles.actionText}>{t("common.print", { defaultValue: "Print" })}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.paper}>
          {showPrintPreview ? (
            <View style={styles.printPreviewContainer}>
              {String(receiptText || "")
                .split("\n")
                .map((line, idx) => {
                  const encodedLine = encodeCp858ForPreview(line);
                  if (line === "__QR_FISKALY__") {
                    const fiskalyQrData = getFiskalyQrData();
                    if (fiskalyQrData) {
                      return (
                        <View key={`print-line-${idx}`} style={styles.printPreviewQrContainer}>
                          <Image
                            source={{ uri: getQrUrl(fiskalyQrData, 160) }}
                            style={styles.printPreviewQrImage}
                          />
                        </View>
                      );
                    }
                  }
                  return (
                    <Text key={`print-line-${idx}`} style={styles.printPreviewText}>
                      {"  "}{encodedLine}
                    </Text>
                  );
                })}
            </View>
          ) : receiptUi ? (
            receiptUi
          ) : (
            <View style={{ paddingVertical: 18, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  paper: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },
  receiptRoot: {
    flex: 1,
  },
  receiptHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  receiptHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  receiptHeaderSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  downloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  receiptText: {
    fontSize: 11,
    color: "#111827",
  },
  receiptDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 10,
  },
  receiptKeyValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  receiptFooter: {
    marginTop: 10,
  },
  receiptFooterBold: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  receiptFooterText: {
    fontSize: 11,
    color: "#111827",
  },
  qrRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  qrImage: {
    width: 120,
    height: 120,
  },
  receiptPoweredBy: {
    marginTop: 20,
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center",
  },
  printPreviewContainer: {
    padding: 16,
    backgroundColor: "#fff",
  },
  printPreviewQrContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  printPreviewQrImage: {
    width: 160,
    height: 160,
  },
  printPreviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#000",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButton: { backgroundColor: "#ec4899" },
  secondaryButton: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  disabled: { opacity: 0.7 },
  actionText: { color: "#111827", fontWeight: "700" },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#ef4444",
    textAlign: "center",
  },
});
