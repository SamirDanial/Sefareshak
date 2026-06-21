import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Calendar, RefreshCw, ShoppingBag, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import { usePermissions } from "../contexts/PermissionContext";
import { notificationService, type NotificationItem } from "../services/notificationService";
import { audioService } from "../services/audioService";
import { useNavigate } from "react-router-dom";
import { ACTIONS, RESOURCES } from "../lib/permissions";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const LIMIT = 10;
const THROTTLE_DELAY = 800; // Minimum 800ms between requests
const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

const getSelectedOrganizationId = (): string | null => {
  try {
    const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return null;
    const val = raw.trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
};

const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const { getToken, userType } = useAuth();
  const { can } = usePermissions();
  const canViewNotifications = can(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW);
  const { subscribe } = useAdminWebSocket();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fetching, setFetching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerTargetRef = useRef<HTMLDivElement>(null);
  const lastRequestRef = useRef<number>(0);
  const fetchingUnseenRef = useRef(false);

  if (!canViewNotifications) {
    return null;
  }

  // Initialize audio service on mount
  useEffect(() => {
    audioService.init();
  }, []);

  // Update badge count on app icon when unseen count changes
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.setBadgeCount === 'function') {
      window.electronAPI.setBadgeCount(unseenCount).catch((error) => {
        console.error("NotificationBell: Error setting badge count:", error);
      });
    }
  }, [unseenCount]);

  // Function to play notification sound
  const playNotificationSound = useCallback(() => {
    audioService.playNotificationSound("newOrder").catch((error) => {
      console.error("NotificationBell: Error playing notification sound:", error);
    });
  }, []);

  // Fetch notifications with pagination
  const fetchNotifications = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (fetching) return;

      try {
        setFetching(true);
        setLoading(pageNum === 1);

        if (userType === "SUPER_ADMIN" && !getSelectedOrganizationId()) {
          return;
        }

        const token = await getToken();
        if (!token) return;

        const response = await notificationService.getNotifications(
          pageNum,
          LIMIT,
          token
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
          setNotifications(response.notifications || []);
        }

        setHasMore(pageNum < response.pagination.pages);
      } catch (error: any) {
        console.error("Error fetching notifications:", error);
        
        // Handle rate limiting (429)
        if (error?.message?.includes("429") || error?.status === 429) {
          setHasMore(false);
          setTimeout(() => {
            setHasMore(true);
          }, 60000); // Wait 1 minute before allowing more loads
        }
      } finally {
        setLoading(false);
        setFetching(false);
      }
    },
    [getToken, fetching]
  );

  // Fetch unseen count
  const fetchUnseenCount = useCallback(async () => {
    if (fetchingUnseenRef.current) return;
    fetchingUnseenRef.current = true;

    try {
      if (userType === "SUPER_ADMIN" && !getSelectedOrganizationId()) {
        return;
      }

      const token = await getToken();
      if (!token) return;

      const unseen = await notificationService.getUnseenNotifications(token);
      setUnseenCount(unseen.length);
    } catch (error) {
      console.error("Error fetching unseen count:", error);
    } finally {
      fetchingUnseenRef.current = false;
    }
  }, [getToken, userType]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!isOpen || !observerTargetRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (
          target.isIntersecting &&
          hasMore &&
          !loading &&
          !fetching &&
          isOpen
        ) {
          const now = Date.now();
          const timeSinceLastRequest = now - lastRequestRef.current;

          // Throttle requests to prevent rate limiting
          const delay = Math.max(0, THROTTLE_DELAY - timeSinceLastRequest);

          setTimeout(() => {
            lastRequestRef.current = Date.now();
            const nextPage = page + 1;
            setPage(nextPage);
            fetchNotifications(nextPage, true);
          }, delay);
        }
      },
      {
        threshold: 0,
        rootMargin: "100px",
      }
    );

    observer.observe(observerTargetRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isOpen, hasMore, loading, fetching, page, fetchNotifications]);

  // Reset when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setHasMore(true);
      setNotifications([]);
    }
  }, [isOpen]);

  // Initial load when dropdown opens
  useEffect(() => {
    if (isOpen && notifications.length === 0) {
      setPage(1);
      fetchNotifications(1, false);
    }
  }, [isOpen, notifications.length, fetchNotifications]);

  // Refresh unseen count periodically
  useEffect(() => {
    fetchUnseenCount();
    const interval = setInterval(fetchUnseenCount, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchUnseenCount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    // Listen for new order notifications
    const handleNewOrder = (data: {
      notification: NotificationItem;
      order: any;
    }) => {
      // Guard against missing notification data
      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid new order notification data received",
          data
        );
        return;
      }

      // Play notification sound
      playNotificationSound();

      // Add notification to the beginning of the list (real-time update)
      setNotifications((prev) => {
        // Check if notification already exists (avoid duplicates)
        const exists = prev.some((n) => n && n.id === data.notification.id);
        if (exists) {
          return prev;
        }
        const updated = [data.notification, ...prev];
        return updated;
      });

      // Update unseen count (real-time update)
      setUnseenCount((prev) => {
        const updated = prev + 1;
        return updated;
      });
    };

    // Listen for new reservation notifications
    const handleNewReservation = (data: {
      notification: NotificationItem;
      reservation: any;
      organizationId?: string;
    }) => {
      // Basic org scoping (backend includes organizationId for new-reservation)
      const selectedOrgId = getSelectedOrganizationId();
      if (data.organizationId && selectedOrgId && String(data.organizationId) !== String(selectedOrgId)) {
        return;
      }

      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid new reservation notification data received",
          data
        );
        return;
      }

      // Play notification sound
      playNotificationSound();

      // Add notification to the beginning of the list (real-time update)
      setNotifications((prev) => {
        const exists = prev.some((n) => n && n.id === data.notification.id);
        if (exists) return prev;
        return [data.notification, ...prev];
      });

      // Update unseen count (real-time update)
      setUnseenCount((prev) => prev + 1);
    };

    // Handle order updated event (when order is merged/updated)
    const handleOrderUpdated = (data: {
      notification: NotificationItem;
      order: any;
      newItems?: any[];
      isMergeRequest?: boolean;
    }) => {
      // Play notification sound for order updates
      playNotificationSound();

      // Update notification if it exists in the list
      if (data.notification && data.notification.id) {
        setNotifications((prev) => {
          const index = prev.findIndex((n) => n.id === data.notification.id);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = data.notification;
            return updated;
          }
          // If notification not found, add it to the beginning
          return [data.notification, ...prev];
        });
      }
    };

    // Handle notification seen event (when another admin marks notification as seen)
    const handleNotificationSeen = (data: {
      orderId?: string;
      reservationId?: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === data.notificationId
            ? { ...n, isSeen: data.isSeen, seenAt: data.seenAt ? data.seenAt.toISOString() : null }
            : n
        )
      );
      // Update unseen count if notification was marked as seen
      if (data.isSeen) {
        setUnseenCount((prev) => Math.max(0, prev - 1));
      }
    };

    // Handle all notifications seen event
    const handleAllNotificationsSeen = (data: {
      count?: number;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      setNotifications((prev) => {
        if (!data.isSeen) return prev;
        const updated = prev.map((n) => ({
          ...n,
          isSeen: true,
          seenAt: data.seenAt ? data.seenAt.toISOString() : null,
        }));
        setUnseenCount(0);
        return updated;
      });
    };

    const handleReservationModified = (data: {
      notification: NotificationItem;
      reservation: any;
      organizationId?: string;
    }) => {
      const selectedOrgId = getSelectedOrganizationId();
      if (
        data.organizationId &&
        selectedOrgId &&
        String(data.organizationId) !== String(selectedOrgId)
      ) {
        return;
      }

      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid reservation-modified notification data received",
          data
        );
        return;
      }

      playNotificationSound();

      setNotifications((prev) => {
        const index = prev.findIndex((n) => n.id === data.notification.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = data.notification;
          return updated;
        }
        return [data.notification, ...prev];
      });
    };

    // Subscribe to all events with automatic cleanup
    const unsubscribe1 = subscribe("new-order", handleNewOrder);
    const unsubscribe2 = subscribe("order-updated", handleOrderUpdated);
    const unsubscribe3 = subscribe("notification-seen", handleNotificationSeen);
    const unsubscribe4 = subscribe("all-notifications-seen", handleAllNotificationsSeen);
    const unsubscribe5 = subscribe("new-reservation", handleNewReservation);
    const unsubscribe6 = subscribe("reservation-modified", handleReservationModified);

    // Cleanup on unmount
    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      unsubscribe5();
      unsubscribe6();
    };
  }, [subscribe, playNotificationSound]);

  // Handle notification click
  const handleNotificationClick = async (notification: NotificationItem) => {
    const isOrder = Boolean(notification.order?.id);
    const isReservation = Boolean(notification.reservation?.id);
    if (!isOrder && !isReservation) return;

    setIsOpen(false);

    // Navigate to relevant page
    if (isOrder && notification.order?.id) {
      const orderId = encodeURIComponent(String(notification.order.id));
      const orderBranchId =
        (notification.order as any)?.branchId || (notification.order as any)?.branch?.id;
      const search = new URLSearchParams();
      if (orderBranchId) search.set("branchId", String(orderBranchId));
      search.set("highlightOrder", orderId);
      search.set("notificationId", String(notification.id));
      navigate({ pathname: "/admin/orders", search: `?${search.toString()}` });
      return;
    }

    if (isReservation && notification.reservation?.id) {
      const reservationId = encodeURIComponent(String(notification.reservation.id));
      const reservationBranchId =
        (notification.reservation as any)?.branchId || (notification.reservation as any)?.branch?.id;
      const search = new URLSearchParams();
      if (reservationBranchId) search.set("branchId", String(reservationBranchId));
      search.set("highlightReservation", reservationId);
      search.set("notificationId", String(notification.id));
      navigate({ pathname: "/admin/reservations", search: `?${search.toString()}` });
    }
  };

  // Mark all as seen
  const handleMarkAllAsSeen = async () => {
    try {
      const token = await getToken();
      if (token) {
        await notificationService.markAllAsSeen(token);
        setNotifications((prev) => prev.map((n) => ({ ...n, isSeen: true })));
        setUnseenCount(0);
      }
    } catch (error) {
      console.error("Error marking all as seen:", error);
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return t("admin.notifications.timeAgo.justNow");
    if (diffMinutes < 60) return t("admin.notifications.timeAgo.minutesAgo", { count: diffMinutes });
    if (diffHours < 24) return t("admin.notifications.timeAgo.hoursAgo", { count: diffHours });
    if (diffDays < 7) return t("admin.notifications.timeAgo.daysAgo", { count: diffDays });
    return date.toLocaleDateString();
  };

  // Get user name
  const getUserName = (notification: NotificationItem) => {
    const user = notification.order?.user;
    if (!user) return t("admin.notifications.guest");
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email || t("admin.notifications.guest");
  };

  const getReservationCustomerName = (notification: NotificationItem) => {
    const reservation = notification.reservation;
    if (!reservation) return t("admin.notifications.guest");
    const user = reservation.user;
    if (user) {
      if (user.firstName || user.lastName) {
        return `${user.firstName || ""} ${user.lastName || ""}`.trim();
      }
      return user.email || t("admin.notifications.guest");
    }
    return reservation.customerName || t("admin.notifications.guest");
  };

  // Get image URL for meal
  const getMealImageUrl = (imagePath: string | null | undefined): string => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      return imagePath;
    }
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  };

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "relative",
          padding: "8px",
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#f9fafb";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Bell style={{ height: "20px", width: "20px", color: "#111827" }} />
        {unseenCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              height: "16px",
              minWidth: "16px",
              padding: "0 4px",
              borderRadius: "8px",
              backgroundColor: "#ec4899",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "8px",
            width: "400px",
            maxHeight: "600px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
            border: "1px solid #e5e7eb",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.notifications.title")}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {unseenCount > 0 && (
                <button
                  onClick={handleMarkAllAsSeen}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "transparent",
                    color: "#ec4899",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#fce7f3";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {t("admin.notifications.markAllRead")}
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <X style={{ height: "16px", width: "16px", color: "#6b7280" }} />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div
            ref={scrollContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: "500px",
            }}
          >
            {loading && notifications.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  color: "#6b7280",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <RefreshCw
                  style={{
                    height: "16px",
                    width: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
                {t("admin.notifications.loading")}
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  color: "#6b7280",
                  fontSize: "14px",
                }}
              >
                {t("admin.notifications.noNotifications")}
              </div>
            ) : (
              <>
                {notifications
                  .filter((n) => n && (n.order || n.reservation))
                  .map((notification) => {
                    const isReservation = Boolean(notification.reservation);
                    const orderItems = notification.order?.orderItems || [];
                    const firstThreeItems = orderItems.slice(0, 3);
                    const remainingCount = orderItems.length - 3;

                    const reservationDate = notification.reservation?.reservationDate
                      ? new Date(notification.reservation.reservationDate)
                      : null;
                    const reservationDateText = reservationDate
                      ? reservationDate.toLocaleString()
                      : "";

                    return (
                      <div
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        style={{
                          padding: "12px 16px",
                          borderBottom: "1px solid #f3f4f6",
                          cursor: "pointer",
                          backgroundColor: notification.isSeen
                            ? "#ffffff"
                            : "#fce7f3",
                          borderLeft: notification.isSeen
                            ? "2px solid transparent"
                            : "2px solid #ec4899",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = notification.isSeen
                            ? "#f9fafb"
                            : "#fce7f3";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = notification.isSeen
                            ? "#ffffff"
                            : "#fce7f3";
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "12px",
                          }}
                        >
                          {isReservation ? (
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "10px",
                                backgroundColor: "#fce7f3",
                                border: "1px solid #f9a8d4",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Calendar style={{ width: "18px", height: "18px", color: "#db2777" }} />
                            </div>
                          ) : firstThreeItems.length > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "-4px",
                                flexShrink: 0,
                              }}
                            >
                              {firstThreeItems.map((item, index) => {
                                const imageUrl = getMealImageUrl(item.meal?.image);
                                return (
                                  <div
                                    key={`${item.id}-${index}`}
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      borderRadius: "50%",
                                      border: "2px solid #ffffff",
                                      marginLeft: index > 0 ? "-8px" : "0",
                                      backgroundColor: "#f3f4f6",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      overflow: "hidden",
                                      fontSize: "10px",
                                      fontWeight: "600",
                                      color: "#111827",
                                    }}
                                  >
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={item.meal?.name || ""}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <span>
                                        {item.meal?.name?.charAt(0).toUpperCase() || "?"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {remainingCount > 0 && (
                                <div
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "50%",
                                    border: "2px solid #ffffff",
                                    marginLeft: "-8px",
                                    backgroundColor: "#f3f4f6",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    color: "#111827",
                                  }}
                                >
                                  +{remainingCount}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "10px",
                                backgroundColor: "#f3f4f6",
                                border: "1px solid #e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <ShoppingBag style={{ width: "18px", height: "18px", color: "#6b7280" }} />
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "4px",
                              }}
                            >
                              <p
                                style={{
                                  fontSize: "14px",
                                  fontWeight: notification.isSeen ? "400" : "600",
                                  color: "#111827",
                                  margin: 0,
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isReservation
                                  ? t("admin.notifications.newReservationFrom", {
                                      defaultValue: "New reservation from {{name}}",
                                      name: getReservationCustomerName(notification),
                                    })
                                  : notification.isOrderUpdate
                                  ? t("admin.notifications.orderUpdated", {
                                      orderNumber: notification.order?.orderNumber,
                                    })
                                  : t("admin.notifications.newOrderFrom", {
                                      name: getUserName(notification),
                                    })}
                              </p>
                              {!notification.isSeen && (
                                <span
                                  style={{
                                    height: "8px",
                                    width: "8px",
                                    borderRadius: "50%",
                                    backgroundColor: "#ec4899",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </div>

                            <p
                              style={{
                                fontSize: "12px",
                                color: "#6b7280",
                                margin: "4px 0",
                              }}
                            >
                              {isReservation ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={{ fontWeight: 600, color: "#111827" }}>
                                    {notification.reservation?.reservationNumber}
                                  </span>
                                  <span>•</span>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <Users style={{ width: "14px", height: "14px" }} />
                                    {notification.reservation?.numberOfGuests}{" "}
                                    {t("admin.reservationManagement.guests", {
                                      defaultValue: "Guests",
                                    })}
                                  </span>
                                  {reservationDateText ? (
                                    <>
                                      <span>•</span>
                                      <span>{reservationDateText}</span>
                                    </>
                                  ) : null}
                                </span>
                              ) : (
                                <>
                                  $
                                  {typeof notification.order?.totalAmount === "number"
                                    ? notification.order.totalAmount.toFixed(2)
                                    : Number(notification.order?.totalAmount || 0).toFixed(2)}
                                  {orderItems.length > 0 && (
                                    <span style={{ marginLeft: "8px" }}>
                                      • {orderItems.length}{" "}
                                      {orderItems.length === 1
                                        ? t("admin.notifications.items.item")
                                        : t("admin.notifications.items.items")}
                                    </span>
                                  )}
                                </>
                              )}
                            </p>
                            <p
                              style={{
                                fontSize: "11px",
                                color: "#9ca3af",
                                margin: 0,
                              }}
                            >
                              {formatRelativeTime(notification.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* Loading indicator for infinite scroll */}
                {loading && notifications.length > 0 && (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#6b7280",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <RefreshCw
                      style={{
                        height: "14px",
                        width: "14px",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    {t("admin.notifications.loadingMore")}
                  </div>
                )}

                {/* Intersection observer target */}
                {hasMore && (
                  <div
                    ref={observerTargetRef}
                    style={{
                      height: "20px",
                      width: "100%",
                    }}
                  />
                )}

                {/* End of list message */}
                {!hasMore && notifications.length > 0 && (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#9ca3af",
                      fontSize: "12px",
                    }}
                  >
                    {t("admin.notifications.noMoreNotifications")}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default NotificationBell;

