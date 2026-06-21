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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
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
  createdAt?: string;
  updatedAt?: string;
}

export default function BranchManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { can, refreshPermissions, rbacUser } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const canCreateBranch = can(RESOURCES.BRANCHES, ACTIONS.CREATE);
  const canUpdateBranch = can(RESOURCES.BRANCHES, ACTIONS.UPDATE);
  const canDeleteBranch = can(RESOURCES.BRANCHES, ACTIONS.DELETE);
  const canViewBranchSettings = can(RESOURCES.BRANCHES, ACTIONS.VIEW_BRANCH_SETTINGS);
  const canUpdateBranchSettings = can(RESOURCES.BRANCHES, ACTIONS.UPDATE_BRANCH_SETTINGS);
  const canViewReservationSettings = can(RESOURCES.BRANCHES, ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS);
  const reservationEntitled = (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;
  const canEditBranchSettings = canViewBranchSettings || canUpdateBranchSettings;
  const canAnyBranchAction =
    canUpdateBranch ||
    canDeleteBranch ||
    (reservationEntitled && canViewReservationSettings) ||
    canViewBranchSettings ||
    canUpdateBranchSettings;

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
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsBranch, setActionsBranch] = useState<Branch | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, organizationLoading]);

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
      setBranches(loadedBranches);
    } catch (error: any) {
      console.error("Failed to load branches", error);
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

    // Filter by search term
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

    // Filter by status
    if (selectedStatus === "ACTIVE") {
      filtered = filtered.filter((branch) => branch.isActive !== false);
    } else if (selectedStatus === "INACTIVE") {
      filtered = filtered.filter((branch) => branch.isActive === false);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        const comparison = nameA.localeCompare(nameB);
        return sortOrder === "asc" ? comparison : -comparison;
      } else if (sortBy === "createdAt") {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
      return 0;
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
    router.push("/(admin)/branch-form");
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
    router.push(`/(admin)/branch-form?id=${branch.id}`);
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
    router.push(`/(admin)/branch-reservation-settings?branchId=${branch.id}`);
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

  return (
    <View style={styles.container}>
      <View style={styles.listContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: headerHeight - 8 }}
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
          {/* Show Filters Toggle */}
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: showFilters ? 4 : 16 }}>
            <TouchableOpacity
              onPress={() => setShowFilters((s) => !s)}
              style={styles.filterTextButtonContainer}
            >
              <Text style={styles.filterTextButton}>
                {showFilters
                  ? t("admin.branchManagement.hideFilters") || "Hide Filters"
                  : t("admin.branchManagement.showFilters") || "Show Filters"}
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
                  placeholder={t("admin.branchManagement.searchPlaceholder") || "Search branches..."}
                  placeholderTextColor="#6B7280"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
              </View>

              <View style={styles.filterDropdownsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    selectedStatus !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowStatusFilterModal(true)}
                >
                  <MaterialCommunityIcons name="eye" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedStatus === "ACTIVE"
                      ? t("admin.branchManagement.active") || "Active"
                      : selectedStatus === "INACTIVE"
                      ? t("admin.branchManagement.inactive") || "Inactive"
                      : t("admin.branchManagement.allStatus") || "All Status"}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.branchManagement.sortBy") || "Sort by"}:
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
                    {t("admin.branchManagement.nameAZ") || "Name"}
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
                        ? t("admin.branchManagement.newestFirst") || "Newest"
                        : t("admin.branchManagement.oldestFirst") || "Oldest"
                      : t("admin.branchManagement.newestFirst") || "Newest"}
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

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ec4899" />
              <Text style={styles.loadingText}>
                {t("admin.branchManagement.loadingBranches")}
              </Text>
            </View>
          ) : filteredAndSortedBranches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {searchTerm || selectedStatus
                  ? t("admin.branchManagement.noBranchesFound") || "No branches found"
                  : t("admin.branchManagement.noBranches")}
              </Text>
            </View>
          ) : (
            <View style={styles.branchesList}>
              {filteredAndSortedBranches.map((branch) => (
                <View key={branch.id} style={styles.branchCard}>
                  <View style={styles.branchInfo}>
                    <Text style={styles.branchName}>
                      {branch.name || branch.code || branch.id}
                    </Text>
                    {branch.code && branch.code !== branch.name && (
                      <Text style={styles.branchCode}>{branch.code}</Text>
                    )}
                    {(branch.address || branch.city) && (
                      <Text style={styles.branchLocation}>
                        {[branch.address, branch.city, branch.state, branch.country]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.menuButton, !canAnyBranchAction && { opacity: 0.4 }]}
                    onPress={() => {
                      if (!canAnyBranchAction) return;
                      setActionsBranch(branch);
                      setShowActionsMenu(branch.id);
                      setActionsModalVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Actions Menu Bottom Sheet */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsBranch(null);
          setShowActionsMenu(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsBranch(null);
            setShowActionsMenu(null);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsBranch && (
              <View style={styles.sheetContent}>
                {reservationEntitled && canViewReservationSettings && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => openReservationSettings(actionsBranch)}
                  >
                    <MaterialCommunityIcons name="calendar" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.branchManagement.reservationSettingsAction") || "Reservation Settings"}
                    </Text>
                  </TouchableOpacity>
                )}

                {(canUpdateBranch || canEditBranchSettings) && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => openEdit(actionsBranch)}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.branchManagement.editBranch") || "Edit Branch"}
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
                      {t("common.delete") || "Delete"}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsBranch(null);
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

      {/* Status Filter Bottom Sheet */}
      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
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
                {t("admin.branchManagement.selectStatus") || "Select Status"}
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
                  setSelectedStatus("");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.branchManagement.allStatus") || "All Status"}
                </Text>
                {selectedStatus === "" && (
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
                  selectedStatus === "ACTIVE" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  setSelectedStatus("ACTIVE");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "ACTIVE" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.branchManagement.active") || "Active"}
                </Text>
                {selectedStatus === "ACTIVE" && (
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
                  selectedStatus === "INACTIVE" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  setSelectedStatus("INACTIVE");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "INACTIVE" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.branchManagement.inactive") || "Inactive"}
                </Text>
                {selectedStatus === "INACTIVE" && (
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

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDeleteModalVisible(false)}
        >
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>
              {t("admin.branchManagement.deleteBranch")}
            </Text>
            <Text style={styles.modalDescription}>
              {t("admin.branchManagement.deleteConfirm")}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setBranchToDelete(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("common.cancel") || "Cancel"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
                disabled={deletingId !== null}
              >
                {deletingId !== null ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>
                    {t("common.delete") || "Delete"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Floating Add Button */}
      {canCreateBranch && (
        <TouchableOpacity style={styles.fab} onPress={openCreate}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  listContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
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
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  filterDropdownsRow: {
    flexDirection: "row",
    gap: 12,
  },
  filterDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 14,
    color: "#D1D5DB",
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
    color: "#9CA3AF",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1f1f1f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  sortButtonTextActive: {
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
    color: "#9CA3AF",
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
    color: "#9CA3AF",
    textAlign: "center",
  },
  branchesList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1f1f1f",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchInfo: {
    flex: 1,
    gap: 4,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  branchCode: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  branchLocation: {
    fontSize: 12,
    color: "#6B7280",
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteModalContent: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#262626",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 16,
    color: "#9CA3AF",
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
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
});
