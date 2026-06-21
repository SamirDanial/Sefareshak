import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { notificationApiService, type NotificationItem } from "@/src/services/notificationApiService";
import ApiService from "@/src/services/apiService";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const DRAWER_WIDTH = 420;
const PAGE_SIZE = 10;

export default function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const { canAny, isLoading: permissionsLoading } = usePermissions();

  const lastCanViewRef = useRef(false);
  const canViewNotifications = useMemo(() => {
    // During permission refreshes, keep last known value to avoid unmounting the bell
    // (which closes the modal and causes flicker).
    if (permissionsLoading) return lastCanViewRef.current;
    try {
      const next = canAny([{ resource: RESOURCES.NOTIFICATIONS, action: ACTIONS.VIEW }]);
      lastCanViewRef.current = Boolean(next);
      return lastCanViewRef.current;
    } catch {
      lastCanViewRef.current = false;
      return false;
    }
  }, [canAny, permissionsLoading]);

  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const fetchingRef = useRef(false);
  const fetchingUnseenRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const ignoreOverlayPressUntilRef = useRef(0);

  const formatDistanceToNow = useCallback(
    (date: Date): string => {
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
    },
    [t]
  );

  const formatOrderNumber = useCallback((orderNumber: string): string => {
    const trimmed = (orderNumber || "").trim();
    return trimmed ? `#${trimmed}` : "";
  }, []);

  const truncateDisplayId = useCallback((value: string, maxLen: number): string => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }, []);

  useEffect(() => {
    notificationService.init();
  }, []);

  const openDrawer = useCallback(() => {
    ignoreOverlayPressUntilRef.current = Date.now() + 350;
    setShouldRender(true);
    setIsOpen(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsOpen(false);
        setShouldRender(false);
      }
    });
  }, [fadeAnim, slideAnim]);

  const fetchNotifications = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!canViewNotifications) return;
      // Prevent notification fetch for super admin without organization
      if (userType === "SUPER_ADMIN" && !selectedOrganizationId) return;
      if (fetchingRef.current) return;

      try {
        fetchingRef.current = true;
        setLoading(true);
        const token = await getToken();
        if (!token) return;

        const response = await notificationApiService.getNotifications(
          pageNum,
          PAGE_SIZE,
          token,
          selectedOrganizationId ?? undefined
        );

        setNotifications((prev) => {
          const incoming = response.notifications || [];
          if (!append) {
            // Replace with server list but keep any socket notifications not present yet.
            const serverIds = new Set(incoming.map((n) => n.id));
            const socketOnly = prev.filter((n) => !serverIds.has(n.id));
            return [...incoming, ...socketOnly];
          }

          const existingIds = new Set(prev.map((n) => n.id));
          const newOnes = incoming.filter((n) => !existingIds.has(n.id));
          return [...prev, ...newOnes];
        });

        const totalPages = response.pagination?.pages || 1;
        setHasMore(pageNum < totalPages);
      } catch (e) {
        console.error("Error fetching notifications:", e);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
        loadingMoreRef.current = false;
      }
    },
    [canViewNotifications, getToken, selectedOrganizationId, userType]
  );

  const refreshUnseenCount = useCallback(async () => {
    if (!canViewNotifications) return;
    // Prevent notification fetch for super admin without organization
    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
      return;
    }
    if (fetchingUnseenRef.current) return;
    fetchingUnseenRef.current = true;
    try {
      const token = await getToken();
      if (!token) {
        return;
      }
      const unseen = await notificationApiService.getUnseenNotifications(
        token,
        selectedOrganizationId ?? undefined
      );
      setUnseenCount(Array.isArray(unseen) ? unseen.length : 0);
    } catch (e) {
      // Check if this is an organization selection error and treat as warning
      if ((e as any)?.isWarning || (e as any)?.message?.includes("Organization selection is required")) {
        console.warn("Organization selection required for notifications - this is expected for super admins without organization");
      } else if ((e as any)?.status === 401 || (e as any)?.isAuthError) {
        console.warn("Authentication error fetching notifications - this may be expected for super admins without organization");
      } else {
        console.error("Error fetching unseen notifications:", e);
      }
    } finally {
      fetchingUnseenRef.current = false;
    }
  }, [canViewNotifications, getToken, selectedOrganizationId, userType]);

  // Periodically refresh unseen count
  useEffect(() => {
    // Don't set up interval if notifications are not available
    if (!canViewNotifications) return;
    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) return;
    
    refreshUnseenCount();
    
    // Create a safe interval that respects logout state
    const interval = setInterval(() => {
      // Check logout state before making API call
      if (ApiService.shouldPreventRequest()) {
        return;
      }
      refreshUnseenCount();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [refreshUnseenCount, canViewNotifications, userType, selectedOrganizationId]);

  // Fetch first page when opening
  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    setHasMore(true);
    loadingMoreRef.current = false;
    fetchNotifications(1, false);
  }, [fetchNotifications, isOpen]);

  // Reset list when org changes
  useEffect(() => {
    setNotifications([]);
    setPage(1);
    setHasMore(true);
    loadingMoreRef.current = false;
    refreshUnseenCount();
    if (isOpen) fetchNotifications(1, false);
  }, [selectedOrganizationId, refreshUnseenCount, isOpen, fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!canViewNotifications) return;
    const socketService = SocketService.getInstance();
    let isMounted = true;

    const connect = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
      } catch (e) {
        console.warn("WebSocket connection warning:", e);
      }
    };

    connect();

    const handleNewOrder = async (data: { notification: NotificationItem; organizationId?: string }) => {
      if (!isMounted) return;
      if (selectedOrganizationId && data.organizationId && data.organizationId !== selectedOrganizationId) return;

      try {
        await notificationService.notifyNewOrder();
      } catch (e) {
        console.error("Failed to play new order sound:", e);
      }

      setNotifications((prev) => {
        if (!data.notification) return prev;
        const existingIndex = prev.findIndex((n) => n.id === data.notification.id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = data.notification;
          return [updated[existingIndex], ...updated.filter((_, i) => i !== existingIndex)];
        }
        return [data.notification, ...prev];
      });

      setUnseenCount((prev) => prev + 1);
      refreshUnseenCount();
    };

    const handleOrderUpdated = async (data: { notification: NotificationItem; organizationId?: string }) => {
      if (!isMounted) return;
      if (selectedOrganizationId && data.organizationId && data.organizationId !== selectedOrganizationId) return;
      if (!data.notification) return;

      try {
        await notificationService.notifyStatusChange();
      } catch (e) {
        console.error("Failed to play notification sound:", e);
      }

      setNotifications((prev) => {
        const existingIndex = prev.findIndex((n) => n.id === data.notification.id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          const wasSeen = updated[existingIndex].isSeen;
          updated[existingIndex] = data.notification;
          // If it becomes unseen, bump unseenCount optimistically
          if (wasSeen && !data.notification.isSeen) {
            setUnseenCount((count) => count + 1);
          }
          return [updated[existingIndex], ...updated.filter((_, i) => i !== existingIndex)];
        }
        return [data.notification, ...prev];
      });

      if (!data.notification.isSeen) {
        setUnseenCount((prev) => prev + 1);
        refreshUnseenCount();
      }
    };

    const handleNotificationSeen = (data: { notificationId: string; isSeen: boolean }) => {
      if (!isMounted) return;
      if (!data?.notificationId) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === data.notificationId ? { ...n, isSeen: true } : n))
      );
      setUnseenCount((prev) => Math.max(0, prev - 1));
    };

    const handleAllSeen = () => {
      if (!isMounted) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, isSeen: true })));
      setUnseenCount(0);
    };

    socketService.on("new-order", handleNewOrder);
    socketService.on("order-updated", handleOrderUpdated);
    socketService.on("notification-seen", handleNotificationSeen);
    socketService.on("all-notifications-seen", handleAllSeen);

    return () => {
      isMounted = false;
      socketService.off("new-order", handleNewOrder);
      socketService.off("order-updated", handleOrderUpdated);
      socketService.off("notification-seen", handleNotificationSeen);
      socketService.off("all-notifications-seen", handleAllSeen);
    };
  }, [canViewNotifications, getToken, refreshUnseenCount, selectedOrganizationId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || fetchingRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  }, [fetchNotifications, hasMore, loading, page]);

  const handleNotificationClick = useCallback(
    async (notification: NotificationItem) => {
      if (!notification?.id) return;

      try {
        // Prevent notification actions for super admin without organization
        if (userType === "SUPER_ADMIN" && !selectedOrganizationId) return;
        
        const token = await getToken();
        if (token) {
          await notificationApiService.markAsSeen(notification.id, token);
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, isSeen: true } : n))
          );
          refreshUnseenCount();
        }
      } catch (e) {
        // Non-blocking
      }

      closeDrawer();
      if (notification.reservation?.id) {
        router.push(`/(admin)/reservation-details?id=${notification.reservation.id}` as any);
        return;
      }
      if (notification.order?.id) {
        router.push(`/(admin)/order-details?id=${notification.order.id}` as any);
      }
    },
    [closeDrawer, getToken, refreshUnseenCount, router, userType, selectedOrganizationId]
  );

  if (!canViewNotifications) return null;

  return (
    <>
      <TouchableOpacity
        onPress={openDrawer}
        style={styles.button}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="bell-outline" size={18} color="#374151" />
        {unseenCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {unseenCount > 99 ? "99+" : String(unseenCount)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal
        visible={shouldRender}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}
      >
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}> 
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (Date.now() < ignoreOverlayPressUntilRef.current) return;
              closeDrawer();
            }}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              paddingTop: insets.top,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{t("admin.notifications.title")}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    // Prevent notification actions for super admin without organization
                    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) return;
                    
                    const token = await getToken();
                    if (token) await notificationApiService.markAllAsSeen(token);
                    setNotifications((prev) => prev.map((n) => ({ ...n, isSeen: true })));
                    setUnseenCount(0);
                  } catch {
                  }
                }}
                style={styles.headerIconButton}
              >
                <MaterialCommunityIcons name="check-all" size={18} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={closeDrawer} style={styles.headerIconButton}>
                <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.panelBody}
            contentContainerStyle={{ paddingBottom: 24 }}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const paddingToBottom = 80;
              const isNearBottom =
                layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
              if (isNearBottom) handleLoadMore();
            }}
            scrollEventThrottle={16}
          >
            {loading && notifications.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#ec4899" />
              </View>
            ) : null}

            {!loading && notifications.length === 0 ? (
              <Text style={styles.emptyText}>{t("admin.notifications.description")}</Text>
            ) : null}

            {notifications.map((n) => (
              <TouchableOpacity
                key={n.id}
                onPress={() => handleNotificationClick(n)}
                style={[styles.item, !n.isSeen && styles.itemUnseen]}
              >
                <View style={styles.itemLeft}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {(() => {
                        const isReservation =
                          (n.type === "RESERVATION" || !!n.reservationId) && !!n.reservation;
                        if (isReservation) {
                          const reservation = n.reservation!;
                          const customerName =
                            reservation.customerName ||
                            reservation.customerEmail ||
                            t("admin.notifications.guest");
                          return (
                            t("admin.notifications.newReservationTitle", { customerName }) ||
                            `New Reservation from ${customerName}`
                          );
                        }

                        const order = n.order;
                        if (!order) return t("admin.notifications.title");

                        const orderUser = order.user;
                        const userName = orderUser
                          ? (orderUser.firstName || orderUser.lastName
                              ? `${orderUser.firstName || ""} ${orderUser.lastName || ""}`.trim()
                              : orderUser.email || t("admin.notifications.guest"))
                          : t("admin.notifications.guest");

                        const isOrderUpdate = Boolean(n.isOrderUpdate);
                        const orderNumber = order.orderNumber || "";
                        return isOrderUpdate
                          ? t("admin.notifications.orderModified", {
                              orderNumber: formatOrderNumber(truncateDisplayId(orderNumber, 10)),
                            })
                          : t("admin.notifications.newOrderFrom", { userName });
                      })()}
                    </Text>

                    {!n.isSeen ? <View style={styles.unseenDot} /> : null}

                    <Text style={styles.itemTime}>
                      {(() => {
                        const raw = n.createdAt;
                        const d = raw ? new Date(raw) : null;
                        return d && !isNaN(d.getTime()) ? formatDistanceToNow(d) : "";
                      })()}
                    </Text>
                  </View>

                  <Text style={styles.itemSubtitle} numberOfLines={2}>
                    {(() => {
                      const isReservation =
                        (n.type === "RESERVATION" || !!n.reservationId) && !!n.reservation;
                      if (isReservation) {
                        const r = n.reservation!;
                        const dateObj = r.reservationDate ? new Date(r.reservationDate) : null;
                        const formattedDate = dateObj && !isNaN(dateObj.getTime())
                          ? dateObj.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "";
                        const formattedTime = dateObj && !isNaN(dateObj.getTime())
                          ? dateObj.toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "";

                        const typeLabel =
                          String(r.type || "").toUpperCase() === "PRE_ORDER"
                            ? t("admin.notifications.preOrderReservation")
                            : t("admin.notifications.simpleReservation");

                        return (
                          t("admin.notifications.reservationDetails", {
                            numberOfGuests: r.numberOfGuests,
                            date: formattedDate,
                            time: formattedTime,
                            type: typeLabel,
                          }) ||
                          `${r.numberOfGuests} guests • ${formattedDate} ${formattedTime} • ${typeLabel}`
                        );
                      }

                      if (!n.order) return "";
                      const order = n.order;
                      const orderNum = formatOrderNumber(truncateDisplayId(order.orderNumber || "", 10));
                      const total = typeof order.totalAmount === "number" ? order.totalAmount : null;
                      const itemsCount = Array.isArray(order.orderItems) ? order.orderItems.length : 0;

                      const itemsLabel =
                        itemsCount === 1
                          ? t("admin.notifications.oneItem")
                          : t("admin.notifications.itemsCount", { count: itemsCount });

                      const totalText = total != null ? ` • ${total}` : "";
                      return `${orderNum}${itemsLabel ? ` • ${itemsLabel}` : ""}${totalText}`;
                    })()}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#6b7280" />
              </TouchableOpacity>
            ))}

            {loading && notifications.length > 0 ? (
              <View style={styles.loadingMoreWrap}>
                <ActivityIndicator color="#6b7280" />
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    maxWidth: "92%",
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  panelHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  panelTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  panelBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
  },
  loadingWrap: {
    paddingVertical: 18,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemUnseen: {
    borderColor: "rgba(251,191,36,0.35)",
    backgroundColor: "rgba(251,191,36,0.08)",
  },
  itemLeft: {
    flex: 1,
    paddingRight: 10,
  },
  itemTitle: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTime: {
    marginLeft: "auto",
    color: "#6b7280",
    fontSize: 11,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f59e0b",
  },
  itemSubtitle: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
  },
  loadingMoreWrap: {
    paddingVertical: 12,
  },
});
