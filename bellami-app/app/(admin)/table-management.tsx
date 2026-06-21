import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { MaterialIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { useRouter, useFocusEffect } from "expo-router";
import {
  reservationService,
  type Table,
  type TableFormData,
  type TableStatus,
  type Zone,
} from "@/src/services/reservationService";
import branchService from "@/src/services/branchService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const STATUS_OPTIONS: TableStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "OUT_OF_SERVICE",
];

export default function TableManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();
  const { canAny } = usePermissions();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition, isScrollingDown, isAtTop } = useScroll();
  const lastScrollY = useRef(0);
  const lastValidBranchIdRef = useRef<string>("");

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

  // Branch and Zone state
  interface Branch {
    id: string;
    name?: string | null;
  }
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [allZonesForFilter, setAllZonesForFilter] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [showZoneFilterModal, setShowZoneFilterModal] = useState(false);

  // Table state
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [statusModal, setStatusModal] = useState<{ visible: boolean; table?: Table }>(
    { visible: false }
  );
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsTable, setActionsTable] = useState<Table | null>(null);


  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (orgLoading) return;

    setBranches([]);
    setSelectedBranchId("");
    setAllZonesForFilter([]);
    setSelectedZoneId("");
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
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (isSuperAdmin) return;
      loadBranches();
    }
  }, []);

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
      (selectedStatus !== "" || selectedZoneId !== "" || selectedBranchId !== "" || selectedActiveStatus !== "") &&
      currentPage === 1
    ) {
      setFiltersLoading(true);
    }
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedStatus, selectedZoneId, selectedBranchId, selectedActiveStatus, sortBy, sortOrder]);

  // Debounced search effect
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
  }, [searchTerm]);

  // Reload tables when screen comes into focus (e.g., returning from form page)
  useFocusEffect(
    React.useCallback(() => {
      if (!isInitialMount.current) {
        // Reload tables when returning from form page
        if (selectedBranchId) {
          // Reset to first page and reload with page 1
          loadTables(1);
          // Also reload zones in case new zones were created
          fetchAllZonesForFilter(selectedBranchId);
        }
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

      // Auto-select the only branch if there is exactly one (and nothing else already selected)
      if (!selectedBranchId && fetchedBranches.length === 1 && fetchedBranches[0]?.id) {
        setSelectedBranchId(fetchedBranches[0].id);
      } else if (!selectedBranchId && fetchedBranches.length > 0 && fetchedBranches[0]?.id) {
        // For staff users, always have a concrete branch selected to avoid cross-branch or empty queries
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
    // Don't clear existing tables if branch becomes temporarily empty during permission hydration.
    // Use the last valid branch to avoid flicker.
    const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;
    if (!effectiveBranchId) {
      setLoading(false);
      setPaginationLoading(false);
      setFiltersLoading(false);
      return;
    }

    try {
      const pageToUse = pageOverride !== undefined ? pageOverride : (refreshing ? 1 : currentPage);
      if (pageToUse === 1 && !refreshing) {
        setLoading(true);
      } else if (pageToUse !== 1) {
        setPaginationLoading(true);
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getTables(
        pageToUse,
        12,
        sortBy,
        sortOrder,
        searchTerm || undefined,
        selectedStatus || undefined,
        undefined, // Legacy zone string filter - not used anymore
        selectedActiveStatus || undefined,
        effectiveBranchId || undefined,
        selectedZoneId === "__UNASSIGNED__" ? "__UNASSIGNED__" : selectedZoneId || undefined,
        token
      );
      setTables(response.data || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
      }
      // Update currentPage if we used a page override
      if (pageOverride !== undefined && pageOverride !== currentPage) {
        setCurrentPage(pageOverride);
      }
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

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentPage(1);
    loadTables();
  };

  // Helper function to get zone name from table
  const getZoneName = (table: Table): string => {
    // Check if zoneRelation exists (from Zone Management)
    if (table.zoneRelation && table.zoneRelation.name) {
      return table.zoneRelation.name;
    }
    // Fallback to legacy zone string
    if (table.zone && typeof table.zone === 'string') {
      return table.zone;
    }
    return t("admin.tableManagement.noZone");
  };

  // Helper function to get zone ID for grouping
  const getZoneId = (table: Table): string => {
    if (table.zoneId) return table.zoneId;
    // If zoneRelation exists, use its id
    if (table.zoneRelation && table.zoneRelation.id) {
      return table.zoneRelation.id;
    }
    // Fallback: use zone name as key for legacy zones
    return getZoneName(table);
  };

  // Sort and group tables by zone (using zoneId from Zone Management)
  const { groupedTables, zones } = useMemo(() => {
    // First, sort all tables based on the selected sort field
    const sortedTables = [...tables].sort((a, b) => {
      if (sortBy === "zone") {
        // Sort by zone first, then by tableNumber as secondary
        const zoneA = getZoneName(a).toLowerCase();
        const zoneB = getZoneName(b).toLowerCase();
        if (zoneA !== zoneB) {
          return sortOrder === "asc" 
            ? zoneA.localeCompare(zoneB)
            : zoneB.localeCompare(zoneA);
        }
        // If same zone, sort by tableNumber
        return sortOrder === "asc"
          ? a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })
          : b.tableNumber.localeCompare(a.tableNumber, undefined, { numeric: true });
      } else if (sortBy === "createdAt") {
        // Sort by creation date
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      } else {
        // Sort by tableNumber
        return sortOrder === "asc"
          ? a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })
          : b.tableNumber.localeCompare(a.tableNumber, undefined, { numeric: true });
      }
    });

    // Then group by zoneId, maintaining the sort order within each group
    const grouped = sortedTables.reduce((acc, table) => {
      const zoneId = getZoneId(table);
      const zoneName = getZoneName(table);
      // Use zoneId as key, but store zone name for display
      if (!acc[zoneId]) {
        acc[zoneId] = {
          name: zoneName,
          tables: []
        };
      }
      acc[zoneId].tables.push(table);
      return acc;
    }, {} as Record<string, { name: string; tables: Table[] }>);

    // Determine zone order based on sort field
    let zoneOrder: string[];
    if (sortBy === "zone") {
      // When sorting by zone, sort zones alphabetically by name
      zoneOrder = Object.keys(grouped).sort((a, b) => {
        const zoneA = grouped[a].name.toLowerCase();
        const zoneB = grouped[b].name.toLowerCase();
        return sortOrder === "asc"
          ? zoneA.localeCompare(zoneB)
          : zoneB.localeCompare(zoneA);
      });
    } else {
      // When sorting by other fields, zones appear in the order of their first table in the sorted list
      const zoneSet = new Map<string, string>(); // zoneId -> zoneName
      sortedTables.forEach((table) => {
        const zoneId = getZoneId(table);
        if (!zoneSet.has(zoneId)) {
          zoneSet.set(zoneId, getZoneName(table));
        }
      });
      zoneOrder = Array.from(zoneSet.keys());
    }

    return { groupedTables: grouped, zones: zoneOrder };
  }, [tables, sortBy, sortOrder, t]);


  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handleBranchFilter = (branchId: string) => {
    setSelectedBranchId(branchId || "");
    setSelectedZoneId(""); // Reset zone filter when branch changes
    setCurrentPage(1);
  };

  const handleZoneFilter = (zoneId: string) => {
    if (zoneId === "all") {
      setSelectedZoneId("");
    } else if (zoneId === "__UNASSIGNED__") {
      setSelectedZoneId("__UNASSIGNED__");
    } else {
      setSelectedZoneId(zoneId);
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
      selectedZoneId ||
      selectedBranchId ||
      selectedActiveStatus
    );
  }, [searchTerm, selectedStatus, selectedZoneId, selectedBranchId, selectedActiveStatus]);

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
      await reservationService.updateTable(
        table.id,
        { isActive: !table.isActive },
        token
      );
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
        return {
          backgroundColor: "rgba(34, 197, 94, 0.12)", // Green
          textColor: "#22c55e",
        };
      case "RESERVED":
        return {
          backgroundColor: "rgba(251, 191, 36, 0.12)", // Yellow/Amber
          textColor: "#fbbf24",
        };
      case "OCCUPIED":
        return {
          backgroundColor: "rgba(239, 68, 68, 0.12)", // Red
          textColor: "#ef4444",
        };
      case "OUT_OF_SERVICE":
        return {
          backgroundColor: "rgba(107, 114, 128, 0.12)", // Gray
          textColor: "#6b7280",
        };
      default:
        return {
          backgroundColor: "rgba(236, 72, 153, 0.12)", // Pink (fallback)
          textColor: "#ec4899",
        };
    }
  };

  if (loading && tables.length === 0) {
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
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight - 8,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        {/* Filters toggle */}
        <View style={{ paddingHorizontal: 24, paddingBottom: showFilters ? 4 : 16 }}>
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

        {/* Search and Filters */}
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

            {/* Filter Dropdowns */}
            <View style={styles.filterDropdownsRow}>
              {/* Branch Filter */}
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedBranchId !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowBranchFilterModal(true)}
              >
                <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedBranchId
                    ? branches.find(b => b.id === selectedBranchId)?.name || t("admin.tableManagement.selectBranch")
                    : t("admin.tableManagement.selectBranch") || "Select Branch"}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Status Filter */}
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedStatus !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowStatusFilterModal(true)}
              >
                <MaterialCommunityIcons name="eye" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedStatus
                    ? statusLabel(selectedStatus as TableStatus)
                    : t("admin.tableManagement.allStatus")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Zone Filter */}
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedZoneId !== "" && styles.filterDropdownActive,
                  !selectedBranchId && styles.filterDropdownDisabled,
                ]}
                onPress={() => selectedBranchId && setShowZoneFilterModal(true)}
                disabled={!selectedBranchId}
              >
                <MaterialCommunityIcons name="map-marker" size={14} color={!selectedBranchId ? "#6B7280" : "#9CA3AF"} />
                <Text style={[styles.filterDropdownText, !selectedBranchId && styles.filterDropdownTextDisabled]}>
                  {!selectedBranchId
                    ? t("admin.tableManagement.selectBranchFirst") || "Select Branch First"
                    : selectedZoneId === "__UNASSIGNED__"
                    ? t("admin.tableManagement.unassigned")
                    : selectedZoneId
                    ? allZonesForFilter.find(z => z.id === selectedZoneId)?.name || t("admin.tableManagement.allZones")
                    : t("admin.tableManagement.allZones")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color={!selectedBranchId ? "#6B7280" : "#9CA3AF"} />
              </TouchableOpacity>

              {/* Active Status Filter */}
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedActiveStatus !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowActiveStatusFilterModal(true)}
              >
                <MaterialCommunityIcons name="check-circle" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
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
              <Text style={styles.sortLabel}>
                {t("admin.tableManagement.sortBy")}:
              </Text>
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "zone" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("zone")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "zone" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.tableManagement.sortZone") || "Zone"}
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
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.emptyText}>
              {t("admin.tableManagement.loading")}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("admin.tableManagement.loadingDescription")}
            </Text>
          </View>
        ) : tables.length === 0 ? (
          <View style={styles.emptyCard}>
            {!selectedBranchId ? (
              <>
                <MaterialCommunityIcons name="office-building" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>
                  {t("admin.tableManagement.selectBranchToView") || "Please select a branch to view tables"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {t("admin.tableManagement.selectBranchToViewSubtext") || "Choose a branch from the filter above to see its tables"}
                </Text>
              </>
            ) : hasActiveFilters ? (
              <>
                <MaterialCommunityIcons name="magnify" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>
                  {t("admin.tableManagement.noResultsFound")}
                </Text>
                <Text style={styles.emptySubtext}>
                  {t("admin.tableManagement.noResultsFoundSubtext")}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>
                  {t("admin.tableManagement.noTables")}
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => handleOpenForm()}
                >
                  <MaterialCommunityIcons name="plus-circle" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    {t("admin.tableManagement.createFirstTable")}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <>
            {paginationLoading && (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            )}
            {zones.map((zoneId) => {
              const zoneGroup = groupedTables[zoneId];
              if (!zoneGroup) return null;
              return (
                <View key={zoneId} style={styles.zoneCard}>
                  <View style={styles.zoneHeader}>
                    <View style={styles.zoneTitleContainer}>
                      <MaterialCommunityIcons name="map-marker" size={16} color="#ec4899" />
                      <Text style={styles.zoneTitle}>{zoneGroup.name}</Text>
                    </View>
                    <Text style={styles.zoneCount}>
                      {t("admin.tableManagement.tables") || "Tables"}: {zoneGroup.tables.length}
                    </Text>
                  </View>
                  <View style={styles.tableList}>
                    {zoneGroup.tables.map((table) => (
                      <View key={table.id} style={styles.tableCard}>
                        <View style={styles.tableHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tableNumber}>{table.tableNumber}</Text>
                            <View style={styles.statusRow}>
                              <View
                                style={[
                                  styles.statusPill,
                                  {
                                    backgroundColor: getStatusColors(table.status)
                                      .backgroundColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusPillText,
                                    {
                                      color: getStatusColors(table.status).textColor,
                                    },
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
                          <View style={{ flexDirection: "row", gap: 8 }}>
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
                                setShowActionsMenu(table.id);
                                setActionsModalVisible(true);
                              }}
                            >
                              <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.tableDetails}>
                          <View style={styles.detailRow}>
                            <MaterialCommunityIcons name="account-group" size={14} color="#9CA3AF" />
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
                        {/* Inline Status Change Dropdown */}
                        <View style={styles.statusDropdownContainer}>
                          {canUpdateTableStatus ? (
                            <TouchableOpacity
                              style={styles.statusDropdownButton}
                              onPress={() => {
                                // Show status selection modal
                                setStatusModal({ visible: true, table });
                              }}
                            >
                              <Text style={styles.statusDropdownText}>
                                {statusLabel(table.status)}
                              </Text>
                              <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                            </TouchableOpacity>
                          ) : (
                            <View style={[styles.statusDropdownButton, { opacity: 0.7 }]}>
                              <Text style={styles.statusDropdownText}>
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
          </>
        )}

        {/* Pagination */}
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

      {/* Delete Bottom Sheet Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setDeleteModalVisible(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.deleteDialog.title")}
              </Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.bottomSheetBody}>
              <Text style={styles.deleteDescription}>
                {t("admin.tableManagement.deleteDialog.description", {
                  tableNumber: selectedTable?.tableNumber || "",
                })}
              </Text>
            </View>
            <View style={styles.bottomSheetFooter}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>
                  {t("admin.tableManagement.deleteDialog.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {t("admin.tableManagement.deleteDialog.confirm")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Status Bottom Sheet Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={statusModal.visible}
        onRequestClose={() => setStatusModal({ visible: false })}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setStatusModal({ visible: false })}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.tableInfo.quickStatusChange")}
              </Text>
              <TouchableOpacity onPress={() => setStatusModal({ visible: false })}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {STATUS_OPTIONS.map((status) => {
                const isCurrentStatus = statusModal.table?.status === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusOption,
                      isCurrentStatus && styles.statusOptionActive,
                    ]}
                    onPress={() => {
                      if (statusModal.table) {
                        handleStatusChange(statusModal.table.id, status);
                        setStatusModal({ visible: false });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        isCurrentStatus && styles.statusOptionTextActive,
                      ]}
                    >
                      {statusLabel(status)}
                    </Text>
                    {isCurrentStatus && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Branch Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showBranchFilterModal}
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectBranch") || "Select Branch"}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingBranches ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                <>
                  {branches.map((branch) => (
                        <TouchableOpacity
                          key={branch.id}
                          style={[
                            styles.bottomSheetOption,
                            selectedBranchId === branch.id && styles.bottomSheetOptionActive,
                          ]}
                          onPress={() => {
                            handleBranchFilter(branch.id);
                            setShowBranchFilterModal(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.bottomSheetOptionText,
                              selectedBranchId === branch.id &&
                                styles.bottomSheetOptionTextActive,
                            ]}
                          >
                            {branch.name || branch.id}
                          </Text>
                          {selectedBranchId === branch.id && (
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={18}
                              color="#ec4899"
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Status Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showStatusFilterModal}
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowStatusFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedStatus === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("all");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.allStatus")}
                </Text>
                {selectedStatus === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.bottomSheetOption,
                    selectedStatus === status && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handleStatusFilter(status);
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedStatus === status &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {statusLabel(status)}
                  </Text>
                  {selectedStatus === status && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zone Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showZoneFilterModal}
        onRequestClose={() => setShowZoneFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowZoneFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectZone")}
              </Text>
              <TouchableOpacity onPress={() => setShowZoneFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedZoneId === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleZoneFilter("all");
                  setShowZoneFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedZoneId === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.allZones")}
                </Text>
                {selectedZoneId === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedZoneId === "__UNASSIGNED__" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleZoneFilter("__UNASSIGNED__");
                  setShowZoneFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedZoneId === "__UNASSIGNED__" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.unassigned")}
                </Text>
                {selectedZoneId === "__UNASSIGNED__" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {allZonesForFilter.map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.bottomSheetOption,
                    selectedZoneId === zone.id && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handleZoneFilter(zone.id);
                    setShowZoneFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedZoneId === zone.id && styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {zone.name}
                  </Text>
                  {selectedZoneId === zone.id && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Active Status Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showActiveStatusFilterModal}
        onRequestClose={() => setShowActiveStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowActiveStatusFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectActiveStatus")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowActiveStatusFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedActiveStatus === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleActiveStatusFilter("all");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedActiveStatus === "" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.allActiveStatus")}
                </Text>
                {selectedActiveStatus === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedActiveStatus === "true" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleActiveStatusFilter("true");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedActiveStatus === "true" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.active")}
                </Text>
                {selectedActiveStatus === "true" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedActiveStatus === "false" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleActiveStatusFilter("false");
                  setShowActiveStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedActiveStatus === "false" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.inactive")}
                </Text>
                {selectedActiveStatus === "false" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setShowActionsMenu(null);
          setActionsTable(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setShowActionsMenu(null);
            setActionsTable(null);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
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
                      setShowActionsMenu(null);
                      setActionsTable(null);
                    }}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.tableManagement.edit")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canToggleTableActive && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleToggleActiveStatus(actionsTable);
                      setShowActionsMenu(null);
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
                      setShowActionsMenu(null);
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
                      setShowActionsMenu(null);
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
                    setShowActionsMenu(null);
                    setActionsTable(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.tableManagement.cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating Add Button */}
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
        topOffset={
          isAtTop || !isScrollingDown
            ? headerHeight + 16 // Navbar is visible, add header height + padding
            : 60 // Navbar is hidden, use default offset
        }
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  loadingSubtitle: { color: "#9CA3AF", fontSize: 13 },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
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
    borderBottomColor: "#262626",
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  filterDropdownsRow: {
    gap: 12,
  },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#171717",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  filterDropdownDisabled: {
    opacity: 0.5,
  },
  filterDropdownTextDisabled: {
    color: "#6B7280",
  },
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
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  pickerInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerInputText: {
    color: "#fff",
    flex: 1,
  },
  pickerInputTextPlaceholder: {
    color: "#6B7280",
  },
  cancelZoneButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    alignSelf: "flex-start",
  },
  cancelZoneButtonText: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "600",
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
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
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#151515",
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptySubtext: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
  },
  zoneCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    padding: 16,
    gap: 12,
    marginBottom: 16,
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
  zoneTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  zoneCount: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  tableList: { gap: 12 },
  tableCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
    padding: 14,
    gap: 12,
  },
  tableHeader: { flexDirection: "row", gap: 12 },
  tableNumber: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  inactivePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  inactivePillText: { color: "#f87171", fontSize: 11, fontWeight: "700" },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  editIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ec4899",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f87171",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f87171",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  tableDetails: { gap: 8 },
  detailRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  detailText: { color: "#E5E7EB", fontSize: 13 },
  notesText: { color: "#9CA3AF", fontSize: 12, lineHeight: 18 },
  statusButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  statusButtonText: { color: "#9CA3AF", fontSize: 12, fontWeight: "600" },
  statusDropdownContainer: {
    borderTopWidth: 1,
    borderTopColor: "#262626",
    paddingTop: 10,
  },
  statusDropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  statusDropdownText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 20,
    maxHeight: 500,
  },
  bottomSheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  inputLabel: { color: "#D1D5DB", fontSize: 12, marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    backgroundColor: "#0f0f0f",
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  inputHint: { color: "#9CA3AF", fontSize: 11, marginTop: 4 },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#262626",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#D1D5DB",
    fontWeight: "600",
    textAlign: "center",
  },
  deleteDescription: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 20,
  },
  statusOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  statusOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  statusOptionText: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  statusOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  paginationLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 40,
    marginTop: 8,
  },
  paginationText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    backgroundColor: "#262626",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a2a",
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
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#D1D5DB",
    fontWeight: "700",
    fontSize: 14,
  },
});

