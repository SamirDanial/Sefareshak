import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import ApiService from "@/src/services/apiService";
import branchService from "@/src/services/branchService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

interface Branch {
  id: string;
  name?: string | null;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  isUrgentlyClosed?: boolean;
  urgentCloseMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export default function BranchManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { getToken } = useAuthRole();
  const { can, refreshPermissions, rbacUser } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const canCreateBranch = can(RESOURCES.BRANCHES, ACTIONS.CREATE);
  const canUpdateBranch = can(RESOURCES.BRANCHES, ACTIONS.UPDATE);
  const canDeleteBranch = can(RESOURCES.BRANCHES, ACTIONS.DELETE);
  const canViewBranchSettings = can(RESOURCES.BRANCHES, ACTIONS.VIEW_BRANCH_SETTINGS);
  const canUpdateBranchSettings = can(RESOURCES.BRANCHES, ACTIONS.UPDATE_BRANCH_SETTINGS);
  const canViewReservationSettings = can(
    RESOURCES.BRANCHES,
    ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS
  );
  const canUrgentCloseBranch = can(RESOURCES.BRANCHES, ACTIONS.URGENT_CLOSE_BRANCH);

  const reservationEntitled = (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;
  const canEditBranchSettings = canViewBranchSettings || canUpdateBranchSettings;
  const canAnyBranchAction =
    canUpdateBranch ||
    canDeleteBranch ||
    (reservationEntitled && canViewReservationSettings) ||
    canViewBranchSettings ||
    canUpdateBranchSettings ||
    canUrgentCloseBranch;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsBranch, setActionsBranch] = useState<Branch | null>(null);
  const [urgentCloseModalVisible, setUrgentCloseModalVisible] = useState(false);
  const [urgentCloseMessage, setUrgentCloseMessage] = useState("");
  const [reopenModalVisible, setReopenModalVisible] = useState(false);
  const [processingUrgentClose, setProcessingUrgentClose] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadBranches();
    }
  }, []);

  useEffect(() => {
    if (organizationLoading) return;
    refreshPermissions();
    loadBranches();
  }, [selectedOrganizationId, organizationLoading, refreshPermissions]);

  useFocusEffect(
    React.useCallback(() => {
      if (!isInitialMount.current) {
        loadBranches();
      }
    }, [])
  );

  useEffect(() => {
    if (isInitialMount.current) return;
    isSearchingRef.current = true;
    const timeout = setTimeout(() => {
      loadBranches();
      setTimeout(() => (isSearchingRef.current = false), 100);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    if (isInitialMount.current) return;
    loadBranches();
  }, [selectedStatus, sortBy, sortOrder]);

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
      if (!refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      if (!token) return;
      const loadedBranches = await branchService.getBranches(token);
      setBranches(loadedBranches as any);
    } catch (error: any) {
      setToast({
        visible: true,
        message: error.message || t("admin.branchManagement.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBranches();
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  const filteredAndSortedBranches = useMemo(() => {
    let filtered = [...branches];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (branch) =>
          (branch.name || "").toLowerCase().includes(searchLower) ||
          (branch.code || "").toLowerCase().includes(searchLower) ||
          (branch.address || "").toLowerCase().includes(searchLower) ||
          (branch.city || "").toLowerCase().includes(searchLower)
      );
    }

    if (selectedStatus === "ACTIVE") {
      filtered = filtered.filter((branch) => branch.isActive !== false);
    } else if (selectedStatus === "INACTIVE") {
      filtered = filtered.filter((branch) => branch.isActive === false);
    }

    filtered.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        const comparison = nameA.localeCompare(nameB);
        return sortOrder === "asc" ? comparison : -comparison;
      }
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [branches, searchTerm, selectedStatus, sortBy, sortOrder]);

  const openCreate = () => {
    if (!canCreateBranch) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    router.push("/(admin)/branch-form" as any);
  };

  const openEdit = (branch: Branch) => {
    if (!canUpdateBranch && !canEditBranchSettings) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setActionsModalVisible(false);
    setActionsBranch(null);
    router.push(`/(admin)/branch-form?id=${branch.id}` as any);
  };

  const openReservationSettings = (branch: Branch) => {
    if (!reservationEntitled || !canViewReservationSettings) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setActionsModalVisible(false);
    setActionsBranch(null);
    router.push(`/(admin)/branch-reservation-settings?branchId=${branch.id}` as any);
  };

  const handleDeleteClick = (branch: Branch) => {
    if (!canDeleteBranch) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setActionsModalVisible(false);
    setActionsBranch(null);
    setBranchToDelete(branch);
    setDeleteModalVisible(true);
  };

  const handleDelete = async () => {
    if (!branchToDelete) return;
    if (!canDeleteBranch) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setDeletingId(branchToDelete.id);
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      await apiService.delete(`/api/admin/branches/${branchToDelete.id}`, token);

      setToast({
        visible: true,
        message: t("admin.branchManagement.deleteSuccess"),
        type: "success",
      });
      loadBranches();
      setDeleteModalVisible(false);
      setBranchToDelete(null);
    } catch (error: any) {
      console.error("Failed to delete branch", error);
      setToast({
        visible: true,
        message: error.message || t("admin.branchManagement.deleteError"),
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleUrgentCloseClick = (branch: Branch) => {
    if (!canUrgentCloseBranch) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setActionsModalVisible(false);
    setActionsBranch(branch);
    setUrgentCloseMessage(t("admin.branchManagement.urgentCloseDefaultMessage", { defaultValue: "This branch is temporarily closed due to an emergency. We apologize for the inconvenience." }));
    setUrgentCloseModalVisible(true);
  };

  const handleUrgentClose = async () => {
    if (!actionsBranch) return;
    setProcessingUrgentClose(true);
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const response = await apiService.post(
        `/api/admin/branches/${actionsBranch.id}/urgent-close`,
        { message: urgentCloseMessage },
        token
      );

      // Update local state immediately for instant UI update
      setBranches((prevBranches) =>
        prevBranches.map((b) =>
          b.id === actionsBranch.id
            ? { ...b, isUrgentlyClosed: true, urgentCloseMessage: urgentCloseMessage }
            : b
        )
      );

      setToast({
        visible: true,
        message: t("admin.branchManagement.urgentCloseSuccess"),
        type: "success",
      });
      setUrgentCloseModalVisible(false);
      setActionsBranch(null);
      setUrgentCloseMessage("");
      
      // Refresh branches after a short delay to ensure data consistency
      setTimeout(() => loadBranches(), 500);
    } catch (error: any) {
      console.error("Failed to urgently close branch", error);
      setToast({
        visible: true,
        message: error.message || t("admin.branchManagement.urgentCloseError"),
        type: "error",
      });
    } finally {
      setProcessingUrgentClose(false);
    }
  };

  const handleReopenClick = (branch: Branch) => {
    if (!canUrgentCloseBranch) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    setActionsModalVisible(false);
    setActionsBranch(branch);
    setReopenModalVisible(true);
  };

  const handleReopen = async () => {
    if (!actionsBranch) return;
    setProcessingUrgentClose(true);
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      await apiService.post(`/api/admin/branches/${actionsBranch.id}/reopen`, {}, token);

      // Update local state immediately for instant UI update
      setBranches((prevBranches) =>
        prevBranches.map((b) =>
          b.id === actionsBranch.id
            ? { ...b, isUrgentlyClosed: false, urgentCloseMessage: null }
            : b
        )
      );

      setToast({
        visible: true,
        message: t("admin.branchManagement.reopenSuccess"),
        type: "success",
      });
      setReopenModalVisible(false);
      setActionsBranch(null);
      
      // Refresh branches after a short delay to ensure data consistency
      setTimeout(() => loadBranches(), 500);
    } catch (error: any) {
      console.error("Failed to reopen branch", error);
      setToast({
        visible: true,
        message: error.message || t("admin.branchManagement.reopenError"),
        type: "error",
      });
    } finally {
      setProcessingUrgentClose(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.pageHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>{t("admin.branchManagement.title", { defaultValue: "Branch Management" })}</Text>
            <TouchableOpacity onPress={() => setShowFilters((s) => !s)} style={styles.filterTextButton}>
              <Text style={styles.filterTextButtonText}>
                {showFilters
                  ? t("admin.branchManagement.hideFilters", { defaultValue: "Hide Filters" })
                  : t("admin.branchManagement.showFilters", { defaultValue: "Show Filters" })}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.subtitleRow}>
            <Text style={styles.pageSubtitle}>
              {t("admin.branchManagement.description", {
                defaultValue: "Manage main and sub-branches, availability, and delivery coverage",
              })}
            </Text>
            <TouchableOpacity
              style={[styles.addButton, !canCreateBranch && { opacity: 0.6 }]}
              onPress={openCreate}
              disabled={!canCreateBranch}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.addButtonText}>{t("admin.branchManagement.addBranch", { defaultValue: "Add Branch" })}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#374151" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.branchManagement.searchPlaceholder", { defaultValue: "Search branches..." })}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            <TouchableOpacity
              style={[styles.filterDropdown, selectedStatus !== "" && styles.filterDropdownActive]}
              onPress={() => setShowStatusFilterModal(true)}
            >
              <MaterialCommunityIcons name="eye" size={14} color="#374151" />
              <Text style={styles.filterDropdownText}>
                {selectedStatus === "ACTIVE"
                  ? t("admin.branchManagement.active", { defaultValue: "Active" })
                  : selectedStatus === "INACTIVE"
                  ? t("admin.branchManagement.inactive", { defaultValue: "Inactive" })
                  : t("admin.branchManagement.allStatus", { defaultValue: "All Status" })}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#374151" />
            </TouchableOpacity>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>{t("admin.branchManagement.sortBy", { defaultValue: "Sort by" })}:</Text>

              <TouchableOpacity
                style={[styles.sortButton, sortBy === "name" && styles.sortButtonActive]}
                onPress={() => handleSort("name")}
              >
                <Text style={[styles.sortButtonText, sortBy === "name" && styles.sortButtonTextActive]}>
                  {t("admin.branchManagement.nameAZ", { defaultValue: "Name" })}
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
                style={[styles.sortButton, sortBy === "createdAt" && styles.sortButtonActive]}
                onPress={() => handleSort("createdAt")}
              >
                <Text style={[styles.sortButtonText, sortBy === "createdAt" && styles.sortButtonTextActive]}>
                  {sortBy === "createdAt"
                    ? sortOrder === "desc"
                      ? t("admin.branchManagement.newestFirst", { defaultValue: "Newest" })
                      : t("admin.branchManagement.oldestFirst", { defaultValue: "Oldest" })
                    : t("admin.branchManagement.newestFirst", { defaultValue: "Newest" })}
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


        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>{t("admin.branchManagement.loadingBranches", { defaultValue: "Loading branches..." })}</Text>
          </View>
        ) : filteredAndSortedBranches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>
              {searchTerm || selectedStatus
                ? t("admin.branchManagement.noBranchesFound", { defaultValue: "No branches found" })
                : t("admin.branchManagement.noBranches", { defaultValue: "No branches" })}
            </Text>
          </View>
        ) : (
          <View style={[styles.branchesGrid, isTablet && styles.branchesGridTablet]}>
            {filteredAndSortedBranches.map((branch) => (
              <View key={branch.id} style={[styles.branchCard, isTablet && styles.branchCardTablet]}>
                <View style={styles.branchInfo}>
                  <View style={styles.branchNameRow}>
                    <Text style={styles.branchName}>{branch.name || branch.code || branch.id}</Text>
                    {branch.isUrgentlyClosed && (
                      <View style={styles.urgentCloseBadge}>
                        <MaterialCommunityIcons name="alert-circle" size={12} color="#ef4444" />
                        <Text style={styles.urgentCloseBadgeText}>{t("admin.branchManagement.urgentlyClosed", { defaultValue: "Urgently Closed" })}</Text>
                      </View>
                    )}
                  </View>
                  {branch.code && branch.code !== branch.name && (
                    <Text style={styles.branchCode}>{branch.code}</Text>
                  )}
                  {(branch.address || branch.city) && (
                    <Text style={styles.branchLocation} numberOfLines={2}>
                      {[branch.address, branch.city, branch.state, branch.country]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  )}
                  {branch.isUrgentlyClosed && branch.urgentCloseMessage && (
                    <Text style={styles.urgentCloseMessage} numberOfLines={2}>
                      {branch.urgentCloseMessage}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.menuButton, !canAnyBranchAction && { opacity: 0.4 }]}
                  onPress={() => {
                    if (!canAnyBranchAction) return;
                    // Get fresh branch data from branches state
                    const freshBranch = branches.find(b => b.id === branch.id);
                    setActionsBranch(freshBranch || branch);
                    setActionsModalVisible(true);
                  }}
                >
                  <MaterialCommunityIcons name="dots-vertical" size={18} color="#374151" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsBranch(null);
        }}
      >
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setActionsModalVisible(false);
              setActionsBranch(null);
            }}
          />

          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHandle} />
            {actionsBranch && (
              <View style={styles.sheetContent}>
                {reservationEntitled && canViewReservationSettings && (
                  <TouchableOpacity style={styles.sheetItem} onPress={() => openReservationSettings(actionsBranch)}>
                    <MaterialCommunityIcons name="calendar" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.branchManagement.reservationSettingsAction", { defaultValue: "Reservation Settings" })}
                    </Text>
                  </TouchableOpacity>
                )}

                {(canUpdateBranch || canEditBranchSettings) && (
                  <TouchableOpacity style={styles.sheetItem} onPress={() => openEdit(actionsBranch)}>
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.branchManagement.editBranch", { defaultValue: "Edit Branch" })}
                    </Text>
                  </TouchableOpacity>
                )}

                {canUrgentCloseBranch && !actionsBranch.isUrgentlyClosed && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemWarning]}
                    onPress={() => handleUrgentCloseClick(actionsBranch)}
                  >
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#f59e0b" />
                    <Text style={[styles.sheetItemText, styles.actionTextWarning]}>
                      {t("admin.branchManagement.urgentClose", { defaultValue: "Urgent Close" })}
                    </Text>
                  </TouchableOpacity>
                )}

                {canUrgentCloseBranch && actionsBranch.isUrgentlyClosed && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => handleReopenClick(actionsBranch)}
                  >
                    <MaterialCommunityIcons name="restart" size={16} color="#10b981" />
                    <Text style={[styles.sheetItemText, styles.actionTextSuccess]}>
                      {t("admin.branchManagement.reopenBranch", { defaultValue: "Reopen Branch" })}
                    </Text>
                  </TouchableOpacity>
                )}

                {canDeleteBranch && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemDanger]}
                    onPress={() => handleDeleteClick(actionsBranch)}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    <Text style={[styles.sheetItemText, styles.actionTextDanger]}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsBranch(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowStatusFilterModal(false)} />
          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.branchManagement.selectStatus", { defaultValue: "Select Status" })}</Text>
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.sheetItem, selectedStatus === "" && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedStatus("");
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedStatus === "" && styles.sheetItemTextActive]}>
                    {t("admin.branchManagement.allStatus", { defaultValue: "All Status" })}
                  </Text>
                  {selectedStatus === "" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetItem, selectedStatus === "ACTIVE" && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedStatus("ACTIVE");
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedStatus === "ACTIVE" && styles.sheetItemTextActive]}>
                    {t("admin.branchManagement.active", { defaultValue: "Active" })}
                  </Text>
                  {selectedStatus === "ACTIVE" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetItem, selectedStatus === "INACTIVE" && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedStatus("INACTIVE");
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedStatus === "INACTIVE" && styles.sheetItemTextActive]}>
                    {t("admin.branchManagement.inactive", { defaultValue: "Inactive" })}
                  </Text>
                  {selectedStatus === "INACTIVE" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowStatusFilterModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDeleteModalVisible(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("admin.branchManagement.deleteBranch", { defaultValue: "Delete branch" })}</Text>
            <Text style={styles.modalDescription}>{t("admin.branchManagement.deleteConfirm", { defaultValue: "Are you sure?" })}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setBranchToDelete(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
                disabled={deletingId !== null}
              >
                {deletingId !== null ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>{t("common.delete", { defaultValue: "Delete" })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={urgentCloseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUrgentCloseModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setUrgentCloseModalVisible(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("admin.branchManagement.urgentClose", { defaultValue: "Urgent Close" })}</Text>
            <Text style={styles.modalDescription}>{t("admin.branchManagement.urgentCloseConfirm", { defaultValue: "Urgently close this branch?" })}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t("admin.branchManagement.urgentCloseMessage", { defaultValue: "Close Message" })}</Text>
              <TextInput
                style={styles.textInput}
                placeholder={t("admin.branchManagement.urgentCloseDefaultMessage", { defaultValue: "This branch is temporarily closed due to an emergency. We apologize for the inconvenience." })}
                placeholderTextColor="#6B7280"
                value={urgentCloseMessage}
                onChangeText={setUrgentCloseMessage}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setUrgentCloseModalVisible(false);
                  setUrgentCloseMessage("");
                  setActionsBranch(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonWarning}
                onPress={handleUrgentClose}
                disabled={processingUrgentClose}
              >
                {processingUrgentClose ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonWarningText}>{t("admin.branchManagement.urgentClose", { defaultValue: "Urgent Close" })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={reopenModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReopenModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setReopenModalVisible(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("admin.branchManagement.reopenBranch", { defaultValue: "Reopen Branch" })}</Text>
            <Text style={styles.modalDescription}>{t("admin.branchManagement.reopenConfirm", { defaultValue: "Reopen this branch?" })}</Text>
            {actionsBranch?.urgentCloseMessage && (
              <Text style={styles.modalInfo}>{actionsBranch.urgentCloseMessage}</Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setReopenModalVisible(false);
                  setActionsBranch(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSuccess}
                onPress={handleReopen}
                disabled={processingUrgentClose}
              >
                {processingUrgentClose ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonSuccessText}>{t("admin.branchManagement.reopenBranch", { defaultValue: "Reopen" })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#374151",
  },
  filterTextButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterTextButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.08)",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 14,
    color: "#374151",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  sortButtonTextActive: {
    color: "#fff",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#374151",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#374151",
    textAlign: "center",
  },
  branchesGrid: {
    flexDirection: "column",
    gap: 12,
  },
  branchesGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchCardTablet: {
    width: "48%",
  },
  branchInfo: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  branchNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  urgentCloseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  urgentCloseBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ef4444",
  },
  urgentCloseMessage: {
    fontSize: 12,
    color: "#ef4444",
    fontStyle: "italic",
    marginTop: 4,
  },
  branchCode: {
    fontSize: 14,
    color: "#374151",
  },
  branchLocation: {
    fontSize: 12,
    color: "#6B7280",
  },
  menuButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
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
    paddingTop: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginBottom: 12,
  },
  sheetContent: {
    paddingBottom: 12,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemActive: {
    borderColor: "#ec4899",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
    flex: 1,
  },
  sheetItemTextActive: {
    color: "#fff",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  actionTextWarning: {
    color: "#f59e0b",
  },
  actionTextSuccess: {
    color: "#10b981",
  },
  modalInfo: {
    fontSize: 13,
    color: "#374151",
    fontStyle: "italic",
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    color: "#111827",
    fontSize: 14,
    minHeight: 80,
  },
  modalButtonWarning: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f59e0b",
  },
  modalButtonWarningText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonSuccess: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
  },
  modalButtonSuccessText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  sheetCancel: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    marginTop: 6,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 16,
    color: "#374151",
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  modalButtonDelete: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
