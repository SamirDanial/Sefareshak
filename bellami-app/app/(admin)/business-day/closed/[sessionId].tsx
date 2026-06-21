import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { businessDayService, type BusinessDayReport } from "@/src/services/businessDayService";
import ApiService from "@/src/services/apiService";

export default function BusinessDayClosedDayDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const localHeaderHeight = 56;
  const headerHeight = statusBarHeight + localHeaderHeight;

  const IS_IOS = (Platform.OS as string) === "ios";

  const canViewReports =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
    ]);

  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [settings, setSettings] = useState<any | null>(null);

  const sessionMeta = useMemo(() => {
    const data = report?.data as any;
    return data?.session || null;
  }, [report]);

  const zReport = useMemo(() => {
    const data = report?.data as any;
    return data?.zReport || null;
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

  const headerTitle = useMemo(() => {
    const bn = String((settings as any)?.businessName || "").trim();
    const branchName = String((report as any)?.data?.session?.branchName || (report as any)?.data?.session?.branch?.name || "").trim();
    if (bn && branchName) return `${bn} - ${branchName}`;
    return bn || branchName || null;
  }, [report, settings]);

  const businessAddressLine = useMemo(() => {
    const b = (report as any)?.data?.session?.branch;
    const raw = String(b?.businessAddress || b?.address || "").trim();
    const zip = String(b?.zipCode || "").trim();
    const city = String(b?.city || "").trim();
    const line2 = [zip, city].filter(Boolean).join(" ").trim();
    return [raw, line2].filter(Boolean).join(" | ").trim() || null;
  }, [report]);

  const businessPhoneLine = useMemo(() => {
    const b = (report as any)?.data?.session?.branch;
    const phone = String(b?.businessPhone || "").trim();
    return phone ? `Tel: ${phone}` : null;
  }, [report]);

  const paymentsByProvider = useMemo(() => {
    return (zReport as any)?.payments?.byProvider || {};
  }, [zReport]);

  const paymentsByProviderAndOrderType = useMemo(() => {
    return (zReport as any)?.payments?.byProviderAndOrderType || {};
  }, [zReport]);

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

  const fmt = (v: any) => {
    const num = Number(v || 0);
    if (Number.isNaN(num)) return String(v ?? "0");
    return num.toFixed(2);
  };

  const sessionNumberLabel = useMemo(() => {
    const n = sessionMeta?.sequenceNumber;
    if (n === null || n === undefined) return "";
    return `#${String(n)}`;
  }, [sessionMeta]);

  const receiptText = useMemo(() => {
    if (!report?.data) return "";
    const data: any = report.data;
    const session = data?.session;
    const branch = session?.branch;
    const bn = String(branch?.name || session?.branchName || "").trim();
    const z: any = data?.zReport || null;

    const formatMaybeMoney = (value: any) => {
      if (value === null || value === undefined) return "—";
      return fmt(value);
    };

    const lines: string[] = [];
    lines.push(`${t("zReport.zReport", { defaultValue: "Z-Report" })}: ${t("zReport.number", { defaultValue: "No." })} ${session?.sequenceNumber ?? "—"}`);
    lines.push(
      `${formatReceiptDateTime(session?.startedAt)} ${t("zReport.to", { defaultValue: "-" })} ${formatReceiptDateTime(session?.endedAt)}`
    );
    lines.push(`${t("zReport.performedAt", { defaultValue: "Performed at" })} ${formatReceiptDateTime(session?.endedAt)}`);

    if (bn) lines.push(bn);

    const addr = String(branch?.businessAddress || branch?.address || "").trim();
    const zip = String(branch?.zipCode || "").trim();
    const city = String(branch?.city || "").trim();
    const line2 = [zip, city].filter(Boolean).join(" ").trim();
    const addressLine = [addr, line2].filter(Boolean).join(" | ").trim();
    if (addressLine) lines.push(addressLine);

    const phone = String(branch?.businessPhone || "").trim();
    if (phone) lines.push(`Tel: ${phone}`);

    lines.push(t("zReport.taxLine", { defaultValue: "—" }));
    lines.push("--------------------------------");

    lines.push(`${t("zReport.totalOrders", { defaultValue: "Orders" })}: ${String(z?.counts?.totalOrders ?? data?.counts?.totalOrders ?? "—")}`);
    lines.push(`${t("zReport.cancelledOrders", { defaultValue: "Cancelled" })}: ${String(z?.counts?.cancelledOrders ?? "—")}`);
    lines.push("--------------------------------");

    const salesLines = z?.sales?.lines || {};
    const salesSums = z?.sales?.sums || {};

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
        if (deliveryBucket) {
          lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })}: ${formatMaybeMoney(vatRevenue(deliveryBucket))} ${formatMaybeMoney(deliveryBucket?.tax)}`);
        } else {
          lines.push(`${t("zReport.deliveryFee", { defaultValue: "Delivery fee" })}: ${formatMaybeMoney(0)} ${formatMaybeMoney(0)}`);
        }
        lines.push(`${t("zReport.discount", { defaultValue: "Discount" })}: ${formatMaybeMoney(0)} ${formatMaybeMoney(0)}`);
      }

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

    lines.push(`${t("receipt.poweredBy", { defaultValue: "Powered by" })} GMS Pro`);
    return lines.join("\n");
  }, [report, sessionNumberLabel]);

  const refresh = async () => {
    if (!sessionId) return;
    try {
      setIsLoading(true);
      const token = await getToken();
      const rep = await businessDayService.getReport(sessionId, token || undefined);
      setReport(rep);

      try {
        const rawSettings = await ApiService.getInstance().getSettings(token || undefined);
        setSettings((rawSettings as any)?.data ?? rawSettings);
      } catch {
        setSettings(null);
      }
    } catch (e: any) {
      // Keep simple to match other admin pages
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const formatDateTime = (value: string | Date | undefined | null) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleString();
  };

  const formatMaybeMoney = (value: any) => {
    if (value === null || value === undefined) return "—";
    const num = Number(value || 0);
    if (Number.isNaN(num)) return String(value);
    return num.toFixed(2);
  };

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, canViewReports]);

  if (!canViewReports) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDayDetails.title")}</Text>
          <Text style={styles.muted}>{t("common.accessDenied")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.localHeader, { paddingTop: statusBarHeight, height: headerHeight }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sessionNumberLabel || ""}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec4899" />}
      >
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.previewBillButton}
            onPress={() => router.push(`/(admin)/bill-preview?sessionId=${sessionId}` as any)}
            disabled={!report || isLoading}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="receipt" size={18} color="#fff" />
            <Text style={styles.previewBillButtonText}>
              {t("admin.businessDayClosedDayDetails.billPreview")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDayDetails.sessionTitle")}</Text>
          {isLoading && !report ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#ec4899" />
              <Text style={styles.muted}>{t("common.loading")}</Text>
            </View>
          ) : sessionMeta ? (
            <View style={{ gap: 10 }}>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.sessionLabel")}</Text>
                <Text style={styles.kvValue}>#{sessionMeta.sequenceNumber}</Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.startedLabel")}</Text>
                <Text style={styles.kvValue}>{formatDateTime(sessionMeta.startedAt)}</Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.endedLabel")}</Text>
                <Text style={styles.kvValue}>{formatDateTime(sessionMeta.endedAt)}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.loadingSession")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDayDetails.dailyReportTitle")}</Text>
          {!report ? (
            <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.noReportLoaded")}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.grossSales")}</Text>
                <Text style={styles.kvValue}>
                  {report?.data?.totals?.grossSales?.toFixed?.(2) ?? report?.data?.totals?.grossSales}
                </Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.taxTotal")}</Text>
                <Text style={styles.kvValue}>
                  {report?.data?.totals?.taxTotal?.toFixed?.(2) ?? report?.data?.totals?.taxTotal}
                </Text>
              </View>

              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.byPaymentMethod")}</Text>
                {Object.entries(report?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                  <View key={k} style={styles.rowBetween}>
                    <Text style={styles.muted}>{k}</Text>
                    <Text style={styles.kvValue}>{Number(v).toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              {dsfinvk ? (
                <View style={styles.kvBox}>
                  <Text style={styles.kvLabel}>{t("admin.fiskaly.dsfinvk.title")}</Text>
                  {dsfinvk?.ok ? (
                    <View style={{ gap: 6 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.muted}>{t("admin.fiskaly.dsfinvk.cashRegisterId")}</Text>
                        <Text style={styles.kvValue}>{String(dsfinvk?.data?.cashRegisterId || "—")}</Text>
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.muted}>{t("admin.fiskaly.dsfinvk.cashPointClosingId")}</Text>
                        <Text style={styles.kvValue}>{String(dsfinvk?.data?.cashPointClosingExportId || "—")}</Text>
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.muted}>{t("admin.fiskaly.dsfinvk.exportId")}</Text>
                        <Text style={styles.kvValue}>{String(dsfinvk?.data?.exportId || "—")}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.muted}>
                      {String(dsfinvk?.error || t("admin.fiskaly.dsfinvk.submissionFailed"))}
                    </Text>
                  )}
                </View>
              ) : null}

              <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowRaw(true)}>
                <Text style={styles.secondaryActionText}>{t("admin.businessDayClosedDayDetails.rawReportData")}</Text>
              </TouchableOpacity>

              {zReport ? (
                <View style={styles.kvBox}>
                  <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.zReportPreview")}</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.totalOrders")}</Text>
                    <Text style={styles.kvValue}>{String(zReport?.counts?.totalOrders ?? "—")}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.totalRevenue")}</Text>
                    <Text style={styles.kvValue}>
                      {formatMaybeMoney(zReport?.sales?.sums?.totalRevenueGross ?? report?.data?.totals?.grossSales)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showRaw} transparent animationType="fade" onRequestClose={() => setShowRaw(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRaw(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t("admin.businessDayClosedDayDetails.rawReportData")}</Text>
          <ScrollView style={{ maxHeight: 520 }}>
            <Text style={styles.rawText}>{report ? JSON.stringify(report.data, null, 2) : ""}</Text>
          </ScrollView>
          <TouchableOpacity style={[styles.secondaryAction, { marginTop: 12 }]} onPress={() => setShowRaw(false)}>
            <Text style={styles.secondaryActionText}>{t("common.close")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  localHeader: {
    backgroundColor: "#0a0a0a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  headerActionsRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  previewBillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: "100%",
  },
  previewBillButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    padding: 14,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  muted: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  kvBox: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#151718",
  },
  kvLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 4,
  },
  kvValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  smallButton: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    width: 80,
    alignItems: "center",
  },
  smallButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryAction: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  zCenterSubTitle: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Courier",
    fontWeight: "800",
    textAlign: "center",
    marginTop: 6,
  },
  zCenterMuted: {
    color: "rgba(17,24,39,0.7)",
    fontSize: 11,
    fontFamily: "Courier",
    textAlign: "center",
  },
  zDivider: {
    height: 1,
    backgroundColor: "rgba(17,24,39,0.35)",
    marginVertical: 10,
  },
  zRowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  zText: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Courier",
  },
  zBold: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Courier",
    fontWeight: "800",
  },
  zSectionTitle: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Courier",
    fontWeight: "800",
    marginBottom: 4,
  },
  zVatRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(17,24,39,0.25)",
  },
  zPoweredBy: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(17,24,39,0.7)",
    fontSize: 10,
    fontFamily: "Courier",
  },
  previewTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  primaryFooterButton: {
    marginTop: 12,
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryFooterButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  footerCloseButton: {
    marginTop: 10,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  footerCloseButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  printerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  printerName: { color: "#fff", fontSize: 14, fontWeight: "800" },
  printerAddr: { color: "#9CA3AF", fontSize: 11, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalCard: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 90,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    padding: 14,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  rawText: {
    color: "#D1D5DB",
    fontSize: 11,
    fontFamily: "Courier",
  },
});
