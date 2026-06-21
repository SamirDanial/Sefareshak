import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
} from "@/src/services/reservationService";
import { formatPrice, fetchCurrency } from "@/src/utils/currency";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

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

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatStatus = (status: ReservationStatus, t: any) => {
  const statusMap: Record<ReservationStatus, { label: string; color: string }> = {
    PENDING: { label: t("reservations.statuses.pending"), color: "#fbbf24" },
    CONFIRMED: { label: t("reservations.statuses.confirmed"), color: "#22c55e" },
    SEATED: { label: t("reservations.statuses.seated"), color: "#3b82f6" },
    COMPLETED: { label: t("reservations.statuses.completed"), color: "#6b7280" },
    CANCELLED: { label: t("reservations.statuses.cancelled"), color: "#ef4444" },
    NO_SHOW: { label: t("reservations.statuses.noshow"), color: "#ef4444" },
  };
  return statusMap[status] || { label: status, color: "#6b7280" };
};

export default function ReservationDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<string>("USD");

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

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

  useEffect(() => {
    fetchCurrency().then(setCurrency);
  }, []);

  useEffect(() => {
    const loadReservation = async () => {
      try {
        setLoading(true);
        const reservationId = params.id as string;
        const reservationData = params.data as string;

        if (reservationData) {
          // If full reservation data was passed, parse it
          try {
            const parsed = JSON.parse(decodeURIComponent(reservationData));
            setReservation(parsed);
            setLoading(false);
            return;
          } catch (e) {
            console.error("Failed to parse reservation data:", e);
          }
        }

        // Otherwise, fetch by ID
        if (reservationId) {
          const token = await getToken();
          if (!token) {
            showToast("Authentication required", "error");
            router.back();
            return;
          }

          // Fetch reservation details
          // Note: You may need to add a getReservationById method to reservationService
          // For now, we'll use the data passed via params
          const response = await reservationService.getUserReservations(1, 100, undefined, token);
          const found = response.data.reservations.find((r: Reservation) => r.id === reservationId);
          
          if (found) {
            setReservation(found);
          } else {
            showToast("Reservation not found", "error");
            router.back();
          }
        } else {
          showToast("Reservation ID is required", "error");
          router.back();
        }
      } catch (error: any) {
        console.error("Error loading reservation:", error);
        showToast("Failed to load reservation details", "error");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadReservation();
  }, [params.id, params.data]);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ visible: true, message, type });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.details.title") || "Reservation Details"}
          onBackPress={() => router.back()}
        />
        <View style={[styles.content, { paddingTop: headerHeight }]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("reservations.myReservations.loading") || "Loading..."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.details.title") || "Reservation Details"}
          onBackPress={() => router.back()}
        />
        <View style={[styles.content, { paddingTop: headerHeight }]}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="alert" size={64} color="#6b7280" />
            <Text style={styles.emptyStateTitle}>
              {t("reservations.myReservations.details.notFound") || "Reservation Not Found"}
            </Text>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>
                {t("reservations.myReservations.back") || "Back"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const itemTaxAmount = (reservation.reservationOrder as any)?.itemTaxAmount;
  const addonTaxAmount = (reservation.reservationOrder as any)?.addonTaxAmount;

  return (
    <View style={styles.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <AnimatedHeader
        title={t("reservations.myReservations.details.title") || "Reservation Details"}
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
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>
            {t("reservations.myReservations.details.reservationNumber") || "Reservation Number"}
          </Text>
          <Text style={styles.detailValue}>
            {reservation.reservationNumber}
          </Text>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>
            {t("reservations.myReservations.details.status") || "Status"}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: `${formatStatus(reservation.status, t).color}20` }]}>
            <Text style={[styles.statusText, { color: formatStatus(reservation.status, t).color }]}>
              {formatStatus(reservation.status, t).label}
            </Text>
          </View>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>
            {t("reservations.myReservations.details.date") || "Date & Time"}
          </Text>
          <Text style={styles.detailValue}>
            {formatDate(reservation.reservationDate)} {formatTime(reservation.reservationDate)}
          </Text>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>
            {t("reservations.myReservations.details.guests") || "Number of Guests"}
          </Text>
          <Text style={styles.detailValue}>
            {reservation.numberOfGuests}
          </Text>
        </View>

        {/* Branch Information */}
        {reservation.branch && (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>
              {t("reservations.myReservations.details.branch") || "Branch"}
            </Text>
            <Text style={styles.detailValue}>
              {reservation.branch.name}
            </Text>
          </View>
        )}

        {/* Zone Information */}
        {(() => {
          // Get zone name from reservation.zone, table's zoneRelation, or preferredZone
          const zoneName = reservation.zone?.name || 
            reservation.tables?.[0]?.table?.zoneRelation?.name ||
            reservation.table?.zoneRelation?.name ||
            reservation.preferredZone;
          
          if (zoneName) {
            return (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>
                  {t("reservations.myReservations.details.zone") || "Zone/Area"}
                </Text>
                <Text style={styles.detailValue}>
                  {zoneName}
                </Text>
              </View>
            );
          }
          return null;
        })()}

        {/* Tables Information */}
        {(reservation.tables && reservation.tables.length > 0) || reservation.table ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>
              {t("reservations.myReservations.details.tables") || "Tables"}
            </Text>
            {reservation.tables && reservation.tables.length > 0 ? (
              <View style={styles.tablesList}>
                {reservation.tables.map((rt: any, index: number) => {
                  const table = rt.table;
                  const zoneInfo = table?.zoneRelation?.name || table?.zone || "";
                  return (
                    <View key={index} style={styles.tableItem}>
                      <Text style={styles.tableItemText}>
                        {table?.tableNumber} ({table?.capacity} {t("reservations.myReservations.details.seats") || "seats"})
                        {zoneInfo && ` - ${zoneInfo}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : reservation.table ? (
              <View style={styles.tableItem}>
                <Text style={styles.tableItemText}>
                  {reservation.table.tableNumber} ({reservation.table.capacity} {t("reservations.myReservations.details.seats") || "seats"})
                  {(reservation.table.zoneRelation?.name || reservation.table.zone) && 
                    ` - ${reservation.table.zoneRelation?.name || reservation.table.zone}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {reservation.specialRequests && (
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>
              {t("reservations.myReservations.details.requests") || "Special Requests"}
            </Text>
            <Text style={styles.detailValue}>
              {reservation.specialRequests}
            </Text>
          </View>
        )}

        {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
          <>
            {/* Order Items */}
            {reservation.reservationOrder.items && reservation.reservationOrder.items.length > 0 && (
              <View style={styles.orderItemsSection}>
                <Text style={styles.orderItemsTitle}>
                  {t("reservations.myReservations.details.items") || "Order Items"} ({reservation.reservationOrder.items.length})
                </Text>
                <View style={styles.orderItemsList}>
                  {reservation.reservationOrder.items.map((item: any, index: number) => {
                    const totalAddonsPrice = item.addons && item.addons.length > 0
                      ? item.addons.reduce((sum: number, addOn: any) => {
                          return sum + (Number(addOn.addOnPrice || 0) * (addOn.quantity || 1));
                        }, 0)
                      : 0;
                    const mealPrice = Number(item.unitPrice || 0) * item.quantity;
                    const itemSubtotal = mealPrice + totalAddonsPrice;
                    const included = item.optionalIngredients?.filter((ing: any) => ing.isIncluded) || [];

                    return (
                      <View key={index} style={styles.orderItemCard}>
                        {/* Main Item Info */}
                        <View style={styles.orderItemHeader}>
                          {item.meal?.image && (
                            <Image
                              source={{ uri: getImageUrl(item.meal.image) }}
                              style={styles.orderItemImage}
                            />
                          )}
                          <View style={styles.orderItemInfo}>
                            <View style={styles.orderItemNameRow}>
                              <Text style={styles.orderItemName}>
                                {item.meal?.name || t("reservations.myReservations.details.meal") || "Meal"}
                              </Text>
                              {item.selectedSize && (
                                <View style={styles.sizeBadge}>
                                  <Text style={styles.sizeBadgeText}>{item.selectedSize}</Text>
                                </View>
                              )}
                              <Text style={styles.orderItemQuantity}>×{item.quantity}</Text>
                            </View>
                            <Text style={styles.orderItemPrice}>
                              {formatPrice(mealPrice, currency)}
                            </Text>
                          </View>
                        </View>

                        {/* Add-ons */}
                        {item.addons && item.addons.length > 0 && (
                          <View style={styles.addonsSection}>
                            {item.addons.map((addOn: any, addonIndex: number) => {
                              const addonQuantity = addOn.quantity || 1;
                              const addonTotalPrice = Number(addOn.addOnPrice || 0) * addonQuantity;
                              const addonName = addOn.addOnName || addOn.addon?.name || t("reservations.myReservations.details.addon") || "Addon";
                              
                              return (
                                <View key={addonIndex} style={styles.addonRow}>
                                  <Text style={styles.addonName}>
                                    + {addonName}{addonQuantity > 1 && ` ×${addonQuantity}`}
                                  </Text>
                                  <Text style={styles.addonPrice}>
                                    {formatPrice(addonTotalPrice, currency)}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {/* Optional Ingredients & Special Instructions */}
                        {(included.length > 0 || item.specialInstructions) && (
                          <View style={styles.itemExtrasSection}>
                            {included.length > 0 && (
                              <View style={styles.ingredientsContainer}>
                                {included.map((ing: any) => (
                                  <View key={ing.id || ing.optionalIngredientId} style={styles.ingredientBadge}>
                                    <Text style={styles.ingredientText}>
                                      {ing.ingredientName || ing.name}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            {item.specialInstructions && (
                              <Text style={styles.specialInstructions}>
                                {item.specialInstructions}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Order Summary */}
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>
                {t("reservations.myReservations.details.orderSummary") || "Order Summary"}
              </Text>
              <View style={styles.orderSummary}>
                <View style={styles.orderRow}>
                  <Text style={styles.orderLabel}>
                    {t("reservations.myReservations.details.subtotal") || "Subtotal"}
                  </Text>
                  <Text style={styles.orderValue}>
                    {formatPrice(Number(reservation.reservationOrder.totalAmount) - Number(reservation.reservationOrder.taxAmount || 0), currency)}
                  </Text>
                </View>
                {reservation.reservationOrder.taxAmount && Number(reservation.reservationOrder.taxAmount) > 0 && (
                  <>
                    <View style={styles.orderRow}>
                      <Text style={styles.orderLabel}>
                        {t("reservations.myReservations.details.tax") || "Tax"}
                      </Text>
                      <Text style={styles.orderValue}>
                        {formatPrice(Number(reservation.reservationOrder.taxAmount), currency)}
                      </Text>
                    </View>
                    {(itemTaxAmount !== undefined || addonTaxAmount !== undefined) && (
                      <View style={styles.taxBreakdown}>
                        {itemTaxAmount !== undefined && (
                          <View style={styles.orderRow}>
                            <Text style={styles.taxBreakdownLabel}>
                              {t("reservations.myReservations.details.itemTax") || "Item Tax"}
                            </Text>
                            <Text style={styles.taxBreakdownValue}>
                              {formatPrice(Number(itemTaxAmount || 0), currency)}
                            </Text>
                          </View>
                        )}
                        {addonTaxAmount !== undefined && (
                          <View style={styles.orderRow}>
                            <Text style={styles.taxBreakdownLabel}>
                              {t("reservations.myReservations.details.addonTax") || "Addon Tax"}
                            </Text>
                            <Text style={styles.taxBreakdownValue}>
                              {formatPrice(Number(addonTaxAmount || 0), currency)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                )}
                <View style={[styles.orderRow, styles.orderTotal]}>
                  <Text style={styles.orderTotalLabel}>
                    {t("reservations.myReservations.details.total") || "Total"}
                  </Text>
                  <Text style={styles.orderTotalValue}>
                    {formatPrice(Number(reservation.reservationOrder.totalAmount), currency)}
                  </Text>
                </View>
                {/* Show paid amount vs total if deposit was used */}
                {reservation.reservationOrder.paidAmount !== undefined && 
                 Number(reservation.reservationOrder.paidAmount) !== Number(reservation.reservationOrder.totalAmount) && (
                  <>
                    <View style={[styles.orderRow, styles.paymentInfoRow]}>
                      <Text style={styles.paymentInfoLabel}>
                        {t("reservations.details.paidAmount") || "Paid Amount"}
                      </Text>
                      <Text style={styles.paidAmountValue}>
                        {formatPrice(Number(reservation.reservationOrder.paidAmount || 0), currency)}
                      </Text>
                    </View>
                    {reservation.reservationOrder.depositPercentage && (
                      <View style={styles.orderRow}>
                        <Text style={styles.depositPercentageLabel}>
                          {t("reservations.details.depositPercentage") || "Deposit"}
                        </Text>
                        <Text style={styles.depositPercentageValue}>
                          {Number(reservation.reservationOrder.depositPercentage)}%
                        </Text>
                      </View>
                    )}
                    <View style={[styles.orderRow, styles.paymentInfoRow]}>
                      <Text style={styles.paymentInfoLabel}>
                        {t("reservations.details.remainingBalance") || "Remaining Balance"}
                      </Text>
                      <Text style={styles.remainingBalanceValue}>
                        {formatPrice(
                          Number(reservation.reservationOrder.totalAmount) - Number(reservation.reservationOrder.paidAmount || 0),
                          currency
                        )}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  loadingText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  orderItemsSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  orderItemsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  orderItemsList: {
    gap: 8,
  },
  orderItemCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  orderItemHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  orderItemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#262626",
  },
  orderItemInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  orderItemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  sizeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizeBadgeText: {
    fontSize: 10,
    color: "#D1D5DB",
  },
  orderItemQuantity: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ec4899",
  },
  addonsSection: {
    marginLeft: 52,
    marginTop: 4,
    gap: 4,
  },
  addonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addonName: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  addonPrice: {
    fontSize: 11,
    fontWeight: "500",
    color: "#fff",
  },
  itemExtrasSection: {
    marginLeft: 52,
    marginTop: 8,
    gap: 6,
  },
  ingredientsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  ingredientBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ingredientText: {
    fontSize: 9,
    color: "#22c55e",
  },
  specialInstructions: {
    fontSize: 10,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  orderSummary: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  orderValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  orderTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  orderTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  taxBreakdown: {
    marginLeft: 12,
    marginTop: 4,
    gap: 4,
  },
  taxBreakdownLabel: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  taxBreakdownValue: {
    fontSize: 11,
    color: "#fff",
  },
  paymentInfoRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  paymentInfoLabel: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  paidAmountValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#22c55e", // Green color for paid amount
  },
  depositPercentageLabel: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  depositPercentageValue: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  remainingBalanceValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f59e0b", // Amber color for remaining balance
  },
  tablesList: {
    gap: 8,
    marginTop: 4,
  },
  tableItem: {
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  tableItemText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
});
