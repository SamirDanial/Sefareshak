import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useScroll } from "@/src/contexts/ScrollContext";
import ApiService from "@/src/services/apiService";
import { useBranch } from "@/src/contexts/BranchContext";
import { useCartStore, type OptionalIngredient } from "@/src/store/cartStore";
import { formatPrice, fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import { useGlobalToast } from "@/src/contexts/GlobalToastContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/800x800?text=Deals";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

const getDealBaseTotal = (deal: any): number => {
  const components = Array.isArray(deal?.components) ? deal.components : [];
  return components.reduce((sum: number, c: any) => {
    const v = c?.effectivePrice ?? c?.price;
    const n = typeof v === "number" ? v : parseFloat(String(v || 0));
    const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
    const qty = Number.isFinite(q) && q > 0 ? q : 1;
    return sum + (isNaN(n) ? 0 : n) * qty;
  }, 0);
};

export default function DealCustomizationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const { branch, visibleBranches } = useBranch();
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const { id, edit, cartItemId } = useLocalSearchParams<{
    id: string;
    edit?: string;
    cartItemId?: string;
  }>();

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  const dealId = id;
  const isEditMode = edit === "1";

  const apiService = ApiService.getInstance();
  const { showToast } = useGlobalToast();

  const { addItem, replaceItem, getItemById, getTotalItems } = useCartStore();
  const totalItems = getTotalItems();

  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [settings, setSettings] = useState<{ allowExcludeOptionalIngredients?: boolean } | null>(null);

  const [selectedAddOns, setSelectedAddOns] = useState<
    Array<{ id: string; name: string; price: number; quantity: number }>
  >([]);
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] = useState<OptionalIngredient[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

  const [showAddOnsModal, setShowAddOnsModal] = useState(false);
  const [showOptionalIngredientsModal, setShowOptionalIngredientsModal] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);

  // Ensure header is visible when arriving on this screen
  useFocusEffect(
    React.useCallback(() => {
      setScrollPosition(0);
      setScrollDirection("up");
      lastScrollY.current = 0;
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
    }, [setScrollDirection, setScrollPosition])
  );

  const loadSettings = async () => {
    try {
      const s = await fetchPublicSettings();
      setCurrency(s.currency);

      try {
        const res = await apiService.getPublicSettings();
        setSettings(res?.data || res);
      } catch {
        setSettings(null);
      }
    } catch {
    }
  };

  const fetchDeal = async () => {
    if (!dealId) return;

    try {
      setLoading(true);
      const res = await apiService.getDeal(dealId, branch?.id);
      if (res?.success) {
        const d = res.data;
        setDeal(d);

        const optionalIngredients: OptionalIngredient[] =
          d?.dealOptionalIngredients?.map((doi: any) => ({
            id: doi.optionalIngredient.id,
            name: doi.optionalIngredient.name,
            isIncluded: false,
          })) || [];

        if (isEditMode && cartItemId) {
          const existing = getItemById(cartItemId);
          if (existing) {
            setSelectedAddOns((existing.addOns || []).map((a) => ({ ...a })) as any);
            setSelectedOptionalIngredients(existing.optionalIngredients || optionalIngredients);
            setSpecialInstructions(existing.specialInstructions || "");
            setQuantity(existing.quantity || 1);
          } else {
            setSelectedOptionalIngredients(optionalIngredients);
          }
        } else {
          setSelectedOptionalIngredients(optionalIngredients);
        }
      } else {
        showToast(t("mealCustomization.fetchError"), "error");
      }
    } catch (e: any) {
      showToast(e?.message || t("mealCustomization.errorOccurred"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    AsyncStorage.setItem("dealDetails:previousRoute", "/deal-category" ).catch(() => {});
    loadSettings();
    fetchDeal();
  }, []);

  useEffect(() => {
    fetchDeal();
  }, [branch?.id, dealId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadSettings(), fetchDeal()]);
    } finally {
      setRefreshing(false);
    }
  };

  const totalPrice = useMemo(() => {
    if (!deal) return 0;
    const base = getDealBaseTotal(deal);
    const addOnsTotal = selectedAddOns.reduce((sum, addOn) => {
      const q = addOn.quantity || 1;
      return sum + (addOn.price || 0) * q;
    }, 0);
    return (base + addOnsTotal) * quantity;
  }, [deal, selectedAddOns, quantity]);

  const toggleOptionalIngredient = (ingredientId: string) => {
    const canExclude = settings?.allowExcludeOptionalIngredients ?? true;
    if (!canExclude) return;

    setSelectedOptionalIngredients((prev) =>
      prev.map((ing) =>
        ing.id === ingredientId ? { ...ing, isIncluded: !ing.isIncluded } : ing
      )
    );
  };

  const getAddOnUnitPrice = (addOn: any): number => {
    const v = addOn?.effectiveBasePrice ?? addOn?.price;
    const p = typeof v === "number" ? v : parseFloat(String(v || 0));
    return isNaN(p) ? 0 : p;
  };

  const handleAddOnToggle = (addOn: any) => {
    const p = getAddOnUnitPrice(addOn);

    setSelectedAddOns((prev) => {
      const existing = prev.find((a) => a.id === addOn.id);
      if (existing) {
        return prev.filter((a) => a.id !== addOn.id);
      }
      return [...prev, { id: addOn.id, name: addOn.name, price: p, quantity: 1 }];
    });
  };

  const handleAddOnQuantityChange = (addOn: any, newQuantity: number) => {
    if (newQuantity < 0) return;

    const p = getAddOnUnitPrice(addOn);

    setSelectedAddOns((prev) => {
      if (newQuantity === 0) return prev.filter((a) => a.id !== addOn.id);
      const idx = prev.findIndex((a) => a.id === addOn.id);
      const next = { id: addOn.id, name: addOn.name, price: p, quantity: newQuantity };
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = next;
        return updated;
      }
      return [...prev, next];
    });
  };

  const handleAddToCart = async (isEditing = false) => {
    if (!deal) return;

    const itemId = isEditing ? (cartItemId as string) : `${deal.id}-${Date.now()}`;

    const base = getDealBaseTotal(deal);
    const addOnsTotal = selectedAddOns.reduce((sum, a) => sum + (a.price || 0) * (a.quantity || 1), 0);
    const unitPrice = base + addOnsTotal;

    const cartItem = {
      id: itemId,
      itemType: "DEAL" as const,
      dealId: deal.id,
      mealName: deal.name,
      mealImage: getImageUrl(deal.image),
      sizeId: "",
      sizeName: "",
      quantity,
      basePrice: base,
      sizePrice: 0,
      dealComponents: (Array.isArray(deal?.components) ? deal.components : []).map((c: any) => {
        const v = c?.effectivePrice ?? c?.price;
        const unitPrice = typeof v === "number" ? v : parseFloat(String(v || 0));
        const taxV = c?.effectiveTaxPercentage ?? c?.taxPercentage;
        const taxPct = typeof taxV === "number" ? taxV : parseFloat(String(taxV || 0));
        const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
        const qty = Number.isFinite(q) && q > 0 ? q : 1;
        return {
          id: c?.id,
          name: c?.name,
          price: isNaN(unitPrice) ? 0 : unitPrice,
          taxPercentage: isNaN(taxPct) ? 0 : taxPct,
          quantity: qty,
        };
      }),
      addOns: selectedAddOns.map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        quantity: a.quantity || 1,
      })),
      optionalIngredients: selectedOptionalIngredients,
      specialInstructions,
      totalPrice: unitPrice * quantity,
    };

    if (isEditing) {
      replaceItem(itemId, cartItem as any);
      showToast(t("mealCustomization.cartUpdated"), "success");
      router.back();
      return;
    }

    addItem(cartItem as any);
    showToast(t("mealCustomization.addedToCart"), "success");
    router.push("/cart");
  };

  if (isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("mealCustomization.loadingTitle")}
          onBackPress={() => router.back()}
        />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={organizationAppStatus as any} />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("mealCustomization.loadingTitle")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.mutedText}>{t("mealCustomization.loadingDescription")}</Text>
        </View>
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("mealCustomization.loadingTitle")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <Text style={styles.mutedText}>{t("mealCustomization.notFound")}</Text>
        </View>
      </View>
    );
  }

  const dealAddOns = Array.isArray(deal?.dealAddOns) ? deal.dealAddOns.map((da: any) => da.addOn).filter(Boolean) : [];

  const visibleAddOns = dealAddOns.slice(0, 4);
  const visibleOptionalIngredients = selectedOptionalIngredients.slice(0, 4);

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={deal.name}
        onBackPress={() => router.back()}
        rightContent={
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => router.push("/cart")}
          >
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollContent, { paddingTop: headerHeight }]}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const currentScrollY = event.nativeEvent.contentOffset.y;
          setScrollPosition(currentScrollY);

          if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
            setScrollDirection("down");
          } else if (currentScrollY < lastScrollY.current) {
            setScrollDirection("up");
          }

          lastScrollY.current = currentScrollY;
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        <View style={styles.imageContainer}>
          <Image source={{ uri: getImageUrl(deal.image) }} style={styles.mealImage} />
          <View style={styles.imageOverlay}>
            {!!deal.description && (
              <Text style={styles.description}>{deal.description}</Text>
            )}
          </View>
        </View>

        <View style={styles.innerContent}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>{t("mealCustomization.declarations")}</Text>
            </View>
            <View style={styles.sectionCardSimple}>
              {(deal.components || []).map((c: any) => (
                <View key={c.id} style={styles.componentRow}>
                  <Text style={styles.componentName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.componentQty}>{`x${c.quantity || 1}`}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>{t("mealCustomization.addExtras")}</Text>
              <TouchableOpacity
                onPress={() => setShowAddOnsModal(true)}
                style={styles.showMoreButtonHeader}
                disabled={dealAddOns.length === 0}
              >
                <Text style={styles.showMoreText}>{t("mealCustomization.showMore")}</Text>
                <MaterialIcons name="chevron-right" size={20} color="#ec4899" />
              </TouchableOpacity>
            </View>

            <View style={styles.addOnsList}>
              {visibleAddOns.map((addOn: any) => {
              const selected = selectedAddOns.find((a) => a.id === addOn.id);
              const isSelected = Boolean(selected);
              const type = String(addOn?.type || "BOOLEAN").toUpperCase();
              const isQuantity = type === "QUANTITY";
              const currentQty = selected?.quantity || 0;
              const unitPrice = getAddOnUnitPrice(addOn);

              return (
                <View
                  key={addOn.id}
                  style={[styles.addOnCard, isSelected && styles.addOnCardActive]}
                >
                  <View style={styles.addOnContent}>
                    <View style={styles.addOnInfo}>
                      <Text style={styles.addOnName}>{addOn.name}</Text>
                      {!!addOn.description && (
                        <Text style={styles.addOnDescription}>{addOn.description}</Text>
                      )}
                      <Text style={styles.addOnPrice}>{formatPrice(unitPrice, currency)}</Text>
                    </View>

                    <View style={styles.addOnControls}>
                      {isQuantity ? (
                        currentQty === 0 ? (
                          <TouchableOpacity
                            onPress={() => handleAddOnQuantityChange(addOn, 1)}
                            style={styles.addButton}
                          >
                            <Text style={styles.addButtonText}>{t("mealCustomization.add")}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.quantityControls}>
                            <TouchableOpacity
                              onPress={() =>
                                handleAddOnQuantityChange(addOn, Math.max(0, currentQty - 1))
                              }
                              disabled={currentQty <= 0}
                              style={[
                                styles.quantityButton,
                                currentQty <= 0 && styles.quantityButtonDisabled,
                              ]}
                            >
                              <Text style={styles.quantityButtonText}>-</Text>
                            </TouchableOpacity>
                            <View style={{ marginHorizontal: 6 }}>
                              <Text style={styles.quantityValue}>{currentQty}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleAddOnQuantityChange(addOn, currentQty + 1)}
                              style={styles.quantityButton}
                            >
                              <Text style={styles.quantityButtonText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleAddOnToggle(addOn)}
                          style={[styles.checkbox, isSelected && styles.checkboxActive]}
                        >
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>{t("mealCustomization.optionalIngredients")}</Text>
              <TouchableOpacity
                onPress={() => setShowOptionalIngredientsModal(true)}
                style={styles.showMoreButtonHeader}
                disabled={selectedOptionalIngredients.length === 0}
              >
                <Text style={styles.showMoreText}>{t("mealCustomization.showMore")}</Text>
                <MaterialIcons name="chevron-right" size={20} color="#ec4899" />
              </TouchableOpacity>
            </View>

            <View style={styles.addOnsList}>
              {visibleOptionalIngredients.map((ing) => (
                <View
                  key={ing.id}
                  style={[styles.addOnCard, ing.isIncluded && styles.addOnCardActive]}
                >
                  <View style={styles.addOnContent}>
                    <View style={styles.addOnInfo}>
                      <Text style={styles.addOnName}>{ing.name}</Text>
                    </View>
                    <View style={styles.addOnControls}>
                      <TouchableOpacity
                        onPress={() => toggleOptionalIngredient(ing.id)}
                        disabled={(settings?.allowExcludeOptionalIngredients ?? true) === false}
                        style={[
                          styles.checkbox,
                          ing.isIncluded && styles.checkboxActive,
                          (settings?.allowExcludeOptionalIngredients ?? true) === false &&
                            styles.checkboxDisabled,
                        ]}
                      >
                        {ing.isIncluded && <Text style={styles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>{t("mealCustomization.specialInstructions")}</Text>
            </View>
            <TextInput
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              placeholder={t("mealCustomization.specialInstructionsPlaceholder")}
              placeholderTextColor="#666"
              style={styles.textInput}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>{t("mealCustomization.quantity")}</Text>
            </View>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                style={styles.quantityButtonMain}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <View style={styles.quantityDisplay}>
                <Text style={styles.quantityText}>{quantity}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setQuantity(quantity + 1)}
                style={styles.quantityButtonMain}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.bottomSpacing} />
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: 30 + insets.bottom }]}>
        <View style={styles.actionBarContent}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>{t("mealCustomization.total")}</Text>
            <Text style={styles.totalPrice}>{formatPrice(totalPrice, currency)}</Text>
          </View>

          <TouchableOpacity style={styles.addToCartButton} onPress={() => handleAddToCart()}>
            <Text style={styles.addToCartText}>{t("mealCustomization.addToCart")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showAddOnsModal} transparent animationType="slide" onRequestClose={() => setShowAddOnsModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddOnsModal(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={styles.bottomSheetTitle}>
                  {t("mealCustomization.addExtras")}
                </Text>
                {selectedAddOns.length > 0 && (
                  <Text style={styles.bottomSheetSubtitle}>
                    {selectedAddOns.length} {t("mealCustomization.selected")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowAddOnsModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={styles.bottomSheetBodyContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.addOnsModalList}>
                {dealAddOns.length > 0 ? (
                  dealAddOns.map((addOn: any) => {
                    const type = String(addOn?.type || "BOOLEAN").toUpperCase();
                    const isBoolean = type === "BOOLEAN";
                    const isQuantity = type === "QUANTITY";
                    const selected = selectedAddOns.find((a) => a.id === addOn.id);
                    const isSelected = Boolean(selected);
                    const addOnQuantity = selected?.quantity || 0;
                    const unitPrice = getAddOnUnitPrice(addOn);

                    return (
                      <View
                        key={addOn.id}
                        style={[
                          styles.addOnCardModal,
                          isSelected && styles.addOnCardModalActive,
                        ]}
                      >
                        {addOn.image && (
                          <View style={styles.addOnImageContainerModal}>
                            <Image
                              source={{ uri: getImageUrl(addOn.image) }}
                              style={styles.addOnImageModal}
                            />
                          </View>
                        )}
                        <View style={styles.addOnContentModal}>
                          <View style={styles.addOnInfoModal}>
                            <Text style={styles.addOnNameModal}>{addOn.name}</Text>
                            {!!addOn.description && (
                              <Text style={styles.addOnDescriptionModal}>
                                {addOn.description}
                              </Text>
                            )}
                            <Text style={styles.addOnPriceModal}>
                              {formatPrice(unitPrice, currency)}
                            </Text>
                          </View>

                          <View style={styles.addOnControlsModal}>
                            {isBoolean && (
                              <TouchableOpacity
                                onPress={() => handleAddOnToggle(addOn)}
                                style={[
                                  styles.checkboxModal,
                                  isSelected && styles.checkboxModalActive,
                                ]}
                              >
                                {isSelected && (
                                  <Text style={styles.checkmarkModal}>✓</Text>
                                )}
                              </TouchableOpacity>
                            )}

                            {isQuantity && (
                              <>
                                {addOnQuantity === 0 ? (
                                  <TouchableOpacity
                                    onPress={() => handleAddOnQuantityChange(addOn, 1)}
                                    style={styles.addButtonModal}
                                  >
                                    <Text style={styles.addButtonTextModal}>
                                      {t("mealCustomization.add")}
                                    </Text>
                                  </TouchableOpacity>
                                ) : (
                                  <View style={styles.quantityControlsModal}>
                                    <TouchableOpacity
                                      onPress={() =>
                                        handleAddOnQuantityChange(
                                          addOn,
                                          Math.max(0, addOnQuantity - 1)
                                        )
                                      }
                                      disabled={addOnQuantity <= 0}
                                      style={[
                                        styles.quantityButtonModal,
                                        addOnQuantity <= 0 &&
                                          styles.quantityButtonModalDisabled,
                                      ]}
                                    >
                                      <Text style={styles.quantityButtonTextModal}>-</Text>
                                    </TouchableOpacity>
                                    <View style={{ marginHorizontal: 10 }}>
                                      <Text style={styles.quantityValueModal}>
                                        {addOnQuantity}
                                      </Text>
                                    </View>
                                    <TouchableOpacity
                                      onPress={() =>
                                        handleAddOnQuantityChange(addOn, addOnQuantity + 1)
                                      }
                                      style={styles.quantityButtonModal}
                                    >
                                      <Text style={styles.quantityButtonTextModal}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#999", fontSize: 14 }}>
                      {t("mealCustomization.noAddons")}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowAddOnsModal(false)}
              >
                <Text style={styles.modalDoneButtonText}>
                  {t("mealCustomization.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOptionalIngredientsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionalIngredientsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowOptionalIngredientsModal(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={styles.bottomSheetTitle}>
                  {(settings?.allowExcludeOptionalIngredients ?? true) !== false
                    ? t("mealCustomization.optionalIngredients")
                    : t("mealCustomization.requiredIngredients")}
                </Text>
                {(settings?.allowExcludeOptionalIngredients ?? true) !== false && (
                  <Text style={styles.bottomSheetSubtitle}>
                    {selectedOptionalIngredients.filter((i) => i.isIncluded).length} {t("mealCustomization.included")} / {selectedOptionalIngredients.filter((i) => !i.isIncluded).length} {t("mealCustomization.excluded")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowOptionalIngredientsModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={styles.bottomSheetBodyContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.addOnsModalList}>
                {selectedOptionalIngredients.length > 0 ? (
                  selectedOptionalIngredients.map((ing) => (
                    <View
                      key={ing.id}
                      style={[
                        styles.addOnCardModal,
                        ing.isIncluded && styles.addOnCardModalActive,
                      ]}
                    >
                      <View style={styles.addOnContentModal}>
                        <View style={styles.addOnInfoModal}>
                          <Text style={styles.addOnNameModal}>{ing.name}</Text>
                        </View>

                        <View style={styles.addOnControlsModal}>
                          <TouchableOpacity
                            onPress={() => toggleOptionalIngredient(ing.id)}
                            disabled={(settings?.allowExcludeOptionalIngredients ?? true) === false}
                            style={[
                              styles.checkboxModal,
                              ing.isIncluded && styles.checkboxModalActive,
                              (settings?.allowExcludeOptionalIngredients ?? true) === false &&
                                styles.checkboxModalDisabled,
                            ]}
                          >
                            {ing.isIncluded && (
                              <Text style={styles.checkmarkModal}>✓</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#999", fontSize: 14 }}>
                      {t("mealCustomization.noOptionalIngredients")}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowOptionalIngredientsModal(false)}
              >
                <Text style={styles.modalDoneButtonText}>
                  {t("mealCustomization.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#151718" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  mutedText: { color: "#9CA3AF", textAlign: "center", marginTop: 12 },

  cartButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#fff",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#ec4899",
  },

  scrollContent: { flex: 1, backgroundColor: "#151718" },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  innerContent: {
    padding: 16,
  },
  imageContainer: {
    width: "100%",
    height: 250,
    position: "relative",
  },
  mealImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  description: {
    color: "#ec4899",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
  },

  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIndicator: {
    width: 30,
    height: 3,
    backgroundColor: "#ec4899",
    borderRadius: 2,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
  },
  showMoreButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },

  sectionCardSimple: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#262626",
    padding: 14,
    gap: 8,
  },
  componentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  componentName: { color: "#e5e7eb", fontSize: 14, flex: 1, paddingRight: 12 },
  componentQty: { color: "#9CA3AF", fontSize: 13 },
  addOnsList: {
    gap: 6,
  },
  addOnCard: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    overflow: "hidden",
    padding: 8,
  },
  addOnCardActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  addOnContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addOnInfo: {
    flex: 1,
  },
  addOnName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  addOnDescription: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  addOnPrice: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addOnControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkmark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  addButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    backgroundColor: "#333",
  },
  quantityValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ec4899",
    minWidth: 24,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
    minHeight: 80,
    textAlignVertical: "top",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  quantityButtonMain: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  quantityDisplay: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 2,
    borderColor: "#ec4899",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  quantityText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ec4899",
  },
  bottomSpacing: {
    height: 120,
  },

  actionBar: {
    backgroundColor: "#151718",
    borderTopWidth: 1,
    borderTopColor: "#333",
    padding: 16,
  },
  actionBarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  totalContainer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    color: "#999",
    marginBottom: 4,
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addToCartButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 150,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  // Modal Styles (match Meal Customization)
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheetContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "85%",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },
  bottomSheetHandleContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: "#ec4899",
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  bottomSheetBody: {
    flex: 1,
  },
  bottomSheetBodyContent: {
    padding: 16,
    paddingBottom: 16,
  },
  addOnsModalList: {
    paddingBottom: 4,
  },
  addOnCardModal: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    overflow: "hidden",
    padding: 10,
  },
  addOnCardModalActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  addOnImageContainerModal: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#333",
    marginRight: 12,
  },
  addOnImageModal: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  addOnContentModal: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addOnInfoModal: {
    flex: 1,
  },
  addOnNameModal: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  addOnDescriptionModal: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  addOnPriceModal: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addOnControlsModal: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxModal: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxModalActive: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  checkboxModalDisabled: {
    opacity: 0.5,
  },
  checkmarkModal: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  addButtonModal: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonTextModal: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  quantityControlsModal: {
    flexDirection: "row",
    alignItems: "center",
  },
  quantityButtonModal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonModalDisabled: {
    backgroundColor: "#333",
  },
  quantityButtonTextModal: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  quantityValueModal: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#ec4899",
    minWidth: 28,
    textAlign: "center",
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  modalDoneButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  modalDoneButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
