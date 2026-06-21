import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import {
  declarationService,
  type Declaration,
} from "@/src/services/declarationService";
import ApiService from "@/src/services/apiService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { OrganizationTransferSheet } from "@/components/admin/OrganizationTransferSheet";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

export default function DeclarationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading, isSuperAdmin, refreshPermissions } = usePermissions();
  const { selectedOrganizationId } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const refreshPermissionsRef = useRef(refreshPermissions);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [allDeclarations, setAllDeclarations] = useState<Declaration[]>([]); // For getting unique types
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleScroll = useCallback((event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  }, [setScrollPosition, setScrollDirection]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] =
    useState<Declaration | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsDeclaration, setActionsDeclaration] =
    useState<Declaration | null>(null);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDeclarationIds, setSelectedDeclarationIds] = useState<Set<string>>(new Set());
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [transferConfirming, setTransferConfirming] = useState(false);

  const allSelected =
    declarations.length > 0 && selectedDeclarationIds.size === declarations.length;

  useEffect(() => {
    refreshPermissionsRef.current = refreshPermissions;
  }, [refreshPermissions]);

  const canViewDeclarations =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.VIEW }]);

  const canCreateDeclaration =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.CREATE }]);

  const canUpdateDeclaration =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.UPDATE }]);

  const canDeleteDeclaration =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.DELETE }]);

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);

  // Fetch all declarations for unique types (without filters)
  const loadAllDeclarations = useCallback(async () => {
    try {
      const token = await getToken();
      const apiService = ApiService.getInstance();
      const json = await apiService.get("/api/declarations/all", token || undefined);
      if ((json as any)?.success && (json as any)?.data) {
        const data = (json as any).data;
        setAllDeclarations(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Error loading all declarations:", e);
    }
  }, [getToken]);

  const loadDeclarations = useCallback(async () => {
    try {
      if (permissionsLoading) return;
      if (!canViewDeclarations) {
        setDeclarations([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }
      if (currentPage === 1 && !refreshing) setLoading(true);
      const token = await getToken();
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "12",
        search: searchTerm,
        sortBy,
        sortOrder,
      });

      if (selectedType !== "all") {
        params.append("type", selectedType);
      }

      const apiService = ApiService.getInstance();
      const json = await apiService.get(
        `/api/declarations?${params.toString()}`,
        token || undefined
      );

      if ((json as any)?.success && (json as any)?.data) {
        const data = (json as any).data;
        setDeclarations(data.declarations || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.totalCount || 0);
      }
    } catch (e) {
      console.error("Error loading declarations:", e);
      setToast({
        visible: true,
        message: t("admin.declarationManagement.failedToLoad"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedType, getToken, t, permissionsLoading, canViewDeclarations]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isSuperAdmin) return;

    if (!selectedOrganizationId) {
      setAllDeclarations([]);
      setDeclarations([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    loadAllDeclarations();
    loadDeclarations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isSuperAdmin, selectedOrganizationId]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadAllDeclarations();
      loadDeclarations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!selectionMode && selectedDeclarationIds.size === 0) return;
    setSelectionMode(false);
    setSelectedDeclarationIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (selectionMode) return;
    setSelectionMode(true);
  }, [isSuperAdmin, selectionMode]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissionsRef.current();
      if (!isInitialMount.current) {
        loadDeclarations();
      }
    }, [])
  );

  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;
    loadDeclarations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedType, sortBy, sortOrder]);

  useEffect(() => {
    if (isInitialMount.current) return;
    isSearchingRef.current = true;
    const t = setTimeout(() => {
      setCurrentPage(1);
      loadDeclarations();
      setTimeout(() => (isSearchingRef.current = false), 100);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleRefresh = () => {
    setRefreshing(true);
    setCurrentPage(1);
    loadDeclarations();
  };

  const handleCreate = () => {
    if (!canCreateDeclaration) return;
    router.push("/(admin)/declaration-form" as any);
  };

  const handleEdit = (declaration: Declaration) => {
    if (!canUpdateDeclaration) return;
    router.push(`/(admin)/declaration-form?id=${declaration.id}` as unknown as any);
  };

  const handleDelete = async () => {
    if (!canDeleteDeclaration) return;
    if (!selectedDeclaration) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/declarations/${selectedDeclaration.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowDeleteModal(false);
      setSelectedDeclaration(null);
      await loadAllDeclarations();
      await loadDeclarations();
      setToast({
        visible: true,
        message: t("admin.declarationManagement.deletedSuccess"),
        type: "success",
      });
    } catch (e) {
      console.error("Delete declaration error:", e);
      setToast({
        visible: true,
        message: t("admin.declarationManagement.failedToDelete"),
        type: "error",
      });
    }
  };

  const toggleSelectedDeclaration = (id: string) => {
    setSelectedDeclarationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (declarations.length === 0) return;
    if (allSelected) {
      setSelectedDeclarationIds(new Set());
      return;
    }
    setSelectedDeclarationIds(new Set(declarations.map((d) => d.id)));
  };

  const openTransferForIds = (mode: "move" | "copy", ids: string[]) => {
    if (!isSuperAdmin) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    setSelectedDeclarationIds(new Set(ids));
    setTransferMode(mode);
    setTransferVisible(true);
  };

  const handleConfirmTransfer = async (organizationId: string) => {
    const ids = Array.from(selectedDeclarationIds);
    if (!isSuperAdmin || ids.length === 0) return;

    setTransferConfirming(true);
    try {
      const token = await getToken();
      if (!token) return;

      if (transferMode === "move") {
        await Promise.allSettled(
          ids.map((id) =>
            declarationService.setDeclarationOrganization(
              id,
              organizationId,
              token || undefined
            )
          )
        );
      } else {
        await declarationService.copyDeclarationsToOrganization(
          ids,
          organizationId,
          token || undefined
        );
      }

      setTransferVisible(false);
      setSelectionMode(false);
      setSelectedDeclarationIds(new Set());
      await loadAllDeclarations();
      await loadDeclarations();
    } finally {
      setTransferConfirming(false);
    }
  };


  // Get unique types from all declarations (not filtered)
  const uniqueTypes = Array.from(
    new Set(
      allDeclarations
        .map((d) => d.type)
        .filter((t): t is string => t !== null && t !== "")
    )
  );

  if (!permissionsLoading && !canViewDeclarations) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.emptyButtonText}>
              {t("common.back", { defaultValue: "Back" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && declarations.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {t("admin.declarationManagement.loadingTitle")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Declarations List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingTop: headerHeight - 8 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        {/* Show Filters Toggle */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: showFilters ? 4 : 16 }}>
          <TouchableOpacity
            onPress={() => setShowFilters((s) => !s)}
            style={styles.filterTextButtonContainer}
          >
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.declarationManagement.hideFilters")
                : t("admin.declarationManagement.showFilters")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search and Filters */}
        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder={t("admin.declarationManagement.searchPlaceholder")}
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => setShowTypeFilter(true)}
              >
                <MaterialCommunityIcons
                  name="tune-vertical"
                  size={14}
                  color="#D1D5DB"
                />
                <Text style={styles.filterButtonText}>
                  {selectedType === "all"
                    ? t("admin.declarationManagement.allTypes")
                    : selectedType}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>
                {t("admin.declarationManagement.sortBy")}:
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
                  {t("admin.declarationManagement.nameAZ")}
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
                      ? t("admin.declarationManagement.newestFirst")
                      : t("admin.declarationManagement.oldestFirst")
                    : t("admin.declarationManagement.newestFirst")}
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
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
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
                {selectedDeclarationIds.size}/{declarations.length}
              </Text>

              <View style={styles.selectionBarActions}>
                <TouchableOpacity
                  onPress={() =>
                    openTransferForIds("move", Array.from(selectedDeclarationIds))
                  }
                  style={[
                    styles.orderingButton,
                    selectedDeclarationIds.size === 0 && { opacity: 0.5 },
                  ]}
                  disabled={selectedDeclarationIds.size === 0}
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
                    openTransferForIds("copy", Array.from(selectedDeclarationIds))
                  }
                  style={[
                    styles.orderingButton,
                    selectedDeclarationIds.size === 0 && { opacity: 0.5 },
                  ]}
                  disabled={selectedDeclarationIds.size === 0}
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
        {declarations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="tag" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>
              {t("admin.declarationManagement.noDeclarationsFound")}
            </Text>
            <Text style={styles.emptyText}>
              {searchTerm || selectedType !== "all"
                ? t("admin.declarationManagement.tryAdjustingFilters")
                : t("admin.declarationManagement.getStarted")}
            </Text>
            {!searchTerm && selectedType === "all" && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={handleCreate}
                disabled={!canCreateDeclaration}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={styles.emptyButtonText}>
                  {t("admin.declarationManagement.addDeclaration")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {declarations.map((declaration) => (
              <View key={declaration.id} style={styles.declarationCard}>
                <View style={styles.declarationContent}>
                  <View style={styles.declarationLeft}>
                    {isSuperAdmin ? (
                      <TouchableOpacity
                        onPress={() => toggleSelectedDeclaration(declaration.id)}
                        style={{ paddingRight: 10, paddingVertical: 6 }}
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons
                          name={
                            selectedDeclarationIds.has(declaration.id)
                              ? "checkbox-marked"
                              : "checkbox-blank-outline"
                          }
                          size={18}
                          color={selectedDeclarationIds.has(declaration.id) ? "#ec4899" : "#9CA3AF"}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.declarationIconContainer}>
                      {declaration.icon ? (
                        <Text style={styles.declarationIcon}>
                          {declaration.icon}
                        </Text>
                      ) : (
                        <MaterialCommunityIcons name="tag" size={20} color="#6B7280" />
                      )}
                    </View>
                    <View style={styles.declarationInfo}>
                      <View style={styles.declarationHeader}>
                        <Text style={styles.declarationName}>
                          {declaration.name}
                        </Text>
                        <View
                          style={[
                            styles.filterBadge,
                            !declaration.shownInFilter &&
                              styles.filterBadgeInactive,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              declaration.shownInFilter
                                ? "eye"
                                : "eye-off"
                            }
                            size={14}
                            color={
                              declaration.shownInFilter ? "#ec4899" : "#6B7280"
                            }
                          />
                        </View>
                        {declaration.type && (
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>
                              {declaration.type}
                            </Text>
                          </View>
                        )}
                      </View>
                      {declaration.description && (
                        <Text
                          style={styles.declarationDescription}
                          numberOfLines={2}
                        >
                          {declaration.description}
                        </Text>
                      )}
                      {declaration._count && (
                        <Text style={styles.declarationCount}>
                          {t("admin.declarationManagement.usedInMeals", {
                            count: declaration._count.mealDeclarations,
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.actionsButton}
                    onPress={() => {
                      setActionsDeclaration(declaration);
                      setActionsModalVisible(true);
                    }}
                    disabled={!canUpdateDeclaration && !canDeleteDeclaration}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={18} color="#D1D5DB" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[
                    styles.paginationButton,
                    currentPage === 1 && styles.paginationButtonDisabled,
                  ]}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <MaterialCommunityIcons name="chevron-left" size={16} color="#D1D5DB" />
                </TouchableOpacity>
                <Text style={styles.paginationText}>
                  {t("admin.declarationManagement.pageOf", {
                    current: currentPage,
                    total: totalPages,
                  })}
                </Text>
                <Text style={styles.paginationCount}>
                  {t("admin.declarationManagement.showingDeclarations", {
                    count: declarations.length,
                    total: totalCount,
                  })}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.paginationButton,
                    currentPage === totalPages &&
                      styles.paginationButtonDisabled,
                  ]}
                  onPress={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  <MaterialCommunityIcons name="chevron-right" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setSelectedDeclaration(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowDeleteModal(false);
              setSelectedDeclaration(null);
            }}
          />
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>
              {t("admin.declarationManagement.deleteDeclaration")}
            </Text>
            <Text style={styles.deleteModalText}>
              {t("admin.declarationManagement.deleteDeclarationDescription", {
                name: selectedDeclaration?.name || "",
              })}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalButtonCancel}
                onPress={() => {
                  setShowDeleteModal(false);
                  setSelectedDeclaration(null);
                }}
              >
                <Text style={styles.deleteModalButtonCancelText}>
                  {t("admin.declarationManagement.deleteDeclarationCancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalButtonConfirm}
                onPress={handleDelete}
              >
                <Text style={styles.deleteModalButtonConfirmText}>
                  {t("admin.declarationManagement.deleteDeclarationConfirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Type Filter Modal */}
      <Modal
        visible={showTypeFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowTypeFilter(false)}
          />
          <View style={styles.filterModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.declarationManagement.filterByTypeTitle")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowTypeFilter(false)}
                style={styles.modalCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.filterModalBody}>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  selectedType === "all" && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setSelectedType("all");
                  setShowTypeFilter(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    selectedType === "all" && styles.filterOptionTextActive,
                  ]}
                >
                  {t("admin.declarationManagement.allTypes")}
                </Text>
                {selectedType === "all" && (
                  <MaterialCommunityIcons name="check" size={16} color="#ec4899" />
                )}
              </TouchableOpacity>
              {uniqueTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterOption,
                    selectedType === type && styles.filterOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedType(type);
                    setShowTypeFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      selectedType === type && styles.filterOptionTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                  {selectedType === type && (
                    <MaterialCommunityIcons name="check" size={16} color="#ec4899" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsDeclaration(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsDeclaration(null);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsDeclaration && (
              <View style={styles.sheetContent}>
                {canUpdateDeclaration && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleEdit(actionsDeclaration);
                      setActionsDeclaration(null);
                    }}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.declarationManagement.edit")}
                    </Text>
                  </TouchableOpacity>
                )}

                {isSuperAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setActionsModalVisible(false);
                        setActionsDeclaration(null);
                        openTransferForIds("move", [actionsDeclaration.id]);
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
                        setActionsDeclaration(null);
                        openTransferForIds("copy", [actionsDeclaration.id]);
                      }}
                    >
                      <MaterialCommunityIcons name="content-copy" size={16} color="#D1D5DB" />
                      <Text style={styles.sheetItemText}>
                        {t("common.copy", { defaultValue: "Copy" })}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {canDeleteDeclaration && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemDanger]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      setSelectedDeclaration(actionsDeclaration);
                      setShowDeleteModal(true);
                      setActionsDeclaration(null);
                    }}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    <Text style={[styles.sheetItemText, styles.actionTextDanger]}>
                      {t("admin.declarationManagement.delete")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsDeclaration(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.declarationManagement.cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating Add Button */}
      {canCreateDeclaration && (
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
        selectedCount={selectedDeclarationIds.size}
        confirming={transferConfirming}
        onConfirm={handleConfirmTransfer}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#9CA3AF" },
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
  },
  searchContainer: {
    gap: 12,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#171717",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#171717",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    flex: 1,
  },
  filterButtonText: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "500",
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
  content: {
    flex: 1,
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  declarationCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    margin: 16,
    marginBottom: 0,
    overflow: "hidden",
  },
  declarationContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
  },
  declarationLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  declarationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#262626",
  },
  declarationIcon: {
    fontSize: 24,
  },
  declarationInfo: {
    flex: 1,
    minWidth: 0,
  },
  declarationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  declarationName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  filterBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  filterBadgeInactive: {
    backgroundColor: "rgba(107, 114, 128, 0.15)",
    borderColor: "rgba(107, 114, 128, 0.3)",
  },
  typeBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ec4899",
  },
  declarationDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  declarationCount: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  actionsButton: {
    padding: 4,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#4B5563",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#171717",
    marginBottom: 8,
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 16,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetCancel: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#171717",
    alignItems: "center",
  },
  sheetCancelText: {
    fontSize: 16,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  paginationButton: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  paginationCount: {
    color: "#6B7280",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: "#D1D5DB",
    marginBottom: 6,
    fontWeight: "600",
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#171717",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  submitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  deleteModalContent: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 20,
    margin: 20,
    borderWidth: 1,
    borderColor: "#262626",
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  deleteModalText: {
    fontSize: 14,
    color: "#D1D5DB",
    marginBottom: 20,
    lineHeight: 20,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  deleteModalButtonCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1a1a1a",
  },
  deleteModalButtonCancelText: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteModalButtonConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ef4444",
  },
  deleteModalButtonConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  filterModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  filterModalBody: {
    padding: 16,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#262626",
  },
  filterOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    borderColor: "#ec4899",
  },
  filterOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  filterOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
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
  emojiInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
    minHeight: 48,
  },
  emojiInputText: {
    fontSize: 20,
    color: "#fff",
    flex: 1,
  },
  emojiInputPlaceholder: {
    fontSize: 14,
    color: "#6B7280",
  },
  clearEmojiButton: {
    marginTop: 8,
    alignSelf: "flex-end",
  },
  clearEmojiText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "600",
  },
  emojiPickerOverlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: "flex-end",
  },
  emojiPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  emojiPickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  emojiPickerModal: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    width: "100%",
  },
  emojiPickerContent: {
    padding: 16,
  },
  emojiCategory: {
    marginBottom: 24,
  },
  emojiCategoryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9CA3AF",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiItem: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: 24,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  switchDescription: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#262626",
    justifyContent: "center",
    padding: 2,
  },
  switchActive: {
    backgroundColor: "#ec4899",
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#171717",
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
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
  },
  selectionBarCount: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  selectionBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
