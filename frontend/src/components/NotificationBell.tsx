import { useState, useEffect, useCallback, useRef } from "react";
import { useInView } from "react-intersection-observer";
import Icon from "@mdi/react";
import { mdiBell, mdiClose } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { notificationService } from "@/services/notificationService";
import type { NotificationItem } from "@/services/notificationService";
import { reservationService } from "@/services/reservationService";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import SocketService from "@/services/socketService";
import { audioService } from "@/services/audioService";
import { useTranslation, Trans } from "react-i18next";

export default function NotificationBell() {
  const { getToken } = useAuth();
  const { can } = usePermissions();
  const canViewNotifications = can(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [unseenCount, setUnseenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const limit = 10;
  const fetchingRef = useRef(false);
  const notificationPermissionRef = useRef<NotificationPermission>("default");

  if (!canViewNotifications) {
    return null;
  }

  // Initialize audio service on mount
  useEffect(() => {
    if (!canViewNotifications) return;
    audioService.init();
  }, [canViewNotifications]);

  // Function to play loud notification sound using audio service
  const playNotificationSound = useCallback(() => {
    audioService.playNotificationSound("newOrder");
  }, []);

  const getSelectedOrganizationId = (): string => {
    try {
      return (window.localStorage.getItem("bellami:selectedOrganizationId") || "").trim();
    } catch {
      return "";
    }
  };

  const shouldHandleOrgScopedEvent = (eventOrganizationId?: string): boolean => {
    const selectedOrganizationId = getSelectedOrganizationId();
    if (!selectedOrganizationId) return true;
    if (!eventOrganizationId) return true;
    return String(eventOrganizationId) === selectedOrganizationId;
  };

  // Request notification permission for OS notifications
  useEffect(() => {
    if (!canViewNotifications) return;
    // Check if browser supports notifications
    if (!("Notification" in window)) {
      return;
    }

    // Check current permission status
    notificationPermissionRef.current = Notification.permission;

    // Request permission if not already granted or denied
    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((permission) => {
          notificationPermissionRef.current = permission;
        })
        .catch(() => {
          // Error requesting notification permission
        });
    }
  }, []);

  // Function to show OS notification
  const showOSNotification = useCallback(
    (notificationData: NotificationItem, isMergeRequest: boolean = false, isReservation: boolean = false) => {
      // Check if notifications are supported and permission is granted
      if (!("Notification" in window)) {
        return;
      }

      if (Notification.permission !== "granted") {
        return;
      }

      try {
        // Handle reservation notifications
        if (isReservation && notificationData.reservation) {
          const reservation = notificationData.reservation;
          const user = reservation.user;
          
          // Guard against missing user data
          if (!user && !reservation.customerName) {
            return;
          }

          const userName = user
            ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
            : reservation.customerName || t("admin.notifications.guest");

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

          const notificationTitle = t("admin.notifications.newReservationReceived");
          const notificationBody = t("admin.notifications.newReservationBody", {
            userName,
            numberOfGuests: reservation.numberOfGuests,
            date: formattedDate,
            time: formattedTime,
            type: reservation.type === "PRE_ORDER" 
              ? t("admin.notifications.preOrderReservation")
              : t("admin.notifications.simpleReservation"),
          });

          // Create persistent notification
          const notification = new Notification(notificationTitle, {
            body: notificationBody,
            icon: "/NextFoody.png",
            badge: "/NextFoody.png",
            tag: `reservation-${reservation.id}`,
            requireInteraction: true,
            silent: false,
          });

          // Handle notification click - focus the window and navigate to reservations
          notification.onclick = () => {
            window.focus();
            notification.close();
            // Navigate to reservation management with the reservation highlighted
            window.location.href = `/admin/reservations?highlightReservation=${reservation.id}`;
          };

          return;
        }

        // Handle order notifications (existing logic)
        const order = notificationData.order;
        if (!order) return;
        
        const user = order.user;

        // Guard against missing user data
        if (!user) {
          return;
        }

        const userName = `${user.firstName} ${user.lastName}`;
        const isCancelled = String(order.status) === "CANCELLED";
        const totalAmount =
          typeof order.totalAmount === "number"
            ? order.totalAmount.toFixed(2)
            : Number(order.totalAmount).toFixed(2);

        // Get merge request info if available
        const mergeRequest = (order as any)._mergeRequest;
        const newItems = mergeRequest?.newItems || [];

        // Build notification title and body
        let notificationTitle = t("admin.notifications.newOrderReceived");
        let notificationBody = t("admin.notifications.newOrderBody", {
          userName,
          totalAmount,
        });

        if (isCancelled) {
          notificationTitle = t("admin.notifications.orderCancelled");
          notificationBody = t("admin.notifications.orderCancelledBody", {
            userName,
            orderNumber: order.orderNumber,
          });
        }

        if (!isCancelled && isMergeRequest && newItems.length > 0) {
          notificationTitle = t("admin.notifications.orderModified");
          const newItemsText = newItems
            .map(
              (item: any) =>
                `${item.quantity}x ${
                  item.name || t("admin.notifications.item")
                }`
            )
            .join(", ");
          notificationBody = t(
            "admin.notifications.orderModifiedBodyWithItems",
            {
              userName,
              orderNumber: order.orderNumber,
              newItems: newItemsText,
            }
          );
        } else if (!isCancelled && isMergeRequest) {
          notificationTitle = t("admin.notifications.orderModified");
          notificationBody = t("admin.notifications.orderModifiedBody", {
            userName,
            orderNumber: order.orderNumber,
          });
        } else if (!isCancelled) {
          // Get order items count for regular notifications
          const itemsCount = order.orderItems?.length || 0;
          const itemsText =
            itemsCount === 1
              ? t("admin.notifications.oneItem")
              : t("admin.notifications.itemsCount", { count: itemsCount });
          notificationBody = t("admin.notifications.newOrderBodyWithItems", {
            userName,
            totalAmount,
            itemsText,
          });
        }

        // Create persistent notification - stays until admin manually closes it
        const notification = new Notification(notificationTitle, {
          body: notificationBody,
          icon:
            order.orderItems
              ?.filter((it: any) => it?.itemType !== "DEAL_COMPONENT")
              ?.map((it: any) => it?.deal?.image || it?.meal?.image)
              ?.find(Boolean) || "/NextFoody.png", // Prefer deal image, fallback to meal image, then default
          badge: "/NextFoody.png", // Small icon shown on mobile
          tag: `order-${order.id}`, // Replace existing notifications with same tag (prevents duplicates)
          requireInteraction: true, // Keeps notification visible until user interacts with it
          silent: false, // Play system sound (in addition to our custom sound)
        });

        // Handle notification click - focus the window and navigate to orders
        notification.onclick = () => {
          window.focus();
          notification.close();
          // Navigate to order management with the order highlighted
          window.location.href = `/admin/orders?highlightOrder=${order.id}`;
        };

        // Don't auto-close - notification stays in OS notification center until admin clears it
        // The notification will remain in the OS notification bar/center until:
        // 1. User clicks it (closes it and navigates to order)
        // 2. User manually dismisses it from the notification center
      } catch (error) {
        // Error showing OS notification
      }
    },
    []
  );

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Intersection observer for infinite scroll
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "100px",
  });

  // Fetch notifications
  const fetchNotifications = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (fetchingRef.current) return;

      try {
        fetchingRef.current = true;
        setLoading(true);
        // Always get a fresh token - don't use cached token for HTTP requests to avoid expiration
        const token = await getToken();
        if (!token) return;

        const response = await notificationService.getNotifications(
          pageNum,
          limit,
          token
        );

        if (append) {
          // Append new notifications, avoiding duplicates by notification ID
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newNotifications = response.notifications.filter(
              (n) => !existingIds.has(n.id)
            );
            return [...prev, ...newNotifications];
          });
        } else {
          setNotifications(response.notifications);
        }

        setHasMore(pageNum < response.pagination.pages);
      } catch (error: any) {
        // Handle token expiration (401) - retry with fresh token
        if (error?.message?.includes("401") || error?.status === 401) {
          // Retry once with fresh token (Clerk handles token refresh internally)
          try {
            const freshToken = await getToken();
            if (freshToken) {
              const response = await notificationService.getNotifications(
                pageNum,
                limit,
                freshToken
              );

              if (append) {
                setNotifications((prev) => {
                  const existingIds = new Set(prev.map((n) => n.id));
                  const newNotifications = response.notifications.filter(
                    (n) => !existingIds.has(n.id)
                  );
                  return [...prev, ...newNotifications];
                });
              } else {
                setNotifications(response.notifications);
              }

              setHasMore(pageNum < response.pagination.pages);
              return; // Success, exit early
            }
          } catch (retryError) {
            // Retry with fresh token failed
          }
        }

        // Handle rate limiting (429) - stop infinite scroll temporarily
        if (error?.message?.includes("429") || error?.status === 429) {
          setHasMore(false); // Stop trying to load more

          // Retry after a delay (exponential backoff)
          setTimeout(() => {
            setHasMore(true);
          }, 60000); // Wait 1 minute before allowing more loads
        }
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [getToken]
  );

  // Store ref to prevent duplicate calls
  const fetchingUnseenRef = useRef(false);

  // Throttle ref to prevent rapid successive requests
  const lastRequestRef = useRef<number>(0);
  const THROTTLE_DELAY = 800; // Minimum 800ms between requests

  // Load more when scroll reaches bottom (with throttling)
  useEffect(() => {
    if (inView && hasMore && !loading && isOpen && !fetchingRef.current) {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestRef.current;

      // Throttle requests to prevent rate limiting
      const delay = Math.max(0, THROTTLE_DELAY - timeSinceLastRequest);

      const timeoutId = setTimeout(() => {
        lastRequestRef.current = Date.now();
        const nextPage = page + 1;
        setPage(nextPage);
        fetchNotifications(nextPage, true);
      }, delay);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore, loading, isOpen]);

  // Reset when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setHasMore(true);
    }
  }, [isOpen]);

  // Initial load when dropdown opens - always fetch fresh notifications
  useEffect(() => {
    if (isOpen) {
      // Reset pagination state
      setPage(1);
      setHasMore(true);
      // Clear existing notifications and fetch fresh from server
      // This ensures we always see the complete, up-to-date list
      setNotifications([]);
      fetchNotifications(1, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Refresh unseen count periodically and on mount
  useEffect(() => {
    if (!canViewNotifications) return;
    const refreshCount = async () => {
      if (fetchingUnseenRef.current) return;
      fetchingUnseenRef.current = true;

      try {
        // Always get a fresh token - don't use cached token for HTTP requests to avoid expiration
        const token = await getToken();
        if (!token) return;

        const unseen = await notificationService.getUnseenNotifications(token);
        setUnseenCount(unseen.length);
      } catch (error: any) {
        // If token expired (401), retry once with a fresh token
        if (error?.message?.includes("401") || error?.status === 401) {
          try {
            // Get a completely fresh token (Clerk handles token refresh internally)
            const freshToken = await getToken();
            if (freshToken) {
              const unseen = await notificationService.getUnseenNotifications(
                freshToken
              );
              setUnseenCount(unseen.length);
            }
          } catch (retryError) {
            // Retry with fresh token failed
          }
        }
      } finally {
        fetchingUnseenRef.current = false;
      }
    };

    refreshCount();
    const interval = setInterval(refreshCount, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewNotifications]);

  // Store token in ref to avoid reconnections on scroll
  const tokenRef = useRef<string | null>(null);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!canViewNotifications) return;
    const socketService = SocketService.getInstance();
    let isMounted = true;

    // Connect to WebSocket (handles duplicates internally)
    const connectSocket = async () => {
      try {
        const token = await getToken();
        tokenRef.current = token;
        await socketService.connect(token || undefined);
      } catch (error) {
        // Error connecting to WebSocket
      }
    };

    // Connect immediately (SocketService handles race conditions)
    connectSocket();

    // Listen for new reservation notifications
    const handleNewReservation = (data: {
      notification: NotificationItem;
      reservation: any;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (!shouldHandleOrgScopedEvent(data.organizationId)) {
        return;
      }

      // Play notification sound using audio service
      playNotificationSound();

      // Show OS notification
      showOSNotification(data.notification, false, true);

      // Guard against missing notification data
      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid new reservation notification data received",
          data
        );
        return;
      }

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

      // Refresh unseen count to ensure accuracy (async, won't block real-time updates)
      const refreshCount = async () => {
        try {
          // Always get a fresh token - don't use cached token for HTTP requests
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error: any) {
          // If token expired (401), retry with fresh token
          if (error?.message?.includes("401") || error?.status === 401) {
            if (isMounted) {
              try {
                const freshToken = await getToken();
                if (freshToken) {
                  const unseen =
                    await notificationService.getUnseenNotifications(
                      freshToken
                    );
                  if (isMounted) {
                    setUnseenCount(unseen.length);
                  }
                }
              } catch (retryError) {
                // Retry failed
              }
            }
          }
        }
      };
      refreshCount();
    };

    // Listen for new order notifications
    const handleNewOrder = (data: {
      notification: NotificationItem;
      order: any;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (!shouldHandleOrgScopedEvent(data.organizationId)) {
        return;
      }

      // Play notification sound using audio service
      playNotificationSound();

      // Show OS notification
      showOSNotification(data.notification);

      // Guard against missing notification data
      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid new order notification data received",
          data
        );
        return;
      }

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

      // Refresh unseen count to ensure accuracy (async, won't block real-time updates)
      const refreshCount = async () => {
        try {
          // Always get a fresh token - don't use cached token for HTTP requests
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error: any) {
          // If token expired (401), retry with fresh token
          if (error?.message?.includes("401") || error?.status === 401) {
            if (isMounted) {
              try {
                const freshToken = await getToken();
                if (freshToken) {
                  const unseen =
                    await notificationService.getUnseenNotifications(
                      freshToken
                    );
                  if (isMounted) {
                    setUnseenCount(unseen.length);
                  }
                }
              } catch (retryError) {
                // Retry failed
              }
            }
          }
        }
      };
      refreshCount();
    };

    // Handle reservation modification notification
    const handleReservationModified = (data: {
      notification: NotificationItem;
      reservation: any;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (!shouldHandleOrgScopedEvent(data.organizationId)) {
        return;
      }

      // Play notification sound using audio service
      playNotificationSound();

      // Create a custom notification message for modifications
      const reservation = data.reservation;
      const reservationNumber = reservation?.reservationNumber || "N/A";
      const customerName = reservation?.user 
        ? `${reservation.user.firstName || ""} ${reservation.user.lastName || ""}`.trim() || "Customer"
        : "Customer";
      
      // Get modification details from reservation (passed from backend)
      const modificationDetails = reservation?._modificationDetails;
      const itemsAdded = modificationDetails?.itemsAdded || 0;
      const itemsRemoved = modificationDetails?.itemsRemoved || 0;
      const modificationType = modificationDetails?.modificationType || "GENERAL";
      
      // Create different notification messages based on modification type
      let title = `Reservation #${reservationNumber} Modified`;
      let message = "";
      
      if (modificationType === "ITEMS_REMOVED" && itemsRemoved > 0) {
        title = `Reservation #${reservationNumber} - Items Removed`;
        message = `${customerName} removed ${itemsRemoved} item${itemsRemoved !== 1 ? 's' : ''} from their pre-order. Refund will be processed automatically.`;
      } else if (modificationType === "ITEMS_ADDED" && itemsAdded > 0) {
        title = `Reservation #${reservationNumber} - Items Added`;
        message = `${customerName} added ${itemsAdded} item${itemsAdded !== 1 ? 's' : ''} to their pre-order.`;
      } else if (modificationType === "ITEMS_BOTH") {
        title = `Reservation #${reservationNumber} - Items Modified`;
        message = `${customerName} modified their pre-order: ${itemsAdded} item${itemsAdded !== 1 ? 's' : ''} added, ${itemsRemoved} item${itemsRemoved !== 1 ? 's' : ''} removed.`;
      } else {
        // General modification (date, guests, etc.)
        const modifications: string[] = [];
        if (reservation?.reservationOrder?.items) {
          const itemCount = reservation.reservationOrder.items.length;
          modifications.push(`${itemCount} item${itemCount !== 1 ? 's' : ''} in pre-order`);
        }
        if (reservation?.numberOfGuests) {
          modifications.push(`${reservation.numberOfGuests} guest${reservation.numberOfGuests !== 1 ? 's' : ''}`);
        }
        if (reservation?.reservationDate) {
          const date = new Date(reservation.reservationDate);
          modifications.push(`Date: ${date.toLocaleDateString()}`);
        }
        message = modifications.length > 0 
          ? `${customerName} modified their reservation: ${modifications.join(", ")}`
          : `${customerName} modified their reservation.`;
      }

      // Create custom notification for OS notification
      const customNotification = {
        ...data.notification,
        title,
        message,
      };

      // Show OS notification
      showOSNotification(customNotification, false, true);

      // Guard against missing notification data
      if (!data.notification || !data.notification.id) {
        console.warn(
          "NotificationBell: Invalid reservation modification notification data received",
          data
        );
        return;
      }

      // Add notification to the beginning of the list (real-time update)
      // Include modification details in the notification's reservation object
      setNotifications((prev) => {
        // Check if notification already exists (avoid duplicates)
        const exists = prev.some((n) => n && n.id === data.notification.id);
        if (exists) {
          return prev;
        }
        // Preserve modification details in the notification's reservation
        const notificationWithModificationDetails = {
          ...data.notification,
          reservation: data.reservation, // Include the reservation with _modificationDetails
        };
        const updated = [notificationWithModificationDetails, ...prev];
        return updated;
      });

      // Update unseen count (real-time update)
      setUnseenCount((prev) => {
        const updated = prev + 1;
        return updated;
      });

      // Refresh unseen count to ensure accuracy (async, won't block real-time updates)
      const refreshCount = async () => {
        try {
          // Always get a fresh token - don't use cached token for HTTP requests
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error: any) {
          // If token expired (401), retry with fresh token
          if (error?.message?.includes("401") || error?.status === 401) {
            if (isMounted) {
              try {
                const freshToken = await getToken();
                if (freshToken) {
                  const unseen =
                    await notificationService.getUnseenNotifications(
                      freshToken
                    );
                  if (isMounted) {
                    setUnseenCount(unseen.length);
                  }
                }
              } catch (retryError) {
                // Retry failed
              }
            }
          }
        }
      };
      refreshCount();
    };

    // Handle order updated event (when order is merged/updated)
    const handleOrderUpdated = (data: {
      notification: NotificationItem;
      order: any;
      newItems?: any[];
      isMergeRequest?: boolean;
      organizationId?: string;
    }) => {
      if (!isMounted) return;

      if (!shouldHandleOrgScopedEvent(data.organizationId)) {
        return;
      }

      // Play notification sound using audio service
      playNotificationSound();

      // Guard against missing notification or order data
      if (!data.notification || !data.notification.order) {
        console.warn(
          "NotificationBell: Invalid order update data received",
          data
        );
        return;
      }

      const baseNotification = data.notification;
      const baseOrder = data.notification.order;

      // Attach merge request info to notification order
      const notificationWithMergeInfo = {
        ...baseNotification,
        order: {
          ...baseOrder,
          _mergeRequest: data.isMergeRequest
            ? {
                newItems: data.newItems || [],
              }
            : undefined,
        },
      };

      // Show OS notification for order update
      showOSNotification(
        notificationWithMergeInfo,
        data.notification.isOrderUpdate || false
      );

      // Update existing notification in the list instead of adding new one
      setNotifications((prev) => {
        // Guard against missing notification or order data
        if (!baseNotification.order || !baseOrder.id) {
          console.warn(
            "NotificationBell: Invalid notification data received",
            data
          );
          return prev;
        }

        const orderId = baseOrder.id;

        // Find existing notification by orderId
        const existingIndex = prev.findIndex(
          (n) => n && n.order && n.order.id === orderId
        );

        if (existingIndex !== -1) {
          // Update existing notification
          const updated = [...prev];
          const wasPreviouslySeen = updated[existingIndex].isSeen;
          updated[existingIndex] = notificationWithMergeInfo;

          // Update unseen count if notification was previously seen but is now unseen
          if (wasPreviouslySeen && !notificationWithMergeInfo.isSeen) {
            setUnseenCount((count) => count + 1);
          }

          // Move to top of list (most recent)
          return [
            updated[existingIndex],
            ...updated.filter((_, i) => i !== existingIndex),
          ];
        } else {
          // If notification doesn't exist, add it (shouldn't happen, but safety check)
          const exists = prev.some((n) => n.id === data.notification.id);
          if (exists) {
            return prev;
          }

          // Increment unseen count if adding new unseen notification
          if (!notificationWithMergeInfo.isSeen) {
            setUnseenCount((count) => count + 1);
          }

          return [notificationWithMergeInfo, ...prev];
        }
      });

      // Refresh unseen count to ensure accuracy (async, won't block real-time updates)
      const refreshCount = async () => {
        try {
          // Always get a fresh token - don't use cached token for HTTP requests
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error: any) {
          // If token expired (401), retry with fresh token
          if (error?.message?.includes("401") || error?.status === 401) {
            if (isMounted) {
              try {
                const freshToken = await getToken();
                if (freshToken) {
                  const unseen =
                    await notificationService.getUnseenNotifications(
                      freshToken
                    );
                  if (isMounted) {
                    setUnseenCount(unseen.length);
                  }
                }
              } catch (retryError) {
                // Retry failed
              }
            }
          }
        }
      };
      refreshCount();
    };

    // Handle notification seen event (when another admin marks notification as seen)
    const handleNotificationSeen = (data: {
      orderId: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted) return;

      // Update notification in the list if it exists
      setNotifications((prev) => {
        const updated = prev.map((notif) => {
          if (notif && notif.order && notif.order.id === data.orderId) {
            return {
              ...notif,
              isSeen: true,
              seenAt: data.seenAt ? new Date(data.seenAt).toISOString() : null,
            };
          }
          return notif;
        });
        return updated;
      });

      // Decrement unseen count if this notification was previously unseen
      setUnseenCount((prev) => {
        // Only decrement if we had unseen notifications
        if (prev > 0) {
          const updated = prev - 1;
          return Math.max(0, updated); // Prevent negative count
        }
        return prev;
      });

      // Refresh unseen count from API to ensure accuracy
      const refreshCount = async () => {
        try {
          // Always get a fresh token - don't use cached token for HTTP requests
          const token = await getToken();
          if (!token || !isMounted) return;

          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          if (isMounted) {
            setUnseenCount(unseen.length);
          }
        } catch (error: any) {
          // If token expired (401), retry with fresh token
          if (error?.message?.includes("401") || error?.status === 401) {
            if (isMounted) {
              try {
                const freshToken = await getToken();
                if (freshToken) {
                  const unseen =
                    await notificationService.getUnseenNotifications(
                      freshToken
                    );
                  if (isMounted) {
                    setUnseenCount(unseen.length);
                  }
                }
              } catch (retryError) {
                // Retry failed
              }
            }
          }
        }
      };
      refreshCount();
    };

    // Handle all notifications seen event
    const handleAllNotificationsSeen = (data: {
      count: number;
      seenAt: Date;
    }) => {
      if (!isMounted) return;

      // Update all notifications in the list
      setNotifications((prev) => {
        const updated = prev.map((notif) => {
          if (!notif.isSeen) {
            return {
              ...notif,
              isSeen: true,
              seenAt: data.seenAt ? new Date(data.seenAt).toISOString() : null,
            };
          }
          return notif;
        });
        return updated;
      });

      // Reset unseen count to 0
      setUnseenCount(0);
    };

    // Register event listeners with a helper function
    const registerListeners = () => {
      // Remove existing listeners first to prevent duplicates
      socketService.off("new-order");
      socketService.off("new-reservation");
      socketService.off("order-updated");
      socketService.off("notification-seen");
      socketService.off("all-notifications-seen");

      // Register listeners
      socketService.on("new-order", handleNewOrder);
      socketService.on("new-reservation", handleNewReservation);
      socketService.on("reservation-modified", handleReservationModified); // Use separate handler for modifications
      socketService.on("order-updated", handleOrderUpdated);
      socketService.on("notification-seen", handleNotificationSeen);
      socketService.on("all-notifications-seen", handleAllNotificationsSeen);
    };

    // Register listeners immediately
    registerListeners();

    // Also register on reconnect (if socket reconnects after listeners were registered)
    const socket = socketService.getSocket();
    let reconnectHandler: (() => void) | null = null;

    if (socket) {
      reconnectHandler = () => {
        registerListeners();
      };
      socket.on("reconnect", reconnectHandler);
    }

    // Cleanup on unmount
    return () => {
      isMounted = false;
      socketService.off("new-order");
      socketService.off("new-reservation");
      socketService.off("reservation-modified");
      socketService.off("order-updated");
      socketService.off("notification-seen");
      socketService.off("all-notifications-seen");
      if (socket && reconnectHandler) {
        socket.off("reconnect", reconnectHandler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOSNotification, t]); // Removed getToken to prevent reconnections on scroll

  // Handle notification click - navigate to order/reservation management page
  const handleNotificationClick = async (notification: NotificationItem) => {
    // Mark notification as seen
    try {
      const token = await getToken();
      if (token) {
        await notificationService.markAsSeen(notification.id, token);
        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, isSeen: true } : n
          )
        );
        setUnseenCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking notification as seen:", error);
    }

    // Navigate based on notification type
    if (notification.type === "RESERVATION" && notification.reservation) {
      // Get branchId from reservation - need to fetch full reservation details
      let branchId: string | undefined;
      
      // Fetch reservation details to get branchId
      try {
        const token = await getToken();
        if (token) {
          const reservationDetails = await reservationService.getReservationById(
            notification.reservation.id,
            token
          );
          branchId = reservationDetails.branch?.id;
        }
      } catch (error) {
        console.error("Error fetching reservation details for navigation:", error);
      }
      
      // Navigate to reservation management page with branchId
      const branchParam = branchId ? `&branchId=${branchId}` : "";
      navigate(`/admin/reservations?highlightReservation=${notification.reservation.id}${branchParam}`);
      setIsOpen(false);
      return;
    } else if (notification.order) {
      // Navigate to orders page with order ID - backend will auto-detect branch from the order
      const url = `/admin/orders?highlightOrder=${notification.order.id}`;
      navigate(url);
    } else {
      console.warn(
        "NotificationBell: Cannot navigate - invalid notification data",
        notification
      );
      return;
    }
    
    setIsOpen(false);
  };

  // Always render - AdminLayout is already protected by admin route

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-muted relative flex items-center justify-center z-50"
        onClick={handleToggle}
      >
        <Icon path={mdiBell} size={0.67} className="text-foreground" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-pink-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side={isMobile ? "left" : "right"}
          className={cn(
            "w-screen h-screen flex flex-col p-0 overflow-hidden",
            isMobile ? "sm:max-w-full" : "sm:max-w-md",
            "[&>button]:hidden" // Hide the default close button
          )}
          // @ts-ignore - SheetContent accepts children and className
        >
          <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between">
            <div className="flex-1">
              <SheetTitle className="text-sm font-semibold m-0">
                {t("admin.notifications.title")}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t("admin.notifications.description")}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {unseenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      // Always get a fresh token - don't use cached token for HTTP requests
                      const token = await getToken();
                      if (token) {
                        await notificationService.markAllAsSeen(token);
                        setNotifications((prev) =>
                          prev.map((n) => ({ ...n, isSeen: true }))
                        );
                        setUnseenCount(0);
                      }
                    } catch (error) {
                      // Error marking all as seen
                    }
                  }}
                >
                  {t("admin.notifications.markAllRead")}
                </Button>
              )}
              {/* Close button - visible on all screen sizes */}
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:text-white/80 hover:bg-white/10"
                  onClick={() => {
                    setIsOpen(false);
                  }}
                >
                  <Icon path={mdiClose} size={0.67} />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("admin.notifications.noNotifications")}
              </div>
            )}

            {notifications
              .filter((notification) => notification && (notification.order || notification.reservation)) // Filter out invalid notifications
              .map((notification) => {
                // Handle reservation notifications
                if (notification.type === "RESERVATION" && notification.reservation) {
                  const reservation = notification.reservation;
                  const user = reservation.user;
                  const customerName = user
                    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
                    : reservation.customerName || t("admin.notifications.guest");
                  
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
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "px-4 py-3 mb-1 cursor-pointer transition-colors border-b last:border-b-0",
                        !notification.isSeen
                          ? "bg-muted/70 hover:bg-muted/50 border-l-2 border-l-pink-500"
                          : "bg-muted/40 hover:bg-muted/20 border-l-2 border-l-gray-500"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm font-semibold text-foreground">
                              {isModification 
                                ? modificationTitle
                                : t("admin.notifications.newReservationTitle", {
                                customerName,
                                  })
                              }
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {isModification ? (
                              <>
                                {modificationMessage || (
                                  <>
                                    <span className="font-medium">{customerName}</span> modified their reservation.
                                  </>
                                )}
                                <span className="block mt-1">
                                  {formattedDate} at {formattedTime}
                                </span>
                              </>
                            ) : (
                              t("admin.notifications.reservationDetails", {
                              numberOfGuests: reservation.numberOfGuests,
                              date: formattedDate,
                              time: formattedTime,
                              type: reservation.type === "PRE_ORDER"
                                ? t("admin.notifications.preOrderReservation")
                                : t("admin.notifications.simpleReservation"),
                              })
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {reservation.reservationNumber}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {!notification.isSeen && (
                            <span className="h-2 w-2 rounded-full bg-pink-500" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Handle order notifications (existing logic)
                const mergeRequest = (notification.order as any)?._mergeRequest;
                const isMergeRequest = !!mergeRequest;
                const newItems = mergeRequest?.newItems || [];
                const isOrderUpdate = notification.isOrderUpdate || false;
                const isCancelled = String(notification.order?.status) === "CANCELLED";

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "px-4 py-3 mb-1 cursor-pointer transition-colors border-b last:border-b-0",
                      !notification.isSeen
                        ? "bg-muted/70 hover:bg-muted/50 border-l-2 border-l-pink-500"
                        : "bg-muted/40 hover:bg-muted/20 border-l-2 border-l-gray-500"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-foreground">
                            {isCancelled ? (
                              <Trans
                                i18nKey="admin.notifications.orderCancelledTitle"
                                values={{
                                  customerName: notification.order?.user
                                    ? notification.order.user.firstName ||
                                      notification.order.user.lastName
                                      ? `${
                                          notification.order.user.firstName ||
                                          ""
                                        } ${
                                          notification.order.user.lastName || ""
                                        }`.trim()
                                      : notification.order.user.email
                                    : t("admin.notifications.guest"),
                                  orderNumber: notification.order?.orderNumber,
                                }}
                                components={{
                                  bold: <span className="font-bold" />,
                                }}
                              />
                            ) : isOrderUpdate || isMergeRequest ? (
                              <Trans
                                i18nKey="admin.notifications.orderModifiedTitle"
                                values={{
                                  customerName: notification.order?.user
                                    ? notification.order.user.firstName ||
                                      notification.order.user.lastName
                                      ? `${
                                          notification.order.user.firstName ||
                                          ""
                                        } ${
                                          notification.order.user.lastName || ""
                                        }`.trim()
                                      : notification.order.user.email
                                    : t("admin.notifications.guest"),
                                  orderNumber: notification.order?.orderNumber,
                                }}
                                components={{
                                  bold: <span className="font-bold" />,
                                }}
                              />
                            ) : (
                              <Trans
                                i18nKey="admin.notifications.newOrderTitle"
                                values={{
                                  customerName: notification.order?.user
                                    ? notification.order.user.firstName ||
                                      notification.order.user.lastName
                                      ? `${
                                          notification.order.user.firstName ||
                                          ""
                                        } ${
                                          notification.order.user.lastName || ""
                                        }`.trim()
                                      : notification.order.user.email
                                    : t("admin.notifications.guest"),
                                }}
                              />
                            )}
                          </p>
                          {!notification.isSeen && (
                            <span className="h-2 w-2 rounded-full bg-pink-500 flex-shrink-0 mt-0.5" />
                          )}
                          {/* Meal Items Avatars */}
                          {notification.order?.orderItems &&
                            notification.order.orderItems.length > 0 && (
                              <div className="flex items-center gap-1 ml-auto">
                                <div className="flex -space-x-2">
                                  {notification.order.orderItems
                                    .filter((it: any) => it?.itemType !== "DEAL_COMPONENT")
                                    .slice(0, 3)
                                    .map((item, index) => {
                                      const displayName =
                                        item?.deal?.name || item?.meal?.name || "Item";
                                      const rawImage =
                                        item?.deal?.image || item?.meal?.image || null;

                                      const imageUrl = rawImage
                                        ? rawImage.startsWith("http")
                                          ? rawImage
                                          : (() => {
                                              const apiUrl =
                                                import.meta.env.VITE_API_URL ||
                                                "";
                                              return apiUrl
                                                ? `${apiUrl}/uploads/images/${rawImage}`
                                                : `/uploads/images/${rawImage}`;
                                            })()
                                        : null;
                                      return (
                                        <Avatar
                                          key={`${item.id}-${index}`}
                                          className="h-6 w-6 border-2 border-background"
                                        >
                                          {imageUrl ? (
                                            <AvatarImage
                                              src={imageUrl}
                                              alt={displayName}
                                              className="object-cover"
                                            />
                                          ) : (
                                            <AvatarFallback className="bg-muted text-[8px]">
                                              {(displayName || "?")
                                                .charAt(0)
                                                .toUpperCase()}
                                            </AvatarFallback>
                                          )}
                                        </Avatar>
                                      );
                                    })}
                                  {notification.order.orderItems.length > 3 && (
                                    <Avatar className="h-6 w-6 border-2 border-background bg-muted flex items-center justify-center">
                                      <span className="text-[8px] font-semibold text-foreground">
                                        +
                                        {notification.order.orderItems.length -
                                          3}
                                      </span>
                                    </Avatar>
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                        {/* Show new items for merge requests */}
                        {!isCancelled && isMergeRequest && newItems.length > 0 && (
                          <div className="mt-2 p-2 bg-muted/50 rounded-md border border-border">
                            <p className="text-xs font-semibold text-foreground mb-1">
                              {t("admin.notifications.newItemsBeingAdded")}
                            </p>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              {newItems.map((item: any, idx: number) => (
                                <li
                                  key={idx}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-green-500 dark:text-green-400">
                                    +
                                  </span>
                                  <span>
                                    {item.quantity}x {item.name}
                                    {item.size && ` (${item.size})`}
                                    {item.addOns && item.addOns.length > 0 && (
                                      <span className="text-muted-foreground/70">
                                        {" "}
                                        + {item.addOns.join(", ")}
                                      </span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {notification.order && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                            <span className="font-medium text-foreground">
                              $
                              {typeof notification.order.totalAmount === "number"
                                ? notification.order.totalAmount.toFixed(2)
                                : Number(
                                    notification.order.totalAmount ?? 0
                                  ).toFixed(2)}
                            </span>
                            <span className="text-muted-foreground/60">•</span>
                            {notification.seenAt ? (
                              <>
                                <span className="text-muted-foreground">
                                  {t("admin.notifications.seen")}{" "}
                                  {formatDistanceToNow(
                                    new Date(notification.seenAt),
                                    {
                                      addSuffix: true,
                                    }
                                  )}
                                </span>
                                <span className="text-muted-foreground/60">
                                  •
                                </span>
                                <span className="text-muted-foreground">
                                  {formatDistanceToNow(
                                    new Date(notification.createdAt),
                                    {
                                      addSuffix: true,
                                    }
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(
                                  new Date(notification.createdAt),
                                  {
                                    addSuffix: true,
                                  }
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Loading indicator */}
            {loading && (
              <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                {t("admin.notifications.loading")}
              </div>
            )}

            {/* Intersection observer trigger */}
            {hasMore && <div ref={ref} className="h-4" />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
