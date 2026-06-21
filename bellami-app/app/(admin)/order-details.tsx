import React, { useState, useEffect, useRef, useMemo, type ComponentProps } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  orderService,
  type Order,
  type OrderUpdateData,
} from "@/src/services/orderService";
import PickupLocationDisplay from "@/components/PickupLocationDisplay";
import {
  refundService,
  type RefundType,
  type RefundItem,
  type RefundResponse,
} from "@/src/services/refundService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import SocketService from "@/src/services/socketService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import ApiService from "@/src/services/apiService";
import branchService, { type Branch } from "@/src/services/branchService";

const getRemainingPrepMs = (o: Order | null, nowMs: number): number | null => {
  if (!o) return null;
  const prepMin = o.preparationTime != null ? Number(o.preparationTime) : NaN;
  if (!Number.isFinite(prepMin) || prepMin <= 0) return null;
  const eligibleStatuses = new Set([
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PICKED_UP",
  ]);
  const anchorRaw = o.confirmedAt || (eligibleStatuses.has(String(o.status)) ? o.createdAt : null);
  if (!anchorRaw) return null;
  const anchor = new Date(anchorRaw);
  if (Number.isNaN(anchor.getTime())) return null;
  const end = anchor.getTime() + prepMin * 60 * 1000;
  return Math.max(0, end - nowMs);
};

const formatRemaining = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount: number, currency: string = "USD"): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
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

const formatOrderNumber = (orderNumber: string): string => {
  return `#${orderNumber}`;
};

const getStatusColor = (status: Order["status"]): string => {
  switch (status) {
    case "PENDING":
      return "#fbbf24";
    case "CONFIRMED":
      return "#3b82f6";
    case "PREPARING":
      return "#f97316";
    case "READY_FOR_DELIVERY":
    case "READY_FOR_PICKUP":
      return "#a855f7";
    case "OUT_FOR_DELIVERY":
      return "#6366f1";
    case "DELIVERED":
    case "PICKED_UP":
      return "#22c55e";
    case "CANCELLED":
      return "#ef4444";
    default:
      return "#6b7280";
  }
};

const getPaymentStatusColor = (status: Order["paymentStatus"]): string => {
  switch (status) {
    case "PENDING":
      return "#fbbf24";
    case "PAID":
      return "#22c55e";
    case "FAILED":
      return "#ef4444";
    case "REFUNDED":
      return "#3b82f6";
    case "PARTIALLY_REFUNDED":
      return "#f97316";
    default:
      return "#6b7280";
  }
};

const getStatusIcon = (status: Order["status"]): ComponentProps<typeof MaterialCommunityIcons>["name"] => {
  switch (status) {
    case "PENDING":
      return "clock";
    case "CONFIRMED":
    case "DELIVERED":
    case "READY_FOR_PICKUP":
    case "PICKED_UP":
      return "check-circle";
    case "PREPARING":
      return "package-variant";
    case "READY_FOR_DELIVERY":
    case "OUT_FOR_DELIVERY":
      return "truck";
    case "CANCELLED":
      return "close-circle";
    default:
      return "alert-circle";
  }
};

