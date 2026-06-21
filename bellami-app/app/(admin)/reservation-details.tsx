import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
  type ReservationType,
  type Table,
} from "@/src/services/reservationService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useScroll } from "@/src/contexts/ScrollContext";
import SocketService from "@/src/services/socketService";
import { notificationApiService } from "@/src/services/notificationApiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import ApiService from "@/src/services/apiService";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatAmount = (amount: any): string => {
  if (amount === null || amount === undefined) {
    return "0.00";
  }
  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numAmount)) {
    return "0.00";
  }
  return numAmount.toFixed(2);
};

const formatMoney = (amount: any, currency: string | null | undefined): string => {
  const cur = typeof currency === "string" && currency.trim() ? currency.trim() : "USD";
  const num = typeof amount === "number" ? amount : parseFloat(String(amount ?? 0));
  const safeNum = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(safeNum);
  } catch {
    return `${formatAmount(safeNum)} ${cur}`;
  }
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const getStatusColor = (status: ReservationStatus): string => {
  switch (status) {
    case "PENDING":
      return "#fbbf24"; // yellow
    case "CONFIRMED":
      return "#3b82f6"; // blue
    case "SEATED":
      return "#22c55e"; // green
    case "COMPLETED":
      return "#10b981"; // emerald
    case "CANCELLED":
      return "#ef4444"; // red
    case "NO_SHOW":
      return "#6b7280"; // gray
    default:
      return "#6b7280";
  }
};

