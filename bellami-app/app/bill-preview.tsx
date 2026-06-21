import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@clerk/clerk-expo";
import ApiService from "@/src/services/apiService";
import type { Branch } from "@/src/services/branchService";
import { orderReceiptService } from "@/src/services/orderReceiptService";
import { buildReceiptText } from "@/src/utils/receiptBuilder";

const IS_IOS = (Platform.OS as string) === "ios";

export default function BillPreviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderId = (params.id as string | undefined) || undefined;
  const { isSignedIn, getToken } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any | null>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);
  const [fiskalySignaturePayload, setFiskalySignaturePayload] = useState<any | null>(null);
  const [fiskalyCorrections, setFiskalyCorrections] = useState<any[]>([]);

  const lastLoadedOrderIdRef = useRef<string | null>(null);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const getQrUrl = (value: string, size: number = 120) => {
    const data = encodeURIComponent(value);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
  };

  const formatReceiptDateTime = (value: string | Date | undefined | null) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
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

  const orderDetailsQrPayload = useMemo(() => {
    if (!order) return null;
    const token = String(order?.deliveryLinkToken || "").trim();
    if (!token) return null;

    const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    const settingsUrl = (settings as any)?.publicAppUrl;

    let base = String(settingsUrl || envUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = `https://${base}`;
    }

    const origin = base.replace(/\/+$/, "");
    return `${origin}/order/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order, settings]);

  const deliveryAddressQrPayload = useMemo(() => {
    if (!order) return null;
    if (String(order?.orderType || "").toUpperCase() !== "DELIVERY") return null;
    const token = String(order?.deliveryLinkToken || "").trim();
    if (!token) return null;

    const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    const settingsUrl = (settings as any)?.publicAppUrl;

    let base = String(settingsUrl || envUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = `https://${base}`;
    }

    const origin = base.replace(/\/+$/, "");
    return `${origin}/delivery/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order, settings]);

  const getFiskalyQrData = () => {
    if (!fiskalySignaturePayload) return "";

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
      signatureCandidates.find((s) => s && typeof s === "string" && s.trim() !== "") || "";

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
      amount,
      currency,
      verification_url: "https://verify.fiskaly.com/",
    };

    return JSON.stringify(qrData);
  };

  const fiskalyQrPayload = useMemo(() => {
    if (!fiskalySignaturePayload) return null;
    const payload = getFiskalyQrData();
    return payload ? payload : null;
  }, [fiskalySignaturePayload]);

  const fiskalyQrUrl = useMemo(() => {
    if (!fiskalyQrPayload) return null;
    return getQrUrl(fiskalyQrPayload, 120);
  }, [fiskalyQrPayload]);

  const orderDetailsQrUrl = useMemo(() => {
    if (!orderDetailsQrPayload) return null;
    return getQrUrl(orderDetailsQrPayload, 120);
  }, [orderDetailsQrPayload]);

  const deliveryAddressQrUrl = useMemo(() => {
    if (!deliveryAddressQrPayload) return null;
    return getQrUrl(deliveryAddressQrPayload, 120);
  }, [deliveryAddressQrPayload]);

  useEffect(() => {
    let cancelled = false;

    const safeSet = <T,>(fn: (v: T) => void, value: T) => {
      if (!cancelled) fn(value);
    };

    const run = async () => {
      try {
        if (!isSignedIn) {
          safeSet(setLoading, false);
          return;
        }

        if (!orderId) {
          safeSet(setLoading, false);
          return;
        }

        if (lastLoadedOrderIdRef.current === orderId && order) {
          safeSet(setLoading, false);
          return;
        }

        lastLoadedOrderIdRef.current = orderId;
        safeSet(setLoading, true);

        const token = (await getTokenRef.current()) || undefined;

        const payload = await orderReceiptService
          .getOrderReceiptPayload(orderId, token)
          .catch(() => orderReceiptService.getMyOrderReceiptPayload(orderId, token));
        const o = (payload as any)?.order;
        const sig = (payload as any)?.fiskaly?.signaturePayload;
        const corrections = Array.isArray((payload as any)?.fiskalyCorrections)
          ? ((payload as any).fiskalyCorrections as any[])
          : [];

        safeSet(setOrder, o || null);
        safeSet(setFiskalySignaturePayload, sig || null);
        safeSet(setFiskalyCorrections, corrections);

        safeSet(setBranchDetails, (o as any)?.branch || null);

        ApiService.getInstance()
          .getSettings(token || undefined)
          .then((raw) => (raw as any)?.data?.data ?? (raw as any)?.data ?? raw)
          .then((s) => safeSet(setSettings, s as any))
          .catch(() => safeSet(setSettings, null));
      } catch (e: any) {
        safeSet(setLoading, false);
        // Keep UI minimal; user can go back.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, orderId, order]);

  const receiptUi = useMemo(() => {
    if (!order) return null;

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
          fiskalySignaturePayload,
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
              {t("receipt.documentTitle", { defaultValue: "Invoice" })}
            </Text>
            {String((order as any)?.status || "") === "CANCELLED" ? (
              <>
                <Text style={[styles.receiptHeaderSubtitle, { color: "#DC2626", fontWeight: "800" }]}>
                  {t("receipt.cancelledDocumentLabel", {
                    defaultValue: "STORNO / Cancelled",
                  })}
                </Text>
                <Text style={[styles.receiptHeaderSubtitle, { color: "#DC2626" }]}>
                  {t("receipt.cancellationReasonLabel", {
                    defaultValue: "Cancellation reason",
                  })}
                  : {String((order as any)?.cancellationReason || "").trim() ||
                    t("receipt.cancellationReasonNotProvided", {
                      defaultValue: "Not provided",
                    })}
                </Text>
              </>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="download" size={18} color="#111827" />
          </TouchableOpacity>
        </View>
        <Text style={styles.receiptText}>-</Text>
        <Text style={styles.receiptText}>
          {t("receipt.orderNumber", { defaultValue: "Order No" })}: {String(order?.orderNumber || "")}
        </Text>
        <Text style={styles.receiptText}>
          {t("receipt.date", { defaultValue: "Date" })}: {formatReceiptDateTime(order.createdAt)}
        </Text>
        <Text style={styles.receiptText}>-</Text>

        {addressLine ? <Text style={styles.receiptText}>{addressLine}</Text> : null}
        {businessPhone ? <Text style={styles.receiptText}>Tel. {businessPhone}</Text> : null}

        <View style={styles.receiptDivider} />

        <Text style={styles.receiptFooterBold}>{t("receipt.customer", { defaultValue: "Customer" })}</Text>
        <Text style={styles.receiptFooterText}>
          {String(order?.user?.firstName || "").trim() || String(order?.guestName || "Customer").trim()}
        </Text>

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

        <Text style={styles.receiptFooterBold}>
          {t("receipt.itemsCount", { defaultValue: "Items count" })}: {itemCount}
        </Text>

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

        {orderDetailsQrPayload ? (
          <View style={{ marginTop: 15, alignItems: "center" }}>
            <Text style={styles.receiptFooterBold}>{t("receipt.orderQr", { defaultValue: "Order (QR)" })}</Text>
            <View style={styles.qrRow}>
              {orderDetailsQrUrl ? (
                <Image source={{ uri: orderDetailsQrUrl }} style={styles.qrImage} />
              ) : null}
            </View>
          </View>
        ) : null}

        {deliveryAddressQrPayload ? (
          <View style={{ marginTop: 15, alignItems: "center" }}>
            <Text style={styles.receiptFooterBold}>{t("receipt.addressQr", { defaultValue: "Address (QR)" })}</Text>
            <View style={styles.qrRow}>
              {deliveryAddressQrUrl ? (
                <Image source={{ uri: deliveryAddressQrUrl }} style={styles.qrImage} />
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={styles.receiptPoweredBy}>
          {t("receipt.poweredBy", { defaultValue: "Powered by" })}: GMS pro
        </Text>
      </View>
    );
  }, [
    branchDetails,
    deliveryAddressQrPayload,
    deliveryAddressQrUrl,
    fiskalyQrUrl,
    fiskalySignaturePayload,
    order,
    orderDetailsQrPayload,
    orderDetailsQrUrl,
    settings,
    t,
  ]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}> 
          <TouchableOpacity onPress={() => router.replace("/(tabs)/orders" as any)} style={styles.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("orders.billPreviewTitle", { defaultValue: "Bill Preview" })}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
        </View>
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}> 
          <TouchableOpacity onPress={() => router.replace("/(tabs)/orders" as any)} style={styles.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("orders.billPreviewTitle", { defaultValue: "Bill Preview" })}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: "#fff", marginBottom: 12 }}>{t("common.pleaseLogin", { defaultValue: "Please Login" })}</Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => router.push("/(auth)/sign-in" as any)}
          >
            <Text style={styles.actionText}>{t("common.login", { defaultValue: "Login" })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}> 
        <TouchableOpacity onPress={() => router.replace("/(tabs)/orders" as any)} style={styles.headerBtn}>
          <MaterialCommunityIcons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("orders.billPreviewTitle", { defaultValue: "Bill Preview" })}</Text>
        <View style={styles.headerBtn} />
      </View>

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

      {IS_IOS ? null : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F13",
  },
  header: {
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
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
    padding: 16,
    paddingBottom: 24,
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
    fontWeight: "800",
    color: "#111827",
  },
  receiptFooterText: {
    marginTop: 2,
    fontSize: 10,
    color: "#111827",
  },
  receiptPoweredBy: {
    marginTop: 14,
    fontSize: 10,
    textAlign: "center",
    color: "#6b7280",
  },
  qrRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "center",
  },
  qrImage: {
    width: 120,
    height: 120,
    backgroundColor: "#fff",
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButton: {
    backgroundColor: "#ec4899",
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
