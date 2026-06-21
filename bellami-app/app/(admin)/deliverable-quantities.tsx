import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import branchService, { type Branch } from "@/src/services/branchService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import {
  deliverableQuantityService,
  type MealWithSizes,
  type MealSizeWithWeight,
  type AvailableWeight,
  type DailyDeliverable,
  type Category,
} from "@/src/services/deliverableQuantityService";

export default function DeliverableQuantitiesScreen() {
  const { t } = useTranslation();
  const { getToken } = useAuthRole();
  const { canAny, refreshPermissions } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const canViewDeliverableQuantities = canAny([
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
  ]);

  const canManageDeliverableQuantities = canAny([
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
  ]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [savingSizeWeights, setSavingSizeWeights] = useState(false);
  const [savingDailyLimit, setSavingDailyLimit] = useState(false);
  const [deletingDailyLimit, setDeletingDailyLimit] = useState(false);

  // Data states
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allMeals, setAllMeals] = useState<MealWithSizes[]>([]);
  const [mealSizes, setMealSizes] = useState<MealSizeWithWeight[]>([]);
  const [dailyDeliverable, setDailyDeliverable] = useState<DailyDeliverable | null>(null);
  const [availableWeight, setAvailableWeight] = useState<AvailableWeight | null>(null);

  // Selection states
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedMealId, setSelectedMealId] = useState<string>("");

  // Modal states
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMealPicker, setShowMealPicker] = useState(false);

  // Form states
  const [sizeWeights, setSizeWeights] = useState<Record<string, string>>({});
  const [dailyLimitInput, setDailyLimitInput] = useState<string>("");
  const [hasSizeWeightChanges, setHasSizeWeightChanges] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  // Derive categories from allMeals
  const categories = useMemo((): Category[] => {
    const categoryMap = new Map<string, Category>();
    allMeals.forEach((meal) => {
      if (meal.category && !categoryMap.has(meal.category.id)) {
        categoryMap.set(meal.category.id, meal.category);
      }
    });
    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMeals]);

  // Filter meals by selected category
  const filteredMeals = useMemo((): MealWithSizes[] => {
    if (!selectedCategoryId) return [];
    return allMeals.filter((meal) => meal.categoryId === selectedCategoryId);
  }, [allMeals, selectedCategoryId]);

  // Get selected items for display
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedMeal = allMeals.find((m) => m.id === selectedMealId);

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
    const loadBranches = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        const activeBranches = (fetchedBranches || []).filter((b: Branch) => b.isActive !== false);
        setBranches(activeBranches);

        // Auto-select the only branch if there is exactly one (and nothing else already selected)
        if (!selectedBranchId && activeBranches.length === 1 && activeBranches[0]?.id) {
          setSelectedBranchId(activeBranches[0].id);
        }
      } catch (error) {
        console.error("Error loading branches:", error);
        setToast({
          visible: true,
          message: t("admin.deliverableQuantities.loadError") || "Failed to load branches",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };
    loadBranches();
  }, [selectedBranchId, getToken]);

  useEffect(() => {
    if (organizationLoading) return;
    refreshPermissions();
    setSelectedBranchId("");
    setSelectedCategoryId("");
    setSelectedMealId("");
    setAllMeals([]);
    setMealSizes([]);
    setSizeWeights({});
    setHasSizeWeightChanges(false);
    setDailyDeliverable(null);
    setAvailableWeight(null);
    setDailyLimitInput("");
    // Branches will reload because the branches effect depends on selectedBranchId
  }, [selectedOrganizationId, organizationLoading, refreshPermissions]);

  // Load meals when branch changes
  useEffect(() => {
    if (!selectedBranchId) {
      setAllMeals([]);
      setSelectedCategoryId("");
      setSelectedMealId("");
      return;
    }

    const loadMeals = async () => {
      try {
        setLoadingMeals(true);
        const token = await getToken();
        const fetchedMeals = await deliverableQuantityService.getMealsForBranch(
          selectedBranchId,
          token || undefined
        );
        setAllMeals(fetchedMeals || []);

        // Reset selections
        setSelectedCategoryId("");
        setSelectedMealId("");
        setMealSizes([]);
        setSizeWeights({});
        setHasSizeWeightChanges(false);
      } catch (error) {
        console.error("Error loading meals:", error);
        setToast({
          visible: true,
          message: t("admin.deliverableQuantities.loadMealsError") || "Failed to load meals",
          type: "error",
        });
        setAllMeals([]);
      } finally {
        setLoadingMeals(false);
      }
    };
    loadMeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // Reset meal selection when category changes
  useEffect(() => {
    setSelectedMealId("");
    setMealSizes([]);
    setSizeWeights({});
    setHasSizeWeightChanges(false);
  }, [selectedCategoryId]);

  // Load meal sizes when meal changes
  useEffect(() => {
    if (!selectedBranchId || !selectedMealId) {
      setMealSizes([]);
      setSizeWeights({});
      setHasSizeWeightChanges(false);
      return;
    }

    const loadSizes = async () => {
      try {
        setLoadingSizes(true);
        const token = await getToken();
        const result = await deliverableQuantityService.getMealSizes(
          selectedBranchId,
          selectedMealId,
          token || undefined
        );

        setMealSizes(result.sizes || []);

        // Initialize local state with current weights
        const initialWeights: Record<string, string> = {};
        (result.sizes || []).forEach((size) => {
          initialWeights[size.id] = size.weight !== null ? String(size.weight) : "";
        });
        setSizeWeights(initialWeights);
        setHasSizeWeightChanges(false);
      } catch (error) {
        console.error("Error loading meal sizes:", error);
        setToast({
          visible: true,
          message: t("admin.deliverableQuantities.loadSizesError") || "Failed to load sizes",
          type: "error",
        });
        setMealSizes([]);
      } finally {
        setLoadingSizes(false);
      }
    };
    loadSizes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedMealId]);

  // Load daily deliverable data
  const loadDailyData = useCallback(async () => {
    if (!selectedBranchId || !selectedMealId) {
      setDailyDeliverable(null);
      setAvailableWeight(null);
      setDailyLimitInput("");
      return;
    }

    try {
      setLoadingDaily(true);
      const token = await getToken();

      const [daily, available] = await Promise.all([
        deliverableQuantityService.getDailyDeliverable(
          selectedBranchId,
          selectedMealId,
          token || undefined
        ),
        deliverableQuantityService.getAvailableWeight(
          selectedBranchId,
          selectedMealId,
          token || undefined
        ),
      ]);

      setDailyDeliverable(daily);
      setAvailableWeight(available);
      setDailyLimitInput(daily?.dailyDeliverableWeight?.toString() || "");
    } catch (error) {
      console.error("Error loading daily data:", error);
    } finally {
      setLoadingDaily(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedMealId]);

  useEffect(() => {
    loadDailyData();
  }, [loadDailyData]);

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDailyData();
    setRefreshing(false);
  };

  // Handle size weight change
  const handleSizeWeightChange = (sizeId: string, value: string) => {
    // Allow only numbers and decimal point
    const cleaned = value.replace(/[^0-9.]/g, "");
    setSizeWeights((prev) => ({ ...prev, [sizeId]: cleaned }));
    setHasSizeWeightChanges(true);
  };

  // Save size weights
  const handleSaveSizeWeights = async () => {
    if (!selectedBranchId || !selectedMealId) return;
    if (!canManageDeliverableQuantities) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }

    try {
      setSavingSizeWeights(true);
      const token = await getToken();

      for (const size of mealSizes) {
        const weightValue = sizeWeights[size.id];
        if (weightValue && weightValue !== "") {
          const weight = parseFloat(weightValue);
          if (!isNaN(weight) && weight > 0) {
            await deliverableQuantityService.upsertSizeWeight(
              {
                branchId: selectedBranchId,
                mealId: selectedMealId,
                mealSizeId: size.id,
                weight,
              },
              token || undefined
            );
          }
        }
      }

      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.saved") || "Saved successfully",
        type: "success",
      });
      setHasSizeWeightChanges(false);
    } catch (error) {
      console.error("Error saving size weights:", error);
      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.saveError") || "Failed to save",
        type: "error",
      });
    } finally {
      setSavingSizeWeights(false);
    }
  };

  // Save daily limit
  const handleSaveDailyLimit = async () => {
    if (!selectedBranchId || !selectedMealId) return;
    if (!canManageDeliverableQuantities) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }

    const limitValue = parseFloat(dailyLimitInput);
    if (isNaN(limitValue) || limitValue <= 0) {
      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.invalidLimit") || "Please enter a valid limit",
        type: "error",
      });
      return;
    }

    try {
      setSavingDailyLimit(true);
      const token = await getToken();

      await deliverableQuantityService.upsertDailyDeliverable(
        {
          branchId: selectedBranchId,
          mealId: selectedMealId,
          dailyDeliverableWeight: limitValue,
        },
        token || undefined
      );

      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.saved") || "Saved successfully",
        type: "success",
      });
      await loadDailyData();
    } catch (error) {
      console.error("Error saving daily limit:", error);
      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.saveError") || "Failed to save",
        type: "error",
      });
    } finally {
      setSavingDailyLimit(false);
    }
  };

  // Delete daily limit
  const handleDeleteDailyLimit = async () => {
    if (!selectedBranchId || !selectedMealId || !dailyDeliverable) return;
    if (!canManageDeliverableQuantities) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }

    try {
      setDeletingDailyLimit(true);
      const token = await getToken();

      await deliverableQuantityService.deleteDailyDeliverable(
        selectedBranchId,
        selectedMealId,
        token || undefined
      );

      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.deleted") || "Limit removed",
        type: "success",
      });
      setDailyDeliverable(null);
      setDailyLimitInput("");
      await loadDailyData();
    } catch (error) {
      console.error("Error deleting daily limit:", error);
      setToast({
        visible: true,
        message: t("admin.deliverableQuantities.deleteError") || "Failed to remove limit",
        type: "error",
      });
    } finally {
      setDeletingDailyLimit(false);
    }
  };

  // Render picker modal
  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    items: { id: string; name: string | null | undefined }[],
    selectedId: string,
    onSelect: (id: string) => void
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.modalItem, selectedId === item.id && styles.modalItemSelected]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <Text
                  style={[styles.modalItemText, selectedId === item.id && styles.modalItemTextSelected]}
                >
                  {item.name || "Unnamed"}
                </Text>
                {selectedId === item.id && (
                  <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                )}
              </TouchableOpacity>
            ))}
            {items.length === 0 && (
              <Text style={styles.emptyText}>
                {t("admin.deliverableQuantities.noItems") || "No items available"}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1, paddingTop: headerHeight }}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        {/* Branch Selector */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="map-marker" size={18} color="#ec4899" />
            <Text style={styles.cardTitle}>
              {t("admin.deliverableQuantities.selectBranch") || "Select Branch"}
            </Text>
          </View>
          <View style={styles.cardBody}>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowBranchPicker(true)}
            >
              <Text style={selectedBranch ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedBranch?.name || t("admin.deliverableQuantities.selectBranch") || "Select Branch"}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Selector */}
        {selectedBranchId && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="view-grid" size={18} color="#ec4899" />
              <Text style={styles.cardTitle}>
                {t("admin.deliverableQuantities.selectCategory") || "Select Category"}
              </Text>
            </View>
            <View style={styles.cardBody}>
              {loadingMeals ? (
                <ActivityIndicator size="small" color="#ec4899" />
              ) : (
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowCategoryPicker(true)}
                  disabled={categories.length === 0}
                >
                  <Text style={selectedCategory ? styles.pickerText : styles.pickerPlaceholder}>
                    {selectedCategory?.name ||
                      t("admin.deliverableQuantities.selectCategory") ||
                      "Select Category"}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Meal Selector */}
        {selectedCategoryId && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#ec4899" />
              <Text style={styles.cardTitle}>
                {t("admin.deliverableQuantities.selectMeal") || "Select Meal"}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowMealPicker(true)}
                disabled={filteredMeals.length === 0}
              >
                <Text style={selectedMeal ? styles.pickerText : styles.pickerPlaceholder}>
                  {selectedMeal?.name || t("admin.deliverableQuantities.selectMeal") || "Select Meal"}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Size Weights Configuration */}
        {selectedMealId && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="scale" size={18} color="#ec4899" />
              <Text style={styles.cardTitle}>
                {t("admin.deliverableQuantities.sizeWeights") || "Size Weights"}
              </Text>
            </View>
            <Text style={styles.cardDescription}>
              {t("admin.deliverableQuantities.sizeWeightsDesc") || "Configure weight (kg) per size"}
            </Text>
            <View style={styles.cardBody}>
              {loadingSizes ? (
                <ActivityIndicator size="small" color="#ec4899" />
              ) : mealSizes.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("admin.deliverableQuantities.noSizes") || "No sizes configured for this meal"}
                </Text>
              ) : (
                <>
                  {mealSizes.map((size) => (
                    <View key={size.id} style={styles.sizeRow}>
                      <View style={styles.sizeInfo}>
                        <Text style={styles.sizeName}>{size.name}</Text>
                        <Text style={styles.sizeType}>{size.sizeType}</Text>
                      </View>
                      <View style={styles.sizeInputContainer}>
                        <TextInput
                          style={styles.sizeInput}
                          value={sizeWeights[size.id] || ""}
                          onChangeText={(value) => handleSizeWeightChange(size.id, value)}
                          placeholder="0.00"
                          placeholderTextColor="#6B7280"
                          keyboardType="decimal-pad"
                          editable={canManageDeliverableQuantities}
                        />
                        <Text style={styles.sizeUnit}>kg</Text>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      (!canManageDeliverableQuantities || !hasSizeWeightChanges || savingSizeWeights) && styles.saveButtonDisabled,
                    ]}
                    onPress={handleSaveSizeWeights}
                    disabled={!canManageDeliverableQuantities || !hasSizeWeightChanges || savingSizeWeights}
                  >
                    {savingSizeWeights ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        <Text style={styles.saveButtonText}>
                          {t("admin.deliverableQuantities.saveWeights") || "Save Weights"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* Daily Limit Configuration */}
        {selectedMealId && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="clock" size={18} color="#ec4899" />
              <Text style={styles.cardTitle}>
                {t("admin.deliverableQuantities.dailyLimit") || "Daily Limit"}
              </Text>
            </View>
            <Text style={styles.cardDescription}>
              {t("admin.deliverableQuantities.dailyLimitDesc") || "Maximum deliverable weight per day"}
            </Text>
            <View style={styles.cardBody}>
              {loadingDaily ? (
                <ActivityIndicator size="small" color="#ec4899" />
              ) : (
                <>
                  <View style={styles.dailyLimitRow}>
                    <TextInput
                      style={styles.dailyLimitInput}
                      value={dailyLimitInput}
                      onChangeText={setDailyLimitInput}
                      placeholder="0.00"
                      placeholderTextColor="#6B7280"
                      keyboardType="decimal-pad"
                      editable={canManageDeliverableQuantities}
                    />
                    <Text style={styles.dailyLimitUnit}>kg</Text>
                  </View>
                  <View style={styles.dailyLimitActions}>
                    <TouchableOpacity
                      style={[styles.saveButton, savingDailyLimit && styles.saveButtonDisabled]}
                      onPress={handleSaveDailyLimit}
                      disabled={!canManageDeliverableQuantities || savingDailyLimit || !dailyLimitInput}
                    >
                      {savingDailyLimit ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                          <Text style={styles.saveButtonText}>
                            {t("admin.deliverableQuantities.saveLimit") || "Save Limit"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {dailyDeliverable && (
                      <TouchableOpacity
                        style={[styles.deleteButton, deletingDailyLimit && styles.deleteButtonDisabled]}
                        onPress={handleDeleteDailyLimit}
                        disabled={!canManageDeliverableQuantities || deletingDailyLimit}
                      >
                        {deletingDailyLimit ? (
                          <ActivityIndicator size="small" color="#F87171" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="delete" size={16} color="#F87171" />
                            <Text style={styles.deleteButtonText}>
                              {t("admin.deliverableQuantities.removeLimit") || "Remove"}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Today's Status */}
        {selectedMealId && availableWeight && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="chart-bar" size={18} color="#ec4899" />
              <Text style={styles.cardTitle}>
                {t("admin.deliverableQuantities.todayStatus") || "Today's Status"}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.statusGrid}>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>
                    {t("admin.deliverableQuantities.dailyLimit") || "Daily Limit"}
                  </Text>
                  <Text style={styles.statusValue}>
                    {availableWeight.dailyDeliverableWeight !== null
                      ? `${availableWeight.dailyDeliverableWeight.toFixed(2)} kg`
                      : t("admin.deliverableQuantities.noLimit") || "No limit"}
                  </Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>
                    {t("admin.deliverableQuantities.consumed") || "Consumed"}
                  </Text>
                  <Text style={[styles.statusValue, styles.consumedValue]}>
                    {availableWeight.consumedWeight !== null
                      ? `${availableWeight.consumedWeight.toFixed(2)} kg`
                      : "0.00 kg"}
                  </Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>
                    {t("admin.deliverableQuantities.available") || "Available"}
                  </Text>
                  <Text
                    style={[
                      styles.statusValue,
                      styles.availableValue,
                      availableWeight.availableWeight !== null &&
                        availableWeight.availableWeight <= 0 &&
                        styles.exhaustedValue,
                    ]}
                  >
                    {availableWeight.availableWeight !== null
                      ? `${availableWeight.availableWeight.toFixed(2)} kg`
                      : t("admin.deliverableQuantities.unlimited") || "Unlimited"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Picker Modals */}
      {renderPickerModal(
        showBranchPicker,
        () => setShowBranchPicker(false),
        t("admin.deliverableQuantities.selectBranch") || "Select Branch",
        branches.map((b) => ({ id: b.id, name: b.name })),
        selectedBranchId,
        setSelectedBranchId
      )}
      {renderPickerModal(
        showCategoryPicker,
        () => setShowCategoryPicker(false),
        t("admin.deliverableQuantities.selectCategory") || "Select Category",
        categories,
        selectedCategoryId,
        setSelectedCategoryId
      )}
      {renderPickerModal(
        showMealPicker,
        () => setShowMealPicker(false),
        t("admin.deliverableQuantities.selectMeal") || "Select Meal",
        filteredMeals,
        selectedMealId,
        setSelectedMealId
      )}

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={headerHeight + 16}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  cardDescription: {
    color: "#9CA3AF",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cardBody: {
    padding: 16,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
  },
  pickerText: {
    color: "#fff",
    fontSize: 14,
  },
  pickerPlaceholder: {
    color: "#6B7280",
    fontSize: 14,
  },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sizeInfo: {
    flex: 1,
  },
  sizeName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  sizeType: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  sizeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sizeInput: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 10,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    width: 80,
    textAlign: "right",
  },
  sizeUnit: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  dailyLimitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  dailyLimitInput: {
    flex: 1,
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    fontSize: 16,
  },
  dailyLimitUnit: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
  },
  dailyLimitActions: {
    flexDirection: "row",
    gap: 12,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: "#4B5563",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F87171",
    marginTop: 16,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: "#F87171",
    fontWeight: "600",
    fontSize: 14,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statusItem: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  statusLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  consumedValue: {
    color: "#FBBF24",
  },
  availableValue: {
    color: "#34D399",
  },
  exhaustedValue: {
    color: "#F87171",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    paddingVertical: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  modalItemText: {
    color: "#D1D5DB",
    fontSize: 16,
  },
  modalItemTextSelected: {
    color: "#ec4899",
    fontWeight: "600",
  },
});

