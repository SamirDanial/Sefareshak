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

  const sessionMeta = useMemo(() => {
    const data = (report as any)?.data as any;
    return data?.session || null;
  }, [report]);

  const zReport = useMemo(() => {
    const data = (report as any)?.data as any;
    return data?.zReport || null;
  }, [report]);

  const sessionNumberLabel = useMemo(() => {
    const n = sessionMeta?.sequenceNumber;
    if (n === null || n === undefined) return "";
    return `#${String(n)}`;
  }, [sessionMeta]);

  const refresh = async () => {
    if (!sessionId) return;
    try {
      setIsLoading(true);
      const token = await getToken();
      const rep = await businessDayService.getReport(sessionId, token || undefined);
      setReport(rep);

      try {
        await ApiService.getInstance().getSettings(token || undefined);
      } catch {
        // ignore
      }
    } catch {
      // ignore to match other admin pages
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
          <MaterialCommunityIcons name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sessionNumberLabel || ""}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 40 }}
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
            <Text style={styles.previewBillButtonText}>{t("admin.businessDayClosedDayDetails.billPreview")}</Text>
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
                  {(report as any)?.data?.totals?.grossSales?.toFixed?.(2) ?? (report as any)?.data?.totals?.grossSales}
                </Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.taxTotal")}</Text>
                <Text style={styles.kvValue}>
                  {(report as any)?.data?.totals?.taxTotal?.toFixed?.(2) ?? (report as any)?.data?.totals?.taxTotal}
                </Text>
              </View>

              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.byPaymentMethod")}</Text>
                {Object.entries((report as any)?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                  <View key={k} style={styles.rowBetween}>
                    <Text style={styles.muted}>{k}</Text>
                    <Text style={styles.kvValue}>{Number(v).toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowRaw(true)}>
                <Text style={styles.secondaryActionText}>{t("admin.businessDayClosedDayDetails.rawReportData")}</Text>
              </TouchableOpacity>

              {zReport ? (
                <View style={styles.kvBox}>
                  <Text style={styles.kvLabel}>{t("admin.businessDayClosedDayDetails.zReportPreview")}</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.totalOrders")}</Text>
                    <Text style={styles.kvValue}>{String((zReport as any)?.counts?.totalOrders ?? "—")}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>{t("admin.businessDayClosedDayDetails.totalRevenue")}</Text>
                    <Text style={styles.kvValue}>
                      {formatMaybeMoney(
                        (zReport as any)?.sales?.sums?.totalRevenueGross ?? (report as any)?.data?.totals?.grossSales
                      )}
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
            <Text style={styles.rawText}>{report ? JSON.stringify((report as any).data, null, 2) : ""}</Text>
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
    backgroundColor: "#f5f5f5",
  },
  localHeader: {
    backgroundColor: "#f5f5f5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
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
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },
  headerActionsRow: {
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
    marginBottom: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  cardTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  muted: {
    color: "#6b7280",
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
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f9fafb",
  },
  kvLabel: {
    color: "#6b7280",
    fontSize: 11,
    marginBottom: 4,
  },
  kvValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  secondaryAction: {
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 90,
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  modalTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  rawText: {
    color: "#4b5563",
    fontSize: 11,
    fontFamily: "Courier",
  },
});
