import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useRouter, useFocusEffect } from "expo-router";
import {
  reservationService,
  type Table,
  type TableStatus,
  type Zone,
} from "@/src/services/reservationService";
import branchService from "@/src/services/branchService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { EditIcon } from "@/components/ui/edit-icon";

const STATUS_OPTIONS: TableStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "OUT_OF_SERVICE",
];

type Branch = {
  id: string;
  name?: string | null;
};

export default function TableManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();
  const { canAny } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const lastValidBranchIdRef = useRef<string>("");
  const { width } = useWindowDimensions();
  const isTablet = Platform.OS !== "web" && width >= 700;

  const isSuperAdmin = userType === "SUPER_ADMIN";

  const canCreateTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.CREATE }]);
  const canUpdateTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.UPDATE }]);
  const canDeleteTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.DELETE }]);
  const canToggleTableActive = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.TOGGLE_ACTIVE },
  ]);
  const canUpdateTableStatus = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.UPDATE_STATUS },
  ]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [allZonesForFilter, setAllZonesForFilter] = useState<Zone[]>([]);
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [showZoneFilterModal, setShowZoneFilterModal] = useState(false);

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [statusModal, setStatusModal] = useState<{ visible: boolean; table?: Table }>({
    visible: false,
  });

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("");
  const [sortBy, setSortBy] = useState<"tableNumber" | "createdAt" | "zone">("zone");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [showActiveStatusFilterModal, setShowActiveStatusFilterModal] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);

  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsTable, setActionsTable] = useState<Table | null>(null);

  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (orgLoading) return;

    setBranches([]);
    setAllZonesForFilter([]);
    setSelectedZoneFilter("");
    lastValidBranchIdRef.current = "";

    setTables([]);
    setTotalPages(1);
    setTotalCount(0);
    setCurrentPage(1);

    setSearchTerm("");
    setSelectedStatus("");
    setSelectedActiveStatus("");
    setSortBy("zone");
    setSortOrder("asc");

    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, orgLoading, selectedOrganizationId]);

  useEffect(() => {
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (isSuperAdmin) return;
      loadBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLoading]);

  useEffect(() => {
    if (selectedBranchId) {
      lastValidBranchIdRef.current = selectedBranchId;
      fetchAllZonesForFilter(selectedBranchId);
    } else {
      setAllZonesForFilter([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;

    if (
      (selectedStatus !== "" ||
        selectedZoneFilter !== "" ||
        selectedBranchId !== "" ||
        selectedActiveStatus !== "") &&
      currentPage === 1
    ) {
      setFiltersLoading(true);
    }

    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedStatus, selectedZoneFilter, selectedBranchId, selectedActiveStatus, sortBy, sortOrder]);

  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadTables();
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useFocusEffect(
    React.useCallback(() => {
      if (!isInitialMount.current && selectedBranchId) {
        loadTables(1);
        fetchAllZonesForFilter(selectedBranchId);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBranchId])
  );

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = (await getToken()) || undefined;
      const fetchedBranches = await branchService.getBranches(token);
      setBranches(fetchedBranches as any);

      const currentIsValid = selectedBranchId && (fetchedBranches as any[]).some((b: any) => b.id === selectedBranchId);
      if (!currentIsValid && fetchedBranches.length > 0 && fetchedBranches[0]?.id) {
        setSelectedBranchId(fetchedBranches[0].id);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const fetchAllZonesForFilter = async (branchId?: string) => {
    try {
      if (!branchId) {
        setAllZonesForFilter([]);
        return;
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAllZonesForFilter(response.zones);
    } catch (error) {
      console.error("Error fetching zones for filter:", error);
      setAllZonesForFilter([]);
    }
  };

  const loadTables = async (pageOverride?: number) => {
    const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;

    if (!effectiveBranchId) {
      setTables([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
      return;
    }

    try {
      if ((pageOverride || currentPage) === 1 && !refreshing) setLoading(true);
      else setPaginationLoading(true);

      const token = (await getToken()) || undefined;

      const res = await reservationService.getTables(
        pageOverride || currentPage,
        12,
        sortBy,
        sortOrder,
        searchTerm,
        selectedStatus || undefined,
        undefined,
        selectedActiveStatus || undefined,
        effectiveBranchId || undefined,
        selectedZoneFilter || undefined,
        token
      );

      setTables(res.data);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotalCount(res.pagination?.totalCount || res.data.length);
    } catch (error) {
      console.error("Error loading tables:", error);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
      setFiltersLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setCurrentPage(1);
    await loadTables(1);
  };

  const handleBranchFilter = (branchId: string) => {
    setSelectedBranchId(branchId === "all" ? "" : branchId);
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handleZoneFilter = (zoneId: string) => {
    if (zoneId === "all") {
      setSelectedZoneFilter("");
    } else if (zoneId === "__UNASSIGNED__") {
      setSelectedZoneFilter("__UNASSIGNED__");
    } else {
      setSelectedZoneFilter(zoneId);
    }
    setCurrentPage(1);
  };

  const handleActiveStatusFilter = (activeStatus: string) => {
    setSelectedActiveStatus(activeStatus === "all" ? "" : activeStatus);
    setCurrentPage(1);
  };

  const handleSort = (field: "tableNumber" | "createdAt" | "zone") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return !!(
      searchTerm.trim() ||
      selectedStatus ||
      selectedZoneFilter ||
      selectedBranchId ||
      selectedActiveStatus
    );
  }, [searchTerm, selectedStatus, selectedZoneFilter, selectedBranchId, selectedActiveStatus]);

  const handleOpenForm = (table?: Table) => {
    if (table && !canUpdateTable) return;
    if (!table && !canCreateTable) return;
    if (table) {
      router.push(`/(admin)/table-form?id=${table.id}` as any);
    } else {
      router.push("/(admin)/table-form" as any);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteTable) return;
    if (!selectedTable) return;
    try {
      setDeleting(true);
      const token = (await getToken()) || undefined;
      await reservationService.deleteTable(selectedTable.id, token);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.tableDeleted"),
        type: "success",
      });
      setDeleteModalVisible(false);
      setSelectedTable(null);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error deleting table:", error);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.deleteError"),
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (tableId: string, status: TableStatus) => {
    if (!canUpdateTableStatus) return;
    try {
      const token = (await getToken()) || undefined;
      await reservationService.updateTable(tableId, { status }, token);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.statusUpdated"),
        type: "success",
      });
      await loadTables();
    } catch (error) {
      console.error("Error updating status:", error);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.statusError"),
        type: "error",
      });
    }
  };

  const handleToggleActiveStatus = async (table: Table) => {
    if (!canToggleTableActive) return;
    try {
      const token = (await getToken()) || undefined;
      await reservationService.updateTable(table.id, { isActive: !table.isActive }, token);
      setToast({
        visible: true,
        message: table.isActive
          ? t("admin.tableManagement.messages.tableDeactivated", {
              tableNumber: table.tableNumber,
            })
          : t("admin.tableManagement.messages.tableActivated", {
              tableNumber: table.tableNumber,
            }),
        type: "success",
      });
      await loadTables();
    } catch (error) {
      console.error("Error toggling table active status:", error);
      setToast({
        visible: true,
        message: t("admin.tableManagement.messages.toggleActiveStatusError"),
        type: "error",
      });
    }
  };

  const statusLabel = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE":
        return t("admin.tableManagement.statuses.available");
      case "RESERVED":
        return t("admin.tableManagement.statuses.reserved");
      case "OCCUPIED":
        return t("admin.tableManagement.statuses.occupied");
      case "OUT_OF_SERVICE":
        return t("admin.tableManagement.statuses.outOfService");
      default:
        return status;
    }
  };

  const getStatusColors = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE":
        return { backgroundColor: "rgba(34, 197, 94, 0.12)", textColor: "#22c55e" };
      case "RESERVED":
        return { backgroundColor: "rgba(251, 191, 36, 0.12)", textColor: "#fbbf24" };
      case "OCCUPIED":
        return { backgroundColor: "rgba(239, 68, 68, 0.12)", textColor: "#ef4444" };
      case "OUT_OF_SERVICE":
        return { backgroundColor: "rgba(107, 114, 128, 0.12)", textColor: "#6b7280" };
      default:
        return { backgroundColor: "rgba(236, 72, 153, 0.12)", textColor: "#ec4899" };
    }
  };

  const groupedTables = useMemo(() => {
    const groups: Record<
      string,
      {
        name: string;
        tables: Table[];
      }
    > = {};

    const zoneNameById: Record<string, string> = {};
    allZonesForFilter.forEach((z) => {
      zoneNameById[z.id] = z.name;
    });

    const unassignedKey = "__UNASSIGNED__";

    for (const table of tables) {
      const zoneId = table.zoneId || unassignedKey;
      const zoneName = table.zoneId
        ? zoneNameById[table.zoneId] || t("admin.tableManagement.unassigned")
        : t("admin.tableManagement.unassigned");

      if (!groups[zoneId]) {
        groups[zoneId] = { name: zoneName, tables: [] };
      }
      groups[zoneId].tables.push(table);
    }

    return groups;
  }, [allZonesForFilter, t, tables]);

  const zones = useMemo(() => {
    const zoneIds = Object.keys(groupedTables);
    if (sortBy === "zone") {
      zoneIds.sort((a, b) => {
        const nameA = groupedTables[a]?.name || "";
        const nameB = groupedTables[b]?.name || "";
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
    }
    return zoneIds;
  }, [groupedTables, sortBy, sortOrder]);

  if (loading && tables.length === 0 && selectedBranchId) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingTitle}>{t("admin.tableManagement.loading")}</Text>
        <Text style={styles.loadingSubtitle}>
          {t("admin.tableManagement.loadingDescription")}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {paginationLoading && (
        <View style={styles.paginationLoadingOverlay}>
          <ActivityIndicator size="large" color="#ec4899" />
        </View>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingTop: 0 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: showFilters ? 4 : 16,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowFilters((prev) => !prev)}
            style={styles.filterTextButtonContainer}
          >
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.tableManagement.hideFilters")
                : t("admin.tableManagement.showFilters")}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.tableManagement.searchPlaceholder")}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            <View style={styles.filterDropdownsRow}>
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedBranchId !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowBranchFilterModal(true)}
              >
                <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.tableManagement.selectBranch")
                    : t("admin.tableManagement.selectBranch")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedStatus !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowStatusFilterModal(true)}
              >
                <MaterialCommunityIcons name="eye" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedStatus
                    ? statusLabel(selectedStatus as TableStatus)
                    : t("admin.tableManagement.allStatus")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedZoneFilter !== "" && styles.filterDropdownActive,
                  !selectedBranchId && styles.filterDropdownDisabled,
                ]}
                onPress={() => selectedBranchId && setShowZoneFilterModal(true)}
                disabled={!selectedBranchId}
              >
                <MaterialCommunityIcons
                  name="map-marker"
                  size={14}
                  color={!selectedBranchId ? "#6B7280" : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.filterDropdownText,
                    !selectedBranchId && styles.filterDropdownTextDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {!selectedBranchId
                    ? t("admin.tableManagement.selectBranchFirst")
                    : selectedZoneFilter === "__UNASSIGNED__"
                    ? t("admin.tableManagement.unassigned")
                    : selectedZoneFilter
                    ? allZonesForFilter.find((z) => z.id === selectedZoneFilter)?.name ||
                      t("admin.tableManagement.allZones")
                    : t("admin.tableManagement.allZones")}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={14}
                  color={!selectedBranchId ? "#6B7280" : "#9CA3AF"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedActiveStatus !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowActiveStatusFilterModal(true)}
              >
                <MaterialCommunityIcons name="check-circle" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedActiveStatus === "true"
                    ? t("admin.tableManagement.active")
                    : selectedActiveStatus === "false"
                    ? t("admin.tableManagement.inactive")
                    : t("admin.tableManagement.allActiveStatus")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>{t("admin.tableManagement.sortBy")}:</Text>

              <TouchableOpacity
                style={[styles.sortButton, sortBy === "zone" && styles.sortButtonActive]}
                onPress={() => handleSort("zone")}
              >
                <Text style={[styles.sortButtonText, sortBy === "zone" && styles.sortButtonTextActive]}>
                  {t("admin.tableManagement.sortZone")}
                </Text>
                {sortBy === "zone" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "tableNumber" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("tableNumber")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "tableNumber" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.tableManagement.sortTableNumber")}
                </Text>
                {sortBy === "tableNumber" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "createdAt" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("createdAt")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "createdAt" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.tableManagement.sortDate")}
                </Text>
                {sortBy === "createdAt" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading || filtersLoading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.emptyCard}>
              <ActivityIndicator size="large" color="#ec4899" />
              <Text style={styles.emptyText}>{t("admin.tableManagement.loading")}</Text>
              <Text style={styles.emptySubtext}>
                {t("admin.tableManagement.loadingDescription")}
              </Text>
            </View>
          </View>
        ) : tables.length === 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.emptyCard}>
              {!selectedBranchId ? (
                <>
                  <MaterialCommunityIcons name="office-building" size={48} color="#6B7280" />
                  <Text style={styles.emptyText}>
                    {t("admin.tableManagement.selectBranchToView")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.tableManagement.selectBranchToViewSubtext")}
                  </Text>
                </>
              ) : hasActiveFilters ? (
                <>
                  <MaterialCommunityIcons name="magnify" size={48} color="#6B7280" />
                  <Text style={styles.emptyText}>{t("admin.tableManagement.noResultsFound")}</Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.tableManagement.noResultsFoundSubtext")}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>{t("admin.tableManagement.noTables")}</Text>
                  <TouchableOpacity
                    style={styles.primaryButtonInline}
                    onPress={() => handleOpenForm()}
                  >
                    <MaterialCommunityIcons name="plus-circle" size={18} color="#fff" />
                    <Text style={styles.primaryButtonInlineText}>
                      {t("admin.tableManagement.createFirstTable")}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {paginationLoading && (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            )}

            <View style={[styles.zonesGrid, isTablet && styles.zonesGridTablet]}>
              {zones.map((zoneId) => {
                const zoneGroup = groupedTables[zoneId];
                if (!zoneGroup) return null;
                return (
                  <View
                    key={zoneId}
                    style={[styles.zoneCard, isTablet && styles.zoneCardTablet]}
                  >
                    <View style={styles.zoneHeader}>
                      <View style={styles.zoneTitleContainer}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#ec4899" />
                        <Text style={styles.zoneTitle} numberOfLines={1}>
                          {zoneGroup.name}
                        </Text>
                      </View>
                      <Text style={styles.zoneCount} numberOfLines={1}>
                        {t("admin.tableManagement.tables")}: {zoneGroup.tables.length}
                      </Text>
                    </View>

                    <View style={styles.tableList}>
                      {zoneGroup.tables.map((table) => (
                        <View key={table.id} style={styles.tableCard}>
                          <View style={styles.tableHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.tableNumber} numberOfLines={1}>
                                {table.tableNumber}
                              </Text>
                              <View style={styles.statusRow}>
                                <View
                                  style={[
                                    styles.statusPill,
                                    {
                                      backgroundColor: getStatusColors(table.status).backgroundColor,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.statusPillText,
                                      { color: getStatusColors(table.status).textColor },
                                    ]}
                                  >
                                    {statusLabel(table.status)}
                                  </Text>
                                </View>
                                {table.isActive === false && (
                                  <View style={styles.inactivePill}>
                                    <Text style={styles.inactivePillText}>
                                      {t("admin.tableManagement.statuses.inactive")}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            <TouchableOpacity
                              style={[
                                styles.menuButton,
                                !canUpdateTable &&
                                  !canToggleTableActive &&
                                  !canUpdateTableStatus &&
                                  !canDeleteTable &&
                                  { opacity: 0.5 },
                              ]}
                              onPress={() => {
                                if (
                                  !canUpdateTable &&
                                  !canToggleTableActive &&
                                  !canUpdateTableStatus &&
                                  !canDeleteTable
                                ) {
                                  return;
                                }
                                setActionsTable(table);
                                setActionsModalVisible(true);
                              }}
                            >
                              <MaterialCommunityIcons
                                name="dots-vertical"
                                size={18}
                                color="#9CA3AF"
                              />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.tableDetails}>
                            <View style={styles.detailRow}>
                              <MaterialCommunityIcons
                                name="account-group"
                                size={14}
                                color="#9CA3AF"
                              />
                              <Text style={styles.detailText}>
                                {t("admin.tableManagement.tableInfo.capacity", {
                                  count: table.capacity,
                                })}
                              </Text>
                            </View>
                            {table.notes ? (
                              <Text style={styles.notesText}>{table.notes}</Text>
                            ) : null}
                          </View>

                          <View style={styles.statusDropdownContainer}>
                            {canUpdateTableStatus ? (
                              <TouchableOpacity
                                style={styles.statusDropdownButton}
                                onPress={() => setStatusModal({ visible: true, table })}
                              >
                                <Text style={styles.statusDropdownText} numberOfLines={1}>
                                  {statusLabel(table.status)}
                                </Text>
                                <MaterialCommunityIcons
                                  name="chevron-down"
                                  size={14}
                                  color="#9CA3AF"
                                />
                              </TouchableOpacity>
                            ) : (
                              <View style={[styles.statusDropdownButton, { opacity: 0.7 }]}>
                                <Text style={styles.statusDropdownText} numberOfLines={1}>
                                  {statusLabel(table.status)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              {t("admin.tableManagement.showingTables", {
                count: tables.length,
                total: totalCount,
              })}
            </Text>
            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === 1 && styles.paginationButtonDisabled,
                ]}
                onPress={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1 || paginationLoading}
              >
                <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.paginationPageText}>
                {t("admin.tableManagement.pageOf", {
                  current: currentPage,
                  total: totalPages,
                })}
              </Text>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === totalPages && styles.paginationButtonDisabled,
                ]}
                onPress={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages || paginationLoading}
              >
                <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="slide"
        visible={deleteModalVisible}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setDeleteModalVisible(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.tableManagement.delete")}</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={{ color: "#D1D5DB" }}>
                {t("admin.tableManagement.messages.confirmDelete")}
              </Text>
              <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setDeleteModalVisible(false)}
                  disabled={deleting}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t("admin.tableManagement.actions.cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dangerButton, deleting && { opacity: 0.5 }]}
                  onPress={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dangerButtonText}>
                      {t("admin.tableManagement.delete")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={statusModal.visible}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setStatusModal({ visible: false })}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setStatusModal({ visible: false })}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectStatus")}
              </Text>
              <TouchableOpacity onPress={() => setStatusModal({ visible: false })}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    if (!statusModal.table) return;
                    handleStatusChange(statusModal.table.id, status);
                    setStatusModal({ visible: false });
                  }}
                >
                  <Text style={styles.bottomSheetOptionText}>{statusLabel(status)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showBranchFilterModal}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowBranchFilterModal(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.tableManagement.selectBranch")}</Text>
              <TouchableOpacity onPress={() => setShowBranchFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedBranchId === "" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleBranchFilter("all");
                  setShowBranchFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedBranchId === "" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.allBranches")}</Text>
              </TouchableOpacity>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.bottomSheetOption, selectedBranchId === b.id && styles.bottomSheetOptionSelected]}
                  onPress={() => {
                    handleBranchFilter(b.id);
                    setShowBranchFilterModal(false);
                  }}
                >
                  <Text style={[styles.bottomSheetOptionText, selectedBranchId === b.id && styles.bottomSheetOptionTextSelected]}>{b.name || b.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showStatusFilterModal}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowStatusFilterModal(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.tableManagement.selectStatus")}</Text>
              <TouchableOpacity onPress={() => setShowStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedStatus === "" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleStatusFilter("all");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedStatus === "" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.allStatus")}</Text>
              </TouchableOpacity>
              {STATUS_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.bottomSheetOption, selectedStatus === s && styles.bottomSheetOptionSelected]}
                  onPress={() => {
                    handleStatusFilter(s);
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text style={[styles.bottomSheetOptionText, selectedStatus === s && styles.bottomSheetOptionTextSelected]}>{statusLabel(s)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showZoneFilterModal}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowZoneFilterModal(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowZoneFilterModal(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.tableManagement.selectZone")}</Text>
              <TouchableOpacity onPress={() => setShowZoneFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedZoneFilter === "" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleZoneFilter("all");
                  setShowZoneFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedZoneFilter === "" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.allZones")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedZoneFilter === "__UNASSIGNED__" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleZoneFilter("__UNASSIGNED__");
                  setShowZoneFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedZoneFilter === "__UNASSIGNED__" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.unassigned")}</Text>
              </TouchableOpacity>
              {allZonesForFilter.map((z) => (
                <TouchableOpacity
                  key={z.id}
                  style={[styles.bottomSheetOption, selectedZoneFilter === z.id && styles.bottomSheetOptionSelected]}
                  onPress={() => {
                    handleZoneFilter(z.id);
                    setShowZoneFilterModal(false);
                  }}
                >
                  <Text style={[styles.bottomSheetOptionText, selectedZoneFilter === z.id && styles.bottomSheetOptionTextSelected]}>{z.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showActiveStatusFilterModal}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowActiveStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowActiveStatusFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectActiveStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowActiveStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedActiveStatus === "" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleActiveStatusFilter("all");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedActiveStatus === "" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.allActiveStatus")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedActiveStatus === "true" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleActiveStatusFilter("true");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedActiveStatus === "true" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.active")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bottomSheetOption, selectedActiveStatus === "false" && styles.bottomSheetOptionSelected]}
                onPress={() => {
                  handleActiveStatusFilter("false");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text style={[styles.bottomSheetOptionText, selectedActiveStatus === "false" && styles.bottomSheetOptionTextSelected]}>{t("admin.tableManagement.inactive")}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsTable(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsTable(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsTable && (
              <View style={styles.sheetContent}>
                {canUpdateTable && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleOpenForm(actionsTable);
                      setActionsTable(null);
                    }}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>{t("admin.tableManagement.edit")}</Text>
                  </TouchableOpacity>
                )}

                {canToggleTableActive && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleToggleActiveStatus(actionsTable);
                      setActionsTable(null);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={actionsTable.isActive ? "eye-off" : "eye"}
                      size={16}
                      color="#D1D5DB"
                    />
                    <Text style={styles.sheetItemText}>
                      {actionsTable.isActive
                        ? t("admin.tableManagement.deactivate")
                        : t("admin.tableManagement.activate")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canUpdateTableStatus && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      setStatusModal({ visible: true, table: actionsTable });
                      setActionsTable(null);
                    }}
                  >
                    <MaterialCommunityIcons name="sync" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.tableManagement.tableInfo.quickStatusChange")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canDeleteTable && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemDanger]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      setSelectedTable(actionsTable);
                      setDeleteModalVisible(true);
                      setActionsTable(null);
                    }}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    <Text style={[styles.sheetItemText, styles.actionTextDanger]}>
                      {t("admin.tableManagement.delete")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsTable(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>{t("admin.tableManagement.cancel")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {canCreateTable && (
        <TouchableOpacity style={styles.fab} onPress={() => handleOpenForm()}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
  },
  loadingTitle: { color: "#111827", fontSize: 18, fontWeight: "700" },
  loadingSubtitle: { color: "#6B7280", fontSize: 13 },

  paginationLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  list: { flex: 1 },

  filterTextButtonContainer: { alignSelf: "flex-end" },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },

  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },

  filterDropdownsRow: { gap: 12 },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#f9fafb",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  filterDropdownDisabled: { opacity: 0.5 },
  filterDropdownTextDisabled: { color: "#6B7280" },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f3f4f6",
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptySubtext: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
  },

  zonesGrid: { gap: 16 },
  zonesGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  zoneCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 12,
  },
  zoneCardTablet: {
    width: "48%",
  },
  zoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  zoneTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  zoneTitle: { color: "#111827", fontSize: 16, fontWeight: "700", flex: 1 },
  zoneCount: { color: "#6B7280", fontSize: 13, fontWeight: "600" },

  tableList: { gap: 12 },
  tableCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    padding: 14,
    gap: 12,
  },
  tableHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tableNumber: { color: "#111827", fontSize: 16, fontWeight: "700" },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  inactivePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(107, 114, 128, 0.12)",
  },
  inactivePillText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },

  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  tableDetails: { gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { color: "#374151", fontSize: 13, fontWeight: "500" },
  notesText: { color: "#6B7280", fontSize: 13, lineHeight: 18 },

  statusDropdownContainer: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
  statusDropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statusDropdownText: { color: "#111827", fontSize: 13, fontWeight: "600", flex: 1 },

  pagination: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  paginationText: { fontSize: 12, color: "#6B7280", textAlign: "center" },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: { opacity: 0.5 },
  paginationPageText: { fontSize: 13, color: "#374151", fontWeight: "500" },

  primaryButtonInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  primaryButtonInlineText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
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
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  bottomSheetBody: { padding: 20, maxHeight: 500 },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionText: { fontSize: 14, color: "#374151", fontWeight: "500" },
  bottomSheetOptionSelected: {
    backgroundColor: "#fce7f3",
    borderColor: "#ec4899",
  },
  bottomSheetOptionTextSelected: {
    color: "#ec4899",
    fontWeight: "600",
  },

  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 14,
  },
  dangerButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ef4444",
  },
  dangerButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginTop: 8,
    marginBottom: 8,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  actionTextDanger: { color: "#ef4444" },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
});
