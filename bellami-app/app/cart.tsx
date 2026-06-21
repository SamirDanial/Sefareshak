import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useCartStore } from "@/src/store/cartStore";
import { useAuth } from "@clerk/clerk-expo";
import { formatPrice, fetchCurrency } from "@/src/utils/currency";
import { useBranch } from "@/src/contexts/BranchContext";
import { deliverableQuantityService, type CartValidationResult } from "@/src/services/deliverableQuantityService";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/200x200?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

export default function CartScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { items, updateItemQuantity, removeItem, getTotalPrice, clearCart } =
    useCartStore();
  const totalPrice = getTotalPrice();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const [currency, setCurrency] = useState<string>("USD");
  const { branch, branches } = useBranch();

  const selectedBranchFull = branches.find((b) => b.id === branch?.id) ?? null;
  const isBranchUrgentlyClosed = (selectedBranchFull as any)?.isUrgentlyClosed === true;
  const urgentCloseMessage: string | null = (selectedBranchFull as any)?.urgentCloseMessage ?? null;

  // Validation states
  const [validationResult, setValidationResult] = useState<CartValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [meals, setMeals] = useState<any[]>([]);

  // Check if validation has errors
  const hasValidationErrors = validationResult && !validationResult.valid;
  const isCheckoutBlocked = isBranchUrgentlyClosed || !!hasValidationErrors;

  useEffect(() => {
    fetchCurrency().then(setCurrency);
  }, []);

  // Fetch meals for size type lookup
  useEffect(() => {
    const fetchMeals = async () => {
      if (items.length === 0) {
        setMeals([]);
        return;
      }
      try {
        const apiService = ApiService.getInstance();
        const uniqueMealIds = [
          ...new Set(
            items
              .filter((item) => item.itemType !== "DEAL" && !!item.mealId)
              .map((item) => item.mealId)
          ),
        ].filter(Boolean) as string[];
        const fetchedMeals = await Promise.all(
          uniqueMealIds.map(async (mealId) => {
            try {
              const meal = await apiService.getMealById(mealId, branch?.id);
              return meal;
            } catch {
              return null;
            }
          })
        );
        setMeals(fetchedMeals.filter((m) => m !== null));
      } catch (error) {
        console.error("Error fetching meals for validation:", error);
      }
    };
    fetchMeals();
  }, [items, branch?.id]);

  // Validate cart items against daily limits
  const validateCart = useCallback(async () => {
    if (!branch?.id || items.length === 0) {
      setValidationResult(null);
      return;
    }

    try {
      setValidating(true);
      
      // Build cart items for validation
      const itemsForValidation = items
        .filter((item) => item.itemType !== "DEAL" && !!item.mealId)
        .map((item) => {
        const mealId = item.mealId as string;
        const meal = meals.find((m) => m?.id === item.mealId);
        const mealSize = meal?.mealSizes?.find(
          (s: any) => s.name === item.sizeName || s.id === item.sizeId
        );
        return {
          mealId,
          mealSizeType: mealSize?.sizeType || null,
          quantity: item.quantity,
        };
      });

      if (itemsForValidation.length === 0) {
        setValidationResult(null);
        return;
      }

      const result = await deliverableQuantityService.validateCart(
        branch.id,
        itemsForValidation
      );
      setValidationResult(result);
    } catch (error) {
      console.error("Error validating cart:", error);
      // Don't block on validation error
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  }, [branch?.id, items, meals]);

  // Validate when items or meals change
  useEffect(() => {
    if (meals.length > 0 || items.length === 0) {
      validateCart();
    }
  }, [validateCart, meals.length, items]);

  const handleCheckout = () => {
    if (isSignedIn) {
      // Navigate to checkout page
      router.push("/checkout");
    } else {
      // Navigate to login page
      router.push("/(auth)/sign-in");
    }
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    // Determine scroll direction
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("cart.title")}
          onBackPress={() => router.back()}
        />

        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>{t("cart.empty")}</Text>
          <Text style={styles.emptySubtitle}>{t("cart.emptyDescription")}</Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.push("/(tabs)/menu")}
          >
            <Text style={styles.exploreButtonText}>
              {t("cart.continueShopping")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t("cart.title")}
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {items.map((item) => (
          <View key={item.id} style={styles.cartItem}>
            <Image
              source={{ uri: getImageUrl(item.mealImage) }}
              style={styles.itemImage}
            />
            <View style={styles.itemDetails}>
              <View style={styles.itemHeader}>
                <View style={styles.itemHeaderContent}>
                  <Text style={styles.itemName}>{item.mealName}</Text>
                  <Text style={styles.itemSize}>{item.sizeName}</Text>
                </View>
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        item.itemType === "DEAL"
                          ? `/deal/${item.dealId}?edit=1&cartItemId=${encodeURIComponent(item.id)}`
                          : `/meal/${item.mealId}?edit=1&cartItemId=${encodeURIComponent(item.id)}`
                      )
                    }
                    style={styles.editButton}
                  >
                    <MaterialIcons name="edit" size={18} color="#ec4899" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeItem(item.id)}
                    style={styles.removeButton}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={18}
                      color="#9BA1A6"
                    />
                  </TouchableOpacity>
                </View>
              </View>
              {item.addOns.length > 0 && (
                <Text style={styles.itemAddOns}>
                  {item.addOns.map((a) => a.name).join(", ")}
                </Text>
              )}
              {item.optionalIngredients &&
                item.optionalIngredients.length > 0 && (
                  <View style={styles.optionalIngredientsContainer}>
                    {(() => {
                      const included = item.optionalIngredients.filter(
                        (ing) => ing.isIncluded
                      );
                      const excluded = item.optionalIngredients.filter(
                        (ing) => !ing.isIncluded
                      );

                      return (
                        <>
                          {included.length > 0 && (
                            <Text style={styles.optionalIngredientText}>
                              <Text style={styles.optionalIngredientLabel}>
                                {t("mealCustomization.includedIngredients")}:{" "}
                              </Text>
                              <Text style={styles.optionalIngredientValue}>
                                {included.map((ing) => ing.name).join(", ")}
                              </Text>
                            </Text>
                          )}
                          {excluded.length > 0 && (
                            <Text style={styles.optionalIngredientText}>
                              <Text style={styles.optionalIngredientLabel}>
                                {t("mealCustomization.excludedIngredients")}:{" "}
                              </Text>
                              <Text style={styles.optionalIngredientValue}>
                                {excluded.map((ing) => ing.name).join(", ")}
                              </Text>
                            </Text>
                          )}
                        </>
                      );
                    })()}
                  </View>
                )}
              {item.specialInstructions && (
                <Text style={styles.itemInstructions} numberOfLines={1}>
                  {item.specialInstructions}
                </Text>
              )}
              <View style={styles.itemFooter}>
                <Text style={styles.itemPrice}>
                  {formatPrice(item.totalPrice / item.quantity, currency)} ×{" "}
                  {item.quantity}
                </Text>
                <View style={styles.quantityControls}>
                  <TouchableOpacity
                    onPress={() =>
                      updateItemQuantity(item.id, item.quantity - 1)
                    }
                    style={styles.quantityButton}
                  >
                    <Text style={styles.quantityButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.quantityValue}>{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateItemQuantity(item.id, item.quantity + 1)
                    }
                    style={styles.quantityButton}
                  >
                    <Text style={styles.quantityButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Checkout Bar */}
      <View style={styles.checkoutBar}>
        {/* Urgently Closed Warning Banner */}
        {isBranchUrgentlyClosed && (
          <View style={styles.urgentClosedBanner}>
            <MaterialIcons name="warning" size={18} color="#ef4444" />
            <View style={styles.urgentClosedContent}>
              <Text style={styles.urgentClosedTitle}>
                {t("cart.branchUrgentlyClosed") || "This branch is temporarily closed."}
              </Text>
              {urgentCloseMessage ? (
                <Text style={styles.urgentClosedMessage}>{urgentCloseMessage}</Text>
              ) : null}
            </View>
          </View>
        )}
        {/* Validation Warning Banner */}
        {hasValidationErrors && (
          <View style={styles.validationWarning}>
            <MaterialIcons name="warning" size={18} color="#f59e0b" />
            <View style={styles.validationWarningContent}>
              <Text style={styles.validationWarningTitle}>
                {t("cart.limitExceeded") || "Daily limit exceeded"}
              </Text>
              {validationResult?.errors.map((error, index) => (
                <Text key={index} style={styles.validationWarningText} numberOfLines={2}>
                  {error}
                </Text>
              ))}
            </View>
          </View>
        )}
        {validating && (
          <View style={styles.validatingBanner}>
            <ActivityIndicator size="small" color="#ec4899" />
            <Text style={styles.validatingText}>
              {t("cart.validating") || "Checking availability..."}
            </Text>
          </View>
        )}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>{t("cart.total")}</Text>
          <Text style={styles.totalPrice}>{formatPrice(totalPrice, currency)}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.checkoutButton,
            isCheckoutBlocked && styles.checkoutButtonDisabled,
          ]}
          onPress={handleCheckout}
          disabled={isCheckoutBlocked || validating}
        >
          <Text style={styles.checkoutButtonText}>
            {isBranchUrgentlyClosed
              ? t("cart.cannotCheckout") || "Cannot Checkout"
              : hasValidationErrors
              ? t("cart.cannotCheckout") || "Cannot Checkout"
              : isSignedIn
              ? t("cart.proceedToCheckout")
              : t("cart.signInToCheckout")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  backButtonIcon: {
    fontSize: 32,
    color: "#ec4899",
    fontWeight: "bold",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    paddingTop: 6,
    paddingHorizontal: 0,
  },
  headerRight: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#999",
    marginBottom: 32,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  exploreButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  exploreButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  cartItem: {
    backgroundColor: "#262626",
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    padding: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#333",
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
    justifyContent: "space-between",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  itemHeaderContent: {
    flex: 1,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  itemSize: {
    fontSize: 13,
    color: "#ccc",
    marginBottom: 4,
  },
  itemAddOns: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  optionalIngredientsContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  optionalIngredientText: {
    fontSize: 12,
    marginBottom: 2,
  },
  optionalIngredientLabel: {
    fontWeight: "600",
    color: "#ccc",
  },
  optionalIngredientValue: {
    color: "#999",
  },
  itemInstructions: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ec4899",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    minWidth: 24,
    textAlign: "center",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(154, 161, 166, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(154, 161, 166, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkoutBar: {
    backgroundColor: "#151718",
    borderTopWidth: 1,
    borderTopColor: "#333",
    padding: 16,
    paddingBottom: 30,
  },
  totalSection: {
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    color: "#999",
    marginBottom: 4,
  },
  totalPrice: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ec4899",
  },
  checkoutButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  checkoutButtonDisabled: {
    backgroundColor: "#666",
    opacity: 0.7,
  },
  checkoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  bottomSpacing: {
    height: 24,
  },
  urgentClosedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  urgentClosedContent: {
    flex: 1,
  },
  urgentClosedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fca5a5",
  },
  urgentClosedMessage: {
    fontSize: 12,
    color: "#fca5a5",
    marginTop: 3,
    lineHeight: 16,
    opacity: 0.85,
  },
  validationWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  validationWarningContent: {
    flex: 1,
  },
  validationWarningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f59e0b",
    marginBottom: 4,
  },
  validationWarningText: {
    fontSize: 12,
    color: "#d97706",
    marginBottom: 2,
  },
  validatingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  validatingText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});
