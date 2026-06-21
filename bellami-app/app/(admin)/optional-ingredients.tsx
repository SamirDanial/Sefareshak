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
  optionalIngredientService,
  type OptionalIngredient,
} from "@/src/services/optionalIngredientService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { OrganizationTransferSheet } from "@/components/admin/OrganizationTransferSheet";

export default function OptionalIngredientsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const { canAny, isLoading: permissionsLoading, isSuperAdmin, refreshPermissions } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const refreshPermissionsRef = useRef(refreshPermissions);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [optionalIngredients, setOptionalIngredients] = useState<
    OptionalIngredient[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);

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
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] =
    useState<OptionalIngredient | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsIngredient, setActionsIngredient] =
    useState<OptionalIngredient | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [showFilters, setShowFilters] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set());
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [transferConfirming, setTransferConfirming] = useState(false);

  const allSelected =
    optionalIngredients.length > 0 &&
    selectedIngredientIds.size === optionalIngredients.length;

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    refreshPermissionsRef.current = refreshPermissions;
  }, [refreshPermissions]);

  const canViewOptionalIngredients =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW }]);

  const canCreateOptionalIngredient =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.CREATE }]);

  const canUpdateOptionalIngredient =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.UPDATE }]);

  const canDeleteOptionalIngredient =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.DELETE }]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadData();
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissionsRef.current();
      if (!isInitialMount.current) {
        if (!permissionsLoading && canViewOptionalIngredients) {
          loadData();
        }
      }
    }, [])
  );

  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;
    if (currentPage === 1) setFiltersLoading(true);
    loadData();
  }, [currentPage, sortBy, sortOrder]);

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
    if (!selectionMode && selectedIngredientIds.size === 0) return;
    setSelectionMode(false);
    setSelectedIngredientIds(new Set());
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
      setOptionalIngredients([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      setListLoading(false);
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
      if (permissionsLoading) return;
      if (!canViewOptionalIngredients) {
        setOptionalIngredients([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }
      if (currentPage === 1 && !isSearchingRef.current && !refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      const data = await optionalIngredientService.getOptionalIngredients(
        currentPage,
        12,
        searchTerm || "",
        sortBy,
        sortOrder,
        token || undefined
      );
      setOptionalIngredients(data.optionalIngredients);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(
        data.pagination?.totalCount || data.optionalIngredients.length
      );
    } catch (e) {
      console.error("Error loading optional ingredients:", e);
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.failedToFetch"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setListLoading(false);
      setFiltersLoading(false);
      setPaginationLoading(false);
    }
  };

  const loadSearchResults = async () => {
    try {
      if (permissionsLoading) return;
      if (!canViewOptionalIngredients) {
        setOptionalIngredients([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }
      setListLoading(true);
      const token = await getToken();
      const data = await optionalIngredientService.getOptionalIngredients(
        1,
        12,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined
      );
      setOptionalIngredients(data.optionalIngredients);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(
        data.pagination?.totalCount || data.optionalIngredients.length
      );
    } catch (e) {
      console.error("Error searching optional ingredients:", e);
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
    if (!canCreateOptionalIngredient) return;
    router.push("/(admin)/optional-ingredient-form" as any);
  };

  const handleEdit = (ingredient: OptionalIngredient) => {
    if (!canUpdateOptionalIngredient) return;
    router.push(
      `/(admin)/optional-ingredient-form?id=${ingredient.id}` as unknown as any
    );
  };

  const handleDelete = async () => {
    if (!canDeleteOptionalIngredient) return;
    if (!ingredientToDelete) return;
    try {
      const token = await getToken();
      await optionalIngredientService.deleteOptionalIngredient(
        ingredientToDelete.id,
        token || undefined
      );
      setShowDeleteModal(false);
      setIngredientToDelete(null);
      await loadData();
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.deletedSuccess"),
        type: "success",
      });
    } catch (e) {
      console.error("Delete optional ingredient error:", e);
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.failedToDelete"),
        type: "error",
      });
    }
  };

  const toggleSelectedIngredient = (id: string) => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (optionalIngredients.length === 0) return;
    if (allSelected) {
      setSelectedIngredientIds(new Set());
      return;
    }
    setSelectedIngredientIds(new Set(optionalIngredients.map((i) => i.id)));
  };

  const openTransferForIds = (mode: "move" | "copy", ids: string[]) => {
    if (!isSuperAdmin) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    setSelectedIngredientIds(new Set(ids));
    setTransferMode(mode);
    setTransferVisible(true);
  };

  const handleConfirmTransfer = async (organizationId: string) => {
    const ids = Array.from(selectedIngredientIds);
    if (!isSuperAdmin || ids.length === 0) return;

    setTransferConfirming(true);
    try {
      const token = await getToken();
      if (!token) return;

      if (transferMode === "move") {
        await Promise.allSettled(
          ids.map((id) =>
            optionalIngredientService.setOptionalIngredientOrganization(
              id,
              organizationId,
              token || undefined
            )
          )
        );
      } else {
        await optionalIngredientService.copyOptionalIngredientsToOrganization(
          ids,
          organizationId,
          token || undefined
        );
      }

      setTransferVisible(false);
      setSelectionMode(false);
      setSelectedIngredientIds(new Set());
      await loadData();
    } finally {
      setTransferConfirming(false);
    }
  };

  if (!permissionsLoading && !canViewOptionalIngredients) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
          <TouchableOpacity
            style={[styles.modalButtonCancel, { marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.modalButtonCancelText}>
              {t("common.back", { defaultValue: "Back" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && optionalIngredients.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.optionalIngredientManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* List */}
      <View style={styles.listContainer}>
        {(listLoading || filtersLoading) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingOverlayText}>
              {listLoading
                ? t("admin.categoryManagement.searchingCategories")
                : t("admin.categoryManagement.applyingFilters")}
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
                  ? t("admin.categoryManagement.hideFilters")
                  : t("admin.categoryManagement.showFilters")}
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
                  placeholder={t(
                    "admin.optionalIngredientManagement.searchPlaceholder"
                  )}
                  placeholderTextColor="#6B7280"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.optionalIngredientManagement.sortBy")}:
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
                    {t("admin.optionalIngredientManagement.nameAZ")}
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
                        ? t("admin.optionalIngredientManagement.newestFirst")
                        : t("admin.optionalIngredientManagement.oldestFirst")
                      : t("admin.optionalIngredientManagement.newestFirst")}
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
                  {selectedIngredientIds.size}/{optionalIngredients.length}
                </Text>

                <View style={styles.selectionBarActions}>
                  <TouchableOpacity
                    onPress={() =>
                      openTransferForIds("move", Array.from(selectedIngredientIds))
                    }
                    style={[
                      styles.orderingButton,
                      selectedIngredientIds.size === 0 && { opacity: 0.5 },
                    ]}
                    disabled={selectedIngredientIds.size === 0}
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
                      openTransferForIds("copy", Array.from(selectedIngredientIds))
                    }
                    style={[
                      styles.orderingButton,
                      selectedIngredientIds.size === 0 && { opacity: 0.5 },
                    ]}
                    disabled={selectedIngredientIds.size === 0}
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
          {optionalIngredients.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t(
                  "admin.optionalIngredientManagement.noOptionalIngredientsFound"
                )}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchTerm
                  ? t("admin.optionalIngredientManagement.tryAdjustingFilters")
                  : t("admin.optionalIngredientManagement.getStarted")}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {optionalIngredients.map((ingredient) => (
                <View key={ingredient.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.infoRow}>
                      {isSuperAdmin ? (
                        <TouchableOpacity
                          onPress={() => toggleSelectedIngredient(ingredient.id)}
                          style={{ paddingRight: 10, paddingVertical: 6 }}
                          accessibilityRole="button"
                        >
                          <MaterialCommunityIcons
                            name={
                              selectedIngredientIds.has(ingredient.id)
                                ? "checkbox-marked"
                                : "checkbox-blank-outline"
                            }
                            size={18}
                            color={selectedIngredientIds.has(ingredient.id) ? "#ec4899" : "#9CA3AF"}
                          />
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.iconCircle}>
                        <MaterialCommunityIcons
                          name="silverware-fork-knife"
                          size={20}
                          color="#ec4899"
                        />
                      </View>
                      <View style={styles.details}>
                        <View style={styles.nameRow}>
                          <Text style={styles.name} numberOfLines={1}>
                            {ingredient.name}
                          </Text>
                        </View>
                        {ingredient._count && (
                          <Text style={styles.metaText}>
                            {t(
                              "admin.optionalIngredientManagement.usedInMeals",
                              {
                                count:
                                  ingredient._count.mealOptionalIngredients,
                              }
                            )}
                          </Text>
                        )}
                        {ingredient.createdAt && (
                          <Text style={styles.metaText}>
                            {new Date(
                              ingredient.createdAt
                            ).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => {
                        setActionsIngredient(ingredient);
                        setShowActionsMenu(ingredient.id);
                        setActionsModalVisible(true);
                      }}
                      disabled={!canUpdateOptionalIngredient && !canDeleteOptionalIngredient}
                    >
                      <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>

                  {ingredient.description && (
                    <Text style={styles.description} numberOfLines={2}>
                      {ingredient.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Actions Bottom Sheet Modal */}
          <Modal
            visible={actionsModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setActionsModalVisible(false);
              setShowActionsMenu(null);
              setActionsIngredient(null);
            }}
          >
            <Pressable
              style={styles.sheetOverlay}
              onPress={() => {
                setActionsModalVisible(false);
                setShowActionsMenu(null);
                setActionsIngredient(null);
              }}
            >
              <Pressable
                style={styles.sheetContainer}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.sheetHandle} />
                {actionsIngredient && (
                  <View style={styles.sheetContent}>
                    {canUpdateOptionalIngredient && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          setActionsModalVisible(false);
                          handleEdit(actionsIngredient);
                          setShowActionsMenu(null);
                        }}
                      >
                        <EditIcon size={16} color="#D1D5DB" />
                        <Text style={styles.sheetItemText}>
                          {t("admin.optionalIngredientManagement.edit")}
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
                            openTransferForIds("move", [actionsIngredient.id]);
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
                            openTransferForIds("copy", [actionsIngredient.id]);
                          }}
                        >
                          <MaterialCommunityIcons name="content-copy" size={16} color="#D1D5DB" />
                          <Text style={styles.sheetItemText}>
                            {t("common.copy", { defaultValue: "Copy" })}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {canDeleteOptionalIngredient && (
                      <TouchableOpacity
                        style={[styles.sheetItem, styles.sheetItemDanger]}
                        onPress={() => {
                          setActionsModalVisible(false);
                          setIngredientToDelete(actionsIngredient);
                          setShowDeleteModal(true);
                          setShowActionsMenu(null);
                        }}
                      >
                        <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                        <Text
                          style={[styles.sheetItemText, styles.actionTextDanger]}
                        >
                          {t("admin.optionalIngredientManagement.delete")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.sheetCancel}
                      onPress={() => {
                        setActionsModalVisible(false);
                        setShowActionsMenu(null);
                        setActionsIngredient(null);
                      }}
                    >
                      <Text style={styles.sheetCancelText}>
                        {t("admin.optionalIngredientManagement.cancel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <Text style={styles.paginationText}>
                {t("admin.categoryManagement.showingCategories", {
                  count: optionalIngredients.length,
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
                  {t("admin.optionalIngredientManagement.pageOf", {
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
              {t("admin.optionalIngredientManagement.deleteOptionalIngredient")}
            </Text>
            <Text style={styles.modalDescription}>
              {t(
                "admin.optionalIngredientManagement.deleteOptionalIngredientDescription",
                {
                  name: ingredientToDelete?.name,
                }
              )}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t(
                    "admin.optionalIngredientManagement.deleteOptionalIngredientCancel"
                  )}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
              >
                <Text style={styles.modalButtonDeleteText}>
                  {t(
                    "admin.optionalIngredientManagement.deleteOptionalIngredientConfirm"
                  )}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Floating Add Button */}
      {canCreateOptionalIngredient && (
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
        selectedCount={selectedIngredientIds.size}
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
    borderBottomColor: "#262626",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#D1D5DB",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#171717",
    borderRadius: 8,
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
  listContainer: { flex: 1, position: "relative" },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    gap: 12,
  },
  loadingOverlayText: { color: "#9CA3AF", fontSize: 14 },
  paginationLoadingOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  list: { flex: 1 },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D1D5DB",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  grid: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  details: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  metaText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 8,
    lineHeight: 18,
  },
  menuButton: {
    padding: 4,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#404040",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetContent: {
    padding: 16,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#262626",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetCancel: {
    marginTop: 8,
    padding: 14,
    alignItems: "center",
  },
  sheetCancelText: {
    fontSize: 15,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  pagination: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    gap: 12,
  },
  paginationText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
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
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#171717",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#262626",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  modalButtonCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  modalButtonDelete: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  modalButtonDeleteText: {
    fontSize: 15,
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