const getAllowedStatusOptions = (orderType: Order["orderType"]): Order["status"][] => {
  const base: Order["status"][] = ["PENDING", "CONFIRMED", "PREPARING"];
  if (orderType === "PICKUP") {
    return [...base, "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"];
  }
  return [...base, "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
};

export default function OrderDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderId = params.id as string;
  const isEditMode = params.edit === "true";
  const { getToken } = useAuthRole();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const refundsLoadedForOrderId = useRef<string | null>(null);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [settings, setSettings] = useState<any | null>(null);
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderRefunds, setOrderRefunds] = useState<RefundResponse[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [editFormData, setEditFormData] = useState<OrderUpdateData>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
  const [showPaymentStatusModal, setShowPaymentStatusModal] = useState(false);
  const [showPreparationTimeModal, setShowPreparationTimeModal] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [refundFormData, setRefundFormData] = useState<{
    refundType: RefundType;
    amount?: number;
    items: RefundItem[];
    reason?: string;
  }>({
    refundType: "FULL",
    items: [],
  });
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const canEditOrders =
    !permissionsLoading &&
    (can(RESOURCES.ORDERS, ACTIONS.UPDATE) ||
      can(RESOURCES.ORDERS, ACTIONS.UPDATE_STATUS));

  const canRefundOrders =
    !permissionsLoading && can(RESOURCES.ORDERS, ACTIONS.REFUND);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        if (!token) return;
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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const branchId = String((order as any)?.branchId || (order as any)?.branch?.id || "").trim();
        if (!branchId) {
          setBranchDetails(null);
          return;
        }
        const token = await getToken();
        if (!token) return;
        const list = await branchService.getBranches(token);
        if (cancelled) return;
        const found = Array.isArray(list)
          ? (list as any[]).find((b) => String((b as any)?.id) === branchId)
          : null;
        setBranchDetails((found as any) ?? null);
      } catch {
        if (cancelled) return;
        setBranchDetails(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, order]);

  const displayCurrency = useMemo(() => {
    const branchCurrency = String((branchDetails as any)?.currency || "").trim();
    const settingsCurrency = String((settings as any)?.currency || "").trim();
    const orderCurrency = String((order as any)?.currency || "").trim();
    return branchCurrency || settingsCurrency || orderCurrency || "USD";
  }, [branchDetails, order, settings]);

  // If user tries to enter edit mode without permission, force view mode.
  useEffect(() => {
    if (permissionsLoading) return;
    if (isEditMode && !canEditOrders) {
      router.replace(`/(admin)/order-details?id=${orderId}` as any);
    }
  }, [permissionsLoading, isEditMode, canEditOrders, orderId, router]);

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

  const getStatusLabel = (status: Order["status"]): string => {
    const statusKey = `admin.orderManagement.statuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status });
    return translated !== statusKey
      ? translated
      : status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPaymentStatusLabel = (status: Order["paymentStatus"]): string => {
    const statusKey = `admin.orderManagement.paymentStatuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status });
    return translated !== statusKey
      ? translated
      : status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPaymentMethodLabel = (method: Order["paymentMethod"]): string => {
    const methodKey = `admin.orderManagement.paymentMethods.${method
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(methodKey, { defaultValue: method });
    return translated !== methodKey ? translated : method;
  };

  const getRefundTypeLabel = (type: RefundType): string => {
    const typeKey = `admin.orderManagement.refundTypes.${type
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(typeKey, { defaultValue: type });
    return translated !== typeKey ? translated : type;
  };

  const isClosedOrder = (o: Order) => (o as any)?.businessDaySession?.status === "CLOSED";

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!order) return;
    if (!editFormData.status) return;
    const allowed = getAllowedStatusOptions(order.orderType);
    if (!allowed.includes(editFormData.status as any)) {
      setEditFormData((prev) => ({ ...prev, status: undefined }));
    }
  }, [order, editFormData.status]);

  useEffect(() => {
    if (orderId) {
      loadOrderDetails();
    }
  }, [orderId]);

  // Initialize edit form data when order loads and in edit mode
  useEffect(() => {
    if (order && isEditMode && canEditOrders) {
      setEditFormData({
        status: order.status,
        paymentStatus: order.paymentStatus,
        preparationTime: order.preparationTime != null ? Number(order.preparationTime) : undefined,
      });
    }
  }, [order, isEditMode, canEditOrders]);

  // Prevent editing cancelled orders - redirect to view mode if order is cancelled
  useEffect(() => {
    if (order && isEditMode && order.status === "CANCELLED") {
      router.replace(`/(admin)/order-details?id=${orderId}` as any);
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.orderCancelledReadOnly", {
          defaultValue: "This order has been cancelled and cannot be edited.",
        }),
        type: "error",
      });
    }
  }, [order, isEditMode, orderId, router, t]);

  // WebSocket connection for real-time order updates
  useEffect(() => {
    if (!orderId) return;

    const socketService = SocketService.getInstance();
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        await socketService.connect(token || undefined);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Handle order updated event (when order is updated by another admin)
        const handleOrderUpdated = (data: {
          notification: any;
          order: Order;
          newItems?: any[];
          isMergeRequest?: boolean;
        }) => {
          if (!isMounted) return;

          // Only update if it's the same order we're viewing
          if (data.order.id === orderId) {
            // Update order state with the new data
            setOrder(data.order);

            // Update edit form data if in edit mode
            if (isEditMode) {
              setEditFormData({
                status: data.order.status,
                paymentStatus: data.order.paymentStatus,
              });
            }

            // Show toast notification
            setToast({
              visible: true,
              message: t("admin.orderManagement.orderUpdatedToast", {
                orderNumber: formatOrderNumber(data.order.orderNumber),
              }),
              type: "info",
            });
          }
        };

        // Handle order status change event (when order status changes)
        const handleOrderStatusChange = (data: {
          orderId: string;
          orderNumber: string;
          status: string;
          paymentStatus: string;
          updatedAt: string;
        }) => {
          if (!isMounted) return;

          // Only update if it's the same order we're viewing
          if (data.orderId === orderId && order) {
            // Update order state with new status
            setOrder({
              ...order,
              status: data.status as Order["status"],
              paymentStatus: data.paymentStatus as Order["paymentStatus"],
              updatedAt: data.updatedAt,
            });

            // Update edit form data if in edit mode
            if (isEditMode) {
              setEditFormData({
                status: data.status as Order["status"],
                paymentStatus: data.paymentStatus as Order["paymentStatus"],
              });
            }
          }
        };

        socketService.on("order-updated", handleOrderUpdated);
        socketService.on("order-status-changed", handleOrderStatusChange);

        cleanupFn = () => {
          socketService.off("order-updated", handleOrderUpdated);
          socketService.off("order-status-changed", handleOrderStatusChange);
        };
      } catch (error) {
        console.error("📋 Order Details: Error setting up WebSocket:", error);
      }
    };

    setupWebSocket();

    return () => {
      isMounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order, isEditMode, getToken]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const orderData = await orderService.getOrderById(
        orderId,
        token || undefined
      );
      setOrder(orderData);

      // Best-effort load refunds (web shows refund history when present; this keeps mobile in sync)
      // We avoid refetching repeatedly for the same order.
      if (refundsLoadedForOrderId.current !== orderData.id) {
        try {
          await loadOrderRefunds(orderData.id);
          refundsLoadedForOrderId.current = orderData.id;
        } catch (e) {
          // keep silent; refund history will be hidden if we couldn't fetch
        }
      }
    } catch (error) {
      console.error("Error loading order details:", error);
      Alert.alert("Error", t("admin.orderManagement.loadOrderDetailsError"));
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadOrderRefunds = async (orderId: string) => {
    try {
      setLoadingRefunds(true);
      const token = await getToken();
      const refunds = await refundService.getOrderRefunds(
        orderId,
        token || undefined
      );
      setOrderRefunds(refunds);
    } catch (error) {
      console.error("Error loading refunds:", error);
      setOrderRefunds([]);
    } finally {
      setLoadingRefunds(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!order) return;

    if (isClosedOrder(order) && !order.isScheduledOrder) {
      return;
    }

    try {
      setIsActionLoading(true);
      const token = await getToken();

      const refundRequest: {
        orderId: string;
        refundType: RefundType;
        amount?: number;
        items?: RefundItem[];
        reason?: string;
      } = {
        orderId: order.id,
        refundType: refundFormData.refundType,
        reason: refundFormData.reason,
      };

      if (refundFormData.refundType === "PARTIAL" && refundFormData.amount) {
        refundRequest.amount = refundFormData.amount;
      } else if (refundFormData.refundType === "ITEM_SPECIFIC") {
        refundRequest.items = refundFormData.items;
      }

      await refundService.createRefund(refundRequest, token || undefined);
      setToast({
        visible: true,
        message: t("admin.orderManagement.refundProcessedSuccess"),
        type: "success",
      });
      setShowRefundModal(false);
      // Reload order to get updated payment status
      await loadOrderDetails();
    } catch (error: any) {
      console.error("Error processing refund:", error);
      setToast({
        visible: true,
        message:
          error?.message || t("admin.orderManagement.refundProcessError"),
        type: "error",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleItemRefundToggle = (orderItemId: string, isSelected: boolean) => {
    if (!order) return;

    if (isSelected) {
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId
      );
      if (orderItem) {
        setRefundFormData({
          ...refundFormData,
          items: [
            ...refundFormData.items,
            {
              orderItemId,
              refundAmount: parseFloat(orderItem.totalPrice.toString()),
            },
          ],
        });
      }
    } else {
      setRefundFormData({
        ...refundFormData,
        items: refundFormData.items.filter(
          (item) => item.orderItemId !== orderItemId
        ),
      });
    }
  };

  const handleSaveWithCheck = () => {
    if (!order) return;

    // Check if status is being changed to CANCELLED
    if (editFormData.status === "CANCELLED" && order.status !== "CANCELLED") {
      setCancelReasonInput("");
      setShowCancelReasonModal(true);
      return;
    }

    // Otherwise proceed with normal save
    handleUpdateOrder();
  };

  const handleConfirmCancelAndSave = async () => {
    if (!cancelReasonInput.trim()) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancellationReasonRequired", {
          defaultValue: "Please provide a cancellation reason",
        }),
        type: "error",
      });
      return;
    }

    setShowCancelReasonModal(false);

    // Add cancellation reason to editFormData and save
    try {
      setIsSaving(true);
      const token = await getToken();
      await orderService.updateOrder(
        order!.id,
        {
          ...editFormData,
          cancellationReason: cancelReasonInput.trim(),
        },
        token || undefined
      );

      setToast({
        visible: true,
        message: t("admin.orderManagement.orderUpdatedSuccess"),
        type: "success",
      });

      setTimeout(() => {
        router.back();
      }, 100);
    } catch (error) {
      console.error("Error updating order:", error);

      const errAny = error as any;
      const code = errAny?.response?.data?.code || errAny?.data?.code;
      if (code === "POS_DEVICE_REQUIRED") {
        setToast({
          visible: true,
          message: t("admin.orderManagement.posDeviceRequired", {
            defaultValue: "Select an active POS device for this branch to update the order.",
          }),
          type: "error",
        });
        return;
      }
      const serverMessage =
        errAny?.response?.data?.error ||
        errAny?.response?.data?.message ||
        errAny?.message ||
        undefined;
      setToast({
        visible: true,
        message: serverMessage || t("admin.orderManagement.orderUpdateError"),
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateOrder = async () => {
    if (!order) return;

    try {
      setIsSaving(true);
      const token = await getToken();
      await orderService.updateOrder(
        order.id,
        editFormData,
        token || undefined
      );

      setToast({
        visible: true,
        message: t("admin.orderManagement.orderUpdatedSuccess"),
        type: "success",
      });

      // Navigate back to orders management page after successful update
      // Use setTimeout to ensure navigation happens after state updates
      setTimeout(() => {
        router.back();
      }, 100);
    } catch (error) {
      console.error("Error updating order:", error);

      const errAny = error as any;
      const code = errAny?.response?.data?.code || errAny?.data?.code;
      if (code === "POS_DEVICE_REQUIRED") {
        setToast({
          visible: true,
          message: t("admin.orderManagement.posDeviceRequired", {
            defaultValue: "Select an active POS device for this branch to update the order.",
          }),
          type: "error",
        });
        return;
      }
      const serverMessage =
        errAny?.response?.data?.error ||
        errAny?.response?.data?.message ||
        errAny?.message ||
        undefined;
      setToast({
        visible: true,
        message: serverMessage || t("admin.orderManagement.orderUpdateError"),
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.orderManagement.orderDetails")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight + 16 }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.orderManagement.loadingOrderDetails")}
          </Text>
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.orderManagement.orderDetails")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight + 16 }]}>
          <MaterialCommunityIcons
            name="alert-circle"
            size={48}
            color="#6B7280"
          />
          <Text style={styles.emptyText}>
            {t("admin.orderManagement.orderNotFound")}
          </Text>
          <TouchableOpacity
            style={styles.backButtonStyle}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              {t("admin.orderManagement.goBack")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={
          isEditMode
            ? t("admin.orderManagement.editOrderTitle")
            : t("admin.orderManagement.orderDetails")
        }
        onBackPress={() => router.back()}
        rightContent={
          isEditMode ? (
            <TouchableOpacity
              onPress={handleSaveWithCheck}
              style={styles.saveButton}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {t("admin.orderManagement.save")}
                </Text>
              )}
            </TouchableOpacity>
          ) : canEditOrders && order?.status !== "CANCELLED" ? (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/(admin)/order-details?id=${orderId}&edit=true` as any
                )
              }
              style={styles.editButton}
            >
              <EditIcon size={18} color="#ec4899" />
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingTop: headerHeight + 34 }]}
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Order Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.orderNumber}>
              {formatOrderNumber(order.orderNumber)}
            </Text>
            {order.isMerged ? (
              <View style={styles.mergedBadge}>
                <Text style={styles.mergedBadgeText}>
                  {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                </Text>
              </View>
            ) : null}
          </View>

          {(() => {
            const remaining = getRemainingPrepMs(order, nowMs);
            if (remaining === null) return null;
            return (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t("admin.orderManagement.preparationTimeRemaining", {
                    defaultValue: "Preparation time remaining",
                  })}
                </Text>
                <Text style={styles.summaryValue}>{formatRemaining(remaining)}</Text>
              </View>
            );
          })()}

          {/* Status Badges Row - Editable in edit mode */}
          <View style={styles.statusRow}>
            <View style={styles.statusBadgeContainer}>
              <Text style={styles.statusLabel}>
                {t("admin.orderManagement.fields.status")}
              </Text>
              {isEditMode && canEditOrders ? (
                <TouchableOpacity
                  style={styles.statusPickerButton}
                  onPress={() => setShowOrderStatusModal(true)}
                >
                  <Text style={styles.statusPickerText}>
                    {editFormData.status
                      ? getStatusLabel(editFormData.status)
                      : t("admin.orderManagement.selectStatus")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: getStatusColor(order.status) + "20",
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={getStatusIcon(order.status)}
                    size={12}
                    color={getStatusColor(order.status)}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: getStatusColor(order.status) },
                    ]}
                  >
                    {getStatusLabel(order.status)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.statusBadgeContainer}>
              <Text style={styles.statusLabel}>
                {t("admin.orderManagement.fields.paymentStatus")}
              </Text>
              {isEditMode && canEditOrders ? (
                <TouchableOpacity
                  style={styles.statusPickerButton}
                  onPress={() => setShowPaymentStatusModal(true)}
                >
                  <Text style={styles.statusPickerText}>
                    {editFormData.paymentStatus
                      ? getPaymentStatusLabel(editFormData.paymentStatus)
                      : t("admin.orderManagement.selectStatus")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.paymentStatusBadge,
                    {
                      backgroundColor:
                        getPaymentStatusColor(order.paymentStatus) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentStatusBadgeText,
                      {
                        color: getPaymentStatusColor(order.paymentStatus),
                      },
                    ]}
                  >
                    {getPaymentStatusLabel(order.paymentStatus)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.statusBadgeContainerFull}>
            <Text style={styles.statusLabel}>
              {t("admin.orderManagement.preparationTime", { defaultValue: "Preparation Time" })}
            </Text>
            {isEditMode && canEditOrders ? (
              <TouchableOpacity
                style={styles.statusPickerButton}
                onPress={() => setShowPreparationTimeModal(true)}
              >
                <Text style={styles.statusPickerText}>
                  {editFormData.preparationTime
                    ? `${editFormData.preparationTime} ${t("common.time.minutes", { defaultValue: "minutes" })}`
                    : t("admin.orderManagement.selectPreparationTime", {
                        defaultValue: "Select time",
                      })}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ) : (
              <View style={styles.paymentStatusBadge}>
                <Text style={[styles.paymentStatusBadgeText, { color: "#a855f7" }]}>
                  {order.preparationTime
                    ? `${order.preparationTime} ${t("common.time.minutes", { defaultValue: "minutes" })}`
                    : "-"}
                </Text>
              </View>
            )}
          </View>

          {/* Cancellation Reason - Only for cancelled orders */}
          {order.status === "CANCELLED" && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: "#ef4444" }]}>
                {t("admin.orderManagement.cancellationReasonLabel", {
                  defaultValue: "Cancellation reason",
                })}
              </Text>
              <Text style={[styles.summaryValue, { color: "#ef4444", flex: 1, textAlign: "right" }]}>
                {order.cancellationReason ||
                  t("admin.orderManagement.cancellationReasonNotProvided", {
                    defaultValue: "Not provided",
                  })}
              </Text>
            </View>
          )}

          {/* Delivery Notes */}
          {order.deliveryNotes ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t("admin.orderManagement.deliveryNotes")}
              </Text>
              <Text style={styles.summaryValue}>{order.deliveryNotes}</Text>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {t("admin.orderManagement.fields.paymentMethod")}
            </Text>
            <Text style={styles.summaryValue}>
              {getPaymentMethodLabel(order.paymentMethod)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {t("admin.orderManagement.fields.totalAmount")}
            </Text>
            <Text style={styles.summaryTotal}>
              {formatCurrency(order.totalAmount, displayCurrency)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {t("admin.orderManagement.fields.created")}
            </Text>
            <Text style={styles.summaryValue}>
              {formatDate(order.createdAt)}
            </Text>
          </View>

          {order.isScheduledOrder && order.scheduledDate ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {order.orderType === "PICKUP"
                  ? t("admin.orderManagement.scheduled.pickupFor", {
                      defaultValue: "Pickup Scheduled For",
                    })
                  : t("admin.orderManagement.scheduled.deliveryFor", {
                      defaultValue: "Delivery Scheduled For",
                    })}
              </Text>
              <Text style={styles.summaryValue}>
                {formatDate(order.scheduledDate)}
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={styles.previewBillButton}
              onPress={() => router.push(`/(admin)/bill-preview?id=${order.id}` as any)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="receipt" size={18} color="#fff" />
              <Text style={styles.previewBillButtonText}>
                {t("admin.orderManagement.previewBillTitle", { defaultValue: "Bill Preview" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Information */}
        {(order.user || order.guestName) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("admin.orderManagement.customerInformation")}
            </Text>
            <View style={styles.infoCard}>
              {order.user ? (
                <>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="account" size={16} color="#9CA3AF" />
                    <Text style={styles.infoText}>
                      {order.user.firstName} {order.user.lastName}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons
                      name="email"
                      size={16}
                      color="#9CA3AF"
                    />
                    <Text style={styles.infoText}>{order.user.email}</Text>
                  </View>
                  {order.user.phone && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="phone" size={16} color="#9CA3AF" />
                      <Text style={styles.infoText}>{order.user.phone}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {order.guestName && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons
                        name="account"
                        size={16}
                        color="#9CA3AF"
                      />
                      <Text style={styles.infoText}>{order.guestName}</Text>
                    </View>
                  )}
                  {order.guestEmail && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons
                        name="email"
                        size={16}
                        color="#9CA3AF"
                      />
                      <Text style={styles.infoText}>{order.guestEmail}</Text>
                    </View>
                  )}
                  {order.guestPhone && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="phone" size={16} color="#9CA3AF" />
                      <Text style={styles.infoText}>{order.guestPhone}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* Pickup or Delivery Address */}
        {order.orderType === "PICKUP" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("admin.orderManagement.pickupInformation", {
                defaultValue: "Pickup Information",
              })}
            </Text>
            <View style={styles.infoCard}>
              <PickupLocationDisplay branch={order.branch || null} compact />
              {order.pickupPhone && (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="phone" size={16} color="#9CA3AF" />
                  <Text style={styles.infoText}>{order.pickupPhone}</Text>
                </View>
              )}
              {order.pickupNotes && (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="format-align-left" size={16} color="#9CA3AF" />
                  <Text style={styles.infoText}>{order.pickupNotes}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          order.deliveryAddress && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t("admin.orderManagement.deliveryAddress", {
                  defaultValue: "Delivery Address",
                })}
              </Text>
              <View style={styles.infoCard}>
                {(() => {
                  const rawStreet = (order as any)?.deliveryStreetAddress as
                    | string
                    | undefined;
                  const rawHouse = (order as any)?.deliveryHouseNumber as
                    | string
                    | undefined;
                  const postal = (order as any)?.deliveryPostalCode as
                    | string
                    | undefined;

                  const hasBuildingDetails =
                    !!(order as any)?.deliveryBuilding ||
                    !!(order as any)?.deliveryFloor ||
                    !!(order as any)?.deliveryApartment ||
                    !!(order as any)?.deliveryExtraDetails;

                  const normalized = (() => {
                    const looksLikeHouseNo = (v?: string) =>
                      !!v && /^\d+[a-zA-Z]?$/.test(v.trim());
                    const looksLikeStreet = (v?: string) =>
                      !!v && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v);
                    const s = rawStreet?.trim();
                    const h = rawHouse?.trim();
                    if (looksLikeHouseNo(s) && looksLikeStreet(h) && !looksLikeHouseNo(h)) {
                      return { street: h, house: s };
                    }
                    return { street: s, house: h };
                  })();

                  const addressValue = (() => {
                    if (normalized.street && normalized.house)
                      return `${normalized.street} ${normalized.house}`;
                    if (normalized.street) return normalized.street;
                    return order.deliveryAddress || "";
                  })();

                  return (
                    <>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          <Text style={{ color: "#9CA3AF" }}>
                            {t("admin.orderManagement.fields.address", {
                              defaultValue: "Address",
                            })}
                            {": "}
                          </Text>
                          {addressValue || "-"}
                        </Text>
                      </View>

                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="mailbox" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          <Text style={{ color: "#9CA3AF" }}>
                            {t("admin.orderManagement.fields.postalCode", {
                              defaultValue: "Postal Code",
                            })}
                            {": "}
                          </Text>
                          {postal || "-"}
                        </Text>
                      </View>

                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="home-outline" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          <Text style={{ color: "#9CA3AF" }}>
                            {t("admin.orderManagement.fields.houseNumber", {
                              defaultValue: "House number",
                            })}
                            {": "}
                          </Text>
                          {normalized.house || "-"}
                        </Text>
                      </View>

                      {hasBuildingDetails ? (
                        <>
                          {(order as any)?.deliveryBuilding ? (
                            <View style={styles.infoRow}>
                              <MaterialCommunityIcons name="office-building" size={16} color="#9CA3AF" />
                              <Text style={styles.infoText}>
                                <Text style={{ color: "#9CA3AF" }}>
                                  {t("admin.orderManagement.fields.building", {
                                    defaultValue: "Building",
                                  })}
                                  {": "}
                                </Text>
                                {(order as any).deliveryBuilding}
                              </Text>
                            </View>
                          ) : null}

                          {(order as any)?.deliveryFloor ? (
                            <View style={styles.infoRow}>
                              <MaterialCommunityIcons name="stairs" size={16} color="#9CA3AF" />
                              <Text style={styles.infoText}>
                                <Text style={{ color: "#9CA3AF" }}>
                                  {t("admin.orderManagement.fields.floor", {
                                    defaultValue: "Floor",
                                  })}
                                  {": "}
                                </Text>
                                {(order as any).deliveryFloor}
                              </Text>
                            </View>
                          ) : null}

                          {(order as any)?.deliveryApartment ? (
                            <View style={styles.infoRow}>
                              <MaterialCommunityIcons name="door" size={16} color="#9CA3AF" />
                              <Text style={styles.infoText}>
                                <Text style={{ color: "#9CA3AF" }}>
                                  {t("admin.orderManagement.fields.apartmentUnit", {
                                    defaultValue: "Apartment/Unit",
                                  })}
                                  {": "}
                                </Text>
                                {(order as any).deliveryApartment}
                              </Text>
                            </View>
                          ) : null}

                          {(order as any)?.deliveryExtraDetails ? (
                            <View style={styles.infoRow}>
                              <MaterialCommunityIcons name="note-text-outline" size={16} color="#9CA3AF" />
                              <Text style={styles.infoText}>
                                <Text style={{ color: "#9CA3AF" }}>
                                  {t("admin.orderManagement.fields.extraDetails", {
                                    defaultValue: "Extra Details",
                                  })}
                                  {": "}
                                </Text>
                                {(order as any).deliveryExtraDetails}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  );
                })()}
                {order.deliveryPhone && (
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="phone" size={16} color="#9CA3AF" />
                    <Text style={styles.infoText}>{order.deliveryPhone}</Text>
                  </View>
                )}
                {order.deliveryNotes && (
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="format-align-left" size={16} color="#9CA3AF" />
                    <Text style={styles.infoText}>{order.deliveryNotes}</Text>
                  </View>
                )}
              </View>
            </View>
          )
        )}

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("admin.orderManagement.orderItems")}
          </Text>
          {(order.orderItems as any[])
            .filter(
              (it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId
            )
            .map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                {/* Meal Image */}
                <View style={styles.mealImageContainer}>
                  {(item?.meal?.image || (item as any)?.deal?.image || (item as any)?.image) ? (
                    <Image
                      source={{
                        uri: getOptimizedImageUrl(
                          item?.meal?.image ||
                            (item as any)?.deal?.image ||
                            (item as any)?.image
                        ),
                      }}
                      style={styles.mealImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.mealImagePlaceholder}>
                      <MaterialCommunityIcons
                        name="package-variant"
                        size={24}
                        color="#6B7280"
                      />
                    </View>
                  )}
                </View>

                {/* Item Details */}
                <View style={styles.itemContent}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemName}>
                      {item?.meal?.name ||
                        (item as any)?.deal?.name ||
                        (item as any)?.name ||
                        "Item"}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.totalPrice, displayCurrency)}
                    </Text>
                  </View>

                  <View style={styles.itemMetaRow}>
                    {item.selectedSize && (
                      <View style={styles.sizeBadge}>
                        <Text style={styles.sizeBadgeText}>
                          {item.selectedSize}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.itemQuantity}>× {item.quantity}</Text>
                    <Text style={styles.itemUnitPrice}>
                      @ {formatCurrency(item.unitPrice, displayCurrency)}
                    </Text>
                  </View>

                  {item.taxAmount !== undefined && item.taxAmount > 0 && (
                    <Text style={styles.itemTax}>
                      {t("admin.orderManagement.fields.tax")}{" "}
                      {formatCurrency(item.taxAmount, displayCurrency)}
                      {item.taxPercentage && ` (${item.taxPercentage}%)`}
                    </Text>
                  )}
                </View>
              </View>

              {(() => {
                const isDealParent =
                  (item as any)?.itemType === "DEAL" ||
                  Boolean((item as any)?.dealId) ||
                  Boolean((item as any)?.deal);

                if (!isDealParent) return null;

                const childItems = (order.orderItems as any[])
                  .filter(
                    (ci: any) =>
                      ci?.itemType === "DEAL_COMPONENT" &&
                      String(ci?.parentDealItemId) === String(item.id)
                  )
                  .map((ci: any) => {
                    const name =
                      ci?.dealComponent?.name ||
                      ci?.name ||
                      ci?.meal?.name ||
                      ci?.deal?.name ||
                      "Component";
                    const qty = Number(ci?.quantity || 1);
                    const taxAmount =
                      ci?.taxAmount !== undefined && ci?.taxAmount !== null
                        ? Number(ci.taxAmount)
                        : undefined;
                    const taxPercentage =
                      ci?.taxPercentage !== undefined &&
                      ci?.taxPercentage !== null
                        ? Number(ci.taxPercentage)
                        : undefined;
                    return { name: String(name), qty, taxAmount, taxPercentage };
                  });

                if (!childItems.length) return null;

                const childTaxLines = childItems.filter(
                  (ci: any) =>
                    ci.taxAmount !== undefined && Number(ci.taxAmount || 0) > 0
                );

                return (
                  <>
                    <View style={styles.addOnsSection}>
                      <Text style={styles.addOnsSectionTitle}>
                        {t("admin.orderManagement.fields.includes", {
                          defaultValue: "Includes",
                        })}
                      </Text>
                      <View style={styles.addOnsGrid}>
                        {childItems.map((ci: any, idx: number) => (
                          <View key={`${ci.name}-${idx}`} style={styles.addOnCard}>
                            <View style={styles.addOnHeader}>
                              <Text style={styles.addOnName}>
                                {ci.name}
                              </Text>
                              {ci.qty > 1 && (
                                <View style={styles.addOnQuantityBadge}>
                                  <Text style={styles.addOnQuantityText}>
                                    ×{ci.qty}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>

                    {childTaxLines.length > 0 && (
                      <View style={styles.addOnsSection}>
                        <Text style={styles.addOnsSectionTitle}>
                          {t("admin.orderManagement.fields.taxBreakdown", {
                            defaultValue: "Tax Breakdown",
                          })}
                        </Text>
                        <View style={styles.addOnsGrid}>
                          {childTaxLines.map((ci: any, idx: number) => (
                            <View
                              key={`${ci.name}-tax-${idx}`}
                              style={styles.addOnCard}
                            >
                              <View style={styles.addOnHeader}>
                                <Text style={styles.addOnName}>
                                  {ci.name}
                                  {ci.qty > 1 ? ` ×${ci.qty}` : ""}
                                  {ci.taxPercentage !== undefined
                                    ? ` (${ci.taxPercentage}%)`
                                    : ""}
                                </Text>
                              </View>
                              <Text style={styles.addOnPrice}>
                                {formatCurrency(
                                  Number(ci.taxAmount || 0),
                                  displayCurrency
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                );
              })()}

              {/* Add-ons */}
              {item.orderItemAddOns.length > 0 && (
                <View style={styles.addOnsSection}>
                  <Text style={styles.addOnsSectionTitle}>
                    {t("admin.orderManagement.fields.addons")}
                  </Text>
                  <View style={styles.addOnsGrid}>
                    {item.orderItemAddOns.map((addon: any) => (
                      <View key={addon.id} style={styles.addOnCard}>
                        <View style={styles.addOnHeader}>
                          <Text style={styles.addOnName}>
                            {addon.addOnName}
                          </Text>
                          {addon.quantity && addon.quantity > 1 && (
                            <View style={styles.addOnQuantityBadge}>
                              <Text style={styles.addOnQuantityText}>
                                ×{addon.quantity}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.addOnPrice}>
                          {formatCurrency(
                            addon.addOnPrice * (addon.quantity || 1),
                            displayCurrency
                          )}
                        </Text>
                        {addon.taxAmount !== undefined &&
                          addon.taxAmount > 0 && (
                            <Text style={styles.addOnTax}>
                              +{" "}
                              {formatCurrency(addon.taxAmount, displayCurrency)}{" "}
                              {t("admin.orderManagement.tax")}
                            </Text>
                          )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Special Instructions */}
              {item.specialInstructions && (
                <View style={styles.specialInstructionsCard}>
                  <Text style={styles.specialInstructionsLabel}>
                    {t("admin.orderManagement.fields.specialInstructions")}
                  </Text>
                  <Text style={styles.specialInstructionsText}>
                    {item.specialInstructions}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("admin.orderManagement.orderSummary")}
          </Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t("admin.orderManagement.orderType")}
              </Text>
              <View
                style={[
                  styles.orderTypeBadge,
                  order.orderType === "PICKUP"
                    ? styles.orderTypePickup
                    : styles.orderTypeDelivery,
                ]}
              >
                <Text
                  style={[
                    styles.orderTypeBadgeText,
                    order.orderType === "PICKUP"
                      ? styles.orderTypePickupText
                      : styles.orderTypeDeliveryText,
                  ]}
                >
                  {order.orderType === "PICKUP"
                    ? t("admin.orderManagement.orderTypes.pickup")
                    : t("admin.orderManagement.orderTypes.delivery")}
                </Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t("admin.orderManagement.subtotal")}
              </Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(
                  order.totalAmount - order.deliveryFee - order.taxAmount,
                  displayCurrency
                )}
              </Text>
            </View>
            {order.orderType === "DELIVERY" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t("admin.orderManagement.fields.deliveryFee")}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(order.deliveryFee, displayCurrency)}
                </Text>
              </View>
            )}
            {order.orderType === "PICKUP" &&
              Number((order as any).takeawayServiceFee || 0) > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t("admin.orderManagement.fields.takeawayServiceFee", {
                      defaultValue: "Takeaway service fee",
                    })}
                  </Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(
                      Number((order as any).takeawayServiceFee || 0),
                      displayCurrency
                    )}
                  </Text>
                </View>
              )}
            {order.orderType === "PICKUP" &&
              Number((order as any).takeawayServiceTaxAmount || 0) > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t("admin.orderManagement.fields.takeawayServiceTax", {
                      defaultValue: "Takeaway service tax",
                    })}
                  </Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(
                      Number((order as any).takeawayServiceTaxAmount || 0),
                      displayCurrency
                    )}
                  </Text>
                </View>
              )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {t("admin.orderManagement.fields.tax")}
              </Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(order.taxAmount, displayCurrency)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryTotalLabel}>
                {t("admin.orderManagement.total")}
              </Text>
              <Text style={styles.summaryTotalValue}>
                {formatCurrency(order.totalAmount, displayCurrency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Delivery Notes */}
        {order.deliveryNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("admin.orderManagement.deliveryNotes")}
            </Text>
            <View style={styles.infoCard}>
              <Text style={styles.deliveryNotes}>{order.deliveryNotes}</Text>
            </View>
          </View>
        )}

        {/* Refund History */}
        {(loadingRefunds ||
          orderRefunds.length > 0 ||
          order.paymentStatus === "PARTIALLY_REFUNDED" ||
          order.paymentStatus === "REFUNDED") && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("admin.orderManagement.refundHistory")}
            </Text>
            {loadingRefunds ? (
              <View style={styles.refundLoadingContainer}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : (
              <>
                {/* Refund Summary */}
                <View style={styles.refundSummaryCard}>
                  <View>
                    <Text style={styles.refundSummaryLabel}>
                      {t("admin.orderManagement.totalOrderAmount")}
                    </Text>
                    <Text style={styles.refundSummaryAmount}>
                      {formatCurrency(order.totalAmount, displayCurrency)}
                    </Text>
                  </View>
                  <View style={styles.refundSummaryRight}>
                    <Text style={styles.refundSummaryLabel}>
                      {t("admin.orderManagement.totalRefunded")}
                    </Text>
                    <Text style={styles.refundSummaryRefunded}>
                      {formatCurrency(
                        orderRefunds.reduce(
                          (sum, refund) => sum + refund.amount,
                          0
                        ),
                        displayCurrency
                      )}
                    </Text>
                    <Text style={styles.refundSummaryStatus}>
                      {t("admin.orderManagement.fields.status")}{" "}
                      {getPaymentStatusLabel(order.paymentStatus)}
                    </Text>
                  </View>
                </View>

                {/* Individual Refunds */}
                {orderRefunds.length > 0 ? (
                  <View style={styles.refundsList}>
                    {orderRefunds.map((refund, index) => {
                      const statusInfo = refundService.formatRefundStatus(
                        refund.status
                      );
                      return (
                        <View key={refund.id} style={styles.refundCard}>
                          <View style={styles.refundCardLeft}>
                            <Text style={styles.refundCardTitle}>
                              {t("admin.orderManagement.refund")} #{index + 1} -{" "}
                              {refundService.formatRefundType(
                                refund.refundType
                              )}
                            </Text>
                            <Text style={styles.refundCardDate}>
                              {new Date(refund.createdAt).toLocaleString()}
                            </Text>
                            {refund.reason && (
                              <Text style={styles.refundCardReason}>
                                {t("admin.orderManagement.reason")}:{" "}
                                {refund.reason}
                              </Text>
                            )}
                            {(refund.stripeRefundId ||
                              refund.paypalRefundId) && (
                              <Text style={styles.refundCardReason}>
                                {refund.stripeRefundId
                                  ? `Stripe ID: ${refund.stripeRefundId} `
                                  : ""}
                                {refund.paypalRefundId
                                  ? `PayPal ID: ${refund.paypalRefundId}`
                                  : ""}
                              </Text>
                            )}
                          </View>
                          <View style={styles.refundCardRight}>
                            <Text
                              style={[
                                styles.refundCardAmount,
                                { color: statusInfo.color },
                              ]}
                            >
                              {formatCurrency(refund.amount, displayCurrency)}
                            </Text>
                            <Text
                              style={[
                                styles.refundCardStatus,
                                { color: statusInfo.color },
                              ]}
                            >
                              {statusInfo.text}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.refundEmptyText}>
                    {t("admin.orderManagement.noRefundDetails")}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Process Refund Button */}
        {(order.paymentStatus === "PAID" ||
          order.paymentStatus === "PARTIALLY_REFUNDED") &&
          order.status !== "CANCELLED" && (
          canRefundOrders ? (
            <TouchableOpacity
              style={[
                styles.processRefundButton,
                isClosedOrder(order) && !order.isScheduledOrder && styles.processRefundButtonDisabled,
              ]}
              onPress={() => {
                if (isClosedOrder(order) && !order.isScheduledOrder) return;
                setRefundFormData({
                  refundType: "FULL",
                  items: [],
                  reason: "",
                });
                setShowRefundModal(true);
              }}
              disabled={isClosedOrder(order) && !order.isScheduledOrder}
            >
              <MaterialCommunityIcons name="currency-usd" size={18} color="#fff" />
              <Text style={styles.processRefundButtonText}>
                {t("admin.orderManagement.processRefund")}
              </Text>
            </TouchableOpacity>
          ) : null
        )}
      </ScrollView>

      {/* Refund Modal */}
      <Modal
        visible={showRefundModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRefundModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowRefundModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.orderManagement.processRefundTitle")}
              </Text>
              <TouchableOpacity onPress={() => setShowRefundModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {order && (
                <>
                  {/* Refund Type Selection */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>
                      {t("admin.orderManagement.refundType")}
                    </Text>
                    <View style={styles.refundTypeOptions}>
                      {(
                        ["FULL", "PARTIAL", "ITEM_SPECIFIC"] as RefundType[]
                      ).map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.refundTypeButton,
                            refundFormData.refundType === type &&
                              styles.refundTypeButtonActive,
                          ]}
                          onPress={() =>
                            setRefundFormData({
                              ...refundFormData,
                              refundType: type,
                            })
                          }
                        >
                          <Text
                            style={[
                              styles.refundTypeButtonText,
                              refundFormData.refundType === type &&
                                styles.refundTypeButtonTextActive,
                            ]}
                          >
                            {getRefundTypeLabel(type)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Partial Refund Amount */}
                  {refundFormData.refundType === "PARTIAL" && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>
                        {t("admin.orderManagement.refundAmount")}
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={t(
                          "admin.orderManagement.refundAmountPlaceholder"
                        )}
                        placeholderTextColor="#6B7280"
                        keyboardType="numeric"
                        value={refundFormData.amount?.toString() || ""}
                        onChangeText={(text) =>
                          setRefundFormData({
                            ...refundFormData,
                            amount: parseFloat(text) || 0,
                          })
                        }
                      />
                      <Text style={styles.inputHint}>
                        {t("admin.orderManagement.max")}:{" "}
                        {formatCurrency(order.totalAmount, displayCurrency)}
                      </Text>
                    </View>
                  )}

                  {/* Item-Specific Refund */}
                  {refundFormData.refundType === "ITEM_SPECIFIC" && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>
                        {t("admin.orderManagement.selectItemsToRefund")}
                      </Text>
                      <View style={styles.refundItemsList}>
                        {order.orderItems.map((item) => {
                          const isSelected = refundFormData.items.some(
                            (refundItem) => refundItem.orderItemId === item.id
                          );
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.refundItemCard,
                                isSelected && styles.refundItemCardSelected,
                              ]}
                              onPress={() =>
                                handleItemRefundToggle(item.id, !isSelected)
                              }
                            >
                              <View style={styles.refundItemInfo}>
                                <Text style={styles.refundItemName}>
                                  {item.meal.name}
                                </Text>
                                <Text style={styles.refundItemPrice}>
                                  {formatCurrency(
                                    item.totalPrice,
                                    displayCurrency
                                  )}
                                </Text>
                              </View>
                              {isSelected && (
                                <MaterialCommunityIcons
                                  name="check-circle"
                                  size={20}
                                  color="#ec4899"
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Refund Reason */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>
                      {t("admin.orderManagement.reasonForRefund")}
                    </Text>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      numberOfLines={3}
                      placeholder={t(
                        "admin.orderManagement.refundReasonPlaceholder"
                      )}
                      placeholderTextColor="#6B7280"
                      value={refundFormData.reason || ""}
                      onChangeText={(text) =>
                        setRefundFormData({ ...refundFormData, reason: text })
                      }
                    />
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.refundCancelButton}
                onPress={() => setShowRefundModal(false)}
              >
                <Text style={styles.refundCancelButtonText}>
                  {t("admin.orderManagement.deleteOrderCancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.refundProcessButton}
                onPress={handleProcessRefund}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="currency-usd"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.refundProcessButtonText}>
                      {t("admin.orderManagement.process")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Preparation Time Bottom Sheet Modal */}
      <Modal
        visible={showPreparationTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPreparationTimeModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPreparationTimeModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.preparationTime", {
                  defaultValue: "Preparation Time",
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowPreparationTimeModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {[30, 45, 60].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.bottomSheetOption,
                    editFormData.preparationTime === mins && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setEditFormData({
                      ...editFormData,
                      preparationTime: mins,
                    });
                    setShowPreparationTimeModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      editFormData.preparationTime === mins &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {mins} {t("common.time.minutes", { defaultValue: "minutes" })}
                  </Text>
                  {editFormData.preparationTime === mins && (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Order Status Bottom Sheet Modal */}
      <Modal
        visible={showOrderStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderStatusModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderStatusModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectOrderStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowOrderStatusModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody} showsVerticalScrollIndicator={false}>
              {getAllowedStatusOptions(order?.orderType || "DELIVERY").map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.bottomSheetOption,
                  ]}
                  onPress={() => {
                    const nextStatus = status as Order["status"];
                    const shouldAutoMarkPaid = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
                    const currentPaymentStatus =
                      (editFormData.paymentStatus || order?.paymentStatus) as Order["paymentStatus"] | undefined;
                    const isRefundedState =
                      currentPaymentStatus === "REFUNDED" || currentPaymentStatus === "PARTIALLY_REFUNDED";

                    setEditFormData({
                      ...editFormData,
                      status: nextStatus,
                      ...(shouldAutoMarkPaid && !isRefundedState ? { paymentStatus: "PAID" } : {}),
                    });
                    setShowOrderStatusModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      editFormData.status === status &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getStatusLabel(status as Order["status"])}
                  </Text>
                  {editFormData.status === status && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment Status Bottom Sheet Modal */}
      <Modal
        visible={showPaymentStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentStatusModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentStatusModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectPaymentStatus")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowPaymentStatusModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {[
                "PENDING",
                "PAID",
                "FAILED",
                "REFUNDED",
                "PARTIALLY_REFUNDED",
              ].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.bottomSheetOption,
                    editFormData.paymentStatus === status &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setEditFormData({
                      ...editFormData,
                      paymentStatus: status as Order["paymentStatus"],
                    });
                    setShowPaymentStatusModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      editFormData.paymentStatus === status &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getPaymentStatusLabel(status as Order["paymentStatus"])}
                  </Text>
                  {editFormData.paymentStatus === status && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancellation Reason Modal */}
      <Modal
        visible={showCancelReasonModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelReasonModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowCancelReasonModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.orderManagement.cancellationReason", {
                  defaultValue: "Cancellation Reason",
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowCancelReasonModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                {t("admin.orderManagement.cancellationReasonLabel", {
                  defaultValue: "Please provide a reason for cancelling this order",
                })}
              </Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                placeholder={t("admin.orderManagement.cancellationReasonPlaceholder", {
                  defaultValue: "Enter cancellation reason...",
                })}
                placeholderTextColor="#6B7280"
                value={cancelReasonInput}
                onChangeText={setCancelReasonInput}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.refundCancelButton}
                onPress={() => setShowCancelReasonModal(false)}
              >
                <Text style={styles.refundCancelButtonText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelConfirmButton}
                onPress={handleConfirmCancelAndSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.cancelConfirmButtonText}>
                    {t("admin.orderManagement.confirmCancel", {
                      defaultValue: "Cancel Order",
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    paddingTop: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  headerRight: {
    width: 40,
  },
  editButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  backButtonStyle: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#ec4899",
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  summaryHeader: {
    marginBottom: 16,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  mergedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(168, 85, 247, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.35)",
  },
  mergedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#a855f7",
  },
  statusRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  statusBadgeContainer: {
    flex: 1,
    minWidth: "45%",
    gap: 6,
  },
  statusBadgeContainerFull: {
    width: "100%",
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: "#262626",
    paddingTop: 12,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  summaryTotal: {
    fontSize: 18,
    color: "#ec4899",
    fontWeight: "700",
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  paymentStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paymentStatusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  itemHeader: {
    flexDirection: "row",
    gap: 12,
  },
  mealImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#262626",
  },
  mealImage: {
    width: "100%",
    height: "100%",
  },
  mealImagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  sizeBadgeText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  itemQuantity: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  itemUnitPrice: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemTax: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  addOnsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  addOnsSectionTitle: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  addOnsGrid: {
    gap: 10,
  },
  addOnCard: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#404040",
  },
  addOnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  addOnName: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  addOnQuantityBadge: {
    backgroundColor: "#404040",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addOnQuantityText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "600",
  },
  addOnPrice: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  addOnTax: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  specialInstructionsCard: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    marginTop: 12,
  },
  specialInstructionsLabel: {
    fontSize: 12,
    color: "#fbbf24",
    fontWeight: "600",
    marginBottom: 4,
  },
  specialInstructionsText: {
    fontSize: 13,
    color: "#fbbf24",
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#D1D5DB",
    flex: 1,
  },
  orderTypeBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  orderTypeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  orderTypePickup: {
    backgroundColor: "#ec489922",
    borderColor: "#ec4899",
  },
  orderTypeDelivery: {
    backgroundColor: "#0ea5e922",
    borderColor: "#0ea5e9",
  },
  orderTypePickupText: {
    color: "#ec4899",
  },
  orderTypeDeliveryText: {
    color: "#0ea5e9",
  },
  deliveryNotes: {
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
  },
  previewBillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: "100%",
  },
  previewBillButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  refundSummaryCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  refundSummaryRight: {
    alignItems: "flex-end",
  },
  refundSummaryLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  refundSummaryAmount: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  refundSummaryRefunded: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "600",
    marginBottom: 4,
  },
  refundSummaryStatus: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  refundsList: {
    gap: 12,
  },
  refundCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#404040",
  },
  refundCardLeft: {
    flex: 1,
    gap: 4,
  },
  refundCardRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  refundCardTitle: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  refundCardDate: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  refundCardReason: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  refundCardAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  refundCardStatus: {
    fontSize: 11,
    fontWeight: "500",
  },
  refundLoadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  refundEmptyText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    padding: 20,
  },
  processRefundButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  processRefundButtonDisabled: {
    opacity: 0.6,
  },
  processRefundButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalContainer: {
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
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  refundTypeOptions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  refundTypeButton: {
    flex: 1,
    minWidth: "30%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    alignItems: "center",
  },
  refundTypeButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  refundTypeButtonText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  refundTypeButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    marginBottom: 12,
    minHeight: 50,
  },
  inputHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 6,
  },
  refundItemsList: {
    gap: 8,
  },
  refundItemCard: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#404040",
  },
  refundItemCardSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  refundItemInfo: {
    flex: 1,
  },
  refundItemName: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
    marginBottom: 4,
  },
  refundItemPrice: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  refundModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    paddingBottom: 20,
  },
  refundCancelButton: {
    flex: 1,
    backgroundColor: "#262626",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  refundCancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  refundProcessButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 14,
  },
  refundProcessButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  textArea: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  statusPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#404040",
    marginTop: 8,
  },
  statusPickerText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  cancelConfirmButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelConfirmButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
