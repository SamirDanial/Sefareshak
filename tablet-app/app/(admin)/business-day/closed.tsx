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
import { useBranch } from "@/src/contexts/BranchContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import branchService, { type Branch } from "@/src/services/branchService";
import { businessDayService, type BusinessDaySession, type Pagination } from "@/src/services/businessDayService";

export default function BusinessDayClosedDaysScreen() {
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

  const canViewReports =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
      { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
    ]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [branchModalVisible, setBranchModalVisible] = useState(false);

  const [sessions, setSessions] = useState<BusinessDaySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_SIZE = 10;

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

  const refresh = async () => {
    if (!effectiveBranchId) {
      setSessions([]);
      setPagination(null);
      return;
    }

    try {
      setIsLoading(true);
      const token = await getToken();
      const closed = await businessDayService.listClosed(
        effectiveBranchId,
        { page: currentPage, limit: PAGE_SIZE },
        token || undefined
      );
      setSessions(closed.sessions);
      setPagination(closed.pagination);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    } finally {
      setIsLoading(false);
    }
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
    if (organizationLoading) return;
    if (!canViewReports) return;
    refreshPermissions();
    setSessions([]);
    setPagination(null);
    setCurrentPage(1);
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, organizationLoading]);

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, canViewReports, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [effectiveBranchId]);

  if (!canViewReports) {
    return (
      <View style={[styles.container, { paddingTop: 16 }]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDays.title")}</Text>
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
          <Text style={styles.screenTitle}>{t("admin.businessDayClosedDays.title")}</Text>
          <TouchableOpacity
            style={[styles.smallButton, isLoading && styles.buttonDisabled]}
            onPress={() => refresh()}
            disabled={isLoading}
          >
            <Text style={styles.smallButtonText}>{t("common.refresh")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDays.filterTitle")}</Text>
          <Text style={styles.label}>{t("admin.businessDayClosedDays.branchLabel")}</Text>
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
            <Text style={styles.muted}>{t("admin.businessDayClosedDays.selectSpecificBranch")}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("admin.businessDayClosedDays.listTitle")}</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#ec4899" />
              <Text style={styles.muted}>{t("common.loading")}</Text>
            </View>
          ) : !effectiveBranchId ? (
            <Text style={styles.muted}>{t("admin.businessDayClosedDays.selectBranchToView")}</Text>
          ) : sessions.length === 0 ? (
            <Text style={styles.muted}>{t("admin.businessDayClosedDays.empty")}</Text>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 10 }}>
                {sessions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.sessionRow}
                    onPress={() => router.push(`/(admin)/business-day/closed/${s.id}` as any)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitle}>#{s.sequenceNumber}</Text>
                      <Text style={styles.muted}>
                        {new Date(s.startedAt).toLocaleString()} →{" "}
                        {s.endedAt ? new Date(s.endedAt).toLocaleString() : "—"}
                      </Text>
                    </View>
                    <Text style={styles.statusText}>{s.status}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {pagination && pagination.totalPages > 1 ? (
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    style={[styles.pageButton, (!pagination.hasPrev || isLoading) && styles.buttonDisabled]}
                    onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={!pagination.hasPrev || isLoading}
                  >
                    <Text style={styles.pageButtonText}>{t("common.previous")}</Text>
                  </TouchableOpacity>

                  <Text style={styles.pageLabel}>
                    {t("common.page", { current: pagination.currentPage, total: pagination.totalPages })}
                  </Text>

                  <TouchableOpacity
                    style={[styles.pageButton, (!pagination.hasNext || isLoading) && styles.buttonDisabled]}
                    onPress={() => setCurrentPage((p) => p + 1)}
                    disabled={!pagination.hasNext || isLoading}
                  >
                    <Text style={styles.pageButtonText}>{t("common.next")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

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
              <Text style={styles.bottomSheetTitle}>{t("admin.businessDayClosedDays.branchLabel")}</Text>
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
                    {t("admin.businessDayClosedDays.allBranchesNotSupported")}
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f9fafb",
  },
  sessionTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  statusText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  pageButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "transparent",
    minWidth: 92,
    alignItems: "center",
  },
  pageButtonText: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "700",
  },
  pageLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
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
});
