import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  notificationApiService,
  type NotificationItem,
} from "@/src/services/notificationApiService";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;

  const canViewNotifications =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.NOTIFICATIONS, action: ACTIONS.VIEW }]);

  // Translated date formatter
  const formatDistanceToNow = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return t("admin.notifications.time.justNow");
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return t("admin.notifications.time.minutesAgo", { count: minutes });
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return t("admin.notifications.time.hoursAgo", { count: hours });
    }
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return t("admin.notifications.time.daysAgo", { count: days });
    }
    if (diffInSeconds < 2592000) {
      const weeks = Math.floor(diffInSeconds / 604800);
      return t("admin.notifications.time.weeksAgo", { count: weeks });
    }
    if (diffInSeconds < 31536000) {
      const months = Math.floor(diffInSeconds / 2592000);
      return t("admin.notifications.time.monthsAgo", { count: months });
    }
    const years = Math.floor(diffInSeconds / 31536000);
    return t("admin.notifications.time.yearsAgo", { count: years });
  };
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [unseenCount, setUnseenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const limit = 10;
  const fetchingRef = useRef(false);
  const fetchingUnseenRef = useRef(false);
  const loadingMoreRef = useRef(false); // Track if we're currently loading more
  const slideAnim = useRef(new Animated.Value(-400)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Initialize notification service on mount
  useEffect(() => {
    notificationService.init();
  }, []);

  // Function to play notification sound
  const playNotificationSound = useCallback(async () => {
    await notificationService.notifyStatusChange();
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (fetchingRef.current) {
        loadingMoreRef.current = false; // Reset if already fetching
        return;
      }

      if (!canViewNotifications) {
        setUnseenCount(0);
        setHasMore(false);
        return;
      }

      try {
        fetchingRef.current = true;
        setLoading(true);
        const token = await getToken();
        if (!token) {
          loadingMoreRef.current = false;
          return;
        }

        const response = await notificationApiService.getNotifications(
          pageNum,
          limit,
          token,
          selectedOrganizationId ?? undefined
        );

        if (append) {
          // Append new notifications, avoiding duplicates
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newNotifications = response.notifications.filter(
              (n) => !existingIds.has(n.id)
            );
            return [...prev, ...newNotifications];
          });
        } else {
          // When replacing (first page), merge with existing WebSocket notifications
          // to preserve real-time updates that might have come in
          setNotifications((prev) => {
            const existingIds = new Set(
              response.notifications.map((n) => n.id)
            );
            // Keep WebSocket notifications that aren't in the API response
            const websocketNotifications = prev.filter(
              (n) => !existingIds.has(n.id)
            );
            // Combine: API notifications first (most recent from server), then WebSocket ones
            return [...response.notifications, ...websocketNotifications];
          });
        }

        setHasMore(pageNum < response.pagination.pages);
      } catch (error: any) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
        loadingMoreRef.current = false; // Reset loading more flag on completion
      }
    },
    [getToken, selectedOrganizationId]
  );

  // Load more when scroll reaches bottom
  const handleLoadMore = useCallback(() => {
    // Prevent duplicate calls
    if (loading || !hasMore || fetchingRef.current || loadingMoreRef.current) {
      return;
    }

    // Mark as loading more to prevent duplicate calls
    loadingMoreRef.current = true;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true).finally(() => {
      // Reset the loading more flag after fetch completes
      loadingMoreRef.current = false;
    });
  }, [loading, hasMore, page, fetchNotifications]);

  // Reset when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setHasMore(true);
      loadingMoreRef.current = false; // Reset loading more flag
    }
  }, [isOpen]);

  // Initial load when drawer opens (always fetch to ensure we have latest data)
  useEffect(() => {
    if (isOpen) {
      if (!canViewNotifications) {
        setUnseenCount(0);
        return;
      }
      setPage(1);
      // Always fetch first page when drawer opens to ensure we have latest notifications
      // WebSocket updates will merge with this list
      fetchNotifications(1, false);
    }
  }, [isOpen, fetchNotifications, canViewNotifications]);

  // Refresh unseen count periodically and on mount
  useEffect(() => {
    const refreshCount = async () => {
      if (fetchingUnseenRef.current) return;
      fetchingUnseenRef.current = true;

      try {
        if (!canViewNotifications) {
          setUnseenCount(0);
          return;
        }
        const token = await getToken();
        if (!token) return;

        const unseen = await notificationApiService.getUnseenNotifications(
          token,
          selectedOrganizationId ?? undefined
        );
        setUnseenCount(unseen.length);
      } catch (error) {
        console.error("Error fetching unseen count:", error);
      } finally {
        fetchingUnseenRef.current = false;
      }
    };

    refreshCount();
    const interval = setInterval(refreshCount, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [getToken, canViewNotifications, selectedOrganizationId]);

  // Reset notification list when organization changes
  useEffect(() => {
    if (organizationLoading) return;
    setNotifications([]);
    setPage(1);
    setHasMore(true);
    loadingMoreRef.current = false;
    fetchingRef.current = false;
    fetchingUnseenRef.current = false;
    setUnseenCount(0);

    // If drawer is open, refetch immediately for the new org
    if (isOpen && canViewNotifications) {
      fetchNotifications(1, false);
    }
  }, [selectedOrganizationId, organizationLoading, isOpen, canViewNotifications, fetchNotifications]);

  // WebSocket connection for real-time notifications (using singleton pattern)
  // This effect runs once on mount and stays active for the component lifetime
  useEffect(() => {
    if (!canViewNotifications) {
      return;
    }
    const socketService = SocketService.getInstance(); // Singleton pattern
    let isMounted = true;

    const connectSocket = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        // Wait a bit for connection to be fully established
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      }
    };

    // Connect immediately (SocketService singleton handles race conditions)
    connectSocket();

    const handleNewOrder = (data: {
      notification: NotificationItem;
      order: any;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (selectedOrganizationId && data.organizationId && data.organizationId !== selectedOrganizationId) {
        return;
      }

      playNotificationSound();

      // Add notification to the beginning of the list (real-time update)
      setNotifications((prev) => {
        // Check if notification already exists (avoid duplicates)
        const exists = prev.some((n) => n.id === data.notification.id);
        if (exists) {
          return prev;
        }
        return [data.notification, ...prev];
      });

      // Update unseen count (real-time update)
      setUnseenCount((prev) => prev + 1);

      // Refresh unseen count to ensure accuracy (async, won't block real-time updates)
      const refreshCount = async () => {
        try {
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationApiService.getUnseenNotifications(
            token,
            selectedOrganizationId ?? undefined
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error) {
          console.error("Error refreshing unseen count:", error);
        }
      };
      refreshCount();
    };

    const handleOrderUpdated = (data: {
      notification: NotificationItem;
      order: any;
      newItems?: any[];
      isMergeRequest?: boolean;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (selectedOrganizationId && data.organizationId && data.organizationId !== selectedOrganizationId) {
        return;
      }

      // Safety check: ensure we have valid data
      if (!data.notification || !data.order) {
        console.error("Invalid order-updated data received:", data);
        return;
      }

      // Use order from data if notification.order is missing
      const orderData = data.notification.order || data.order;
      if (!orderData || !orderData.id) {
        console.error("Invalid order data in order-updated event:", data);
        return;
      }

      playNotificationSound();

      // Attach merge request info to notification order (like React frontend)
      const notificationWithMergeInfo = {
        ...data.notification,
        order: {
          ...orderData,
          _mergeRequest: data.isMergeRequest
            ? {
                newItems: data.newItems || [],
              }
            : undefined,
        },
      };

      setNotifications((prev) => {
        const existingIndex = prev.findIndex(
          (n) => n.order?.id === orderData.id
        );

        if (existingIndex !== -1) {
          const updated = [...prev];
          const wasPreviouslySeen = updated[existingIndex].isSeen;
          updated[existingIndex] = notificationWithMergeInfo;

          if (wasPreviouslySeen && !notificationWithMergeInfo.isSeen) {
            setUnseenCount((count) => count + 1);
          }

          return [
            updated[existingIndex],
            ...updated.filter((_, i) => i !== existingIndex),
          ];
        } else {
          const exists = prev.some((n) => n.id === data.notification.id);
          if (exists) {
            return prev;
          }

          if (!notificationWithMergeInfo.isSeen) {
            setUnseenCount((count) => count + 1);
          }

          return [notificationWithMergeInfo, ...prev];
        }
      });
    };

    const handleNotificationSeen = (data: {
      orderId: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted) return;

      setNotifications((prev) => {
        return prev.map((notif) => {
          // Only check order notifications - skip if order is null
          if (notif.order && notif.order.id === data.orderId) {
            return {
              ...notif,
              isSeen: true,
              seenAt: data.seenAt ? new Date(data.seenAt).toISOString() : null,
            };
          }
          return notif;
        });
      });

      setUnseenCount((prev) => Math.max(0, prev - 1));
    };

    const handleAllNotificationsSeen = () => {
      if (!isMounted) return;

      setNotifications((prev) =>
        prev.map((notif) => ({
          ...notif,
          isSeen: true,
        }))
      );

      setUnseenCount(0);
    };

    // Register WebSocket listeners (singleton handles connection state)
    // These listeners will be queued if socket isn't ready yet
    socketService.on("new-order", handleNewOrder);
    socketService.on("order-updated", handleOrderUpdated);
    socketService.on("notification-seen", handleNotificationSeen);
    socketService.on("all-notifications-seen", handleAllNotificationsSeen);

    // Cleanup: Remove listeners when component unmounts
    // Note: We don't disconnect the socket here as it's a singleton
    // Other components might be using it
    return () => {
      isMounted = false;
      socketService.off("new-order", handleNewOrder);
      socketService.off("order-updated", handleOrderUpdated);
      socketService.off("notification-seen", handleNotificationSeen);
      socketService.off("all-notifications-seen", handleAllNotificationsSeen);
    };
  }, [getToken, playNotificationSound, canViewNotifications, selectedOrganizationId]);

  const handleNotificationClick = async (notification: NotificationItem) => {
    // Handle reservation notifications
    if ((notification.type === "RESERVATION" || notification.reservationId) && notification.reservation) {
      // Mark as seen if possible - use notification.id, not reservationId
      try {
        const token = await getToken();
        if (notification.id) {
          await notificationApiService.markAsSeen(
            notification.id,
            token || undefined
          );
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, isSeen: true } : n))
          );
          setUnseenCount((prev) => Math.max(0, prev - 1));
        }
      } catch (error: any) {
        // Handle 404 gracefully (notification might already be deleted or marked as seen)
        if (error?.message?.includes('404')) {
          console.warn("Notification already marked as seen or deleted:", notification.id);
          // Still update UI optimistically
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, isSeen: true } : n))
          );
          setUnseenCount((prev) => Math.max(0, prev - 1));
        } else {
          console.error("Error marking reservation notification as seen:", error);
        }
      }

      // Navigate to reservation details page
      setIsOpen(false);
      router.push(`/(admin)/reservation-details?id=${notification.reservation.id}` as any);
      return;
    }

    // Handle order notifications
    if (!notification.order) {
      return;
    }

    // Mark as seen - use notification.id, not order.id
    try {
      const token = await getToken();
      if (notification.id) {
        await notificationApiService.markAsSeen(
          notification.id,
          token || undefined
        );
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isSeen: true } : n))
        );
        setUnseenCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error: any) {
      // Handle 404 gracefully (notification might already be deleted or marked as seen)
      if (error?.message?.includes('404')) {
        console.warn("Notification already marked as seen or deleted:", notification.id);
        // Still update UI optimistically
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isSeen: true } : n))
        );
        setUnseenCount((prev) => Math.max(0, prev - 1));
      } else {
        console.error("Error marking notification as seen:", error);
      }
    }

    // Navigate to order details page showing only this order
    // Double-check that order exists before navigating
    if (!notification.order || !notification.order.id) {
      console.warn("Cannot navigate: notification.order is null or missing id");
      return;
    }
    
    setIsOpen(false);
    router.push(`/(admin)/order-details?id=${notification.order.id}` as any);
  };

  const handleMarkAllAsSeen = async () => {
    try {
      const token = await getToken();
      await notificationApiService.markAllAsSeen(token || undefined);
      setNotifications((prev) => prev.map((n) => ({ ...n, isSeen: true })));
      setUnseenCount(0);
    } catch (error) {
      console.error("Error marking all as seen:", error);
    }
  };

  // Animate drawer when opening/closing
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Stop any ongoing animations
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

      // Always reset to starting position when opening
      slideAnim.setValue(-400);
      fadeAnim.setValue(0);

      // Small delay to ensure values are set before animation starts
      requestAnimationFrame(() => {
        // Animate drawer sliding from left with smooth easing
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else if (shouldRender) {
      // Animate drawer sliding back to left when closing
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

      // Small delay to ensure smooth animation
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -400,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Only unmount after animation completes
          setShouldRender(false);
        });
      });
    }
  }, [isOpen, shouldRender, slideAnim, fadeAnim]);

  return (
    <>
      <TouchableOpacity
        style={styles.bellButton}
        onPress={() => setIsOpen(true)}
      >
        <MaterialCommunityIcons name="bell" size={18} color="#fff" />
        {unseenCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unseenCount > 9 ? "9+" : unseenCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={shouldRender || isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.overlay,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setIsOpen(false)}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.drawer,
              {
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.drawerHeader, { paddingTop: statusBarHeight + 12 }]}>
              <View style={styles.drawerHeaderLeft}>
                <Text style={styles.drawerTitle}>
                  {t("admin.notifications.title")}
                </Text>
              </View>
              <View style={styles.drawerHeaderRight}>
                {unseenCount > 0 && (
                  <TouchableOpacity
                    style={styles.markAllButton}
                    onPress={handleMarkAllAsSeen}
                  >
                    <Text style={styles.markAllButtonText}>
                      {t("admin.notifications.markAllRead")}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsOpen(false)}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notifications List */}
            <ScrollView
              style={styles.drawerContent}
              onScroll={({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } =
                  nativeEvent;
                const paddingToBottom = 50; // Increased threshold for better detection
                const isNearBottom =
                  layoutMeasurement.height + contentOffset.y >=
                  contentSize.height - paddingToBottom;

                if (isNearBottom) {
                  handleLoadMore();
                }
              }}
              scrollEventThrottle={200}
              onMomentumScrollEnd={({ nativeEvent }) => {
                // Also check on momentum scroll end for better reliability
                const { layoutMeasurement, contentOffset, contentSize } =
                  nativeEvent;
                const paddingToBottom = 50;
                if (
                  layoutMeasurement.height + contentOffset.y >=
                  contentSize.height - paddingToBottom
                ) {
                  handleLoadMore();
                }
              }}
            >
              {notifications.length === 0 && !loading && (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="bell" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>
                    {t("admin.notifications.noNotifications")}
                  </Text>
                </View>
              )}

              {notifications.map((notification) => {
                // Handle reservation notifications
                if ((notification.type === "RESERVATION" || notification.reservationId) && notification.reservation) {
                  const reservation = notification.reservation;
                  const user = reservation.user;
                  const customerName = user
                    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
                    : reservation.customerName || t("admin.notifications.guest") || "Guest";
                  
                  const reservationDate = new Date(reservation.reservationDate);
                  const formattedDate = reservationDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const formattedTime = reservationDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });

                  // Check if this is a modification (notification created after reservation was created)
                  const isModification = notification.createdAt && reservation.createdAt 
                    ? new Date(notification.createdAt) > new Date(reservation.createdAt)
                    : false;

                  // Get modification details from reservation (passed from backend via WebSocket)
                  const reservationWithOrder = reservation as any;
                  const modificationDetails = reservationWithOrder?._modificationDetails;
                  const itemsAdded = modificationDetails?.itemsAdded || 0;
                  const itemsRemoved = modificationDetails?.itemsRemoved || 0;
                  const modificationType = modificationDetails?.modificationType || "GENERAL";

                  // Determine what was modified
                  let modificationTitle = `Reservation #${reservation.reservationNumber || 'N/A'} Modified`;
                  let modificationMessage = "";
                  
                  if (isModification && modificationType === "ITEMS_REMOVED" && itemsRemoved > 0) {
                    modificationTitle = `Reservation #${reservation.reservationNumber || 'N/A'} - Items Removed`;
                    modificationMessage = `${customerName} removed ${itemsRemoved} item${itemsRemoved !== 1 ? 's' : ''} from their pre-order. Refund will be processed automatically.`;
                  } else if (isModification && modificationType === "ITEMS_ADDED" && itemsAdded > 0) {
                    modificationTitle = `Reservation #${reservation.reservationNumber || 'N/A'} - Items Added`;
                    modificationMessage = `${customerName} added ${itemsAdded} item${itemsAdded !== 1 ? 's' : ''} to their pre-order.`;
                  } else if (isModification && modificationType === "ITEMS_BOTH") {
                    modificationTitle = `Reservation #${reservation.reservationNumber || 'N/A'} - Items Modified`;
                    modificationMessage = `${customerName} modified their pre-order: ${itemsAdded} item${itemsAdded !== 1 ? 's' : ''} added, ${itemsRemoved} item${itemsRemoved !== 1 ? 's' : ''} removed.`;
                  } else if (isModification) {
                    // General modification (date, guests, etc.)
                    const modifications: string[] = [];
                    if (reservationWithOrder.reservationOrder?.items) {
                      const itemCount = reservationWithOrder.reservationOrder.items.length;
                      modifications.push(`${itemCount} item${itemCount !== 1 ? 's' : ''}`);
                    }
                    if (reservation.numberOfGuests) {
                      modifications.push(`${reservation.numberOfGuests} guest${reservation.numberOfGuests !== 1 ? 's' : ''}`);
                    }
                    modificationMessage = modifications.length > 0 
                      ? `${customerName} modified their reservation: ${modifications.join(", ")}`
                      : `${customerName} modified their reservation.`;
                  }

                  return (
                    <TouchableOpacity
                      key={notification.id}
                      style={[
                        styles.reservationNotificationItem,
                        !notification.isSeen && styles.notificationItemUnseen,
                      ]}
                      onPress={() => handleNotificationClick(notification)}
                    >
                      <View style={styles.reservationNotificationContent}>
                        <View style={styles.reservationNotificationHeader}>
                          <View style={styles.reservationNotificationHeaderLeft}>
                            <Text style={styles.reservationNotificationTitle} numberOfLines={1}>
                              {isModification 
                                ? modificationTitle
                                : t("admin.notifications.newReservationTitle", {
                                    customerName,
                                  }) || `New Reservation from ${customerName}`
                              }
                            </Text>
                            {!notification.isSeen && (
                              <View style={styles.unseenDot} />
                            )}
                          </View>
                          <Text style={styles.reservationNotificationTime}>
                            {formatDistanceToNow(new Date(notification.createdAt))}
                          </Text>
                        </View>
                        <View style={styles.reservationNotificationDetails}>
                          <Text style={styles.reservationNotificationDescription} numberOfLines={2}>
                            {isModification ? (
                              modificationMessage || `${customerName} modified their reservation.`
                            ) : (
                              `${reservation.numberOfGuests} guests • ${formattedDate} at ${formattedTime} • ${reservation.type === "PRE_ORDER" ? "Pre-Order" : "Simple"}`
                            )}
                          </Text>
                          <Text style={styles.reservationNumberInline}>
                            #{reservation.reservationNumber}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                // Handle order notifications (existing logic)
                // Skip rendering if order is null
                if (!notification.order) {
                  return null;
                }

                // Store order in local variable for safe access
                const order = notification.order;

                const mergeRequest = (order as any)?._mergeRequest;
                const isMergeRequest = !!mergeRequest;
                const newItems = mergeRequest?.newItems || [];
                const isOrderUpdate = notification.isOrderUpdate || false;
                
                // Safe access to user with proper null checks
                const orderUser = order?.user;
                const userName = orderUser
                  ? (orderUser.firstName || orderUser.lastName
                      ? `${orderUser.firstName || ""} ${
                          orderUser.lastName || ""
                        }`.trim()
                      : orderUser.email || "Guest")
                  : "Guest";

                return (
                  <TouchableOpacity
                    key={notification.id}
                    style={[
                      styles.notificationItem,
                      !notification.isSeen && styles.notificationItemUnseen,
                    ]}
                    onPress={() => handleNotificationClick(notification)}
                  >
                    <View style={styles.notificationContent}>
                      <View style={styles.notificationHeader}>
                        <Text style={styles.notificationTitle}>
                          {isOrderUpdate || isMergeRequest
                            ? t("admin.notifications.orderModified", {
                                orderNumber: order?.orderNumber || "",
                              })
                            : t("admin.notifications.newOrderFrom", {
                                userName,
                              })}
                        </Text>
                        {!notification.isSeen && (
                          <View style={styles.unseenDot} />
                        )}
                        {order?.orderItems &&
                          order.orderItems.length > 0 && (
                            <View style={styles.mealAvatars}>
                              {order.orderItems
                                .filter(
                                  (it: any) =>
                                    it?.itemType !== "DEAL_COMPONENT" &&
                                    !it?.parentDealItemId
                                )
                                .slice(0, 3)
                                .map((item, index) => {
                                  const rawImage =
                                    item?.meal?.image ||
                                    (item as any)?.deal?.image ||
                                    (item as any)?.image;
                                  const imageUrl = rawImage
                                    ? getOptimizedImageUrl(rawImage)
                                    : null;

                                  const rawName =
                                    item?.meal?.name ||
                                    (item as any)?.deal?.name ||
                                    (item as any)?.name ||
                                    "";
                                  return (
                                    <View
                                      key={`${item.id}-${index}`}
                                      style={[
                                        styles.mealAvatar,
                                        index > 0 && styles.mealAvatarOverlap,
                                      ]}
                                    >
                                      {imageUrl ? (
                                        <Image
                                          source={{ uri: imageUrl }}
                                          style={styles.mealAvatarImage}
                                        />
                                      ) : (
                                        <View
                                          style={styles.mealAvatarPlaceholder}
                                        >
                                          <Text style={styles.mealAvatarText}>
                                            {(rawName || "?")
                                              .charAt(0)
                                              .toUpperCase()}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                  );
                                })}
                              {order?.orderItems &&
                                order.orderItems.filter(
                                  (it: any) =>
                                    it?.itemType !== "DEAL_COMPONENT" &&
                                    !it?.parentDealItemId
                                ).length > 3 && (
                                <View
                                  style={[
                                    styles.mealAvatar,
                                    styles.mealAvatarOverlap,
                                    styles.mealAvatarMore,
                                  ]}
                                >
                                  <Text style={styles.mealAvatarMoreText}>
                                    +
                                    {order.orderItems.filter(
                                      (it: any) =>
                                        it?.itemType !== "DEAL_COMPONENT" &&
                                        !it?.parentDealItemId
                                    ).length - 3}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                      </View>

                      {/* Show new items for merge requests */}
                      {isMergeRequest && newItems.length > 0 && (
                        <View style={styles.newItemsContainer}>
                          <Text style={styles.newItemsTitle}>
                            {t("admin.notifications.newItemsBeingAdded")}
                          </Text>
                          {newItems.map((item: any, idx: number) => (
                            <Text key={idx} style={styles.newItemText}>
                              + {item.quantity}x {item.name}
                              {item.size && ` (${item.size})`}
                            </Text>
                          ))}
                        </View>
                      )}

                      <View style={styles.notificationFooter}>
                        <Text style={styles.notificationAmount}>
                          $
                          {order?.totalAmount
                            ? typeof order.totalAmount === "number"
                              ? order.totalAmount.toFixed(2)
                              : Number(order.totalAmount).toFixed(2)
                            : "0.00"}
                        </Text>
                        <Text style={styles.notificationSeparator}>•</Text>
                        {notification.seenAt ? (
                          <>
                            <Text style={styles.notificationTime}>
                              {t("admin.notifications.seen")}{" "}
                              {formatDistanceToNow(
                                new Date(notification.seenAt)
                              )}
                            </Text>
                            <Text style={styles.notificationSeparator}>•</Text>
                            <Text style={styles.notificationTime}>
                              {formatDistanceToNow(
                                new Date(notification.createdAt)
                              )}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.notificationTime}>
                            {formatDistanceToNow(
                              new Date(notification.createdAt)
                            )}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Loading indicator */}
              {loading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#ec4899" />
                  <Text style={styles.loadingText}>
                    {t("admin.notifications.loading")}
                  </Text>
                </View>
              )}

              {/* Load more trigger */}
              {hasMore && !loading && <View style={styles.loadMoreTrigger} />}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    flexDirection: "row",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "85%",
    maxWidth: 400,
    height: "100%",
    backgroundColor: "#171717",
    borderRightWidth: 1,
    borderRightColor: "#262626",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  drawerHeaderLeft: {
    flex: 1,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  drawerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  markAllButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerContent: {
    flex: 1,
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 12,
  },
  notificationItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  notificationItemUnseen: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#ec4899",
  },
  notificationContent: {
    gap: 8,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    minWidth: 0,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ec4899",
  },
  mealAvatars: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
  },
  mealAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#171717",
    overflow: "hidden",
    backgroundColor: "#262626",
  },
  mealAvatarOverlap: {
    marginLeft: -8,
  },
  mealAvatarImage: {
    width: "100%",
    height: "100%",
  },
  mealAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#262626",
  },
  mealAvatarText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
  },
  mealAvatarMore: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#262626",
  },
  mealAvatarMoreText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
  },
  newItemsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  newItemsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
  },
  newItemText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  notificationAmount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  notificationSeparator: {
    fontSize: 12,
    color: "#6B7280",
  },
  notificationTime: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  notificationDescription: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    marginTop: 4,
  },
  notificationDescriptionBold: {
    fontWeight: "600",
    color: "#D1D5DB",
  },
  reservationNumber: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
    fontFamily: "monospace",
  },
  reservationNotificationItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  reservationNotificationContent: {
    gap: 6,
  },
  reservationNotificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reservationNotificationHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  reservationNotificationTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  reservationNotificationTime: {
    fontSize: 10,
    color: "#6B7280",
  },
  reservationNotificationDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  reservationNotificationDescription: {
    fontSize: 11,
    color: "#9CA3AF",
    lineHeight: 16,
    flex: 1,
  },
  reservationNumberInline: {
    fontSize: 10,
    color: "#6B7280",
    fontFamily: "monospace",
    fontWeight: "500",
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  loadMoreTrigger: {
    height: 20,
  },
});
