import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import {
  reservationService,
  type Zone,
  type ZoneFormData,
  type ZoneFloorPlan,
} from "@/src/services/reservationService";
import branchService from "@/src/services/branchService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import FloorPlanEditor from "@/components/FloorPlanEditor";

interface Branch {
  id: string;
  name?: string | null;
  code?: string | null;
}

export default function ZoneManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();
  const { canAny } = usePermissions();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const lastValidBranchIdRef = useRef<string>("");
  const { width } = useWindowDimensions();
  const isTablet = Platform.OS !== "web" && width >= 700;

  const isSuperAdmin = userType === "SUPER_ADMIN";

  const canCreateZone = canAny([{ resource: RESOURCES.ZONES, action: ACTIONS.CREATE }]);
  const canUpdateZone = canAny([{ resource: RESOURCES.ZONES, action: ACTIONS.UPDATE }]);
  const canDeleteZone = canAny([{ resource: RESOURCES.ZONES, action: ACTIONS.DELETE }]);
  const canViewFloorPlan = canAny([
    { resource: RESOURCES.ZONES, action: ACTIONS.VIEW_FLOOR_PLAN },
  ]);
  const canEditFloorPlan = canAny([
    { resource: RESOURCES.ZONES, action: ACTIONS.EDIT_FLOOR_PLAN },
  ]);

  const [zones, setZones] = useState<Zone[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "capacity">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [formData, setFormData] = useState<ZoneFormData>({
    branchId: "",
    name: "",
    description: "",
    capacity: undefined,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsZone, setActionsZone] = useState<Zone | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  // Floor Plan Editor state
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [selectedZoneForFloorPlan, setSelectedZoneForFloorPlan] = useState<Zone | null>(null);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);

  const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;
  const canOpenZoneActions =
    canUpdateZone || canDeleteZone || canViewFloorPlan || canEditFloorPlan;

  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (orgLoading) return;

    setZones([]);
    setTotalPages(1);
    setTotalCount(0);
    setCurrentPage(1);

    setBranches([]);
    lastValidBranchIdRef.current = "";

    setSearchTerm("");
    setSelectedStatus("all");
    setSortBy("name");
    setSortOrder("asc");

    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, orgLoading, selectedOrganizationId]);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: "", type: "success" }), 3000);
  };

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

  // Load branches on mount
  useEffect(() => {
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    if (isSuperAdmin) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLoading]);

  // Load zones when branch is selected
  useEffect(() => {
    const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;
    if (effectiveBranchId) {
      if (selectedBranchId) lastValidBranchIdRef.current = selectedBranchId;
      setCurrentPage(1);
      loadZones();
    } else {
      setLoading(false);
      setTotalPages(1);
      setTotalCount(0);
    }
  }, [selectedBranchId]);

  // Debounced search effect
  useEffect(() => {
    if (!selectedBranchId) return;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadZonesSilently();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedStatus, sortBy, sortOrder]);

  // Reload when page changes
  useEffect(() => {
    if (selectedBranchId && currentPage > 0) {
      loadZones();
    }
  }, [currentPage]);

  useFocusEffect(
    React.useCallback(() => {
      if (!isInitialMount.current && selectedBranchId) {
        loadZones();
      }
    }, [selectedBranchId])
  );

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
    } catch (error: any) {
      console.error("Error loading branches:", error);
      showToast("error", error.message || "Failed to load branches");
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async () => {
    if (!effectiveBranchId) return;

    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const response = await reservationService.getZones(effectiveBranchId, token, {
        page: currentPage,
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });
      setZones(response.zones);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error: any) {
      console.error("Error loading zones:", error);
      showToast("error", error.message || "Failed to load zones");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadZonesSilently = async () => {
    if (!effectiveBranchId) return;

    try {
      setPaginationLoading(true);
      const token = await getToken();
      if (!token) return;

      const response = await reservationService.getZones(effectiveBranchId, token, {
        page: 1,
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });
      setZones(response.zones);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
      setCurrentPage(1);
    } catch (error: any) {
      console.error("Error loading zones:", error);
      showToast("error", error.message || "Failed to load zones");
    } finally {
      setPaginationLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (selectedBranchId) {
      loadZones();
    } else {
      loadBranches();
      setRefreshing(false);
    }
  };

  const handleCreate = () => {
    if (!canCreateZone) return;
    if (!selectedBranchId) {
      showToast("error", "Please select a branch first");
      return;
    }
    setSelectedZone(null);
    setFormData({
      branchId: selectedBranchId,
      name: "",
      description: "",
      capacity: undefined,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (zone: Zone) => {
    if (!canUpdateZone) return;
    setSelectedZone(zone);
    setFormData({
      branchId: zone.branchId,
      name: zone.name,
      description: zone.description || "",
      capacity: zone.capacity || undefined,
      isActive: zone.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (zone: Zone) => {
    if (!canDeleteZone) return;
    setSelectedZone(zone);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (selectedZone && !canUpdateZone) return;
    if (!selectedZone && !canCreateZone) return;
    if (!formData.name.trim()) {
      showToast("error", "Zone name is required");
      return;
    }

    if (!formData.branchId) {
      showToast("error", "Branch is required");
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;

      if (selectedZone) {
        await reservationService.updateZone(selectedZone.id, formData, token);
        showToast("success", "Zone updated successfully");
      } else {
        await reservationService.createZone(formData, token);
        showToast("success", "Zone created successfully");
      }

      setIsDialogOpen(false);
      loadZones();
    } catch (error: any) {
      // Check for duplicate name error
      const errorMessage = error.response?.data?.error || error.message || "Failed to save zone";
      let userFriendlyMessage = errorMessage;
      
      // Check if error indicates duplicate name
      const isDuplicateError = 
        errorMessage.toLowerCase().includes("already exists") ||
        errorMessage.toLowerCase().includes("duplicate") ||
        errorMessage.toLowerCase().includes("unique constraint") ||
        (errorMessage.toLowerCase().includes("name") && errorMessage.toLowerCase().includes("taken"));
      
      if (isDuplicateError) {
        userFriendlyMessage = t("admin.zoneManagement.duplicateNameError", {
          name: formData.name,
        }) || `A zone with the name "${formData.name}" already exists in this branch. Please choose a different name.`;
        // Don't log duplicate errors to console since we handle them in UI
        // Close the dialog when duplicate error occurs
        setIsDialogOpen(false);
      } else {
        // Only log non-duplicate errors
        console.error("Error saving zone:", error);
      }
      
      showToast("error", userFriendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!canDeleteZone) return;
    if (!selectedZone) return;

    try {
      setDeleting(true);
      const token = await getToken();
      if (!token) return;

      await reservationService.deleteZone(selectedZone.id, token);
      showToast("success", "Zone deleted successfully");
      setIsDeleteDialogOpen(false);
      
      // If we deleted the last item on the page and it's not page 1, go to previous page
      if (zones.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        loadZones();
      }
    } catch (error: any) {
      console.error("Error deleting zone:", error);
      showToast("error", error.message || "Failed to delete zone");
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (field: "name" | "createdAt" | "capacity") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  // Floor Plan handlers
  const handleOpenFloorPlan = async (zone: Zone) => {
    if (!canViewFloorPlan && !canEditFloorPlan) return;
    try {
      setLoadingFloorPlan(true);
      setSelectedZoneForFloorPlan(zone);
      setIsFloorPlanOpen(true);
      const token = await getToken();
      if (!token) return;
      
      const data = await reservationService.getZoneFloorPlan(zone.id, token);
      setFloorPlanData(data);
    } catch (error: any) {
      console.error("Error loading floor plan:", error);
      showToast("error", error.message || "Failed to load floor plan");
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  const handleCloseFloorPlan = () => {
    setIsFloorPlanOpen(false);
    setSelectedZoneForFloorPlan(null);
    setFloorPlanData(null);
  };

  const handleSaveFloorPlan = async (data: {
    canvasSettings: { canvasWidth: number; canvasHeight: number };
    tables: Array<{
      id: string;
      tableNumber: string;
      capacity: number;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
    }>;
    floorElements: any[];
    deletedTableIds: string[];
    deletedElementIds: string[];
    newElements: Array<any>;
  }) => {
    if (!canEditFloorPlan) {
      showToast(
        "error",
        t("common.notAuthorized", { defaultValue: "Not authorized" })
      );
      throw new Error("Not authorized");
    }
    if (!selectedZoneForFloorPlan) return;
    
    const token = await getToken();
    if (!token) return;
    
    try {
      // Update canvas settings
      await reservationService.updateCanvasSettings(
        selectedZoneForFloorPlan.id,
        data.canvasSettings,
        token
      );
      
      // Create new tables, then persist their positions
      const newTables = data.tables.filter((t) => t.id.startsWith("temp_"));
      for (const t of newTables) {
        const created = await reservationService.createTable(
          {
            tableNumber: t.tableNumber,
            capacity: t.capacity,
            branchId: selectedZoneForFloorPlan.branchId,
            zoneId: selectedZoneForFloorPlan.id,
          },
          token
        );

        const createdTable = (created as any)?.data ?? created;
        const createdId = (createdTable as any)?.id;
        if (!createdId) {
          throw new Error("Failed to create table: missing id in response");
        }

        await reservationService.updateTablePosition(
          createdId,
          {
            id: createdId,
            positionX: t.positionX,
            positionY: t.positionY,
            width: t.width,
            height: t.height,
            rotation: t.rotation,
            shape: t.shape as "ROUND" | "SQUARE" | "RECTANGLE",
          },
          token
        );
      }

      // Delete removed tables
      for (const tableId of data.deletedTableIds) {
        await reservationService.deleteTable(tableId, token);
      }

      // Update table positions (only existing tables)
      const existingTables = data.tables.filter((t) => !t.id.startsWith("temp_"));
      if (existingTables.length > 0) {
        await reservationService.bulkUpdateTablePositions(
          selectedZoneForFloorPlan.id,
          existingTables.map((t) => ({
            id: t.id,
            positionX: t.positionX,
            positionY: t.positionY,
            width: t.width,
            height: t.height,
            rotation: t.rotation,
            shape: t.shape as "ROUND" | "SQUARE" | "RECTANGLE",
          })),
          token
        );
      }
      
      // Delete removed elements
      for (const elementId of data.deletedElementIds) {
        await reservationService.deleteFloorElement(elementId, token);
      }
      
      // Update existing elements
      for (const element of data.floorElements) {
        await reservationService.updateFloorElement(
          element.id,
          {
            type: element.type,
            label: element.label,
            positionX: element.positionX,
            positionY: element.positionY,
            width: element.width,
            height: element.height,
            rotation: element.rotation,
            color: element.color,
            icon: element.icon,
          },
          token
        );
      }
      
      // Create new elements
      for (const element of data.newElements) {
        await reservationService.createFloorElement(
          selectedZoneForFloorPlan.id,
          element,
          token
        );
      }
      
      showToast("success", t("admin.tableManagement.floorPlan.saveSuccess", "Floor plan saved successfully"));
      handleCloseFloorPlan();
    } catch (error: any) {
      console.error("Error saving floor plan:", error);
      throw error; // Re-throw to let the editor handle the error
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.listContainer}>
        <ScrollView
          style={styles.scrollView}
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
          {/* Empty State - No Branch Selected */}
          {!effectiveBranchId && (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
              <Text style={styles.emptyTitle}>
                {t("admin.zoneManagement.selectBranchToView")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("admin.zoneManagement.selectBranchToViewSubtext")}
              </Text>
            </View>
          )}

          {/* Loading State */}
          {effectiveBranchId && loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ec4899" />
              <Text style={styles.loadingText}>
                {t("admin.zoneManagement.loading")}
              </Text>
              <Text style={styles.loadingSubtext}>
                {t("admin.zoneManagement.loadingDescription")}
              </Text>
            </View>
          )}

          {/* Show Filters Toggle */}
          {effectiveBranchId && !loading && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: showFilters ? 4 : 16 }}>
              <TouchableOpacity
                onPress={() => setShowFilters((s) => !s)}
                style={styles.filterTextButtonContainer}
              >
                <Text style={styles.filterTextButton}>
                  {showFilters
                    ? t("admin.zoneManagement.hideFilters") || "Hide Filters"
                    : t("admin.zoneManagement.showFilters") || "Show Filters"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filters */}
          {effectiveBranchId && !loading && showFilters && (
            <View style={styles.filtersContainer}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.zoneManagement.searchPlaceholder") || "Search zones..."}
                  placeholderTextColor="#6B7280"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
              </View>

              <View style={styles.filterDropdownsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    selectedStatus !== "all" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowStatusFilterModal(true)}
                >
                  <MaterialCommunityIcons name="eye" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedStatus === "true"
                      ? t("admin.zoneManagement.active")
                      : selectedStatus === "false"
                      ? t("admin.zoneManagement.inactive")
                      : t("admin.zoneManagement.allStatus") || "All Status"}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                {isSuperAdmin && (
                  <TouchableOpacity
                    style={[
                      styles.filterDropdown,
                      selectedBranchId !== "" && styles.filterDropdownActive,
                    ]}
                    onPress={() => setShowBranchModal(true)}
                    disabled={loadingBranches}
                  >
                    <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                    <Text style={styles.filterDropdownText} numberOfLines={1}>
                      {selectedBranchId
                        ? branches.find((b) => b.id === selectedBranchId)?.name ||
                          t("admin.zoneManagement.selectBranchPlaceholder")
                        : t("admin.zoneManagement.selectBranchPlaceholder")}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.zoneManagement.sortBy") || "Sort by"}:
                </Text>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "name" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("name")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "name" && styles.sortButtonTextActive,
                    ]}
                  >
                    {t("admin.zoneManagement.nameAZ") || "Name"}
                  </Text>
                  {sortBy === "name" && (
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
                    sortBy === "capacity" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("capacity")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "capacity" && styles.sortButtonTextActive,
                    ]}
                  >
                    {t("admin.zoneManagement.capacity")}
                  </Text>
                  {sortBy === "capacity" && (
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
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.zoneManagement.newestFirst") || "Newest"
                        : t("admin.zoneManagement.oldestFirst") || "Oldest"
                      : t("admin.zoneManagement.newestFirst") || "Newest"}
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

          {/* Zones List */}
          {effectiveBranchId && !loading && zones.length === 0 && !searchTerm && selectedStatus === "all" ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.zoneManagement.noZones")}
              </Text>
            </View>
          ) : effectiveBranchId && !loading && zones.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.zoneManagement.noZonesFound") || "No zones found"}
              </Text>
            </View>
          ) : effectiveBranchId && !loading ? (
            <>
              <View style={[styles.zonesList, isTablet && styles.zonesListTablet]}>
                {zones.map((zone) => (
                  <View
                    key={zone.id}
                    style={[styles.zoneCard, isTablet && styles.zoneCardTablet]}
                  >
                    <View style={styles.zoneInfo}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      {zone.description && (
                        <Text style={styles.zoneDescription} numberOfLines={2}>
                          {zone.description}
                        </Text>
                      )}
                      <View style={styles.zoneMeta}>
                        {zone.capacity && (
                          <Text style={styles.zoneMetaText}>
                            {t("admin.zoneManagement.capacity")}: {zone.capacity}
                          </Text>
                        )}
                        {zone._count && zone._count.tables > 0 && (
                          <>
                            {zone.capacity && <Text style={styles.zoneMetaSeparator}>•</Text>}
                            <Text style={styles.zoneMetaText}>
                              {zone._count.tables} {t("admin.zoneManagement.tables")}
                            </Text>
                          </>
                        )}
                        <View
                          style={[
                            styles.statusBadge,
                            zone.isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              zone.isActive
                                ? styles.statusBadgeTextActive
                                : styles.statusBadgeTextInactive,
                            ]}
                          >
                            {zone.isActive
                              ? t("admin.zoneManagement.active")
                              : t("admin.zoneManagement.inactive")}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.menuButton, !canOpenZoneActions && { opacity: 0.5 }]}
                      onPress={() => {
                        if (!canOpenZoneActions) return;
                        setActionsZone(zone);
                        setShowActionsMenu(zone.id);
                        setActionsModalVisible(true);
                      }}
                    >
                      <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Pagination */}
              {totalPages > 1 && (
                <View style={styles.paginationContainer}>
                  <Text style={styles.paginationText}>
                    {t("admin.zoneManagement.showingZones", {
                      count: zones.length,
                      total: totalCount,
                    }) || `Showing ${zones.length} out of ${totalCount} zones`}
                  </Text>
                  <View style={styles.paginationButtons}>
                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        currentPage === 1 && styles.paginationButtonDisabled,
                      ]}
                      onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={16} color={currentPage === 1 ? "#6B7280" : "#fff"} />
                    </TouchableOpacity>
                    <Text style={styles.paginationPageText}>
                      {t("admin.zoneManagement.pageOf", {
                        current: currentPage,
                        total: totalPages,
                      }) || `Page ${currentPage} of ${totalPages}`}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        currentPage === totalPages && styles.paginationButtonDisabled,
                      ]}
                      onPress={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={16} color={currentPage === totalPages ? "#6B7280" : "#fff"} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          ) : null}

          {/* Actions Menu Bottom Sheet */}
          <Modal
            visible={actionsModalVisible}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={() => {
              setActionsModalVisible(false);
              setActionsZone(null);
              setShowActionsMenu(null);
            }}
          >
            <Pressable
              style={styles.sheetOverlay}
              onPress={() => {
                setActionsModalVisible(false);
                setActionsZone(null);
                setShowActionsMenu(null);
              }}
            >
              <Pressable
                style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.sheetHandle} />
                {actionsZone && (
                  <View style={styles.sheetContent}>
                    {canUpdateZone && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          setActionsModalVisible(false);
                          setActionsZone(null);
                          setShowActionsMenu(null);
                          // Small delay to allow modal to close before opening edit dialog
                          setTimeout(() => {
                            handleEdit(actionsZone);
                          }, 300);
                        }}
                      >
                        <EditIcon size={16} color="#D1D5DB" />
                        <Text style={styles.sheetItemText}>
                          {t("admin.zoneManagement.edit")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {(canViewFloorPlan || canEditFloorPlan) && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          setActionsModalVisible(false);
                          setActionsZone(null);
                          setShowActionsMenu(null);
                          // Small delay to allow modal to close before opening floor plan editor
                          setTimeout(() => {
                            handleOpenFloorPlan(actionsZone);
                          }, 300);
                        }}
                        disabled={loadingFloorPlan}
                      >
                        <MaterialCommunityIcons 
                          name="floor-plan" 
                          size={16} 
                          color={loadingFloorPlan ? "#6B7280" : "#ec4899"} 
                        />
                        <Text style={[styles.sheetItemText, { color: loadingFloorPlan ? "#6B7280" : "#ec4899" }]}>
                          {t(
                            canEditFloorPlan
                              ? "admin.tableManagement.editFloorPlan"
                              : "admin.tableManagement.viewFloorPlan",
                            canEditFloorPlan ? "Edit Floor Plan" : "View Floor Plan"
                          )}
                        </Text>
                        {loadingFloorPlan && (
                          <ActivityIndicator size="small" color="#ec4899" style={{ marginLeft: 8 }} />
                        )}
                      </TouchableOpacity>
                    )}

                    <View>
                      {canDeleteZone && (
                        <>
                          <TouchableOpacity
                            style={[
                              styles.sheetItem,
                              styles.sheetItemDanger,
                              (actionsZone._count && actionsZone._count.tables > 0) && styles.sheetItemDisabled,
                            ]}
                            onPress={() => {
                              setActionsModalVisible(false);
                              setActionsZone(null);
                              setShowActionsMenu(null);
                              if (actionsZone._count && actionsZone._count.tables > 0) {
                                return;
                              }
                              // Small delay to allow modal to close before opening delete dialog
                              setTimeout(() => {
                                handleDelete(actionsZone);
                              }, 300);
                            }}
                            disabled={actionsZone._count && actionsZone._count.tables > 0}
                          >
                            <MaterialCommunityIcons 
                              name="delete" 
                              size={16} 
                              color={(actionsZone._count && actionsZone._count.tables > 0) ? "#6B7280" : "#ef4444"} 
                            />
                            <Text style={[
                              styles.sheetItemText, 
                              styles.actionTextDanger,
                              (actionsZone._count && actionsZone._count.tables > 0) && styles.sheetItemTextDisabled,
                            ]}>
                              {t("admin.zoneManagement.delete")}
                            </Text>
                          </TouchableOpacity>
                          {(actionsZone._count && actionsZone._count.tables > 0) && (
                            <Text style={styles.sheetWarningText}>
                              {t("admin.zoneManagement.cannotDeleteHasTables")}
                            </Text>
                          )}
                        </>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.sheetCancel}
                      onPress={() => {
                        setActionsModalVisible(false);
                        setActionsZone(null);
                        setShowActionsMenu(null);
                      }}
                    >
                      <Text style={styles.sheetCancelText}>
                        {t("common.cancel") || "Cancel"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>

          {/* Create/Edit Dialog */}
          <Modal
            visible={isDialogOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setIsDialogOpen(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalOverlay}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setIsDialogOpen(false)}
              >
                <Pressable
                  style={styles.dialogContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.dialogHeader}>
                    <Text style={styles.dialogTitle}>
                      {selectedZone
                        ? t("admin.zoneManagement.editZone")
                        : t("admin.zoneManagement.createZone")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setIsDialogOpen(false)}
                      style={styles.dialogCloseButton}
                    >
                      <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.dialogDescription}>
                    {selectedZone
                      ? t("admin.zoneManagement.editZoneDescription")
                      : t("admin.zoneManagement.createZoneDescription")}
                  </Text>
                  <ScrollView style={styles.dialogScrollView} showsVerticalScrollIndicator={false}>
                    <View style={styles.dialogForm}>
                      <View style={styles.dialogField}>
                        <Text style={styles.dialogLabel}>
                          {t("admin.zoneManagement.zoneName")} <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                          style={styles.dialogInput}
                          placeholder={t("admin.zoneManagement.zoneNamePlaceholder")}
                          placeholderTextColor="#6B7280"
                          value={formData.name}
                          onChangeText={(text) => setFormData({ ...formData, name: text })}
                        />
                      </View>
                      <View style={styles.dialogField}>
                        <Text style={styles.dialogLabel}>
                          {t("admin.zoneManagement.description")}
                        </Text>
                        <TextInput
                          style={[styles.dialogInput, styles.dialogTextArea]}
                          placeholder={t("admin.zoneManagement.descriptionPlaceholder")}
                          placeholderTextColor="#6B7280"
                          value={formData.description}
                          onChangeText={(text) => setFormData({ ...formData, description: text })}
                          multiline
                          numberOfLines={3}
                        />
                      </View>
                      <View style={styles.dialogField}>
                        <Text style={styles.dialogLabel}>
                          {t("admin.zoneManagement.capacity")}
                        </Text>
                        <TextInput
                          style={styles.dialogInput}
                          placeholder={t("admin.zoneManagement.capacityPlaceholder")}
                          placeholderTextColor="#6B7280"
                          value={formData.capacity?.toString() || ""}
                          onChangeText={(text) =>
                            setFormData({
                              ...formData,
                              capacity: text ? Number(text) : undefined,
                            })
                          }
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.dialogSwitchRow}>
                        <Text style={styles.dialogLabel}>
                          {t("admin.zoneManagement.isActive")}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.switch,
                            formData.isActive && styles.switchActive,
                          ]}
                          onPress={() =>
                            setFormData({ ...formData, isActive: !formData.isActive })
                          }
                        >
                          <View
                            style={[
                              styles.switchThumb,
                              formData.isActive && styles.switchThumbActive,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </ScrollView>
                  <View style={styles.dialogActions}>
                    <TouchableOpacity
                      style={styles.dialogButtonCancel}
                      onPress={() => setIsDialogOpen(false)}
                      disabled={saving}
                    >
                      <Text style={styles.dialogButtonTextCancel}>
                        {t("admin.zoneManagement.cancel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dialogButtonSave,
                        (!formData.name.trim() || saving) && styles.dialogButtonDisabled,
                      ]}
                      onPress={handleSave}
                      disabled={!formData.name.trim() || saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.dialogButtonTextSave}>
                          {t("admin.zoneManagement.save")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

          {/* Delete Confirmation Dialog */}
          <Modal
            visible={isDeleteDialogOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setIsDeleteDialogOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setIsDeleteDialogOpen(false)}
            >
              <Pressable
                style={styles.dialogContent}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.dialogHeader}>
                  <Text style={styles.dialogTitle}>
                    {t("admin.zoneManagement.deleteZone")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsDeleteDialogOpen(false)}
                    style={styles.dialogCloseButton}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.dialogDescription}>
                  {t("admin.zoneManagement.deleteZoneDescription", {
                    name: selectedZone?.name,
                  })}
                </Text>
                <View style={styles.dialogActions}>
                  <TouchableOpacity
                    style={styles.dialogButtonCancel}
                    onPress={() => {
                      setIsDeleteDialogOpen(false);
                      setSelectedZone(null);
                    }}
                    disabled={deleting}
                  >
                    <Text style={styles.dialogButtonTextCancel}>
                      {t("admin.zoneManagement.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dialogButtonDelete, deleting && styles.dialogButtonDisabled]}
                    onPress={handleDeleteConfirm}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.dialogButtonTextDelete}>
                        {t("admin.zoneManagement.delete")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Status Filter Modal */}
          <Modal
            visible={showStatusFilterModal}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={() => setShowStatusFilterModal(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowStatusFilterModal(false)}
            >
              <Pressable
                style={[styles.modalContent, { paddingBottom: insets.bottom + 12 }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {t("admin.zoneManagement.allStatus") || "All Status"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowStatusFilterModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalScrollView}>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedStatus === "all" && styles.modalItemSelected,
                    ]}
                    onPress={() => {
                      handleStatusFilter("all");
                      setShowStatusFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        selectedStatus === "all" && styles.modalItemTextSelected,
                      ]}
                    >
                      {t("admin.zoneManagement.allStatus") || "All Status"}
                    </Text>
                    {selectedStatus === "all" && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedStatus === "true" && styles.modalItemSelected,
                    ]}
                    onPress={() => {
                      handleStatusFilter("true");
                      setShowStatusFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        selectedStatus === "true" && styles.modalItemTextSelected,
                      ]}
                    >
                      {t("admin.zoneManagement.active")}
                    </Text>
                    {selectedStatus === "true" && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedStatus === "false" && styles.modalItemSelected,
                    ]}
                    onPress={() => {
                      handleStatusFilter("false");
                      setShowStatusFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        selectedStatus === "false" && styles.modalItemTextSelected,
                      ]}
                    >
                      {t("admin.zoneManagement.inactive")}
                    </Text>
                    {selectedStatus === "false" && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Branch Modal */}
          <Modal
            visible={showBranchModal}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={() => setShowBranchModal(false)}
          >
            <Pressable
              style={styles.sheetOverlay}
              onPress={() => setShowBranchModal(false)}
            >
              <Pressable
                style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.sheetHandle} />
                <View style={styles.sheetContent}>
                  <Text style={styles.sheetTitle}>
                    {t("admin.zoneManagement.selectBranch")}
                  </Text>

                  <ScrollView style={styles.sheetScrollView}>
                    {loadingBranches ? (
                      <View style={styles.sheetLoadingContainer}>
                        <ActivityIndicator size="small" color="#ec4899" />
                      </View>
                    ) : (
                      branches.map((branch) => (
                        <TouchableOpacity
                          key={branch.id}
                          style={styles.sheetItem}
                          onPress={() => {
                            setSelectedBranchId(branch.id);
                            setShowBranchModal(false);
                          }}
                        >
                          <Text style={styles.sheetItemText}>
                            {branch.name || branch.code || branch.id}
                          </Text>
                          {selectedBranchId === branch.id && (
                            <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.sheetCancel}
                    onPress={() => setShowBranchModal(false)}
                  >
                    <Text style={styles.sheetCancelText}>
                      {t("common.cancel") || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </ScrollView>
      </View>
      {/* Floating Action Button */}
      {canCreateZone && effectiveBranchId && !loading && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreate}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ visible: false, message: "", type: "success" })}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />

      {/* Floor Plan Editor */}
      {isFloorPlanOpen && selectedZoneForFloorPlan && floorPlanData && (
        <FloorPlanEditor
          zoneId={selectedZoneForFloorPlan.id}
          zoneName={selectedZoneForFloorPlan.name}
          canvasWidth={floorPlanData.canvasWidth || 800}
          canvasHeight={floorPlanData.canvasHeight || 600}
          tables={floorPlanData.tables}
          floorElements={floorPlanData.floorElements}
          readOnly={!canEditFloorPlan}
          onSave={canEditFloorPlan ? handleSaveFloorPlan : undefined}
          onCancel={handleCloseFloorPlan}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  listContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  branchSelectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  branchSelectorLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 8,
  },
  branchSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  branchSelectorText: {
    fontSize: 16,
    color: "#111827",
    flex: 1,
  },
  branchSelectorPlaceholder: {
    color: "#9CA3AF",
  },
  branchSelectorDescription: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    fontSize: 13,
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 12,
    paddingLeft: 8,
  },
  filterDropdownsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  filterDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 13,
    color: "#6B7280",
  },
  sortButtonTextActive: {
    color: "#fff",
  },
  zonesList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  zonesListTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  zoneCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  zoneCardTablet: {
    width: "48%",
  },
  zoneInfo: {
    flex: 1,
    gap: 4,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  zoneDescription: {
    fontSize: 14,
    color: "#6B7280",
  },
  zoneMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  zoneMetaText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  zoneMetaSeparator: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
  },
  statusBadgeActive: {
    backgroundColor: "#10b981",
  },
  statusBadgeInactive: {
    backgroundColor: "#6B7280",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  statusBadgeTextActive: {
    color: "#fff",
  },
  statusBadgeTextInactive: {
    color: "#fff",
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  paginationContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  paginationText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 12,
    textAlign: "center",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  paginationButton: {
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 14,
    color: "#111827",
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
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalItemSelected: {
    backgroundColor: "#f3f4f6",
  },
  modalItemText: {
    fontSize: 16,
    color: "#111827",
  },
  modalItemTextSelected: {
    color: "#ec4899",
  },
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
  sheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sheetScrollView: {
    maxHeight: 360,
  },
  sheetLoadingContainer: {
    paddingVertical: 16,
    alignItems: "center",
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
  sheetItemDisabled: {
    opacity: 0.5,
  },
  sheetItemText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetItemTextDisabled: {
    color: "#9CA3AF",
  },
  sheetWarningText: {
    fontSize: 12,
    color: "#6B7280",
    paddingHorizontal: 20,
    paddingBottom: 8,
    marginTop: -8,
  },
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
  dialogContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: 32,
  },
  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  dialogCloseButton: {
    padding: 4,
  },
  dialogDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  dialogScrollView: {
    maxHeight: 400,
  },
  dialogForm: {
    paddingHorizontal: 20,
  },
  dialogField: {
    marginBottom: 20,
  },
  dialogLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  dialogInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  dialogTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  dialogSwitchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    padding: 2,
  },
  switchActive: {
    backgroundColor: "#ec4899",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  dialogButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dialogButtonTextCancel: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  dialogButtonSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  dialogButtonDisabled: {
    opacity: 0.5,
  },
  dialogButtonTextSave: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
  dialogButtonDelete: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ef4444",
  },
  dialogButtonTextDelete: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
});