export default function ReservationDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [settings, setSettings] = useState<any | null>(null);

  const canViewReservations =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW }]);

  const canConfirmReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.CONFIRM }]);

  const canSeatReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.SEAT }]);

  const canCompleteReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.COMPLETE }]);

  const canCancelReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.CANCEL }]);

  const canViewReservationHistory =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW_HISTORY }]);

  const canUpdateReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.UPDATE }]);

  const canViewTables =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.VIEW }]);

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

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [assignTableModalOpen, setAssignTableModalOpen] = useState(false);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [reservationHistory, setReservationHistory] = useState<Array<{
    type: string;
    action: string;
    timestamp: string;
    details?: any;
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [refundInfo, setRefundInfo] = useState<{
    refundAmount: number;
    refundPercentage: number;
    refundType: string;
    hoursUntilReservation: number;
  } | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  if (permissionsLoading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.reservationManagement.details.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.reservationManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!permissionsLoading && !canViewReservations) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.reservationManagement.details.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
          <TouchableOpacity
            style={[styles.confirmModalButton, styles.cancelModalButton, { marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelModalButtonText}>
              {t("common.back", { defaultValue: "Back" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const reservationRef = useRef<Reservation | null>(null);

  useEffect(() => {
    if (id) {
      loadReservation();
      loadReservationSettings();
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        const apiService = ApiService.getInstance();
        const raw = await apiService.getSettings(token || undefined);
        if (cancelled) return;
        setSettings((raw as any)?.data ?? raw);
      } catch {
        if (cancelled) return;
        setSettings(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const displayCurrency = useMemo(() => {
    const branchCurrency = String((reservation as any)?.branch?.currency || "").trim();
    const orderCurrency = String((reservation as any)?.reservationOrder?.currency || "").trim();
    const settingsCurrency = String((settings as any)?.currency || "").trim();
    return branchCurrency || settingsCurrency || orderCurrency || "USD";
  }, [reservation, settings]);

  // Mark notification as seen when viewing reservation details
  useEffect(() => {
    if (!reservation || !reservation.id || !reservation.notifications || reservation.notifications.length === 0) {
      return;
    }

    // Check if there are any unseen notifications
    const unseenNotifications = reservation.notifications.filter((n) => !n.isSeen);
    if (unseenNotifications.length === 0) {
      return;
    }

    const markNotificationsAsSeen = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // Validate notification IDs before attempting to mark as seen
        const validNotifications = unseenNotifications.filter((n) => {
          if (!n.id || typeof n.id !== 'string' || n.id.trim() === '') {
            console.warn(`📅 Reservation Details: Invalid notification ID:`, n);
            return false;
          }
          return true;
        });

        if (validNotifications.length === 0) {
          console.warn("📅 Reservation Details: No valid notification IDs to mark as seen");
          return;
        }


        // Mark all unseen notifications as seen
        const markPromises = validNotifications.map(async (notification) => {
          try {
            await notificationApiService.markAsSeen(notification.id, token);
            return { success: true, notificationId: notification.id };
          } catch (error: any) {
            // Handle 404 gracefully (notification might already be deleted or marked as seen by another admin)
            if (error?.message?.includes('404')) {
              console.warn(`📅 Reservation Details: Notification ${notification.id} not found (404) - may have been deleted or already marked as seen`);
              return { success: false, notificationId: notification.id, error: '404' };
            } else {
              console.error(`📅 Reservation Details: Error marking notification ${notification.id} as seen:`, error);
              return { success: false, notificationId: notification.id, error: 'other' };
            }
          }
        });

        const results = await Promise.all(markPromises);
        const successfulIds = results
          .filter(r => r.success)
          .map(r => r.notificationId);
        const notFoundIds = results
          .filter(r => !r.success && r.error === '404')
          .map(r => r.notificationId);

        // Update local state only for successfully marked notifications
        // For 404s, we also update since they're likely already marked as seen or deleted
        const idsToUpdate = [...successfulIds, ...notFoundIds];
        
        if (idsToUpdate.length > 0) {
          setReservation((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              notifications: prev.notifications?.map((n) =>
                idsToUpdate.includes(n.id)
                  ? { ...n, isSeen: true, seenAt: new Date().toISOString() }
                  : n
              ) || [],
            };
          });
        }

        if (successfulIds.length > 0) {
        }
      } catch (error) {
        console.error("📅 Reservation Details: Error marking notifications as seen:", error);
      }
    };

    // Small delay to ensure reservation is fully loaded and page is visible
    const timeoutId = setTimeout(() => {
      markNotificationsAsSeen();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [reservation?.id, getToken]);

  // Keep ref in sync with reservation state
  useEffect(() => {
    reservationRef.current = reservation;
  }, [reservation]);

  // Real-time WebSocket updates for reservation details
  useEffect(() => {
    if (!id) return;

    const socketService = SocketService.getInstance();
    let isMounted = true;

    // Handle reservation updated event (real-time) - status changes, table assignments, etc.
    const handleReservationUpdate = (data: { reservation: Reservation }) => {
      if (!isMounted || !data.reservation) return;
      
      const currentReservation = reservationRef.current;
      if (!currentReservation || data.reservation.id !== currentReservation.id) return;

      // Update reservation, preserve notifications and other important fields
      setReservation((prev) => {
        if (!prev) return prev;
        return {
          ...data.reservation,
          notifications: data.reservation.notifications || prev.notifications || [],
          // Preserve any other fields that might not be in the update
          reservationOrder: data.reservation.reservationOrder || prev.reservationOrder,
          table: data.reservation.table || prev.table,
          tables: data.reservation.tables || prev.tables,
        };
      });

      // Show toast for status changes
      if (data.reservation.status !== currentReservation.status) {
        setToast({
          visible: true,
          message: t("admin.reservationManagement.statusUpdated") || "Reservation status updated",
          type: "success",
        });
      }
    };

    // Handle reservation modified event (real-time) - items added/removed, date changes, etc.
    const handleReservationModified = (data: {
      notification: any;
      reservation: Reservation;
    }) => {
      if (!isMounted || !data.reservation) return;
      
      const currentReservation = reservationRef.current;
      if (!currentReservation || data.reservation.id !== currentReservation.id) return;

      // Update reservation with new notification and preserve other fields
      setReservation((prev) => {
        if (!prev) return prev;
        
        // Check if notification already exists to avoid duplicates
        const notificationExists = prev.notifications?.some(
          (n) => n.id === data.notification?.id
        );
        
        const updatedNotifications = notificationExists
          ? prev.notifications
          : prev.notifications
          ? [...prev.notifications, data.notification].filter(Boolean)
          : data.notification
          ? [data.notification]
          : [];

        return {
          ...data.reservation,
          notifications: updatedNotifications,
          // Preserve other important fields
          reservationOrder: data.reservation.reservationOrder || prev.reservationOrder,
          table: data.reservation.table || prev.table,
          tables: data.reservation.tables || prev.tables,
        };
      });
    };

    // Handle notification seen event (real-time)
    const handleNotificationSeen = (data: {
      reservationId?: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted || !data.reservationId) return;
      
      const currentReservation = reservationRef.current;
      if (!currentReservation || data.reservationId !== currentReservation.id) return;

      // Update notification seen status
      setReservation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notifications: prev.notifications?.map((n) =>
            n.id === data.notificationId ? { ...n, isSeen: true } : n
          ) || [],
        };
      });
    };

    // Connect to WebSocket
    const connectSocket = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        
        // Register event listeners
        socketService.on("reservation-updated", handleReservationUpdate);
        socketService.on("reservation-modified", handleReservationModified);
        socketService.on("notification-seen", handleNotificationSeen);
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      }
    };

    connectSocket();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      socketService.off("reservation-updated", handleReservationUpdate);
      socketService.off("reservation-modified", handleReservationModified);
      socketService.off("notification-seen", handleNotificationSeen);
    };
  }, [id, getToken, t]);

  // Calculate refund info when cancel modal opens
  useEffect(() => {
    if (isCancelModalOpen && reservation && reservationSettings) {
      if (reservation.type === "PRE_ORDER" && reservation.reservationOrder) {
        const now = new Date();
        const reservationDate = new Date(reservation.reservationDate);
        const hoursUntilReservation = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        const fullRefundHours = reservationSettings.fullRefundHoursBefore ?? 24;
        const partialRefundHours = reservationSettings.partialRefundHoursBefore ?? 4;
        const noRefundHours = reservationSettings.noRefundHoursBefore ?? 1;

        let refundPercentage = 0;
        let refundType = "NO_REFUND";

        if (hoursUntilReservation >= fullRefundHours) {
          refundPercentage = 1.0;
          refundType = "FULL";
        } else if (hoursUntilReservation >= partialRefundHours) {
          refundPercentage = 0.5;
          refundType = "PARTIAL_50";
        } else if (hoursUntilReservation >= noRefundHours) {
          refundPercentage = 0.25;
          refundType = "PARTIAL_25";
        } else {
          refundPercentage = 0;
          refundType = "NO_REFUND";
        }

        const totalAmount = Number(reservation.reservationOrder.totalAmount || 0);
        const refundAmount = totalAmount * refundPercentage;

        setRefundInfo({
          refundAmount,
          refundPercentage,
          refundType,
          hoursUntilReservation,
        });
      } else {
        setRefundInfo(null);
      }
    } else if (!isCancelModalOpen) {
      setRefundInfo(null);
    }
  }, [isCancelModalOpen, reservation, reservationSettings]);

  const loadReservation = async () => {
    try {
      setLoading(true);
      if (permissionsLoading) return;
      if (!canViewReservations) return;
      const token = await getToken();
      if (!token) {
        router.back();
        return;
      }

      const data = await reservationService.getReservationById(id!, token);
      setReservation(data);
    } catch (error: any) {
      console.error("Error loading reservation:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoading"),
        type: "error",
      });
      setTimeout(() => {
        router.back();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const loadReservationSettings = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const settings = await reservationService.getSettings(token);
      setReservationSettings(settings);
    } catch (error) {
      console.error("Error loading reservation settings:", error);
    }
  };

  const handleStatusChange = async (status: ReservationStatus) => {
    if (!reservation) return;

    try {
      if (permissionsLoading) return;
      if (status === "CONFIRMED" && !canConfirmReservation) return;
      if (status === "SEATED" && !canSeatReservation) return;
      if (status === "COMPLETED" && !canCompleteReservation) return;

      setIsActionLoading(true);
      const token = await getToken();
      if (!token) return;

      await reservationService.updateReservationStatus(reservation.id, status, token);
      setToast({
        visible: true,
        message: t("admin.reservationManagement.statusUpdated"),
        type: "success",
      });
      await loadReservation();
    } catch (error: any) {
      console.error("Error updating status:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorUpdating"),
        type: "error",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const loadAvailableTables = async () => {
    if (!reservation) return;

    try {
      if (permissionsLoading) return;
      if (!canViewTables) return;

      setLoadingTables(true);
      const token = await getToken();
      if (!token) return;

      const response = await reservationService.getTables(1, 100, "tableNumber", "asc", undefined, undefined, undefined, undefined, token);
      
      if (response.success && response.data) {
        const allTables = response.data;
        const available = allTables.filter(
          (table) => table.status === "AVAILABLE" && table.isActive
        );
        setAvailableTables(available);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoadingTables"),
        type: "error",
      });
    } finally {
      setLoadingTables(false);
    }
  };

  // Group tables by zone
  const groupedTables = useMemo(() => {
    const unassignedLabel = t("admin.tableManagement.unassigned") || "Unassigned";
    const grouped: { [zone: string]: Table[] } = {};
    availableTables.forEach((table) => {
      const zone = table.zone || unassignedLabel;
      if (!grouped[zone]) {
        grouped[zone] = [];
      }
      grouped[zone].push(table);
    });
    
    // Convert to array and sort zones
    return Object.entries(grouped)
      .map(([zone, tables]) => ({
        zone,
        tables: tables.sort((a, b) => {
          // Sort by table number
          const numA = parseInt(a.tableNumber) || 0;
          const numB = parseInt(b.tableNumber) || 0;
          return numA - numB;
        }),
      }))
      .sort((a, b) => {
        // Put "Unassigned" at the end
        if (a.zone === unassignedLabel) return 1;
        if (b.zone === unassignedLabel) return -1;
        return a.zone.localeCompare(b.zone);
      });
  }, [availableTables, t]);

  useEffect(() => {
    if (assignTableModalOpen && reservation) {
      loadAvailableTables();
    }
  }, [assignTableModalOpen, reservation?.id]);

  const handleAssignTable = async () => {
    if (!reservation || selectedTableIds.length === 0) return;

    try {
      if (permissionsLoading) return;
      if (!canUpdateReservation) return;
      if (!canViewTables) return;

      setIsActionLoading(true);
      const token = await getToken();
      if (!token) return;

      await reservationService.assignTable(reservation.id, { tableIds: selectedTableIds }, token);
      setToast({
        visible: true,
        message: t("admin.reservationManagement.tableAssigned"),
        type: "success",
      });
      setAssignTableModalOpen(false);
      setSelectedTableIds([]);
      await loadReservation();
    } catch (error: any) {
      console.error("Error assigning table:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorAssigningTable"),
        type: "error",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;

    try {
      if (permissionsLoading) return;
      if (!canCancelReservation) return;

      setIsActionLoading(true);
      const token = await getToken();
      if (!token) return;

      await reservationService.cancelReservation(reservation.id, undefined, token);
      
      // Show success message with refund info if applicable
      if (reservation.type === "PRE_ORDER" && refundInfo && refundInfo.refundAmount > 0) {
        setToast({
          visible: true,
          message: t("admin.reservationManagement.cancelDialog.cancelSuccessWithRefund", {
            amount: formatAmount(refundInfo.refundAmount),
          }),
          type: "success",
        });
      } else {
        setToast({
          visible: true,
          message: t("admin.reservationManagement.cancelled"),
          type: "success",
        });
      }

      setIsCancelModalOpen(false);
      setRefundInfo(null);
      await loadReservation();
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorCancelling"),
        type: "error",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const loadReservationHistory = async () => {
    if (!reservation) {
      console.warn("No reservation ID provided for loading history");
      return;
    }

    try {
      if (permissionsLoading) return;
      if (!canViewReservationHistory) return;

      setLoadingHistory(true);
      const token = await getToken();
      if (!token) {
        console.warn("No token available for loading history");
        return;
      }

      const history = await reservationService.getReservationHistory(reservation.id, token);
      setReservationHistory(Array.isArray(history) ? history : []);
    } catch (error: any) {
      console.error("Error loading history:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoadingHistory"),
        type: "error",
      });
      setReservationHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatusLabel = (status: ReservationStatus): string => {
    const statusKey = `admin.reservationManagement.statuses.${status.toLowerCase()}`;
    const translated = t(statusKey, { defaultValue: status });
    return translated !== statusKey ? translated : status;
  };

  const getTypeLabel = (type: ReservationType): string => {
    const typeKey = `admin.reservationManagement.types.${type.toLowerCase()}`;
    const translated = t(typeKey, { defaultValue: type });
    return translated !== typeKey ? translated : type;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.reservationManagement.details.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.reservationManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.reservationManagement.details.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <MaterialCommunityIcons name="alert-circle" size={48} color="#6b7280" />
          <Text style={styles.emptyText}>
            {t("admin.reservationManagement.errorLoading")}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>
              {t("admin.reservationManagement.goBack") || "Go Back"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t("admin.reservationManagement.details.title")}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight + 24, padding: 16, paddingBottom: 32 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Reservation Info */}
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>
            {t("admin.reservationManagement.details.reservationInfo")}
          </Text>
          <DetailRow
            label={t("admin.reservationManagement.details.number")}
            value={reservation.reservationNumber}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.date")}
            value={formatDate(reservation.reservationDate)}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.time")}
            value={formatTime(reservation.reservationDate)}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.guests")}
            value={reservation.numberOfGuests.toString()}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.status")}
            value={getStatusLabel(reservation.status)}
            valueColor={getStatusColor(reservation.status)}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.type")}
            value={getTypeLabel(reservation.type)}
          />
        </View>

        {/* Customer Info */}
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>
            {t("admin.reservationManagement.details.customerInfo")}
          </Text>
          <DetailRow
            label={t("admin.reservationManagement.details.name")}
            value={reservation.customerName}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.email")}
            value={reservation.customerEmail}
          />
          <DetailRow
            label={t("admin.reservationManagement.details.phone")}
            value={reservation.customerPhone}
          />
          {reservation.specialRequests && (
            <DetailRow
              label={t("admin.reservationManagement.details.specialRequests")}
              value={reservation.specialRequests}
            />
          )}
        </View>

        {/* Table Info */}
        {(reservation.tables && reservation.tables.length > 0) ||
        reservation.table ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              {t("admin.reservationManagement.details.tableInfo")}
            </Text>
            {reservation.tables && reservation.tables.length > 0 ? (
              reservation.tables.map((rt: any, index: number) => (
                <DetailRow
                  key={index}
                  label={`${t("admin.reservationManagement.details.table")} ${index + 1}`}
                  value={`${rt.table?.tableNumber} (${rt.table?.capacity} ${t("admin.reservationManagement.seats")})${rt.table?.zoneRelation?.name ? ` - ${rt.table.zoneRelation.name}` : rt.table?.zone ? ` - ${rt.table.zone}` : ""}`}
                />
              ))
            ) : reservation.table ? (
              <DetailRow
                label={t("admin.reservationManagement.details.table")}
                value={`${reservation.table.tableNumber} (${reservation.table.capacity} ${t("admin.reservationManagement.seats")})${reservation.table.zoneRelation?.name ? ` - ${reservation.table.zoneRelation.name}` : reservation.table.zone ? ` - ${reservation.table.zone}` : ""}`}
              />
            ) : null}
          </View>
        ) : null}

        {/* Zone Info */}
        {reservation.zone && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              {t("admin.reservationManagement.details.zone")}
            </Text>
            <DetailRow
              label={t("admin.reservationManagement.details.zone")}
              value={reservation.zone.name}
            />
          </View>
        )}

        {/* Preferred Zone (if no zone assigned) */}
        {reservation.preferredZone && !reservation.zone && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              {t("admin.reservationManagement.details.zone")}
            </Text>
            <DetailRow
              label={t("admin.reservationManagement.details.zone")}
              value={reservation.preferredZone}
            />
          </View>
        )}

        {/* Branch Info */}
        {reservation.branch && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              {t("admin.reservationManagement.details.branch")}
            </Text>
            <DetailRow
              label={t("admin.reservationManagement.details.branch")}
              value={reservation.branch.name}
            />
          </View>
        )}

        {/* Pre-Order Details */}
        {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              {t("admin.reservationManagement.details.orderSummary")}
            </Text>
            
            {/* Order Items */}
            {reservation.reservationOrder.items && reservation.reservationOrder.items.length > 0 ? (
              <View style={styles.orderItemsContainer}>
                <Text style={styles.orderItemsTitle}>
                  {reservation.reservationOrder.items.length === 1
                    ? `${reservation.reservationOrder.items.length} ${t("admin.reservationManagement.details.item")}`
                    : `${reservation.reservationOrder.items.length} ${t("admin.reservationManagement.details.items")}`}
                </Text>
                
                {reservation.reservationOrder.items.map((item: any, index: number) => (
                  <View key={index} style={styles.orderItemCard}>
                    {/* Main Item Info */}
                    <View style={styles.orderItemHeader}>
                      {item.meal?.image ? (
                        <Image
                          source={{ uri: getOptimizedImageUrl(item.meal.image) }}
                          style={styles.orderItemImage}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={styles.orderItemImagePlaceholder}>
                          <MaterialCommunityIcons
                            name="image"
                            size={24}
                            color="#6B7280"
                          />
                        </View>
                      )}
                      <View style={styles.orderItemInfo}>
                        <View style={styles.orderItemNameRow}>
                          <Text style={styles.orderItemName} numberOfLines={2}>
                            {item.meal?.name || t("admin.reservationManagement.details.meal")}
                          </Text>
                          <Text style={styles.orderItemPrice}>
                            {formatMoney(item.totalPrice, displayCurrency)}
                          </Text>
                        </View>
                        <View style={styles.orderItemMeta}>
                          {item.selectedSize && (
                            <Text style={styles.orderItemMetaText}>
                              {item.selectedSize}
                            </Text>
                          )}
                          {item.selectedSize && item.quantity && (
                            <Text style={styles.orderItemMetaText}> × </Text>
                          )}
                          {item.quantity && (
                            <Text style={styles.orderItemMetaText}>
                              {item.quantity}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Add-ons */}
                    {item.addons && item.addons.length > 0 && (
                      <View style={styles.orderItemAddons}>
                        {item.addons.map((addOn: any) => {
                          const addonUnitPrice = Number(addOn.addOnPrice || 0);
                          const addonQuantity = addOn.quantity || 1;
                          const addonTotalPrice = addonUnitPrice * addonQuantity;
                          const addonName = addOn.addOnName || addOn.addon?.name || t("admin.reservationManagement.details.addon");
                          return (
                            <View key={addOn.id} style={styles.addonRow}>
                              <Text style={styles.addonName}>
                                {addonName}
                                {addonQuantity > 1 && (
                                  <Text style={styles.addonQuantity}> ×{addonQuantity}</Text>
                                )}
                              </Text>
                              <Text style={styles.addonPrice}>
                                {formatMoney(addonTotalPrice, displayCurrency)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Optional Ingredients */}
                    {item.optionalIngredients && item.optionalIngredients.length > 0 && (
                      <View style={styles.orderItemIngredients}>
                        {(() => {
                          const included = item.optionalIngredients.filter(
                            (ing: any) => ing.isIncluded
                          );
                          return included.length > 0 ? (
                            <View style={styles.ingredientsContainer}>
                              {included.map((ing: any) => (
                                <View key={ing.id} style={styles.ingredientBadge}>
                                  <Text style={styles.ingredientText}>
                                    {ing.ingredientName}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null;
                        })()}
                      </View>
                    )}

                    {/* Special Instructions */}
                    {item.specialInstructions && (
                      <View style={styles.orderItemInstructions}>
                        <Text style={styles.instructionsText}>
                          {item.specialInstructions}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* Order Summary */}
                <View style={styles.orderSummary}>
                  <Text style={styles.orderSummaryTitle}>
                    {t("admin.reservationManagement.details.orderSummary")}
                  </Text>
                  
                  <View style={styles.orderSummaryRow}>
                    <Text style={styles.orderSummaryLabel}>
                      {t("admin.reservationManagement.details.subtotal")}
                    </Text>
                    <Text style={styles.orderSummaryValue}>
                      {formatMoney(
                        Number(reservation.reservationOrder.totalAmount || 0) -
                          Number(reservation.reservationOrder.taxAmount || 0),
                        displayCurrency
                      )}
                    </Text>
                  </View>

                  {reservation.reservationOrder.taxAmount && 
                   Number(reservation.reservationOrder.taxAmount) > 0 && (
                    <>
                      <View style={styles.orderSummaryRow}>
                        <Text style={styles.orderSummaryLabel}>
                          {t("admin.reservationManagement.details.tax")}
                        </Text>
                        <Text style={styles.orderSummaryValue}>
                          {formatMoney(reservation.reservationOrder.taxAmount, displayCurrency)}
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={styles.orderSummaryTotal}>
                    <Text style={styles.orderSummaryTotalLabel}>
                      {t("admin.reservationManagement.details.total")}
                    </Text>
                    <Text style={styles.orderSummaryTotalValue}>
                      {formatMoney(reservation.reservationOrder.totalAmount, displayCurrency)}
                    </Text>
                  </View>
                  
                  {/* Show paid amount vs total if deposit was used */}
                  {reservation.reservationOrder.paidAmount !== undefined && 
                   Number(reservation.reservationOrder.paidAmount) !== Number(reservation.reservationOrder.totalAmount) && (
                    <>
                      <View style={[styles.orderSummaryRow, styles.paymentInfoRow]}>
                        <Text style={styles.paymentInfoLabel}>
                          {t("admin.reservationManagement.details.paidAmount", "Paid Amount")}
                        </Text>
                        <Text style={styles.paidAmountValue}>
                          {formatMoney(Number(reservation.reservationOrder.paidAmount || 0), displayCurrency)}
                        </Text>
                      </View>
                      {reservation.reservationOrder.depositPercentage && (
                        <View style={styles.orderSummaryRow}>
                          <Text style={styles.depositPercentageLabel}>
                            {t("admin.reservationManagement.details.depositPercentage", "Deposit")}
                          </Text>
                          <Text style={styles.depositPercentageValue}>
                            {Number(reservation.reservationOrder.depositPercentage)}%
                          </Text>
                        </View>
                      )}
                      <View style={[styles.orderSummaryRow, styles.paymentInfoRow]}>
                        <Text style={styles.paymentInfoLabel}>
                          {t("admin.reservationManagement.details.remainingBalance", "Remaining Balance")}
                        </Text>
                        <Text style={styles.remainingBalanceValue}>
                          {formatMoney(
                            Number(reservation.reservationOrder.totalAmount) -
                              Number(reservation.reservationOrder.paidAmount || 0),
                            displayCurrency
                          )}
                        </Text>
                      </View>
                      
                      {/* Complete Payment Button */}
                      {canUpdateReservation && (
                        <View style={styles.completePaymentButtonContainer}>
                          <TouchableOpacity
                            onPress={async () => {
                              if (!reservation) return;
                              if (permissionsLoading) return;
                              if (!canUpdateReservation) return;
                              try {
                                setIsCompletingPayment(true);
                                const token = (await getToken()) || undefined;
                                await reservationService.completeReservationPayment(
                                  reservation.id,
                                  token
                                );
                                setToast({
                                  visible: true,
                                  message: t(
                                    "admin.reservationManagement.messages.paymentCompleted",
                                    "Payment completed successfully"
                                  ),
                                  type: "success",
                                });

                                // Reload reservation data
                                await loadReservation();
                              } catch (error: any) {
                                console.error("Error completing payment:", error);
                                setToast({
                                  visible: true,
                                  message:
                                    error.response?.data?.error ||
                                    t(
                                      "admin.reservationManagement.messages.completePaymentError",
                                      "Failed to complete payment"
                                    ),
                                  type: "error",
                                });
                              } finally {
                                setIsCompletingPayment(false);
                              }
                            }}
                            disabled={isCompletingPayment}
                            style={[
                              styles.completePaymentButton,
                              isCompletingPayment &&
                                styles.completePaymentButtonDisabled,
                            ]}
                          >
                            {isCompletingPayment ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.completePaymentButtonText}>
                                {t(
                                  "admin.reservationManagement.actions.completePayment",
                                  "Complete Payment"
                                )}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.noItemsContainer}>
                <Text style={styles.noItemsText}>
                  {t("admin.reservationManagement.details.noPreOrderItems")}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {reservation.status === "PENDING" && canConfirmReservation && (
            <TouchableOpacity
              onPress={() => handleStatusChange("CONFIRMED")}
              disabled={isActionLoading}
              style={[styles.actionButton, styles.confirmButton]}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {t("admin.reservationManagement.actions.confirm")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {reservation.status === "CONFIRMED" && canSeatReservation && (
            <>
              <TouchableOpacity
                onPress={() => handleStatusChange("SEATED")}
                disabled={isActionLoading}
                style={[styles.actionButton, styles.seatedButton]}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="account" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>
                      {t("admin.reservationManagement.actions.markAsSeated")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {!reservation.tableId && canUpdateReservation && canViewTables && (
                <TouchableOpacity
                  onPress={() => {
                    setAssignTableModalOpen(true);
                  }}
                  style={[styles.actionButton, styles.assignButton]}
                >
                  <MaterialCommunityIcons name="map-marker" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {t("admin.reservationManagement.actions.assignTable")}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {reservation.status === "SEATED" && canCompleteReservation && (
            <TouchableOpacity
              onPress={() => handleStatusChange("COMPLETED")}
              disabled={isActionLoading}
              style={[styles.actionButton, styles.completeButton]}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {t("admin.reservationManagement.actions.markAsCompleted")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {["PENDING", "CONFIRMED"].includes(reservation.status) &&
            canCancelReservation && (
            <TouchableOpacity
              onPress={() => setIsCancelModalOpen(true)}
              disabled={isActionLoading}
              style={[styles.actionButton, styles.cancelButton]}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {t("admin.reservationManagement.actions.cancel")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canViewReservationHistory && (
            <TouchableOpacity
              onPress={async () => {
                if (!reservation) {
                  console.warn("No reservation selected for viewing history");
                  return;
                }
                if (permissionsLoading) return;
                if (!canViewReservationHistory) return;
                setIsHistoryModalOpen(true);
                await loadReservationHistory();
              }}
              style={[styles.actionButton, styles.historyButton]}
            >
              <MaterialCommunityIcons name="clock" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>
                {t("admin.reservationManagement.actions.viewHistory")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Cancel Confirmation Modal */}
      <Modal
        visible={isCancelModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsCancelModalOpen(false);
          setRefundInfo(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setIsCancelModalOpen(false);
            setRefundInfo(null);
          }}
        >
          <Pressable style={styles.confirmModal} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={styles.confirmModalScroll}
              contentContainerStyle={styles.confirmModalContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.confirmModalTitle}>
                {t("admin.reservationManagement.cancelDialog.title")}
              </Text>
              <Text style={styles.confirmModalText}>
                {t("admin.reservationManagement.cancelDialog.description", {
                  reservationNumber: reservation?.reservationNumber,
                })}
              </Text>

              {(() => {
                if (!reservation || reservation.type !== "PRE_ORDER") {
                  return null;
                }

                if (!refundInfo) {
                  return (
                    <View style={styles.refundInfoContainer}>
                      <ActivityIndicator size="small" color="#ec4899" />
                      <Text style={styles.refundInfoText}>
                        {t("admin.reservationManagement.cancelDialog.calculatingRefund")}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View style={styles.refundInfoContainer}>
                    <View style={styles.refundInfoHeader}>
                      <MaterialCommunityIcons name="alert" size={20} color="#fbbf24" />
                      <Text style={styles.refundInfoTitle}>
                        {t("admin.reservationManagement.cancelDialog.refundConsequences")}
                      </Text>
                    </View>

                    {refundInfo.refundType === "NO_REFUND" ? (
                      <View style={[styles.refundWarningBox, styles.noRefundBox]}>
                        <Text style={styles.refundWarningText}>
                          {t("admin.reservationManagement.cancelDialog.noRefundWarning", {
                            hours: Math.ceil(refundInfo.hoursUntilReservation),
                          })}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.refundAmountBox}>
                          <Text style={styles.refundAmountLabel}>
                            {t("admin.reservationManagement.cancelDialog.estimatedRefund")}
                          </Text>
                          <Text style={styles.refundAmountValue}>
                            {formatMoney(refundInfo.refundAmount, displayCurrency)}
                          </Text>
                          <Text style={styles.refundPercentage}>
                            ({Math.round(refundInfo.refundPercentage * 100)}% {t("admin.reservationManagement.cancelDialog.ofTotal")})
                          </Text>
                        </View>

                        <View style={styles.refundDetailsBox}>
                          <Text style={styles.refundDetailsTitle}>
                            {t("admin.reservationManagement.cancelDialog.refundPolicy")}
                          </Text>
                          <Text style={styles.refundDetailsText}>
                            {refundInfo.refundType === "FULL"
                              ? t("admin.reservationManagement.cancelDialog.fullRefundPolicy", {
                                  hours: reservationSettings?.fullRefundHoursBefore || 24,
                                })
                              : refundInfo.refundType === "PARTIAL_50"
                              ? t("admin.reservationManagement.cancelDialog.partialRefundPolicy", {
                                  hours: reservationSettings?.partialRefundHoursBefore || 4,
                                  percentage: 50,
                                })
                              : t("admin.reservationManagement.cancelDialog.reducedRefundPolicy", {
                                  hours: reservationSettings?.noRefundHoursBefore || 1,
                                  percentage: 25,
                                })}
                          </Text>
                          <Text style={styles.refundDetailsNote}>
                            {t("admin.reservationManagement.cancelDialog.refundNote")}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                );
              })()}

              <View style={styles.confirmModalActions}>
                <TouchableOpacity
                  onPress={() => {
                    setIsCancelModalOpen(false);
                    setRefundInfo(null);
                  }}
                  style={[styles.confirmModalButton, styles.cancelModalButton]}
                >
                  <Text style={styles.cancelModalButtonText}>
                    {t("admin.reservationManagement.cancelDialog.keepReservation")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancel}
                  disabled={isActionLoading}
                  style={[styles.confirmModalButton, styles.confirmDeleteButton]}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmDeleteButtonText}>
                      {t("admin.reservationManagement.cancelDialog.cancelReservation")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* History Modal */}
      <Modal
        visible={isHistoryModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsHistoryModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderContent}>
              <View style={styles.modalHeaderTitleRow}>
                <MaterialCommunityIcons name="clock" size={20} color="#ec4899" />
                <Text style={styles.modalTitle}>
                  {t("admin.reservationManagement.history.title")}
                </Text>
              </View>
              {reservation && (
                <Text style={styles.modalDescription}>
                  {t("admin.reservationManagement.history.description", {
                    reservationNumber: reservation.reservationNumber,
                  })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setIsHistoryModalOpen(false)}
              style={styles.modalCloseButton}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            showsVerticalScrollIndicator={true}
          >
              {loadingHistory ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ec4899" />
                </View>
              ) : reservationHistory.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="clock" size={48} color="#6b7280" />
                  <Text style={styles.emptyText}>
                    {t("admin.reservationManagement.history.noHistory")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.reservationManagement.history.noHistoryDescription")}
                  </Text>
                </View>
              ) : (
                <View style={styles.timelineContainer}>
                  {/* Timeline line */}
                  <View style={styles.timelineLine} />
                  
                  {reservationHistory.map((entry, index) => {
                    const date = new Date(entry.timestamp);
                    const formattedDate = date.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                    const formattedTime = date.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    // Get icon and color based on event type
                    const getEventConfig = () => {
                      switch (entry.type) {
                        case "RESERVATION_CREATED":
                          return {
                            icon: "calendar",
                            bgColor: "rgba(59, 130, 246, 0.1)",
                            borderColor: "#3b82f6",
                            dotColor: "#3b82f6",
                          };
                        case "RESERVATION_CONFIRMED":
                          return {
                            icon: "check-circle",
                            bgColor: "rgba(34, 197, 94, 0.1)",
                            borderColor: "#22c55e",
                            dotColor: "#22c55e",
                          };
                        case "TABLE_ASSIGNED":
                        case "TABLES_ASSIGNED":
                          return {
                            icon: "map-marker",
                            bgColor: "rgba(168, 85, 247, 0.1)",
                            borderColor: "#a855f7",
                            dotColor: "#a855f7",
                          };
                        case "CUSTOMER_SEATED":
                          return {
                            icon: "account",
                            bgColor: "rgba(249, 115, 22, 0.1)",
                            borderColor: "#f97316",
                            dotColor: "#f97316",
                          };
                        case "RESERVATION_COMPLETED":
                          return {
                            icon: "check-circle",
                            bgColor: "rgba(16, 185, 129, 0.1)",
                            borderColor: "#10b981",
                            dotColor: "#10b981",
                          };
                        case "RESERVATION_CANCELLED":
                          return {
                            icon: "close-circle",
                            bgColor: "rgba(239, 68, 68, 0.1)",
                            borderColor: "#ef4444",
                            dotColor: "#ef4444",
                          };
                        case "NO_SHOW":
                          return {
                            icon: "alert-circle",
                            bgColor: "rgba(239, 68, 68, 0.1)",
                            borderColor: "#ef4444",
                            dotColor: "#ef4444",
                          };
                        case "PAYMENT_PROCESSED":
                        case "PAYMENT_ADDED":
                          return {
                            icon: "currency-usd",
                            bgColor: "rgba(16, 185, 129, 0.1)",
                            borderColor: "#10b981",
                            dotColor: "#10b981",
                          };
                        default:
                          return {
                            icon: "clock",
                            bgColor: "rgba(107, 114, 128, 0.1)",
                            borderColor: "#6b7280",
                            dotColor: "#6b7280",
                          };
                      }
                    };

                    const eventConfig = getEventConfig();

                    return (
                      <View key={index} style={styles.timelineItem}>
                        {/* Timeline dot */}
                        <View style={[styles.timelineDot, { backgroundColor: eventConfig.dotColor }]}>
                          <View style={styles.timelineDotInner} />
                        </View>

                        {/* Event card */}
                        <View
                          style={[
                            styles.historyCard,
                            {
                              backgroundColor: eventConfig.bgColor,
                              borderColor: eventConfig.borderColor,
                            },
                          ]}
                        >
                          <View style={styles.historyCardHeader}>
                            <View
                              style={[
                                styles.historyIconContainer,
                                {
                                  backgroundColor: eventConfig.borderColor,
                                  borderWidth: 2,
                                  borderColor: "rgba(255, 255, 255, 0.3)",
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={eventConfig.icon as any}
                                size={14}
                                color="#ffffff"
                              />
                            </View>
                            <View style={styles.historyCardContent}>
                              <Text style={styles.historyAction}>{entry.action}</Text>
                              <View style={styles.historyTimeRow}>
                                <MaterialCommunityIcons name="clock" size={12} color="#9CA3AF" />
                                <Text style={styles.historyTimestamp}>
                                  {formattedDate} at {formattedTime}
                                </Text>
                              </View>
                            </View>
                            <View
                              style={[
                                styles.historyTypeBadge,
                                { borderColor: eventConfig.borderColor },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.historyTypeText,
                                  { color: eventConfig.borderColor },
                                ]}
                              >
                                {entry.type.replace(/_/g, " ")}
                              </Text>
                            </View>
                          </View>

                          {/* Details */}
                          {entry.details && (
                            <View style={styles.historyDetails}>
                              {entry.details.reservationNumber && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.reservation")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.reservationNumber}
                                  </Text>
                                </View>
                              )}
                              {entry.details.tableNumber && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.table")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.tableNumber}
                                  </Text>
                                </View>
                              )}
                              {entry.details.tables && Array.isArray(entry.details.tables) && entry.details.tables.length > 0 && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.tables")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.tables.map((t: any) => t.tableNumber || t).join(", ")}
                                  </Text>
                                </View>
                              )}
                              {entry.details.numberOfGuests && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.guests")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.numberOfGuests}
                                  </Text>
                                </View>
                              )}
                              {entry.details.reason && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.reason")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.reason}
                                  </Text>
                                </View>
                              )}
                              {entry.details.amount && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.amount")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {formatMoney(entry.details.amount, displayCurrency)}
                                  </Text>
                                </View>
                              )}
                              {entry.details.paymentId && (
                                <View style={styles.historyDetailRow}>
                                  <Text style={styles.historyDetailLabel}>
                                    {t("admin.reservationManagement.history.paymentId")}
                                  </Text>
                                  <Text style={styles.historyDetailValue}>
                                    {entry.details.paymentId}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
        </View>
      </Modal>

      {/* Assign Table Modal */}
      <Modal
        visible={assignTableModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAssignTableModalOpen(false);
          setSelectedTableIds([]);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setAssignTableModalOpen(false);
            setSelectedTableIds([]);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t("admin.reservationManagement.assignTable.title")}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setAssignTableModalOpen(false);
                  setSelectedTableIds([]);
                }}
                style={styles.sheetCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.sheetScrollView}
              contentContainerStyle={styles.sheetContentContainer}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {loadingTables ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ec4899" />
                  <Text style={styles.loadingText}>
                    {t("admin.reservationManagement.assignTable.loadingTables")}
                  </Text>
                </View>
              ) : availableTables.length === 0 ? (
                <View style={styles.sheetEmptyContainer}>
                  <MaterialCommunityIcons name="map-marker-off" size={48} color="#6b7280" />
                  <Text style={styles.sheetEmptyText}>
                    {t("admin.reservationManagement.assignTable.noAvailableTables") || "No available tables"}
                  </Text>
                </View>
              ) : (
                <>
                  {groupedTables.map(({ zone, tables: zoneTables }) => (
                    <View key={zone} style={styles.zoneCard}>
                      <View style={styles.zoneHeader}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#ec4899" />
                        <Text style={styles.zoneTitle}>{zone}</Text>
                        <Text style={styles.zoneCount}>{zoneTables.length}</Text>
                      </View>
                      <View style={styles.tableList}>
                        {zoneTables.map((table) => {
                          const isSelected = selectedTableIds.includes(table.id);
                          return (
                            <TouchableOpacity
                              key={table.id}
                              onPress={() => {
                                if (isSelected) {
                                  setSelectedTableIds((prev) =>
                                    prev.filter((id) => id !== table.id)
                                  );
                                } else {
                                  setSelectedTableIds((prev) => [...prev, table.id]);
                                }
                              }}
                              style={[
                                styles.tableCard,
                                isSelected && styles.tableCardSelected,
                              ]}
                            >
                              <View style={styles.tableCardContent}>
                                <View style={styles.tableCardHeader}>
                                  <View style={styles.tableCardLeft}>
                                    <View style={styles.tableNumberRow}>
                                      <Text style={styles.tableNumber}>{table.tableNumber}</Text>
                                      {table.zone && table.zone !== (t("admin.tableManagement.unassigned") || "Unassigned") && (
                                        <View style={styles.zoneBadgeInline}>
                                          <MaterialCommunityIcons name="map-marker" size={10} color="#ec4899" />
                                          <Text style={styles.zoneBadgeInlineText}>{table.zone}</Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.tableCardDetails}>
                                      <View style={styles.tableDetailRow}>
                                        <MaterialCommunityIcons name="account-group" size={14} color="#9CA3AF" />
                                        <Text style={styles.tableDetailText}>
                                          {table.capacity} {t("admin.reservationManagement.seats")}
                                        </Text>
                                      </View>
                                      {table.notes && (
                                        <View style={styles.tableDetailRow}>
                                          <MaterialCommunityIcons name="note-text" size={14} color="#9CA3AF" />
                                          <Text style={styles.tableDetailText} numberOfLines={1}>
                                            {table.notes}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                  {isSelected ? (
                                    <View style={styles.selectedIndicator}>
                                      <MaterialCommunityIcons name="check-circle" size={24} color="#ec4899" />
                                    </View>
                                  ) : (
                                    <View style={styles.unselectedIndicator}>
                                      <View style={styles.unselectedCircle} />
                                    </View>
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            {/* Fixed Assign Button Footer */}
            {selectedTableIds.length > 0 && (
              <View style={styles.assignButtonFooter}>
                <TouchableOpacity
                  onPress={handleAssignTable}
                  disabled={isActionLoading}
                  style={styles.assignButton}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                      <Text style={styles.assignButtonText}>
                        {selectedTableIds.length === 1
                          ? t("admin.reservationManagement.assignTable.assign", {
                              count: selectedTableIds.length,
                            })
                          : t("admin.reservationManagement.assignTable.assignPlural", {
                              count: selectedTableIds.length,
                            })}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: "#9CA3AF",
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
  },
  backButton: {
    marginTop: 24,
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  detailSection: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  detailLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    flex: 1,
  },
  detailValue: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
    textAlign: "right",
  },
  actionsContainer: {
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  confirmButton: {
    backgroundColor: "#3b82f6",
  },
  seatedButton: {
    backgroundColor: "#22c55e",
  },
  completeButton: {
    backgroundColor: "#10b981",
  },
  cancelButton: {
    backgroundColor: "#ef4444",
  },
  historyButton: {
    backgroundColor: "#6b7280",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  orderItemsContainer: {
    marginTop: 8,
  },
  orderItemsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  orderItemCard: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#404040",
  },
  orderItemHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  orderItemImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    marginRight: 8,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  orderItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  orderItemMetaText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  orderItemAddons: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  addonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  addonName: {
    fontSize: 12,
    color: "#fff",
    flex: 1,
  },
  addonQuantity: {
    color: "#9CA3AF",
  },
  addonPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  orderItemIngredients: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  ingredientsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  ingredientBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ingredientText: {
    fontSize: 10,
    color: "#22c55e",
  },
  orderItemInstructions: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  instructionsText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  orderSummary: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#404040",
  },
  orderSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  orderSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderSummaryLabel: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  orderSummaryValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  taxBreakdown: {
    marginLeft: 12,
    marginTop: 4,
  },
  taxBreakdownLabel: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  taxBreakdownValue: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  orderSummaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  orderSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  orderSummaryTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  paymentInfoRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#404040",
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
  completePaymentButtonContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  completePaymentButton: {
    backgroundColor: "#22c55e", // Green color
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  completePaymentButtonDisabled: {
    opacity: 0.6,
  },
  completePaymentButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  noItemsContainer: {
    padding: 32,
    alignItems: "center",
  },
  noItemsText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    height: "90%",
    width: "100%",
    flexDirection: "column",
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
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  sheetCloseButton: {
    padding: 4,
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalHeaderContent: {
    flex: 1,
    marginRight: 12,
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  modalDescription: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  zoneCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  zoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zoneTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  zoneCount: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
  },
  tableList: {
    gap: 12,
  },
  tableCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
    padding: 14,
  },
  tableCardSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  tableCardContent: {
    flex: 1,
  },
  tableCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tableCardLeft: {
    flex: 1,
  },
  tableNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tableNumber: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  zoneBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zoneBadgeInlineText: {
    color: "#ec4899",
    fontSize: 11,
    fontWeight: "600",
  },
  tableCardDetails: {
    gap: 6,
  },
  tableDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableDetailText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  selectedIndicator: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  unselectedIndicator: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  unselectedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#404040",
  },
  assignButtonFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    backgroundColor: "#171717",
  },
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingVertical: 14,
    borderRadius: 8,
  },
  assignButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sheetEmptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    minHeight: 200,
  },
  sheetEmptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  timelineContainer: {
    position: "relative",
    paddingLeft: 32,
    paddingTop: 8,
  },
  timelineLine: {
    position: "absolute",
    left: 15,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#ec4899",
  },
  timelineItem: {
    position: "relative",
    marginBottom: 12,
  },
  timelineDot: {
    position: "absolute",
    left: -32,
    top: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  timelineDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  historyCard: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 1.5,
    marginLeft: 8,
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  historyIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  historyCardContent: {
    flex: 1,
    minWidth: 0,
  },
  historyAction: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  historyTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  historyTimestamp: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  historyTypeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  historyTypeText: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  historyDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    gap: 6,
  },
  historyDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 6,
  },
  historyDetailLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    minWidth: 70,
    flexShrink: 0,
  },
  historyDetailValue: {
    fontSize: 11,
    color: "#fff",
    flex: 1,
    textAlign: "right",
  },
  confirmModal: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    maxHeight: Dimensions.get("window").height * 0.9,
    width: "100%",
  },
  confirmModalScroll: {
    maxHeight: Dimensions.get("window").height * 0.8,
  },
  confirmModalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  confirmModalText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 16,
  },
  refundInfoContainer: {
    marginBottom: 20,
    gap: 12,
  },
  refundInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  refundInfoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  refundInfoText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  refundWarningBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 12,
    padding: 16,
  },
  noRefundBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
  },
  refundWarningText: {
    fontSize: 14,
    color: "#fbbf24",
    lineHeight: 20,
  },
  refundAmountBox: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  refundAmountLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  refundAmountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#22c55e",
    marginBottom: 4,
  },
  refundPercentage: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  refundDetailsBox: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
  },
  refundDetailsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  refundDetailsText: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 18,
    marginBottom: 8,
  },
  refundDetailsNote: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  confirmModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelModalButton: {
    backgroundColor: "#262626",
  },
  cancelModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmDeleteButton: {
    backgroundColor: "#ef4444",
  },
  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
