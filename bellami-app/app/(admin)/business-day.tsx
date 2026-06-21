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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import branchService, { type Branch } from "@/src/services/branchService";
import ApiService from "@/src/services/apiService";
import {
  businessDayService,
  type BusinessDayCloseValidation,
  type BusinessDayReport,
  type BusinessDaySession,
} from "@/src/services/businessDayService";
import { getAdminHeaderHeight } from "./_layout";

export default function BusinessDayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const {
    canAny,
    isSuperAdmin,
    isOrgAdmin,
    assignedBranchIds,
    isLoading: permissionsLoading,
    refreshPermissions,
  } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

  const canViewReports =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
      { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
    ]);

  const canCloseDay =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.END_OF_DAY, action: ACTIONS.CLOSE_DAY },
      { resource: RESOURCES.REPORTS, action: ACTIONS.EXPORT },
    ]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branchModalVisible, setBranchModalVisible] = useState(false);

  const [session, setSession] = useState<BusinessDaySession | null>(null);
  const [validation, setValidation] = useState<BusinessDayCloseValidation | null>(null);
  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [lastClosedSessionId, setLastClosedSessionId] = useState<string | null>(null);

  const [closeConfirmVisible, setCloseConfirmVisible] = useState(false);
  const [closeSuccessVisible, setCloseSuccessVisible] = useState(false);

  const [posDeviceErrorVisible, setPosDeviceErrorVisible] = useState(false);
  const [posDeviceErrorMessage, setPosDeviceErrorMessage] = useState<string>("");

  const [settings, setSettings] = useState<any | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fiskalyEnabled = Boolean((settings as any)?.fiskalyEnabled);
  const fiskalyEnvironment = String((settings as any)?.fiskalyEnvironment || "").toUpperCase();
  const fiskalyLive = fiskalyEnabled && fiskalyEnvironment === "LIVE";
  // Mobile admin has no POS device selection; if Fiskaly is LIVE we must prevent closing/validating.
  const posDeviceRequiredButMissing = Boolean(fiskalyLive);

  const showPosDeviceErrorDialog = (message: string) => {
    setPosDeviceErrorMessage(String(message || "").trim() || t("common.error"));
    setPosDeviceErrorVisible(true);
  };

  const handlePosDeviceErrorFromBackend = (e: any) => {
    const serverCode = e?.data?.code || e?.response?.data?.code;
    const serverMessage =
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.data?.error ||
      e?.data?.message ||
      e?.message ||
      undefined;

    if (
      String(serverCode || "").trim() === "POS_DEVICE_REQUIRED" ||
      String(serverCode || "").trim() === "FISKALY_POS_DEVICE_NOT_PROVISIONED"
    ) {
      const normalized = String(serverCode || "").trim();
      const fallback =
        normalized === "POS_DEVICE_REQUIRED"
          ? t("admin.businessDay.posDeviceRequired")
          : t("admin.businessDay.posDeviceNotProvisioned");
      showPosDeviceErrorDialog(String(serverMessage || "").trim() || fallback);
      return true;
    }
    return false;
  };

  const effectiveBranchId = useMemo(() => {
    if (!selectedBranchId) return "";
    if (selectedBranchId === "all") return "";
    return selectedBranchId;
  }, [selectedBranchId]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetched = await branchService.getBranches(token || undefined);
      const allowed = isSuperAdmin || isOrgAdmin
        ? fetched
        : fetched.filter((b) => b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id)));
      setBranches(allowed);

      if (isSuperAdmin || isOrgAdmin) {
        setSelectedBranchId((prev) => prev || (allowed[0]?.id ? "all" : ""));
      } else {
        const forced = allowed[0]?.id || "";
        setSelectedBranchId((prev) => prev || forced);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (organizationLoading) return;
    refreshPermissions();
    setSelectedBranchId("");
    setBranches([]);
    setSession(null);
    setValidation(null);
    setReport(null);
    setLastClosedSessionId(null);
    setCloseConfirmVisible(false);
    setCloseSuccessVisible(false);
    setPosDeviceErrorVisible(false);
    setPosDeviceErrorMessage("");
    setSettings(null);
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, organizationLoading]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const apiService = ApiService.getInstance();
        const raw = await apiService.getSettings(token || undefined);
        if (cancelled) return;
        setSettings((raw as any)?.data ?? raw);
      } catch {
        if (cancelled) return;
        setSettings(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, selectedOrganizationId]);

  const refresh = async (options?: { preserveReport?: boolean; preserveValidation?: boolean }) => {
    if (!effectiveBranchId) {
      setSession(null);
      setValidation(null);
      setReport(null);
      setLastClosedSessionId(null);
      return;
    }

    try {
      setIsLoading(true);
      const token = await getToken();
      const current = await businessDayService.getCurrent(effectiveBranchId, token || undefined);
      setSession(current);
      if (!options?.preserveValidation) {
        setValidation(null);
      }
      if (!options?.preserveReport) {
        setReport(null);
        setLastClosedSessionId(null);
      }

      if (current.status === "CLOSED") {
        const rep = await businessDayService.getReport(current.id, token || undefined);
        setReport(rep);
      }
    } catch (e: any) {
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const runValidation = async () => {
    if (!effectiveBranchId) return;
    if (posDeviceRequiredButMissing) {
      showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"));
      return;
    }
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.validateClose(effectiveBranchId, token || undefined);
      setValidation(result);
      Alert.alert(
        t("admin.businessDay.title"),
        result.ok ? t("admin.businessDay.readyToClose") : t("admin.businessDay.cannotCloseYet")
      );
    } catch (e: any) {
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const performCloseDay = async () => {
    if (!effectiveBranchId) return;
    if (posDeviceRequiredButMissing) {
      showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"));
      return;
    }
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.closeDay(effectiveBranchId, token || undefined);

      const closedSessionId = result?.data?.closedSession?.id;
      if (closedSessionId) {
        const rep = await businessDayService.getReport(closedSessionId, token || undefined);
        setReport(rep);
        setLastClosedSessionId(closedSessionId);
      }

      setCloseSuccessVisible(true);
      await refresh({ preserveReport: true });
    } catch (e: any) {
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      const code = e?.data?.code;
      const blockingOrders = e?.data?.data?.blockingOrders;
      if (code === "BUSINESS_DAY_BLOCKED" && Array.isArray(blockingOrders)) {
        setValidation({ ok: false, blockingOrders });
        await refresh({ preserveReport: true, preserveValidation: true });
      } else {
        Alert.alert(t("common.error"), e?.message || t("common.error"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const closeDay = () => {
    if (!effectiveBranchId) return;
    setCloseConfirmVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!canViewReports) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports]);

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, canViewReports]);

  if (!canViewReports) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDay.title")}</Text>
          <Text style={styles.muted}>{t("common.accessDenied")}</Text>
        </View>
      </View>
    );
  }

  const selectedBranchName =
    selectedBranchId === "all"
      ? t("admin.businessDay.allBranchesNotSupported")
      : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId || t("admin.businessDay.selectBranch");

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec4899" />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>{t("admin.businessDay.title")}</Text>
          <TouchableOpacity
            style={[styles.smallButton, isLoading && styles.buttonDisabled]}
            onPress={() => refresh()}
            disabled={isLoading}
          >
            <Text style={styles.smallButtonText}>{t("common.refresh")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDay.sessionTitle")}</Text>

          <Text style={styles.label}>{t("admin.businessDay.branchLabel")}</Text>
          <TouchableOpacity
            style={[styles.selectButton, loadingBranches && styles.buttonDisabled]}
            onPress={() => setBranchModalVisible(true)}
            disabled={loadingBranches}
          >
            <Text style={styles.selectButtonText} numberOfLines={1}>
              {selectedBranchName}
            </Text>
          </TouchableOpacity>

          {selectedBranchId === "all" ? (
            <Text style={styles.muted}>{t("admin.businessDay.selectSpecificBranchToClose")}</Text>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#ec4899" />
              <Text style={styles.muted}>{t("common.loading")}</Text>
            </View>
          ) : null}

          {!isLoading && session ? (
            <View style={styles.sessionGrid}>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.sessionLabel")}</Text>
                <Text style={styles.kvValue}>#{session.sequenceNumber}</Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.statusLabel")}</Text>
                <Text style={styles.kvValue}>{session.status}</Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.startedLabel")}</Text>
                <Text style={styles.kvValue}>{new Date(session.startedAt).toLocaleString()}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.secondaryAction, (!effectiveBranchId || isLoading) && styles.buttonDisabled]}
              onPress={runValidation}
              disabled={!effectiveBranchId || isLoading}
            >
              <Text style={styles.secondaryActionText}>{t("admin.businessDay.validate")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryAction,
                (!effectiveBranchId || isLoading || !canCloseDay || (validation !== null && (validation as any).ok === false)) &&
                  styles.buttonDisabled,
              ]}
              onPress={closeDay}
              disabled={
                !effectiveBranchId ||
                isLoading ||
                !canCloseDay ||
                (validation !== null && (validation as any).ok === false)
              }
            >
              <Text style={styles.primaryActionText}>{t("admin.businessDay.closeDay")}</Text>
            </TouchableOpacity>
          </View>

          {validation && !validation.ok ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>{t("admin.businessDay.cannotCloseTitle")}</Text>
              <Text style={styles.warningText}>{t("admin.businessDay.cannotCloseBody")}</Text>
              <View style={{ marginTop: 10 }}>
                {validation.blockingOrders.slice(0, 10).map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.warningItemRow}
                    onPress={() => router.push(`/(admin)/order-details?id=${o.id}` as any)}
                  >
                    <Text style={styles.warningItemLink}>
                      {o.orderNumber} — {o.status} / {o.paymentStatus} ({o.paymentMethod})
                      {o.reason ? ` — ${o.reason}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {validation?.ok ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>{t("admin.businessDay.readyToCloseTitle")}</Text>
              <Text style={styles.successText}>{t("admin.businessDay.readyToCloseBody")}</Text>
            </View>
          ) : null}
        </View>

        {report ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("admin.businessDay.dailyReportTitle")}</Text>
            {lastClosedSessionId ? (
              <Text style={styles.muted}>
                {t("admin.businessDay.sessionIdLabel")}: {lastClosedSessionId}
              </Text>
            ) : null}

            <View style={styles.reportGrid}>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.grossSales")}</Text>
                <Text style={styles.kvValue}>
                  {report?.data?.totals?.grossSales?.toFixed?.(2) ?? report?.data?.totals?.grossSales}
                </Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.taxTotal")}</Text>
                <Text style={styles.kvValue}>
                  {report?.data?.totals?.taxTotal?.toFixed?.(2) ?? report?.data?.totals?.taxTotal}
                </Text>
              </View>
            </View>

            <View style={styles.kvBox}>
              <Text style={styles.kvLabel}>{t("admin.businessDay.byPaymentMethod")}</Text>
              {Object.entries(report?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                <View key={k} style={styles.rowBetween}>
                  <Text style={styles.muted}>{k}</Text>
                  <Text style={styles.kvValue}>{Number(v).toFixed(2)}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => {
                const sid = report?.sessionId || lastClosedSessionId;
                if (!sid) return;
                router.push(`/(admin)/business-day/closed/${sid}` as any);
              }}
            >
              <Text style={styles.secondaryActionText}>{t("admin.businessDay.viewDetails")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={closeConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseConfirmVisible(false)}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => setCloseConfirmVisible(false)}
        >
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>
              {t("admin.businessDay.confirmCloseTitle")}
            </Text>
            <Text style={styles.confirmBody}>
              {t("admin.businessDay.confirmCloseDescription")}
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setCloseConfirmVisible(false)}
              >
                <Text style={styles.confirmCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDestructiveButton}
                onPress={async () => {
                  setCloseConfirmVisible(false);
                  await performCloseDay();
                }}
              >
                <Text style={styles.confirmDestructiveText}>
                  {t("admin.businessDay.confirmCloseConfirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={posDeviceErrorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPosDeviceErrorVisible(false)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setPosDeviceErrorVisible(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>{t("common.error")}</Text>
            <Text style={styles.confirmBody}>{posDeviceErrorMessage}</Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setPosDeviceErrorVisible(false)}
              >
                <Text style={styles.confirmCancelText}>{t("common.close")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={closeSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseSuccessVisible(false)}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => setCloseSuccessVisible(false)}
        >
          <Pressable
            style={styles.confirmCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.confirmTitle}>{t("admin.businessDay.title")}</Text>
            <Text style={styles.confirmBody}>{t("admin.businessDay.closed")}</Text>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setCloseSuccessVisible(false)}
              >
                <Text style={styles.confirmCancelText}>{t("common.ok")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={branchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setBranchModalVisible(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.businessDay.branchLabel")}</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Text style={styles.bottomSheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {isSuperAdmin ? (
                <TouchableOpacity
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    setSelectedBranchId("all");
                    setBranchModalVisible(false);
                  }}
                >
                  <Text style={styles.bottomSheetOptionText}>
                    {t("admin.businessDay.allBranchesNotSupported")}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    setSelectedBranchId(b.id);
                    setBranchModalVisible(false);
                  }}
                >
                  <Text style={styles.bottomSheetOptionText}>{b.name || b.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  headerRow: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  screenTitle: {
    color: "#ec4899",
    fontSize: 18,
    fontWeight: "800",
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
  label: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 8,
  },
  muted: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#151718",
    marginBottom: 8,
  },
  selectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  smallButton: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  smallButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  sessionGrid: {
    gap: 10,
    marginTop: 6,
  },
  reportGrid: {
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
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
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: "#ec4899",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryActionText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  warningBox: {
    marginTop: 12,
    backgroundColor: "rgba(239, 68, 68, 0.10)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  warningTitle: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "800",
  },
  warningText: {
    color: "#FECACA",
    fontSize: 12,
    marginTop: 4,
  },
  warningItem: {
    color: "#FECACA",
    fontSize: 11,
    marginTop: 4,
  },
  warningItemRow: {
    paddingVertical: 6,
  },
  warningItemLink: {
    color: "#FECACA",
    fontSize: 11,
    textDecorationLine: "underline",
  },
  successBox: {
    marginTop: 12,
    backgroundColor: "rgba(34, 197, 94, 0.10)",
    borderColor: "rgba(34, 197, 94, 0.35)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  successTitle: {
    color: "#86EFAC",
    fontSize: 13,
    fontWeight: "800",
  },
  successText: {
    color: "#BBF7D0",
    fontSize: 12,
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  bottomSheetClose: { color: "#9CA3AF", fontSize: 18, fontWeight: "700" },
  bottomSheetBody: { padding: 16, maxHeight: 500 },
  bottomSheetOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetOptionText: { fontSize: 14, color: "#D1D5DB", fontWeight: "600" },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
    padding: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 20,
    marginBottom: 16,
  },
  confirmButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    color: "#D1D5DB",
    fontWeight: "800",
    fontSize: 14,
  },
  confirmDestructiveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDestructiveText: {
    color: "#ef4444",
    fontWeight: "900",
    fontSize: 14,
  },
});
