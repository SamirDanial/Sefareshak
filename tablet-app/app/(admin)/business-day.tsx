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
import { useRouter } from "expo-router";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { usePosDevice } from "@/src/contexts/PosDeviceContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import branchService, { type Branch } from "@/src/services/branchService";
import ApiService from "@/src/services/apiService";
import {
  businessDayService,
  type BusinessDayCloseValidation,
  type BusinessDayReport,
  type BusinessDaySession,
  type DsfinvkErrorResponse,
} from "@/src/services/businessDayService";

export default function BusinessDayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { selectedDevice } = usePosDevice();
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
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [branchModalVisible, setBranchModalVisible] = useState(false);

  const [session, setSession] = useState<BusinessDaySession | null>(null);
  const [sessionCounts, setSessionCounts] = useState<
    { orderCount: number; reservationOrderCount: number; totalCount: number } | null
  >(null);
  const [fiscalizationStatus, setFiscalizationStatus] = useState<{
    status: "complete" | "pending" | "failed";
    pendingCount?: number;
  } | null>(null);
  const [validation, setValidation] = useState<BusinessDayCloseValidation | null>(null);
  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [lastClosedSessionId, setLastClosedSessionId] = useState<string | null>(null);

  const [closeConfirmVisible, setCloseConfirmVisible] = useState(false);
  const [closeSuccessVisible, setCloseSuccessVisible] = useState(false);

  const [posDeviceErrorVisible, setPosDeviceErrorVisible] = useState(false);
  const [posDeviceErrorMessage, setPosDeviceErrorMessage] = useState<string>("");

  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalData, setErrorModalData] = useState<{
    title: string;
    userMessage: string;
    technicalDetails?: string;
    recommendation?: string;
    transactionIds?: string[];
    showRetry?: boolean;
  } | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const [settings, setSettings] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const effectiveBranchId = useMemo(() => {
    if (!selectedBranchId) return "";
    if (selectedBranchId === "all") return "";
    return selectedBranchId;
  }, [selectedBranchId]);

  const fiskalyEnabled = Boolean((settings as any)?.fiskalyEnabled);
  const fiskalyEnvironment = String((settings as any)?.fiskalyEnvironment || "").toUpperCase();
  const fiskalyLive = fiskalyEnabled && fiskalyEnvironment === "LIVE";

  const selectedDeviceBranchId = String((selectedDevice as any)?.branchId || "").trim();
  const posDeviceRequiredButMissing = Boolean(
    fiskalyLive &&
      (!selectedDevice ||
        (effectiveBranchId.length > 0 &&
          selectedDeviceBranchId.length > 0 &&
          selectedDeviceBranchId !== effectiveBranchId))
  );

  const showPosDeviceErrorDialog = (message: string) => {
    setPosDeviceErrorMessage(String(message || "").trim() || t("common.error"));
    setPosDeviceErrorVisible(true);
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetched = await branchService.getBranches(token || undefined);
      const allowed =
        isSuperAdmin || isOrgAdmin
          ? fetched
          : fetched.filter(
              (b) => b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id))
            );
      setBranches(allowed);

      if (isSuperAdmin || isOrgAdmin) {
        if (!selectedBranchId) setSelectedBranchId(allowed[0]?.id ? "all" : "");
      } else {
        const forced = allowed[0]?.id || "";
        if (!selectedBranchId) setSelectedBranchId(forced);
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
      setSessionCounts(null);
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
      setSessionCounts((current as any)?.counts || null);
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
      const serverCode =
        e?.data?.code ||
        e?.response?.data?.code ||
        undefined;
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
        return;
      }

      Alert.alert(t("common.error"), serverMessage || t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const runValidation = async () => {
    if (!effectiveBranchId) return;

    if (posDeviceRequiredButMissing) {
      if (selectedDevice && selectedDeviceBranchId.length > 0 && selectedDeviceBranchId !== effectiveBranchId) {
        showPosDeviceErrorDialog(t("admin.businessDay.posDeviceBranchMismatch"));
        return;
      }
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
      const serverCode =
        e?.data?.code ||
        e?.response?.data?.code ||
        undefined;
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
        return;
      }

      Alert.alert(t("common.error"), serverMessage || t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const performCloseDay = async () => {
    if (!effectiveBranchId) return;

    if (posDeviceRequiredButMissing) {
      if (selectedDevice && selectedDeviceBranchId.length > 0 && selectedDeviceBranchId !== effectiveBranchId) {
        showPosDeviceErrorDialog(t("admin.businessDay.posDeviceBranchMismatch"));
        return;
      }
      showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"));
      return;
    }

    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.closeDay(effectiveBranchId, token || undefined);

      const closedSessionId = (result as any)?.data?.closedSession?.id;
      if (closedSessionId) {
        const rep = await businessDayService.getReport(closedSessionId, token || undefined);
        setReport(rep);
        setLastClosedSessionId(closedSessionId);
      }

      setCloseSuccessVisible(true);
      await refresh({ preserveReport: true });
    } catch (e: any) {
      const serverCode =
        e?.data?.code ||
        e?.response?.data?.code ||
        undefined;
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
        return;
      }

      const code = e?.data?.code;
      const blockingOrders = e?.data?.data?.blockingOrders;
      if (
        (code === "BUSINESS_DAY_BLOCKED" || code === "BUSINESS_DAY_FISKALY_BLOCKED") &&
        Array.isArray(blockingOrders)
      ) {
        setValidation({ ok: false, blockingOrders });
        await refresh({ preserveReport: true, preserveValidation: true });
        setErrorModalData({
          title: t("admin.businessDay.cannotCloseTitle"),
          userMessage: t("admin.businessDay.cannotCloseBody"),
          technicalDetails: JSON.stringify({ blockingOrders }, null, 2),
          showRetry: true,
        });
        setErrorModalVisible(true);
      } else if (code === "BUSINESS_DAY_DSFINVK_BLOCKED") {
        const backendPayload = e?.data || null;
        const dsfinvkPayload = (backendPayload as any)?.data?.dsfinvk || null;
        console.error("[BusinessDay] BUSINESS_DAY_DSFINVK_BLOCKED", {
          message: e?.message || null,
          backend: backendPayload,
        });
        try {
          console.error(
            "[BusinessDay] BUSINESS_DAY_DSFINVK_BLOCKED payload",
            JSON.stringify(
              { backend: backendPayload, dsfinvk: dsfinvkPayload },
              null,
              2
            )
          );
        } catch {
          // ignore serialization errors
        }

        // Try to parse structured error response
        const structuredError = dsfinvkPayload as DsfinvkErrorResponse | null;
        if (structuredError && typeof structuredError === "object") {
          setErrorModalData({
            title: t("common.error"),
            userMessage: structuredError.userMessage || String(e?.data?.error || e?.message || "").trim() || t("common.error"),
            technicalDetails: structuredError.technicalDetails?.error || JSON.stringify(structuredError.technicalDetails, null, 2),
            recommendation: structuredError.recommendation,
            transactionIds: structuredError.technicalDetails?.transactionIds,
            showRetry: true,
          });
        } else {
          // Fallback for unstructured errors
          const backendMessage =
            String(e?.data?.error || e?.message || "").trim() || t("common.error");
          const dsfinvkError = e?.data?.data?.dsfinvk;
          const details =
            typeof dsfinvkError?.error === "string"
              ? String(dsfinvkError.error)
              : typeof dsfinvkError?.data === "string"
                ? String(dsfinvkError.data)
                : "";

          setErrorModalData({
            title: t("common.error"),
            userMessage: details ? `${backendMessage}\n${details}` : backendMessage,
            technicalDetails: JSON.stringify({ backend: backendPayload, dsfinvk: dsfinvkPayload }, null, 2),
            showRetry: true,
          });
        }
        setErrorModalVisible(true);
      } else {
        const serverMessage =
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.data?.error ||
          e?.data?.message ||
          e?.message ||
          undefined;

        setErrorModalData({
          title: t("common.error"),
          userMessage: serverMessage || t("common.error"),
          showRetry: true,
        });
        setErrorModalVisible(true);
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
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports, branchLoading]);

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, canViewReports]);

  // Auto-refresh fiscalization status every 30 seconds when session is OPEN
  useEffect(() => {
    if (!session || session.status !== "OPEN") {
      setFiscalizationStatus(null);
      return;
    }

    const fetchFiscalizationStatus = async () => {
      try {
        const token = await getToken();
        const api = ApiService.getInstance();
        const response = await api.get(`/api/admin/business-day/fiscalization-status?branchId=${effectiveBranchId}`, token || undefined);
        const data = (response as any)?.data;
        if (data) {
          setFiscalizationStatus({
            status: data.status || "complete",
            pendingCount: data.pendingCount,
          });
        }
      } catch {
        // If endpoint doesn't exist or fails, default to complete
        setFiscalizationStatus({ status: "complete" });
      }
    };

    fetchFiscalizationStatus();
    const interval = setInterval(fetchFiscalizationStatus, 30000);

    return () => clearInterval(interval);
  }, [session?.status, effectiveBranchId, getToken]);

  if (!canViewReports) {
    return (
      <View style={[styles.container, { paddingTop: 16 }]}>
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
      : branches.find((b) => b.id === selectedBranchId)?.name ||
        selectedBranchId ||
        t("admin.businessDay.selectBranch");

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec4899" />}
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
                <View style={styles.statusRow}>
                  <Text style={styles.kvValue}>{session.status}</Text>
                  {session.status === "OPEN" && fiscalizationStatus ? (
                    <View style={[
                      styles.fiscalizationBadge,
                      fiscalizationStatus.status === "complete" && styles.fiscalizationBadgeComplete,
                      fiscalizationStatus.status === "pending" && styles.fiscalizationBadgePending,
                      fiscalizationStatus.status === "failed" && styles.fiscalizationBadgeFailed,
                    ]}>
                      <Text style={styles.fiscalizationBadgeIcon}>
                        {fiscalizationStatus.status === "complete" ? "✓" :
                         fiscalizationStatus.status === "pending" ? "⏳" : "⚠️"}
                      </Text>
                      {fiscalizationStatus.status === "pending" && fiscalizationStatus.pendingCount !== undefined ? (
                        <Text style={styles.fiscalizationBadgeText}>{fiscalizationStatus.pendingCount}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
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
                (!effectiveBranchId ||
                  isLoading ||
                  !canCloseDay ||
                  (validation !== null && (validation as any).ok === false)) &&
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
              <View style={styles.warningHeader}>
                <Text style={styles.warningTitle}>{t("admin.businessDay.cannotCloseTitle")}</Text>
                <View style={styles.warningCountBadge}>
                  <Text style={styles.warningCountText}>{validation.blockingOrders.length}</Text>
                </View>
              </View>
              <Text style={styles.warningText}>{t("admin.businessDay.cannotCloseBody")}</Text>
              <View style={{ marginTop: 10 }}>
                {validation.blockingOrders.slice(0, 10).map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.warningItemRow}
                    onPress={() => router.push(`/(admin)/order-details?id=${o.id}` as any)}
                  >
                    <View style={styles.warningItemIconContainer}>
                      <Text style={styles.warningItemIcon}>
                        {o.reason === "awaiting_fiscalization" ? "⏳" : "⚠️"}
                      </Text>
                    </View>
                    <Text style={styles.warningItemLink}>
                      {o.orderNumber} — {o.status} / {o.paymentStatus} ({o.paymentMethod})
                      {o.reason ? ` — ${o.reason}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {validation.blockingOrders.length > 10 ? (
                <TouchableOpacity
                  style={styles.viewAllButton}
                  onPress={() => {
                    // Could navigate to a full list view
                  }}
                >
                  <Text style={styles.viewAllButtonText}>
                    {t("admin.businessDay.viewAllOrders", { defaultValue: "View All Orders" })} ({validation.blockingOrders.length})
                  </Text>
                </TouchableOpacity>
              ) : null}
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
                  {(report as any)?.data?.totals?.grossSales?.toFixed?.(2) ?? (report as any)?.data?.totals?.grossSales}
                </Text>
              </View>
              <View style={styles.kvBox}>
                <Text style={styles.kvLabel}>{t("admin.businessDay.taxTotal")}</Text>
                <Text style={styles.kvValue}>
                  {(report as any)?.data?.totals?.taxTotal?.toFixed?.(2) ?? (report as any)?.data?.totals?.taxTotal}
                </Text>
              </View>
            </View>

            <View style={styles.kvBox}>
              <Text style={styles.kvLabel}>{t("admin.businessDay.byPaymentMethod")}</Text>
              {Object.entries((report as any)?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                <View key={k} style={styles.rowBetween}>
                  <Text style={styles.muted}>{k}</Text>
                  <Text style={styles.kvValue}>{Number(v).toFixed(2)}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => {
                const sid = (report as any)?.sessionId || lastClosedSessionId;
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
        <Pressable style={styles.confirmOverlay} onPress={() => setCloseConfirmVisible(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>{t("admin.businessDay.confirmCloseTitle")}</Text>
            <Text style={styles.confirmBody}>
              {t("admin.businessDay.confirmCloseDescription")}
              {sessionCounts && Number(sessionCounts.totalCount || 0) === 0
                ? `\n\n${t("admin.businessDay.confirmCloseNoOrdersWarning")}`
                : ""}
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setCloseConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDestructiveButton}
                onPress={async () => {
                  setCloseConfirmVisible(false);
                  await performCloseDay();
                }}
              >
                <Text style={styles.confirmDestructiveText}>{t("admin.businessDay.confirmCloseConfirm")}</Text>
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
        <Pressable style={styles.confirmOverlay} onPress={() => setCloseSuccessVisible(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>{t("admin.businessDay.title")}</Text>
            <Text style={styles.confirmBody}>{t("admin.businessDay.closed")}</Text>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setCloseSuccessVisible(false)}>
                <Text style={styles.confirmCancelText}>{t("common.ok")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDashboardButton}
                onPress={() => {
                  setCloseSuccessVisible(false);
                  router.push("/(admin)" as any);
                }}
              >
                <Text style={styles.confirmDashboardText}>{t("admin.businessDay.goToDashboard", { defaultValue: "Go to Dashboard" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={branchModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setBranchModalVisible(false)}>
          <Pressable
            style={[
              styles.bottomSheetContent,
              {
                paddingBottom: Math.max(12, insets.bottom + 12),
              },
            ]}
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

      <Modal
        visible={errorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setErrorModalVisible(false);
          setShowTechnicalDetails(false);
          setErrorModalData(null);
        }}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => {
            setErrorModalVisible(false);
            setShowTechnicalDetails(false);
            setErrorModalData(null);
          }}
        >
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>{errorModalData?.title || t("common.error")}</Text>
            <Text style={styles.confirmBody}>{errorModalData?.userMessage || ""}</Text>

            {errorModalData?.recommendation ? (
              <View style={styles.recommendationBox}>
                <Text style={styles.recommendationTitle}>{t("admin.businessDay.recommendation", { defaultValue: "Recommendation" })}</Text>
                <Text style={styles.recommendationText}>{errorModalData.recommendation}</Text>
              </View>
            ) : null}

            {errorModalData?.transactionIds && errorModalData.transactionIds.length > 0 ? (
              <View style={styles.transactionIdsBox}>
                <Text style={styles.transactionIdsTitle}>{t("admin.businessDay.transactionIds", { defaultValue: "Affected Transactions" })}</Text>
                <ScrollView style={styles.transactionIdsScroll} nestedScrollEnabled>
                  {errorModalData.transactionIds.map((tid, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.transactionIdRow}
                      onPress={() => {
                        // Copy to clipboard
                      }}
                    >
                      <Text style={styles.transactionIdText}>{tid}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.technicalDetailsToggle}
              onPress={() => setShowTechnicalDetails(!showTechnicalDetails)}
            >
              <Text style={styles.technicalDetailsToggleText}>
                {showTechnicalDetails
                  ? t("admin.businessDay.hideTechnicalDetails", { defaultValue: "Hide Technical Details" })
                  : t("admin.businessDay.showTechnicalDetails", { defaultValue: "Show Technical Details" })}
              </Text>
            </TouchableOpacity>

            {showTechnicalDetails && errorModalData?.technicalDetails ? (
              <View style={styles.technicalDetailsBox}>
                <ScrollView style={styles.technicalDetailsScroll} nestedScrollEnabled>
                  <Text style={styles.technicalDetailsText}>{errorModalData.technicalDetails}</Text>
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => {
                  setErrorModalVisible(false);
                  setShowTechnicalDetails(false);
                  setErrorModalData(null);
                }}
              >
                <Text style={styles.confirmCancelText}>{t("common.close")}</Text>
              </TouchableOpacity>
              {errorModalData?.showRetry ? (
                <TouchableOpacity
                  style={styles.confirmRetryButton}
                  onPress={async () => {
                    setErrorModalVisible(false);
                    setShowTechnicalDetails(false);
                    setErrorModalData(null);
                    await performCloseDay();
                  }}
                >
                  <Text style={styles.confirmRetryText}>{t("admin.businessDay.retryClose", { defaultValue: "Retry" })}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  headerRow: {
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
  label: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 8,
  },
  muted: {
    color: "#6b7280",
    fontSize: 12,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    marginBottom: 8,
  },
  selectButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  smallButton: {
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  smallButtonText: {
    color: "#111827",
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fiscalizationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  fiscalizationBadgeComplete: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  fiscalizationBadgePending: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.4)",
  },
  fiscalizationBadgeFailed: {
    backgroundColor: "rgba(249, 115, 22, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.4)",
  },
  fiscalizationBadgeIcon: {
    fontSize: 12,
  },
  fiscalizationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
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
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryActionText: {
    color: "#111827",
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
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  warningTitle: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "800",
  },
  warningCountBadge: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  warningCountText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "800",
  },
  warningText: {
    color: "#991B1B",
    fontSize: 12,
    marginTop: 4,
  },
  warningItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  warningItemIconContainer: {
    width: 20,
    alignItems: "center",
  },
  warningItemIcon: {
    fontSize: 14,
  },
  warningItemLink: {
    color: "#991B1B",
    fontSize: 11,
    textDecorationLine: "underline",
    flex: 1,
  },
  viewAllButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  viewAllButtonText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "700",
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  bottomSheetClose: { color: "#6b7280", fontSize: 18, fontWeight: "700" },
  bottomSheetBody: { padding: 16, maxHeight: 500 },
  bottomSheetOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionText: { fontSize: 14, color: "#4b5563", fontWeight: "600" },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    color: "#6b7280",
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
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    color: "#4b5563",
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
  confirmDashboardButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDashboardText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },
  recommendationBox: {
    backgroundColor: "rgba(59, 130, 246, 0.10)",
    borderColor: "rgba(59, 130, 246, 0.35)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  recommendationTitle: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  recommendationText: {
    color: "#BFDBFE",
    fontSize: 12,
    lineHeight: 18,
  },
  transactionIdsBox: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  transactionIdsTitle: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
  },
  transactionIdsScroll: {
    maxHeight: 80,
  },
  transactionIdRow: {
    paddingVertical: 4,
  },
  transactionIdText: {
    color: "#374151",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  technicalDetailsToggle: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  technicalDetailsToggleText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "700",
  },
  technicalDetailsBox: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  technicalDetailsScroll: {
    maxHeight: 120,
  },
  technicalDetailsText: {
    color: "#d1d5db",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  confirmRetryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmRetryText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },
});
