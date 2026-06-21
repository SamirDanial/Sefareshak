import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { addonService, type Addon } from "@/src/services/addonService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { OrganizationTransferSheet } from "@/components/admin/OrganizationTransferSheet";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function AddonsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const { canAny, isLoading: permissionsLoading, isSuperAdmin } = usePermissions();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = Platform.OS !== "web" && width >= 700;
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const canCreateAddon =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.CREATE }]);
  const canUpdateAddon =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.UPDATE }]);
  const canDeleteAddon =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.DELETE }]);
  const canToggleAddon =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.TOGGLE_ACTIVE }]);

  const hasAddonActions = canUpdateAddon || canDeleteAddon || canToggleAddon;
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };
  const [refreshing, setRefreshing] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addonToDelete, setAddonToDelete] = useState<Addon | null>(null);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsAddon, setActionsAddon] = useState<Addon | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [showFilters, setShowFilters] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set());
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [transferConfirming, setTransferConfirming] = useState(false);

  const allSelected = addons.length > 0 && selectedAddonIds.size === addons.length;

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadData();
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (!isInitialMount.current) {
        loadData();
      }
    }, [])
  );

  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;
    if (selectedStatus !== "" && currentPage === 1) setFiltersLoading(true);
    loadData();
  }, [currentPage, selectedStatus, sortBy, sortOrder]);

  useEffect(() => {
    if (isInitialMount.current) return;
    isSearchingRef.current = true;
    const t = setTimeout(() => {
      setCurrentPage(1);
      loadSearchResults();
      setTimeout(() => (isSearchingRef.current = false), 100);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!selectionMode && selectedAddonIds.size === 0) return;
    setSelectionMode(false);
    setSelectedAddonIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (selectionMode) return;
    setSelectionMode(true);
  }, [isSuperAdmin, selectionMode]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isSuperAdmin) return;

    if (!selectedOrganizationId) {
      setAddons([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
      setPaginationLoading(false);
      return;
    }

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isSuperAdmin, selectedOrganizationId]);

  const loadData = async () => {
    try {
      if (currentPage === 1 && !refreshing) setLoading(true);
      else setPaginationLoading(true);
      const token = await getToken();
      const data = await addonService.getAddons(
        currentPage,
        12,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined,
        selectedStatus as any
      );

      const filtered = data.addons.filter((a) => {
        const active =
          typeof (a as any).isActive === "boolean"
            ? (a as any).isActive
            : String((a as any).isActive).toLowerCase() === "true";
        if (selectedStatus === "ACTIVE") return active;
        if (selectedStatus === "INACTIVE") return !active;
        return true;
      });

      setAddons(filtered);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || filtered.length);
    } catch (e) {
      console.error("Error loading addons:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
      setPaginationLoading(false);
    }
  };

  const loadSearchResults = async () => {
    try {
      setListLoading(true);
      const token = await getToken();
      const data = await addonService.getAddons(
        1,
        12,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined,
        selectedStatus as any
      );
      const filtered = data.addons.filter((a) => {
        const active =
          typeof (a as any).isActive === "boolean"
            ? (a as any).isActive
            : String((a as any).isActive).toLowerCase() === "true";
        if (selectedStatus === "ACTIVE") return active;
        if (selectedStatus === "INACTIVE") return !active;
        return true;
      });
      setAddons(filtered);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || filtered.length);
    } catch (e) {
      console.error("Error searching addons:", e);
    } finally {
      setListLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setCurrentPage(1);
    loadData();
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleCreate = () => {
    if (!canCreateAddon) return;
    router.push("/(admin)/addon-form" as any);
  };

  const handleEdit = (addon: Addon) => {
    if (!canUpdateAddon) return;
    router.push(`/(admin)/addon-form?id=${addon.id}` as unknown as any);
  };

  const handleDelete = async () => {
    if (!canDeleteAddon) return;
    if (!addonToDelete) return;
    try {
      const token = await getToken();
      await addonService.deleteAddon(addonToDelete.id, token || undefined);
      setShowDeleteModal(false);
      setAddonToDelete(null);
      await loadData();
      setToast({
        visible: true,
        message: t("admin.addonManagement.addonDeleted"),
        type: "success",
      });
    } catch (e) {
      console.error("Delete addon error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.deleteAddonError"),
        type: "error",
      });
    }
  };

  const handleToggleStatus = async (addon: Addon) => {
    if (!canToggleAddon) return;
    try {
      setShowActionsMenu(null);
      const token = await getToken();
      await addonService.toggleAddonStatus(addon.id, token || undefined);
      await loadData();
      setToast({
        visible: true,
        message: addon.isActive
          ? t("admin.addonManagement.addonDeactivated", { name: addon.name })
          : t("admin.addonManagement.addonActivated", { name: addon.name }),
        type: "success",
      });
    } catch (e) {
      console.error("Toggle addon status error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.toggleStatusError"),
        type: "error",
      });
    }
  };

  const toggleSelectedAddon = (id: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (addons.length === 0) return;
    if (allSelected) {
      setSelectedAddonIds(new Set());
      return;
    }
    setSelectedAddonIds(new Set(addons.map((a) => a.id)));
  };

  const openTransferForIds = (mode: "move" | "copy", ids: string[]) => {
    if (!isSuperAdmin) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    setSelectedAddonIds(new Set(ids));
    setTransferMode(mode);
    setTransferVisible(true);
  };

  const handleConfirmTransfer = async (organizationId: string) => {
    const ids = Array.from(selectedAddonIds);
    if (!isSuperAdmin || ids.length === 0) return;

    setTransferConfirming(true);
    try {
      const token = await getToken();
      if (!token) return;

      if (transferMode === "move") {
        await Promise.allSettled(
          ids.map((id) =>
            addonService.setAddonOrganization(id, organizationId, token || undefined)
          )
        );
      } else {
        await addonService.copyAddonsToOrganization(ids, organizationId, token || undefined);
      }

      setTransferVisible(false);
      setSelectionMode(false);
      setSelectedAddonIds(new Set());
      await loadData();
    } finally {
      setTransferConfirming(false);
    }
  };

  if (loading && addons.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.addonManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setShowActionsMenu(null);
          setActionsAddon(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setShowActionsMenu(null);
            setActionsAddon(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsAddon && (
              <View style={styles.sheetContent}>
                {canUpdateAddon && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleEdit(actionsAddon);
                      setShowActionsMenu(null);
                    }}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.addonManagement.edit")}
                    </Text>
                  </TouchableOpacity>
                )}

                {isSuperAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setActionsModalVisible(false);
                        setShowActionsMenu(null);
                        openTransferForIds("move", [actionsAddon.id]);
                      }}
                    >
                      <MaterialCommunityIcons name="swap-horizontal" size={16} color="#D1D5DB" />
                      <Text style={styles.sheetItemText}>
                        {t("common.move", { defaultValue: "Move" })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setActionsModalVisible(false);
                        setShowActionsMenu(null);
                        openTransferForIds("copy", [actionsAddon.id]);
                      }}
                    >
                      <MaterialCommunityIcons name="content-copy" size={16} color="#D1D5DB" />
                      <Text style={styles.sheetItemText}>
                        {t("common.copy", { defaultValue: "Copy" })}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {canToggleAddon && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleToggleStatus(actionsAddon);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={actionsAddon.isActive ? "eye-off" : "eye"}
                      size={16}
                      color="#D1D5DB"
                    />
                    <Text style={styles.sheetItemText}>
                      {actionsAddon.isActive
                        ? t("admin.addonManagement.deactivate")
                        : t("admin.addonManagement.activate")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canDeleteAddon && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemDanger]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      setAddonToDelete(actionsAddon);
                      setShowDeleteModal(true);
                      setShowActionsMenu(null);
                    }}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    <Text style={[styles.sheetItemText, styles.actionTextDanger]}>
                      {t("admin.addonManagement.delete")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setShowActionsMenu(null);
                    setActionsAddon(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.addonManagement.cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      {/* List */}
      <View style={styles.listContainer}>
        {(listLoading || filtersLoading) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingOverlayText}>
              {listLoading
                ? t("admin.addonManagement.searchingAddons")
                : t("admin.addonManagement.applyingFilters")}
            </Text>
          </View>
        )}
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
              onRefresh={handleRefresh}
              tintColor="#ec4899"
              colors={["#ec4899"]}
              progressBackgroundColor="#f3f4f6"
            />
          }
        >
          {/* Show Filters Toggle */}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: showFilters ? 4 : 16 }}>
            <TouchableOpacity
              onPress={() => setShowFilters((s) => !s)}
              style={styles.filterTextButtonContainer}
            >
              <Text style={styles.filterTextButton}>
                {showFilters
                  ? t("admin.addonManagement.hideFilters")
                  : t("admin.addonManagement.showFilters")}
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
                  placeholder={t("admin.addonManagement.searchPlaceholder")}
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
                      ? t("admin.addonManagement.active")
                      : selectedStatus === "INACTIVE"
                      ? t("admin.addonManagement.inactive")
                      : t("admin.addonManagement.allStatus")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.addonManagement.sortBy")}:
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
                    {t("admin.addonManagement.sortName")}
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
                        ? t("admin.addonManagement.newestFirst")
                        : t("admin.addonManagement.oldestFirst")
                      : t("admin.addonManagement.newestFirst")}
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

          {isSuperAdmin ? (
            <View style={{ paddingBottom: 16 }}>
              <View style={styles.selectionBar}>
                <TouchableOpacity
                  onPress={toggleSelectAll}
                  style={styles.selectionBarSelectAll}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={18}
                    color={allSelected ? "#ec4899" : "#9CA3AF"}
                  />
                  <Text style={styles.selectionBarText} numberOfLines={1}>
                    {t("common.selectAll", { defaultValue: "Select all" })}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.selectionBarCount} numberOfLines={1}>
                  {selectedAddonIds.size}/{addons.length}
                </Text>

                <View style={styles.selectionBarActions}>
                  <TouchableOpacity
                    onPress={() =>
                      openTransferForIds("move", Array.from(selectedAddonIds))
                    }
                    style={[
                      styles.orderingButton,
                      selectedAddonIds.size === 0 && { opacity: 0.5 },
                    ]}
                    disabled={selectedAddonIds.size === 0}
                  >
                    <MaterialCommunityIcons
                      name="swap-horizontal"
                      size={16}
                      color="#ec4899"
                    />
                    <Text style={styles.orderingButtonText}>
                      {t("common.move", { defaultValue: "Move" })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      openTransferForIds("copy", Array.from(selectedAddonIds))
                    }
                    style={[
                      styles.orderingButton,
                      selectedAddonIds.size === 0 && { opacity: 0.5 },
                    ]}
                    disabled={selectedAddonIds.size === 0}
                  >
                    <MaterialCommunityIcons
                      name="content-copy"
                      size={16}
                      color="#ec4899"
                    />
                    <Text style={styles.orderingButtonText}>
                      {t("common.copy", { defaultValue: "Copy" })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
          {addons.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="plus" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.addonManagement.noAddonsFound")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("admin.addonManagement.noAddonsFoundSubtext")}
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, isTablet && styles.gridTablet]}>
              {addons.map((ad) => (
                <View key={ad.id} style={[styles.card, isTablet && styles.cardTablet]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.infoRow}>
                      {isSuperAdmin ? (
                        <TouchableOpacity
                          onPress={() => toggleSelectedAddon(ad.id)}
                          style={{ paddingRight: 10, paddingVertical: 6 }}
                          accessibilityRole="button"
                        >
                          <MaterialCommunityIcons
                            name={
                              selectedAddonIds.has(ad.id)
                                ? "checkbox-marked"
                                : "checkbox-blank-outline"
                            }
                            size={18}
                            color={selectedAddonIds.has(ad.id) ? "#ec4899" : "#9CA3AF"}
                          />
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.iconCircle}>
                        <MaterialCommunityIcons name="plus" size={20} color="#ec4899" />
                      </View>
                      <View style={styles.details}>
                        <View style={styles.nameRow}>
                          <Text style={styles.name} numberOfLines={1}>
                            {ad.name}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              ad.isActive
                                ? styles.statusBadgeActive
                                : styles.statusBadgeInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                ad.isActive
                                  ? styles.statusBadgeTextActive
                                  : styles.statusBadgeTextInactive,
                              ]}
                            >
                              {ad.isActive
                                ? t("admin.addonManagement.active")
                                : t("admin.addonManagement.inactive")}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.metaText}>
                          {new Date(ad.createdAt).toLocaleDateString()} •{" "}
                          {ad.type === "BOOLEAN"
                            ? t("admin.addonManagement.toggle")
                            : t("admin.addonManagement.quantity")}
                        </Text>
                        <Text style={styles.metaText}>
                          {t("admin.addonManagement.priceLabel")} $
                          {parseFloat(ad.price || "0").toFixed(2)}
                          {ad.taxPercentage != null
                            ? ` • Tax: ${ad.taxPercentage}%`
                            : ""}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => {
                        setActionsAddon(ad);
                        setShowActionsMenu(ad.id);
                        setActionsModalVisible(true);
                      }}
                      disabled={!hasAddonActions}
                    >
                      {hasAddonActions ? (
                        <MaterialCommunityIcons
                          name="dots-vertical"
                          size={18}
                          color="#9CA3AF"
                        />
                      ) : null}
                    </TouchableOpacity>
                  </View>

                  {/* Actions handled by bottom sheet */}

                  {ad.image && (
                    <View style={styles.imageContainer}>
                      <Image
                        source={{ uri: getOptimizedImageUrl(ad.image) }}
                        style={styles.image}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                  {ad.description && (
                    <Text style={styles.description} numberOfLines={2}>
                      {ad.description}
                    </Text>
                  )}
                  {ad.addonCategories && ad.addonCategories.length > 0 && (
                    <View style={styles.categoriesContainer}>
                      <Text style={styles.categoriesLabel}>
                        {t("admin.addonManagement.categories")}:
                      </Text>
                      <View style={styles.categoriesList}>
                        {ad.addonCategories.map((ac) => (
                          <View key={ac.id} style={styles.categoryBadge}>
                            <Text style={styles.categoryBadgeText}>
                              {ac.category.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {totalPages > 1 && (
            <View style={styles.pagination}>
              <Text style={styles.paginationText}>
                {t("admin.addonManagement.showingAddons", {
                  count: addons.length,
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
                  {t("admin.addonManagement.pageOf", {
                    current: currentPage,
                    total: totalPages,
                  })}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.paginationButton,
                    currentPage === totalPages &&
                      styles.paginationButtonDisabled,
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
      </View>

      {/* Delete Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeleteModal(false)}
        >
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>
              {t("admin.addonManagement.deleteAddon")}
            </Text>
            <Text style={styles.modalDescription}>
              {t("admin.addonManagement.deleteAddonDescription", {
                name: addonToDelete?.name,
              })}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("admin.addonManagement.deleteAddonCancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
              >
                <Text style={styles.modalButtonDeleteText}>
                  {t("admin.addonManagement.deleteAddonConfirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
                {t("admin.addonManagement.selectStatus")}
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
                  setCurrentPage(1);
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.addonManagement.allStatus")}
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
                  setCurrentPage(1);
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "ACTIVE" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.addonManagement.active")}
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
                  selectedStatus === "INACTIVE" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  setSelectedStatus("INACTIVE");
                  setCurrentPage(1);
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "INACTIVE" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.addonManagement.inactive")}
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

      {/* Floating Add Button */}
      {canCreateAddon && (
        <TouchableOpacity style={styles.fab} onPress={handleCreate}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      <OrganizationTransferSheet
        visible={transferVisible}
        onClose={() => setTransferVisible(false)}
        getToken={getToken}
        mode={transferMode}
        selectedCount={selectedAddonIds.size}
        confirming={transferConfirming}
        onConfirm={handleConfirmTransfer}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
  searchInput: { flex: 1, fontSize: 14, color: "#111827" },
  filterDropdownsRow: { flexDirection: "row", gap: 12 },
  filterDropdown: {
    flex: 1,
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
  filterDropdownActive: { borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,0.08)" },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sortLabel: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
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
  listContainer: { flex: 1, position: "relative" },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  filterTextButtonContainer: { alignSelf: "flex-end" },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    zIndex: 10,
  },
  loadingOverlayText: {
    fontSize: 14,
    color: "#ec4899",
    fontWeight: "500",
    marginTop: 4,
  },
  paginationLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  emptySubtext: { fontSize: 14, color: "#6b7280" },
  grid: { gap: 12 },
  gridTablet: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTablet: { width: "48%" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  infoRow: { flex: 1, flexDirection: "row", gap: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  details: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  name: { fontSize: 16, fontWeight: "600", color: "#111827", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusBadgeActive: { backgroundColor: "rgba(34, 197, 94, 0.2)" },
  statusBadgeInactive: { backgroundColor: "rgba(239, 68, 68, 0.2)" },
  statusBadgeText: { fontSize: 10, fontWeight: "600" },
  statusBadgeTextActive: { color: "#22c55e" },
  statusBadgeTextInactive: { color: "#ef4444" },
  metaText: { fontSize: 12, color: "#6b7280" },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  actionsMenu: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  actionItemDanger: { backgroundColor: "rgba(239, 68, 68, 0.1)" },
  actionText: { fontSize: 13, color: "#111827", fontWeight: "500" },
  actionTextDanger: { color: "#ef4444" },
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
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
  imageContainer: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f3f4f6",
  },
  image: { width: "100%", height: "100%" },
  description: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    lineHeight: 16,
  },
  categoriesContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  categoriesLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  categoriesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: "#ec4899",
    fontWeight: "600",
    lineHeight: 16,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
  },
  paginationText: { fontSize: 13, color: "#6b7280" },
  paginationButtons: { flexDirection: "row", alignItems: "center", gap: 12 },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: { backgroundColor: "#e5e7eb", opacity: 0.5 },
  paginationPageText: { fontSize: 13, color: "#111827", fontWeight: "500" },
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
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#ec4899" },
  modalDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  modalButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  modalButtonCancelText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  modalButtonDelete: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
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
  bottomSheetBody: { padding: 8, maxHeight: 400 },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#111827",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  orderingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  orderingButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    gap: 10,
    flexWrap: "nowrap",
  },
  selectionBarSelectAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 140,
  },
  selectionBarText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  selectionBarCount: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  selectionBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
});
