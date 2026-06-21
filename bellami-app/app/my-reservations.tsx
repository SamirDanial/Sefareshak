import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { formatPrice, fetchCurrency, fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import { useBranch } from "@/src/contexts/BranchContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
} from "@/src/services/reservationService";
import { MaterialIcons } from "@expo/vector-icons";

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

export default function MyReservationsScreen() {
  const { t } = useTranslation();
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const { branch, visibleBranches } = useBranch();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

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
    if (isOrganizationUnavailable) {
      setAppStatus(organizationAppStatus);
      setSettingsLoading(false);
      return;
    }

    fetchPublicSettings().then((settings) => {
      setCurrency(settings.currency);
      setAppStatus(settings.appStatus);
      setSettingsLoading(false);
    });
  }, [isOrganizationUnavailable, organizationAppStatus]);

  useEffect(() => {
    if (isSignedIn) {
      loadReservations();
      loadSettings();
    }
  }, [isSignedIn]);

  const loadSettings = async () => {
    try {
      const token = await getToken();
      if (token) {
        const settings = await reservationService.getSettings(token);
        setReservationSettings(settings);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const loadReservations = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const response = await reservationService.getUserReservations(1, 100, undefined, token);
      setReservations(response.data.reservations || []);
    } catch (error: any) {
      console.error("Error loading reservations:", error);
      showToast(t("reservations.myReservations.loadError") || "Failed to load reservations", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedReservation) return;

    try {
      setCancelling(true);
      const token = await getToken();
      if (!token) return;
      await reservationService.cancelReservation(
        selectedReservation.id,
        undefined,
        token
      );
      showToast(
        t("reservations.myReservations.cancelDialog.cancelSuccess") || "Reservation cancelled successfully",
        "success"
      );
      await loadReservations();
      setIsCancelModalOpen(false);
      setSelectedReservation(null);
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      showToast(
        error.response?.data?.error || t("reservations.myReservations.cancelDialog.cancelError") || "Failed to cancel reservation",
        "error"
      );
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = (reservation: Reservation) => {
    return ["PENDING", "CONFIRMED"].includes(reservation.status);
  };

  const canModify = (reservation: Reservation) => {
    if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
      return false;
    }
    const now = new Date();
    const reservationDate = new Date(reservation.reservationDate);
    const hoursUntilReservation =
      (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Default to 24 hours if settings not loaded yet
    const modificationWindow = reservationSettings?.modificationWindowHours || 24;
    return hoursUntilReservation >= modificationWindow;
  };


  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ visible: true, message, type });
  };

  const upcomingReservations = reservations.filter(
    (r) => new Date(r.reservationDate) >= new Date() && r.status !== "CANCELLED"
  );
  const pastReservations = reservations.filter(
    (r) => new Date(r.reservationDate) < new Date() || r.status === "CANCELLED"
  );

  if (settingsLoading && !isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.title") || "My Reservations"}
          onBackPress={() => router.back()}
        />
        <View style={[styles.content, { paddingTop: headerHeight, flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ color: "#9CA3AF", marginTop: 16 }}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  const effectiveAppStatus = isOrganizationUnavailable ? organizationAppStatus : appStatus;
  const isAppUnavailable = effectiveAppStatus !== "LIVE";

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.title") || "My Reservations"}
          onBackPress={() => router.back()}
        />
        <View style={[styles.content, { paddingTop: headerHeight }]}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-circle" size={64} color="#6b7280" />
            <Text style={styles.emptyStateTitle}>
              {t("reservations.myReservations.signInRequired") || "Sign In Required"}
            </Text>
            <Text style={styles.emptyStateText}>
              {t("reservations.myReservations.signInDescription") || "Please sign in to view your reservations"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <AnimatedHeader
        title={t("reservations.myReservations.title") || "My Reservations"}
        onBackPress={() => router.back()}
        rightContent={
          <TouchableOpacity
            style={styles.newReservationHeaderButton}
            onPress={() => router.push("/book-reservation")}
          >
            <MaterialCommunityIcons name="calendar" size={16} color="#fff" />
            <Text style={styles.newReservationHeaderButtonText}>
              {t("reservations.myReservations.new") || "New"}
            </Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight + 24, padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("reservations.myReservations.loading") || "Loading reservations..."}
            </Text>
          </View>
        ) : (
          <>
            {/* Upcoming Reservations */}
            {upcomingReservations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t("reservations.myReservations.upcoming") || "Upcoming Reservations"}
                </Text>
                {upcomingReservations.map((reservation) => {
                  const statusInfo = formatStatus(reservation.status, t);
                  return (
                    <View key={reservation.id} style={styles.reservationCard}>
                      <View style={styles.reservationHeader}>
                        <Text style={styles.reservationNumber}>
                          {reservation.reservationNumber}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
                          <Text style={[styles.statusText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reservationInfo}>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="calendar" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {formatDate(reservation.reservationDate)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="clock" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {formatTime(reservation.reservationDate)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="account-group" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {reservation.numberOfGuests} {t("reservations.myReservations.guests") || "guests"}
                          </Text>
                        </View>
                        {/* Display Branch */}
                        {reservation.branch && (
                          <View style={styles.infoRow}>
                            <MaterialCommunityIcons name="map-marker-radius" size={16} color="#9CA3AF" />
                            <Text style={styles.infoText}>
                              {t("reservations.myReservations.details.branch") || "Branch"}: {reservation.branch.name}
                            </Text>
                          </View>
                        )}
                        {/* Display Zone */}
                        {(() => {
                          // Get zone name from reservation.zone, table's zoneRelation, or preferredZone
                          const zoneName = reservation.zone?.name || 
                            reservation.tables?.[0]?.table?.zoneRelation?.name ||
                            reservation.table?.zoneRelation?.name ||
                            reservation.preferredZone;
                          
                          if (zoneName) {
                            return (
                              <View style={styles.infoRow}>
                                <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#9CA3AF" />
                                <Text style={styles.infoText}>
                                  {t("reservations.myReservations.details.zone") || "Zone/Area"}: {zoneName}
                                </Text>
                              </View>
                            );
                          }
                          return null;
                        })()}
                        {/* Display Tables */}
                        {(() => {
                          // Get tables from either new many-to-many relationship or legacy single table
                          const tables: any[] = [];
                          if (reservation.tables && reservation.tables.length > 0) {
                            // New many-to-many relationship
                            tables.push(...reservation.tables.map((rt: any) => rt.table));
                          } else if (reservation.table) {
                            // Legacy single table
                            tables.push(reservation.table);
                          }
                          
                          if (tables.length > 0) {
                            return (
                              <View style={styles.infoRow}>
                                <MaterialCommunityIcons name="table-furniture" size={16} color="#9CA3AF" />
                                <View style={styles.tablesContainer}>
                                  {tables.map((table) => (
                                    <View key={table.id} style={styles.tableBadge}>
                                      <Text style={styles.tableBadgeText}>
                                        {table.tableNumber}
                                        {table.capacity && ` (${table.capacity} ${t("reservations.myReservations.details.seats") || "seats"})`}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            );
                          }
                          return null;
                        })()}
                        {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
                          <View style={styles.infoRow}>
                            <MaterialCommunityIcons name="credit-card" size={16} color="#9CA3AF" />
                            <Text style={styles.infoText}>
                              {t("reservations.myReservations.order") || "Order"}: {formatPrice(Number(reservation.reservationOrder.totalAmount), currency)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.reservationActions}>
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            !canModify(reservation) && !canCancel(reservation) && styles.actionButtonFullWidth
                          ]}
                          onPress={() => {
                            setSelectedReservation(reservation);
                            setIsViewModalOpen(true);
                          }}
                        >
                          <MaterialCommunityIcons name="eye" size={16} color="#ec4899" />
                          <Text style={styles.actionButtonText}>
                            {t("reservations.myReservations.view") || "View"}
                          </Text>
                        </TouchableOpacity>
                        {canModify(reservation) && (
                          <TouchableOpacity
                            style={[styles.actionButton, styles.modifyButton]}
                            onPress={() => {
                              router.push({
                                pathname: "/modify-reservation",
                                params: {
                                  id: reservation.id,
                                  data: JSON.stringify(reservation),
                                },
                              });
                            }}
                          >
                            <EditIcon size={16} color="#3b82f6" />
                            <Text style={[styles.actionButtonText, styles.modifyButtonText]}>
                              {t("reservations.myReservations.modify") || "Modify"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {canCancel(reservation) && (
                          <TouchableOpacity
                            style={[styles.actionButton, styles.cancelButton]}
                            onPress={() => {
                              setSelectedReservation(reservation);
                              setIsCancelModalOpen(true);
                            }}
                          >
                            <MaterialCommunityIcons name="close-circle" size={16} color="#ef4444" />
                            <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                              {t("reservations.myReservations.cancel") || "Cancel"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Past Reservations */}
            {pastReservations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t("reservations.myReservations.past") || "Past Reservations"}
                </Text>
                {pastReservations.map((reservation) => {
                  const statusInfo = formatStatus(reservation.status, t);
                  return (
                    <View key={reservation.id} style={[styles.reservationCard, styles.pastCard]}>
                      <View style={styles.reservationHeader}>
                        <Text style={styles.reservationNumber}>
                          {reservation.reservationNumber}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
                          <Text style={[styles.statusText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reservationInfo}>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="calendar" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {formatDate(reservation.reservationDate)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="clock" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {formatTime(reservation.reservationDate)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="account-group" size={16} color="#9CA3AF" />
                          <Text style={styles.infoText}>
                            {reservation.numberOfGuests} {t("reservations.myReservations.guests") || "guests"}
                          </Text>
                        </View>
                        {/* Display Branch */}
                        {reservation.branch && (
                          <View style={styles.infoRow}>
                            <MaterialCommunityIcons name="map-marker-radius" size={16} color="#9CA3AF" />
                            <Text style={styles.infoText}>
                              {t("reservations.myReservations.details.branch") || "Branch"}: {reservation.branch.name}
                            </Text>
                          </View>
                        )}
                        {/* Display Zone */}
                        {(() => {
                          // Get zone name from reservation.zone, table's zoneRelation, or preferredZone
                          const zoneName = reservation.zone?.name || 
                            reservation.tables?.[0]?.table?.zoneRelation?.name ||
                            reservation.table?.zoneRelation?.name ||
                            reservation.preferredZone;
                          
                          if (zoneName) {
                            return (
                              <View style={styles.infoRow}>
                                <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#9CA3AF" />
                                <Text style={styles.infoText}>
                                  {t("reservations.myReservations.details.zone") || "Zone/Area"}: {zoneName}
                                </Text>
                              </View>
                            );
                          }
                          return null;
                        })()}
                        {/* Display Tables */}
                        {(() => {
                          // Get tables from either new many-to-many relationship or legacy single table
                          const tables: any[] = [];
                          if (reservation.tables && reservation.tables.length > 0) {
                            // New many-to-many relationship
                            tables.push(...reservation.tables.map((rt: any) => rt.table));
                          } else if (reservation.table) {
                            // Legacy single table
                            tables.push(reservation.table);
                          }
                          
                          if (tables.length > 0) {
                            return (
                              <View style={styles.infoRow}>
                                <MaterialCommunityIcons name="table-furniture" size={16} color="#9CA3AF" />
                                <View style={styles.tablesContainer}>
                                  {tables.map((table, index) => (
                                    <View key={table.id} style={styles.tableBadge}>
                                      <Text style={styles.tableBadgeText}>
                                        {table.tableNumber}
                                        {table.capacity && ` (${table.capacity} ${t("reservations.myReservations.details.seats") || "seats"})`}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            );
                          }
                          return null;
                        })()}
                      </View>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.actionButtonFullWidth]}
                        onPress={() => {
                          setSelectedReservation(reservation);
                          setIsViewModalOpen(true);
                        }}
                      >
                        <MaterialCommunityIcons name="eye" size={16} color="#ec4899" />
                        <Text style={styles.actionButtonText}>
                          {t("reservations.myReservations.view") || "View"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {reservations.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="calendar" size={64} color="#6b7280" />
                <Text style={styles.emptyStateTitle}>
                  {t("reservations.myReservations.noReservations") || "No Reservations"}
                </Text>
                <Text style={styles.emptyStateText}>
                  {t("reservations.myReservations.noReservationsDescription") || "You haven't made any reservations yet."}
                </Text>
                <TouchableOpacity
                  style={styles.newReservationButton}
                  onPress={() => router.push("/book-reservation")}
                >
                  <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
                  <Text style={styles.newReservationButtonText}>
                    {t("reservations.myReservations.makeReservation") || "Make a Reservation"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* View Reservation Details Bottom Sheet Modal */}
      <Modal visible={isViewModalOpen} transparent animationType="slide" onRequestClose={() => setIsViewModalOpen(false)}>
        <View style={styles.bottomSheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsViewModalOpen(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("reservations.myReservations.details.title") || "Reservation Details"}
              </Text>
              <TouchableOpacity onPress={() => setIsViewModalOpen(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {selectedReservation && (
              <ScrollView 
                style={styles.bottomSheetBody} 
                contentContainerStyle={styles.bottomSheetBodyContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={true}
              >
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("reservations.myReservations.details.reservationNumber") || "Reservation Number"}:{" "}
                    <Text style={styles.detailValue}>{selectedReservation.reservationNumber}</Text>
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("reservations.myReservations.details.status") || "Status"}:{" "}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${formatStatus(selectedReservation.status, t).color}20` }]}>
                    <Text style={[styles.statusText, { color: formatStatus(selectedReservation.status, t).color }]}>
                      {formatStatus(selectedReservation.status, t).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("reservations.myReservations.details.date") || "Date & Time"}:{" "}
                    <Text style={styles.detailValue}>
                      {formatDate(selectedReservation.reservationDate)} {formatTime(selectedReservation.reservationDate)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("reservations.myReservations.details.guests") || "Number of Guests"}:{" "}
                    <Text style={styles.detailValue}>{selectedReservation.numberOfGuests}</Text>
                  </Text>
                </View>

                {selectedReservation.branch && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>
                      {t("reservations.myReservations.details.branch") || "Branch"}:{" "}
                      <Text style={styles.detailValue}>{selectedReservation.branch.name}</Text>
                    </Text>
                  </View>
                )}

                {(() => {
                  const zoneName = selectedReservation.zone?.name || 
                    selectedReservation.tables?.[0]?.table?.zoneRelation?.name ||
                    selectedReservation.table?.zoneRelation?.name ||
                    selectedReservation.preferredZone;
                  
                  if (zoneName) {
                    return (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>
                          {t("reservations.myReservations.details.zone") || "Zone/Area"}:{" "}
                          <Text style={styles.detailValue}>{zoneName}</Text>
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                {(() => {
                  const tables: any[] = [];
                  if (selectedReservation.tables && selectedReservation.tables.length > 0) {
                    tables.push(...selectedReservation.tables.map((rt: any) => rt.table));
                  } else if (selectedReservation.table) {
                    tables.push(selectedReservation.table);
                  }
                  
                  if (tables.length > 0) {
                    return (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>
                          {t("reservations.myReservations.details.tables") || "Tables"}:{" "}
                        </Text>
                        <View style={styles.tablesList}>
                          {tables.map((table: any, index: number) => (
                            <View key={table?.id || index} style={styles.tableItem}>
                              <Text style={styles.tableItemText}>
                                {table?.tableNumber} ({table?.capacity} {t("reservations.myReservations.details.seats") || "seats"})
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  }
                  return null;
                })()}

                {selectedReservation.specialRequests && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>
                      {t("reservations.myReservations.details.requests") || "Special Requests"}:{" "}
                      <Text style={styles.detailValue}>
                        {selectedReservation.specialRequests}
                      </Text>
                    </Text>
                  </View>
                )}

                {selectedReservation.type === "PRE_ORDER" && selectedReservation.reservationOrder && (
                  <>
                    {selectedReservation.reservationOrder.items && selectedReservation.reservationOrder.items.length > 0 && (
                      <View style={styles.orderItemsSection}>
                        <Text style={styles.orderItemsTitle}>
                          {t("reservations.myReservations.details.items") || "Order Items"} ({selectedReservation.reservationOrder.items.length})
                        </Text>
                        <View style={styles.orderItemsList}>
                          {selectedReservation.reservationOrder.items.map((item: any, index: number) => {
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
                                      {formatPrice(itemSubtotal, currency)}
                                    </Text>
                                  </View>
                                </View>

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

                    <View style={styles.orderSummarySection}>
                      <Text style={styles.orderSummaryTitle}>
                        {t("reservations.myReservations.details.orderSummary") || "Order Summary"}
                      </Text>
                      <View style={styles.orderSummary}>
                        <View style={styles.orderRow}>
                          <Text style={styles.orderLabel}>
                            {t("reservations.myReservations.details.subtotal") || "Subtotal"}
                          </Text>
                          <Text style={styles.orderValue}>
                            {formatPrice(Number(selectedReservation.reservationOrder.totalAmount) - Number(selectedReservation.reservationOrder.taxAmount || 0), currency)}
                          </Text>
                        </View>
                        {selectedReservation.reservationOrder.taxAmount && Number(selectedReservation.reservationOrder.taxAmount) > 0 && (
                          <>
                            <View style={styles.orderRow}>
                              <Text style={styles.orderLabel}>
                                {t("reservations.myReservations.details.tax") || "Tax"}
                              </Text>
                              <Text style={styles.orderValue}>
                                {formatPrice(Number(selectedReservation.reservationOrder.taxAmount), currency)}
                              </Text>
                            </View>
                            {(selectedReservation.reservationOrder.itemTaxAmount !== undefined ||
                              selectedReservation.reservationOrder.addonTaxAmount !== undefined) && (
                              <View style={styles.taxBreakdown}>
                                {selectedReservation.reservationOrder.itemTaxAmount !== undefined && (
                                  <View style={styles.orderRow}>
                                    <Text style={styles.taxBreakdownLabel}>
                                      {t("reservations.myReservations.details.itemTax") || "Item Tax"}
                                    </Text>
                                    <Text style={styles.taxBreakdownValue}>
                                      {formatPrice(Number(selectedReservation.reservationOrder.itemTaxAmount || 0), currency)}
                                    </Text>
                                  </View>
                                )}
                                {selectedReservation.reservationOrder.addonTaxAmount !== undefined && (
                                  <View style={styles.orderRow}>
                                    <Text style={styles.taxBreakdownLabel}>
                                      {t("reservations.myReservations.details.addonTax") || "Addon Tax"}
                                    </Text>
                                    <Text style={styles.taxBreakdownValue}>
                                      {formatPrice(Number(selectedReservation.reservationOrder.addonTaxAmount || 0), currency)}
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
                            {formatPrice(Number(selectedReservation.reservationOrder.totalAmount), currency)}
                          </Text>
                        </View>
                        {selectedReservation.reservationOrder.paidAmount !== undefined && 
                         Number(selectedReservation.reservationOrder.paidAmount) !== Number(selectedReservation.reservationOrder.totalAmount) && (
                          <>
                            <View style={[styles.orderRow, styles.paymentInfoRow]}>
                              <Text style={styles.paymentInfoLabel}>
                                {t("reservations.details.paidAmount") || "Paid Amount"}
                              </Text>
                              <Text style={styles.paidAmountValue}>
                                {formatPrice(Number(selectedReservation.reservationOrder.paidAmount || 0), currency)}
                              </Text>
                            </View>
                            {selectedReservation.reservationOrder.depositPercentage && (
                              <View style={styles.orderRow}>
                                <Text style={styles.depositPercentageLabel}>
                                  {t("reservations.details.depositPercentage") || "Deposit"}
                                </Text>
                                <Text style={styles.depositPercentageValue}>
                                  {Number(selectedReservation.reservationOrder.depositPercentage)}%
                                </Text>
                              </View>
                            )}
                            <View style={[styles.orderRow, styles.paymentInfoRow]}>
                              <Text style={styles.paymentInfoLabel}>
                                {t("reservations.details.remainingBalance") || "Remaining Balance"}
                              </Text>
                              <Text style={styles.remainingBalanceValue}>
                                {formatPrice(
                                  Number(selectedReservation.reservationOrder.totalAmount) - Number(selectedReservation.reservationOrder.paidAmount || 0),
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
            )}
          </View>
        </View>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal visible={isCancelModalOpen} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsCancelModalOpen(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("reservations.myReservations.cancelDialog.title") || "Cancel Reservation"}
              </Text>
              <TouchableOpacity onPress={() => setIsCancelModalOpen(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                {t("reservations.myReservations.cancelDialog.description", { 
                  reservationNumber: selectedReservation?.reservationNumber || "" 
                }) || `Are you sure you want to cancel reservation ${selectedReservation?.reservationNumber}?`}
              </Text>
              {selectedReservation?.type === "PRE_ORDER" && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    {t("reservations.myReservations.cancelDialog.preOrderWarning") || "Cancelling a pre-order reservation will process a refund."}
                  </Text>
                </View>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setIsCancelModalOpen(false)}
                >
                  <Text style={styles.modalButtonSecondaryText}>
                    {t("reservations.myReservations.cancelDialog.keepReservation") || "Keep Reservation"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonPrimaryText}>
                      {t("reservations.myReservations.cancelDialog.cancelReservation") || "Cancel Reservation"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
  },
  reservationCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  pastCard: {
    opacity: 0.7,
  },
  reservationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reservationNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reservationInfo: {
    gap: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  reservationActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  actionButtonFullWidth: {
    flex: 1,
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  modifyButton: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  modifyButtonText: {
    color: "#3b82f6",
  },
  cancelButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  cancelButtonText: {
    color: "#ef4444",
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
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  newReservationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  newReservationButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: 32,
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
  modalBody: {
    padding: 16,
    maxHeight: 500,
  },
  detailSection: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  detailLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  detailValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  orderSummarySection: {
    marginBottom: 16,
    marginTop: 8,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  orderSummary: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
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
  modalDescription: {
    fontSize: 14,
    color: "#D1D5DB",
    marginBottom: 16,
  },
  warningBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 13,
    color: "#fbbf24",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#404040",
  },
  modalButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonPrimary: {
    backgroundColor: "#ec4899",
  },
  modalButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  newReservationHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newReservationHeaderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  tablesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  tableBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.2)",
  },
  tableBadgeText: {
    fontSize: 13,
    color: "#ec4899",
    fontWeight: "600",
  },
  tableSeparator: {
    fontSize: 13,
    color: "#9CA3AF",
    marginHorizontal: 2,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "90%",
    flexDirection: "column",
    overflow: "hidden",
  },
  bottomSheetHandleContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#666",
    borderRadius: 2,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    flex: 1,
  },
  bottomSheetBodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
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
    color: "#22c55e",
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
    color: "#f59e0b",
  },
  tablesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
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
