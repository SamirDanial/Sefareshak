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
import { usePosDevice } from "@/src/contexts/PosDeviceContext";
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
import { printerService } from "@/src/services/printerService";
import { buildEscPosBytes } from "@/src/utils/receiptBuilder";
import LocalDbService from "@/src/services/localDbService";
import QRCode from "react-native-qrcode-svg";
import { voucherService } from "@/src/services/voucherService";

const getRemainingPrepMs = (o: Order | null, nowMs: number): number | null => {
  if (!o) return null;
  const prepMin = o.preparationTime != null ? Number(o.preparationTime) : NaN;
  if (!Number.isFinite(prepMin) || prepMin <= 0) return null;
  if (o.status === "DELIVERED" || o.status === "PICKED_UP") return null;
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

const parseVoucherInstructions = (instructions: string | null) => {
  if (!instructions) return null;
  const codeMatch = instructions.match(/CODE:\s*(GUT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
  const typeMatch = instructions.match(/TYPE:\s*([A-Z_]+)/i);
  const expiresMatch = instructions.match(/EXPIRES:\s*([\d.]+)/i);
  const vatMatch = instructions.match(/VAT:\s*(\d+)/i);

  if (codeMatch) {
    return {
      code: codeMatch[1],
      type: typeMatch ? typeMatch[1] : "SINGLE_PURPOSE",
      expires: expiresMatch ? expiresMatch[1] : "",
      vatRate: vatMatch ? Number(vatMatch[1]) : undefined,
    };
  }
  return null;
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
  const { selectedDevice } = usePosDevice();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const refundsLoadedForOrderId = useRef<string | null>(null);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [settings, setSettings] = useState<any | null>(null);
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showVouchersListModal, setShowVouchersListModal] = useState(false);
  const [voucherModalSource, setVoucherModalSource] = useState<"vouchers_list" | "order_item" | null>(null);
  const [loadingVoucherDetails, setLoadingVoucherDetails] = useState(false);
  const [activeVoucherDetails, setActiveVoucherModalDetails] = useState<{
    code: string;
    type: string;
    expires: string;
    amount: number;
    currentAmount?: number;
    vatRate?: number | null;
  } | null>(null);

  const printVoucherFromHistory = async (voucherCode: string, amount: number, type: string, expires: string, remainingBalance?: number, vatRate?: number | null) => {
    try {
      if (!printerService.isAvailable()) {
        Alert.alert("Error", "Bluetooth printing is not available in this build.");
        return;
      }

      const busName = branchDetails?.name || order?.branch?.name || "Bellami Store";
      const typeText = type === "SINGLE_PURPOSE" ? "SINGLE-PURPOSE VOUCHER" : "MULTI-PURPOSE VOUCHER";
      const taxText = type === "SINGLE_PURPOSE" ? "Tax was immediately charged" : "Tax charged upon redemption";
      const moneyText = formatCurrency(amount, order?.currency || "USD");
      const balanceText = remainingBalance !== undefined ? formatCurrency(remainingBalance, order?.currency || "USD") : null;

      const receiptLines = [
        "================================",
        `         ${busName.toUpperCase()}`,
        "      Tax Voucher Receipt",
        "================================\n",
        "VOUCHER TYPE:",
        typeText,
        `(${taxText})\n`,
        "VOUCHER VALUE:",
        moneyText,
      ];

      // Show VAT rate for single-purpose vouchers
      if (type === "SINGLE_PURPOSE" && vatRate !== undefined && vatRate !== null) {
        receiptLines.push(
          "",
          `VAT RATE: ${vatRate}%`
        );
      }

      receiptLines.push(
        "",
        "VOUCHER CODE:",
        voucherCode
      );

      if (balanceText) {
        receiptLines.push(
          "",
          t("admin.pos.remainingAmountUpper", { defaultValue: "REMAINING AMOUNT" }) + ":",
          balanceText
        );
      }

      receiptLines.push(
        "\n================================",
        `Valid until:         ${expires}\n`,
        "__QR__\n\n\n\n\n"
      );

      const receiptLinesJoined: string = receiptLines.join("\n");
      const bytes = buildEscPosBytes(receiptLinesJoined, { qrData: voucherCode, printWidthChars: 32 });

      let addr = await printerService.getLastPrinterAddress();
      if (!addr) {
        const paired = await printerService.listPairedPrinters();
        if (!paired || paired.length === 0) {
          Alert.alert("No Printers Found", "Please pair a Bluetooth thermal printer in your device settings first.");
          return;
        }

        if (paired.length === 1) {
          addr = paired[0].address || paired[0].id;
          await printerService.setLastPrinterAddress(addr);
        } else {
          const buttons = paired.slice(0, 2).map((p) => ({
            text: p.name || p.address || p.id,
            onPress: async () => {
              const selectedAddr = p.address || p.id;
              await printerService.setLastPrinterAddress(selectedAddr);
              try {
                await printerService.printBytes(selectedAddr, bytes);
                Alert.alert("Printed", "Voucher receipt successfully printed!");
              } catch (err: any) {
                Alert.alert("Print failed", err?.message || "Failed to print");
              }
            }
          }));
          buttons.push({ text: "Cancel", onPress: () => {}, style: "cancel" } as any);
          Alert.alert(
            "Select Printer",
            "Please select a Bluetooth thermal printer to print the voucher:",
            buttons as any
          );
          return;
        }
      }

      if (addr) {
        await printerService.printBytes(addr, bytes);
        Alert.alert("Printed", "Voucher receipt successfully printed!");
      }
    } catch (err: any) {
      Alert.alert("Print failed", err?.message || "Failed to print");
    }
  };
  const [loading, setLoading] = useState(true);
  const [fiskalyStatus, setFiskalyStatus] = useState<string | null>(null);
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
  const [showDeviceDeactivatedDialog, setShowDeviceDeactivatedDialog] = useState(false);
  const [refundReasonError, setRefundReasonError] = useState(false);
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

  const fiskalyEnabled = Boolean((settings as any)?.fiskalyEnabled);
  const orderBranchIdForPosDevice = String(
    (order as any)?.branchId || (order as any)?.branch?.id || ""
  ).trim();
  const selectedDeviceBranchId = String((selectedDevice as any)?.branchId || "").trim();
  const posDeviceRequiredButMissing = Boolean(
    fiskalyEnabled &&
      (!selectedDevice ||
        (orderBranchIdForPosDevice &&
          selectedDeviceBranchId &&
          selectedDeviceBranchId !== orderBranchIdForPosDevice))
  );

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
      } finally {
        if (cancelled) return;
        setLoading(false);
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

        // First try to load from local cache (for offline orders)
        try {
          const localDb = LocalDbService.getInstance();
          const cachedBranch = await localDb.getBranchById(branchId);
          if (cachedBranch && !cancelled) {
            setBranchDetails(cachedBranch as any);
            return;
          }
        } catch (localError) {
          console.warn("[OrderDetails] Failed to load branch from local cache:", localError);
        }

        // Fall back to API call
        const token = await getToken();
        if (!token) return;
        const list = await branchService.getBranches(token);
        if (cancelled) return;
        const found = Array.isArray(list)
          ? (list as any[]).find((b) => String((b as any)?.id) === branchId)
          : null;
        setBranchDetails((found as any) ?? null);
      } catch (error) {
        console.error('[OrderDetails] Error loading branch details:', error);
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

  // Use branch-specific tax settings when available, otherwise fall back to order or settings
  const effectiveTaxInclusive = useMemo(() => {
    const branchTax = branchDetails?.taxInclusive;
    const orderTax = (order as any)?.taxInclusive;
    const settingsTax = (settings as any)?.taxInclusive;
    
    if (branchTax !== null && branchTax !== undefined) {
      return branchTax;
    }
    return orderTax ?? settingsTax ?? false;
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
    const translated = t(statusKey);
    return translated !== statusKey
      ? translated
      : status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPaymentStatusLabel = (status: Order["paymentStatus"]): string => {
    const statusKey = `admin.orderManagement.paymentStatuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey);
    return translated !== statusKey
      ? translated
      : status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPaymentMethodLabel = (
    method: Order["paymentMethod"],
    orderType?: Order["orderType"]
  ): string => {
    // Use context-aware key for cash on delivery/pickup
    if (method === "CASH_ON_DELIVERY" && orderType) {
      const contextKey =
        orderType === "PICKUP"
          ? "admin.orderManagement.paymentMethods.cashonpickup"
          : "admin.orderManagement.paymentMethods.cashondelivery";
      const translated = t(contextKey);
      if (translated !== contextKey) return translated;
    }
    const methodKey = `admin.orderManagement.paymentMethods.${method
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(methodKey);
    return translated !== methodKey ? translated : method;
  };

  const getRefundTypeLabel = (type: RefundType): string => {
    const typeKey = `admin.orderManagement.refundTypes.${type
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(typeKey);
    return translated !== typeKey ? translated : type;
  };

  const isClosedOrder = (o: Order) => (o as any)?.businessDaySession?.status === "CLOSED";

  const hasFullRefund = () =>
    orderRefunds.some(
      (refund) => refund.refundType === "FULL" && refund.status === "SUCCEEDED"
    );

  const refundedQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of orderRefunds) {
      if (r.refundType === "ITEM_SPECIFIC" && r.status === "SUCCEEDED" && r.items) {
        for (const it of r.items) {
          map.set(it.orderItemId, (map.get(it.orderItemId) ?? 0) + (it.refundedQuantity ?? 1));
        }
      }
    }
    return map;
  }, [orderRefunds]);

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

  // Prevent editing fully refunded orders - redirect to view mode if order has full refund
  useEffect(() => {
    if (order && isEditMode && hasFullRefund()) {
      router.replace(`/(admin)/order-details?id=${orderId}` as any);
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.orderRefundedReadOnly", {
          defaultValue: "Refunded orders cannot be edited",
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
        console.warn("Order Details: WebSocket setup warning:", error);
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

  const loadOrderDetails = async ({ exitOnError = true }: { exitOnError?: boolean } = {}) => {
    let mounted = true;

    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        let orderData: Order | null = null;
        let isOfflineFallbacked = false;

        try {
          orderData = await orderService.getOrderById(
            orderId,
            token || undefined
          );
        } catch (fetchError) {
          console.warn('[OrderDetails] Failed to fetch order from backend, checking offline storage:', fetchError);
          try {
            const localDb = LocalDbService.getInstance();
            const unsynced = await localDb.getUnsyncedOrders();
            const match = unsynced.find((x) => x.id === orderId);
            if (match) {
              const baseInput = JSON.parse(match.cartData);
              const tb = baseInput.taxBreakdown || {};
              isOfflineFallbacked = true;
              
              orderData = {
                id: match.id,
                branchId: match.branchId,
                orderNumber: `OFFLINE-${match.offlineSequenceNumber}-${match.id.slice(-6).toUpperCase()}`,
                createdAt: match.createdAt,
                updatedAt: match.createdAt,
                totalAmount: match.amount,
                currency: tb.currency || "EUR",
                deliveryFee: tb.deliveryTaxAmount || 0,
                taxAmount: tb.totalTaxAmount || 0,
                taxInclusive: tb.taxInclusive || false,
                takeawayServiceFee: tb.takeawayServiceFee || 0,
                takeawayServiceTaxAmount: tb.takeawayServiceTaxAmount || 0,
                discountAmount: baseInput.discountAmount || 0,
                paymentMethod: match.paymentMethod === "CARD" ? "CARD_ON_DELIVERY" : "CASH_ON_DELIVERY",
                paymentStatus: match.paymentStatus === "PAID" ? "PAID" : "PENDING",
                orderType: "PICKUP",
                status: match.paymentStatus === "PAID" ? "PICKED_UP" : "PENDING",
                orderItems: baseInput.cartItems.map((item: any) => ({
                  id: item.id,
                  orderId: match.id,
                  mealId: item.mealId || item.id,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  totalPrice: item.price * item.quantity,
                  specialInstructions: item.specialInstructions,
                  createdAt: match.createdAt,
                  updatedAt: match.createdAt,
                  meal: {
                    id: item.mealId || item.id,
                    name: item.name,
                    basePrice: item.price,
                  },
                  orderItemAddOns: (item.addOns || []).map((ao: any) => ({
                    id: ao.id,
                    addOnName: ao.name,
                    addOnPrice: ao.price || 0,
                    quantity: ao.quantity || 1,
                  }))
                })),
              } as any;
            }
          } catch (localDbError) {
            console.error('[OrderDetails] Offline fallback failed:', localDbError);
          }

          if (!orderData) {
            throw fetchError;
          }
        }

        setOrder(orderData);

        // Fetch fiscal data (best effort) so edit dialog can show retry action on failure
        if (!isOfflineFallbacked) {
          try {
            const payload = await orderService.getOrderReceiptPayload(orderId, token || undefined);
            const nextStatus = String((payload as any)?.fiskaly?.status || "").trim();
            if (mounted) setFiskalyStatus(nextStatus || null);
          } catch {
            if (mounted) setFiskalyStatus(null);
          }
        } else {
          if (mounted) setFiskalyStatus("TSS_OUTAGE");
        }

        // Best-effort load refunds (web shows refund history when present; this keeps mobile in sync)
        // We avoid refetching repeatedly for the same order.
        if (orderData && refundsLoadedForOrderId.current !== orderData.id && !isOfflineFallbacked) {
          try {
            await loadOrderRefunds(orderData.id);
            refundsLoadedForOrderId.current = orderData.id;
          } catch (e) {
            // keep silent; refund history will be hidden if we couldn't fetch
          }
        }
      } catch (error) {
        console.error("Error loading order details:", error);
        if (exitOnError) {
          Alert.alert("Error", t("admin.orderManagement.loadOrderDetailsError"));
          router.back();
        }
      } finally {
        setLoading(false);
      }
    };

    try {
      await fetchOrderDetails();
    } finally {
      mounted = false;
    }
  };

  const refreshFiskalyStatus = async () => {
    try {
      const token = await getToken();
      const payload = await orderService.getOrderReceiptPayload(orderId, token || undefined);
      const nextStatus = String((payload as any)?.fiskaly?.status || "").trim();
      setFiskalyStatus(nextStatus || null);
    } catch {
      setFiskalyStatus(null);
    }
  };

  const handleRetryFiskaly = async () => {
    if (!order) return;

    try {
      setIsActionLoading(true);
      const token = await getToken();
      await orderService.updateOrder(
        order.id,
        {
          status: order.status,
          paymentStatus: order.paymentStatus,
        },
        token || undefined
      );

      await refreshFiskalyStatus();

      setToast({
        visible: true,
        message: t("admin.orderManagement.fiskalyRetrySuccess"),
        type: "success",
      });
    } catch (error: any) {
      const serverMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        undefined;
      setToast({
        visible: true,
        message:
          serverMessage ||
          t("admin.orderManagement.fiskalyRetryError"),
        type: "error",
      });
    } finally {
      setIsActionLoading(false);
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

    // Validate that order is paid before allowing refund
    if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED") {
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.refundRequiresPaidStatus", {
          defaultValue: "Order must be paid before it can be refunded.",
        }),
        type: "error",
      });
      return;
    }

    if (!refundFormData.reason?.trim()) {
      setRefundReasonError(true);
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

      const refundResponse = await refundService.createRefund(refundRequest, token || undefined);
      setShowRefundModal(false);
      // Reset cache so loadOrderDetails will re-fetch refunds
      refundsLoadedForOrderId.current = null;
      // Reload order to get updated payment status + fresh refund list
      await loadOrderDetails({ exitOnError: false });
      // Show success (after reload so UI is already updated)
      setToast({
        visible: true,
        message: t("admin.orderManagement.refundProcessedSuccess"),
        type: "success",
      });
      // Surface Fiskaly correction error as non-blocking warning
      const fiskalyCorrection = (refundResponse as any)?.data?.fiskalyCorrection;
      if (fiskalyCorrection && fiskalyCorrection.ok === false) {
        setTimeout(() => {
          setToast({
            visible: true,
            message: `Refund saved, but fiscal correction failed: ${fiskalyCorrection.error || "Unknown error"}`,
            type: "error",
          });
        }, 3000);
      }
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
        // Use totalPrice (post-item-discount) and apply order-level discount ratio
        const totalItemPrice = parseFloat((orderItem as any).totalPrice.toString());
        const totalQuantity = orderItem.quantity;
        const effectiveUnitPrice = totalItemPrice / totalQuantity;

        const orderDiscountAmount = parseFloat((order as any).discountAmount?.toString() || "0");
        const orderSubtotal = (order.orderItems as any[]).reduce(
          (s: number, oi: any) => s + parseFloat(oi.totalPrice.toString()), 0
        );
        const discountRatio = orderSubtotal > 0 ? orderDiscountAmount / orderSubtotal : 0;
        const discountedUnitPrice = effectiveUnitPrice * (1 - discountRatio);

        const alreadyRefunded = refundedQtyByItemId.get(orderItemId) ?? 0;
        const remainingQty = totalQuantity - alreadyRefunded;
        const totalRefundAmount = discountedUnitPrice * remainingQty;

        setRefundFormData({
          ...refundFormData,
          items: [
            ...refundFormData.items,
            {
              orderItemId,
              refundAmount: totalRefundAmount,
              refundedQuantity: remainingQty,
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

  const handleItemRefundQuantityChange = (orderItemId: string, delta: number) => {
    if (!order) return;

    const orderItem = order.orderItems.find(
      (item) => item.id === orderItemId
    );
    if (!orderItem) return;

    const currentRefundItem = refundFormData.items.find(
      (item) => item.orderItemId === orderItemId
    );
    if (!currentRefundItem) return;

    const alreadyRefunded = refundedQtyByItemId.get(orderItemId) ?? 0;
    const remainingQty = orderItem.quantity - alreadyRefunded;
    const currentQuantity = currentRefundItem.refundedQuantity ?? remainingQty;
    const newQuantity = currentQuantity + delta;

    if (newQuantity < 1 || newQuantity > remainingQty) return;

    // Use totalPrice (post-item-discount) and apply order-level discount ratio
    const totalItemPrice = parseFloat((orderItem as any).totalPrice.toString());
    const totalQuantity = orderItem.quantity;
    const effectiveUnitPrice = totalItemPrice / totalQuantity;

    const orderDiscountAmount = parseFloat((order as any).discountAmount?.toString() || "0");
    const orderSubtotal = (order.orderItems as any[]).reduce(
      (s: number, oi: any) => s + parseFloat(oi.totalPrice.toString()), 0
    );
    const discountRatio = orderSubtotal > 0 ? orderDiscountAmount / orderSubtotal : 0;
    const discountedUnitPrice = effectiveUnitPrice * (1 - discountRatio);

    const newRefundAmount = discountedUnitPrice * newQuantity;

    setRefundFormData({
      ...refundFormData,
      items: refundFormData.items.map((item) =>
        item.orderItemId === orderItemId
          ? { ...item, refundedQuantity: newQuantity, refundAmount: newRefundAmount }
          : item
      ),
    });
  };

  const handleSaveWithCheck = () => {
    if (!order) return;

    // Check if status is being changed to CANCELLED
    if (editFormData.status === "CANCELLED" && order.status !== "CANCELLED") {
      // Validate payment status for cash orders
      const isCashOrder = order.paymentMethod === "CASH_ON_DELIVERY";
      const newPaymentStatus = editFormData.paymentStatus || order.paymentStatus;
      
      if (isCashOrder && newPaymentStatus !== "FAILED") {
        setToast({
          visible: true,
          message: t("admin.orderManagement.errors.cashOrderPaymentStatusRequired", {
            defaultValue: "For cash orders, payment status must be set to 'Failed' when canceling.",
          }),
          type: "error",
        });
        return;
      }
      
      setCancelReasonInput("");
      setShowCancelReasonModal(true);
      return;
    }

    // Check if payment status is being changed to REFUNDED or PARTIALLY_REFUNDED
    const newPaymentStatus = editFormData.paymentStatus || order.paymentStatus;
    if (
      (newPaymentStatus === "REFUNDED" || newPaymentStatus === "PARTIALLY_REFUNDED") &&
      order.paymentStatus !== newPaymentStatus &&
      order.paymentStatus !== "PAID"
    ) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.refundRequiresPaidStatus", {
          defaultValue: "Order must be paid before it can be refunded.",
        }),
        type: "error",
      });
      return;
    }

    // Otherwise proceed with normal save
    handleUpdateOrder();
  };

  const handleConfirmCancelAndSave = async () => {
    if (!cancelReasonInput.trim()) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancellationReasonRequired"),
        type: "error",
      });
      return;
    }

    setShowCancelReasonModal(false);

    try {
      setIsSaving(true);
      const token = await getToken();

      // Process full refund if order is paid or partially refunded
      if (order && (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED")) {
        const refundRequest = {
          orderId: order.id,
          refundType: "FULL" as RefundType,
          reason: cancelReasonInput.trim(),
        };

        console.log("[OrderDetails] Creating refund for order:", order.id);
        const refundResponse = await refundService.createRefund(refundRequest, token || undefined);
        console.log("[OrderDetails] Refund created successfully:", refundResponse);
        
        // Explicitly load refunds after refund creation
        console.log("[OrderDetails] Loading refunds for order:", order.id);
        try {
          await loadOrderRefunds(order.id);
          console.log("[OrderDetails] Refunds loaded successfully");
        } catch (refundLoadError) {
          console.error("[OrderDetails] Error loading refunds after creation:", refundLoadError);
          setToast({
            visible: true,
            message: t("admin.orderManagement.refundLoadError", {
              defaultValue: "Refund processed but failed to load refund history",
            }),
            type: "error",
          });
        }
        
        // Show refund success message
        setToast({
          visible: true,
          message: t("admin.orderManagement.refundProcessedSuccess"),
          type: "success",
        });

        // Surface Fiskaly correction error as non-blocking warning
        const fiskalyCorrection = (refundResponse as any)?.data?.fiskalyCorrection;
        if (fiskalyCorrection && fiskalyCorrection.ok === false) {
          setTimeout(() => {
            setToast({
              visible: true,
              message: `Refund saved, but fiscal correction failed: ${fiskalyCorrection.error || "Unknown error"}`,
              type: "error",
            });
          }, 3000);
        }
      }

      // Update order status to CANCELLED
      await orderService.updateOrder(
        order!.id,
        {
          ...editFormData,
          cancellationReason: cancelReasonInput.trim(),
        },
        token || undefined
      );

      // Reload order to get updated payment status
      await loadOrderDetails({ exitOnError: false });

      setToast({
        visible: true,
        message: t("admin.orderManagement.orderUpdatedSuccess"),
        type: "success",
      });

      // Remove automatic navigation back - let user manually navigate after seeing refund history
    } catch (error) {
      console.error("Error updating order:", error);

      const errAny = error as any;
      const serverCode =
        errAny?.data?.code ||
        errAny?.response?.data?.code ||
        undefined;
      const serverMessage =
        errAny?.response?.data?.error ||
        errAny?.response?.data?.message ||
        errAny?.data?.error ||
        errAny?.data?.message ||
        errAny?.message ||
        undefined;

      if (String(serverCode || "").trim() === "POS_DEVICE_REQUIRED") {
        setToast({
          visible: true,
          message: serverMessage || t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
        router.push("/(admin)/pos-devices" as any);
        return;
      }

      if (String(serverCode || "").trim() === "FISKALY_POS_DEVICE_NOT_PROVISIONED") {
        setToast({
          visible: true,
          message: serverMessage || t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
        router.push("/(admin)/pos-devices" as any);
        return;
      }
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

    if (posDeviceRequiredButMissing) {
      setToast({
        visible: true,
        message: t("admin.posDevices.helperText", {
          defaultValue: "You can select a device for this tablet. Contact your administrator to create or delete devices.",
        }),
        type: "error",
      });
      router.push("/(admin)/pos-devices" as any);
      return;
    }

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
      const serverMessage =
        errAny?.response?.data?.error ||
        errAny?.response?.data?.message ||
        errAny?.message ||
        undefined;
      
      // Check if this is a device deactivation error
      const isDeviceDeactivationError = 
        serverMessage?.toLowerCase().includes('device') && 
        (serverMessage?.toLowerCase().includes('deactivated') || 
         serverMessage?.toLowerCase().includes('inactive') || 
         serverMessage?.toLowerCase().includes('provisioned') ||
         serverMessage?.toLowerCase().includes('no longer'));

      if (isDeviceDeactivationError) {
        setShowDeviceDeactivatedDialog(true);
      } else {
        setToast({
          visible: true,
          message: serverMessage || t("admin.orderManagement.orderUpdateError"),
          type: "error",
        });
      }
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
              disabled={isSaving || posDeviceRequiredButMissing}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {t("admin.orderManagement.save")}
                </Text>
              )}
            </TouchableOpacity>
          ) : canEditOrders && order?.status !== "CANCELLED" && !hasFullRefund() ? (
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
            {order.isPosOrder ? (
              <View style={styles.posBadge}>
                <Text style={styles.posBadgeText}>
                  {t("admin.orderManagement.posBadge", { defaultValue: "POS" })}
                </Text>
              </View>
            ) : null}
            {order.isMerged ? (
              <View style={styles.mergedBadge}>
                <Text style={styles.mergedBadgeText}>
                  {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                </Text>
              </View>
            ) : null}
            {order.isNotSynced ? (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>
                  {t("admin.orderManagement.notSynced", { defaultValue: "Not synced" })}
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
                  onPress={() => {
                    if (posDeviceRequiredButMissing) {
                      setToast({
                        visible: true,
                        message: t("admin.posDevices.helperText", {
                          defaultValue: "You can select a device for this tablet. Contact your administrator to create or delete devices.",
                        }),
                        type: "error",
                      });
                      router.push("/(admin)/pos-devices" as any);
                      return;
                    }
                    setShowOrderStatusModal(true);
                  }}
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
                  onPress={() => {
                    if (posDeviceRequiredButMissing) {
                      setToast({
                        visible: true,
                        message: t("admin.posDevices.helperText", {
                          defaultValue: "You can select a device for this tablet. Contact your administrator to create or delete devices.",
                        }),
                        type: "error",
                      });
                      router.push("/(admin)/pos-devices" as any);
                      return;
                    }
                    setShowPaymentStatusModal(true);
                  }}
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
                onPress={() => {
                  if (posDeviceRequiredButMissing) {
                    setToast({
                      visible: true,
                      message: t("admin.posDevices.helperText", {
                        defaultValue: "You can select a device for this tablet. Contact your administrator to create or delete devices.",
                      }),
                      type: "error",
                    });
                    router.push("/(admin)/pos-devices" as any);
                    return;
                  }
                  setShowPreparationTimeModal(true);
                }}
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
              {getPaymentMethodLabel(order.paymentMethod, order.orderType)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {t("admin.orderManagement.fields.totalAmount")}
            </Text>
            <Text style={styles.summaryTotal}>
              {formatCurrency(
                Number(order.totalAmount) -
                (order.refunds || []).filter((r: any) => r.status === "SUCCEEDED").reduce((sum: number, r: any) => sum + Number(r.amount), 0),
                displayCurrency
              )}
            </Text>
          </View>

          {/* Voucher Payment Details */}
          {(order as any)?.voucherPaymentAmount && Number((order as any).voucherPaymentAmount) > 0 ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t("admin.pos.voucherPayment", { defaultValue: "Voucher Payment" })}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(Number((order as any).voucherPaymentAmount), displayCurrency)}
                </Text>
              </View>
              {(order as any)?.voucherCodes && (order as any).voucherCodes.length > 0 ? (
                (order as any).voucherCodes.map((code: string, index: number) => (
                  <View key={index} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      {t("admin.pos.voucherCode", { defaultValue: "Voucher Code" })}
                    </Text>
                    <Text style={styles.summaryValue}>{code}</Text>
                  </View>
                ))
              ) : null}
              {(order as any)?.voucherRemainingBalances && Object.keys((order as any).voucherRemainingBalances).length > 0 ? (
                Object.entries((order as any).voucherRemainingBalances).map(([code, remaining]) => (
                  <View key={code} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      {t("admin.pos.remainingAmount", { defaultValue: "Remaining Amount" })}
                    </Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(Number(remaining), displayCurrency)}
                    </Text>
                  </View>
                ))
              ) : null}
            </>
          ) : null}

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

          {isEditMode && fiskalyStatus === "FAILED" ? (
            <View style={styles.summaryRow}>
              <TouchableOpacity
                style={styles.fiskalyRetryButton}
                onPress={handleRetryFiskaly}
                activeOpacity={0.85}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
                    <Text style={styles.fiskalyRetryButtonText}>
                      {t("admin.orderManagement.retryFiskaly", { defaultValue: "Retry Fiskaly" })}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
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
              <PickupLocationDisplay branch={branchDetails || order.branch || null} compact settings={settings} />
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
            .map((item) => {
              const totalRefundedQty = refundedQtyByItemId.get(item.id) ?? 0;
              const isRefunded = totalRefundedQty >= item.quantity;
              const hasPartialRefund = totalRefundedQty > 0 && !isRefunded;
              return (
            <View key={item.id} style={[styles.itemCard, isRefunded && styles.itemCardRefunded]}>
              <View style={styles.itemHeader}>
                {/* Meal Image */}
                <View style={styles.mealImageContainer}>
                  {(item?.meal?.image || (item as any)?.deal?.image || (item as any)?.image) ? (
                    <View style={styles.mealImageContainer}>
                      <Image
                        source={{
                          uri: getOptimizedImageUrl(
                            item?.meal?.image ||
                              (item as any)?.deal?.image ||
                              (item as any)?.image
                          ),
                        }}
                        style={[styles.mealImage, isRefunded && styles.mealImageRefunded]}
                        resizeMode="cover"
                      />
                      {isRefunded && <View style={styles.mealImageGreyscaleOverlay} />}
                    </View>
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
                    <Text style={[styles.itemName, isRefunded && styles.itemNameRefunded]}>
                      {item?.meal?.name ||
                        (item as any)?.deal?.name ||
                        ((item?.mealId === null || item?.mealId === undefined) && (item?.dealId === null || item?.dealId === undefined) && item?.specialInstructions ? item.specialInstructions : null) ||
                        (item as any)?.name ||
                        "Item"}
                    </Text>
                    {(isRefunded || hasPartialRefund) && (
                      <View style={styles.refundedBadge}>
                        <Text style={styles.refundedBadgeText}>
                          {hasPartialRefund
                            ? `${totalRefundedQty} of ${item.quantity} Refunded`
                            : "Refunded"}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.itemPrice, isRefunded && styles.itemPriceRefunded]}>
                      {formatCurrency(item.totalPrice, displayCurrency)}
                    </Text>
                  </View>

                  {/* View Voucher Button for voucher items */}
                  {((item as any)?.itemType === "VOUCHER" || parseVoucherInstructions(item.specialInstructions)) && (
                    <TouchableOpacity
                      style={styles.viewVoucherButton}
                      onPress={() => {
                        const voucherInfo = parseVoucherInstructions(item.specialInstructions);
                        if (voucherInfo) {
                          setActiveVoucherModalDetails({
                            code: voucherInfo.code,
                            type: voucherInfo.type,
                            expires: voucherInfo.expires,
                            amount: Number(item.totalPrice),
                            currentAmount: undefined, // Not available in special instructions
                            vatRate: undefined,
                          });
                          setVoucherModalSource("order_item");
                          setShowVoucherModal(true);
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="qrcode" size={16} color="#3B82F6" />
                      <Text style={styles.viewVoucherButtonText}>View Voucher</Text>
                    </TouchableOpacity>
                  )}

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

                  {(Number(item.itemDiscountAmount ?? 0) > 0 || Number(item.itemSurchargeAmount ?? 0) > 0) && (
                    <View style={styles.itemAdjustmentRow}>
                      {Number(item.itemDiscountAmount ?? 0) > 0 && (
                        <View style={styles.itemDiscountBadge}>
                          <Text style={styles.itemDiscountText}>
                            {item.itemDiscountType === "PERCENTAGE"
                              ? `-${item.itemDiscountValue}%`
                              : `-${formatCurrency(Number(item.itemDiscountAmount ?? 0), displayCurrency)}`}
                            {item.itemDiscountScope === "PER_UNIT"
                              ? ` ${t("admin.pos.perUnitShort", { defaultValue: "/u" })}`
                              : ""}
                          </Text>
                        </View>
                      )}
                      {Number(item.itemSurchargeAmount ?? 0) > 0 && (
                        <View style={styles.itemSurchargeBadge}>
                          <Text style={styles.itemSurchargeText}>
                            +{formatCurrency(Number(item.itemSurchargeAmount ?? 0), displayCurrency)}
                            {item.itemSurchargeScope === "PER_UNIT"
                              ? ` ${t("admin.pos.perUnitShort", { defaultValue: "/u" })}`
                              : ""}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {item.taxAmount !== undefined && item.taxAmount > 0 && !effectiveTaxInclusive && (
                    <Text style={styles.itemTax}>
                      {t("admin.orderManagement.fields.tax")}{" "}
                      {formatCurrency(item.taxAmount, displayCurrency)}
                      {item.taxPercentage && ` (${item.taxPercentage}%)`}
                    </Text>
                  )}

                  {(isRefunded || hasPartialRefund) && (
                    <View style={styles.itemAdjustmentRow}>
                      <View style={styles.itemRefundBadge}>
                        <Text style={styles.itemRefundText}>
                          {hasPartialRefund
                            ? `${totalRefundedQty} of ${item.quantity} Refunded`
                            : "Refunded"}
                        </Text>
                      </View>
                    </View>
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

                    {childTaxLines.length > 0 && !effectiveTaxInclusive && (
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
                    {item.orderItemAddOns.map((addon: any) => {
                      const totalAddonQty = addon.quantity || 1;
                      const refundedAddonQty = (order.refunds || [])
                        .filter((r: any) => r.refundType === "ITEM_SPECIFIC" && r.status === "SUCCEEDED")
                        .flatMap((r: any) => (r as any).metadata?.items || [])
                        .filter((ri: any) => ri.orderItemId === item.id)
                        .flatMap((ri: any) => ri.addons || [])
                        .filter((ra: any) => ra.addonId === addon.id)
                        .reduce((sum: number, ra: any) => sum + (Number(ra.refundedQuantity) || 0), 0);
                      const remainingQty = Math.max(0, totalAddonQty - refundedAddonQty);
                      const isAddonFullyRefunded = refundedAddonQty >= totalAddonQty;
                      const isAddonPartiallyRefunded = refundedAddonQty > 0 && !isAddonFullyRefunded;

                      return (
                        <View key={addon.id} style={[styles.addOnCard, isAddonFullyRefunded && styles.addOnCardRefunded]}>
                          <View style={styles.addOnHeader}>
                            <Text style={[styles.addOnName, isAddonFullyRefunded && styles.addOnNameRefunded]}>
                              {addon.addOnName}
                            </Text>
                            {totalAddonQty > 1 && (
                              <View style={[styles.addOnQuantityBadge, isAddonFullyRefunded && styles.addOnQuantityBadgeRefunded]}>
                                <Text style={[styles.addOnQuantityText, isAddonFullyRefunded && styles.addOnQuantityTextRefunded]}>
                                  {isAddonFullyRefunded
                                    ? `×0`
                                    : isAddonPartiallyRefunded
                                      ? `×${remainingQty} of ×${totalAddonQty}`
                                      : `×${totalAddonQty}`}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.addOnPrice, isAddonFullyRefunded && styles.addOnPriceRefunded]}>
                            {formatCurrency(
                              addon.addOnPrice * (addon.quantity || 1),
                              displayCurrency
                            )}
                          </Text>
                          {isAddonPartiallyRefunded && (
                            <View style={styles.addonPartialRefundBadge}>
                              <Text style={styles.addonPartialRefundText}>
                                {refundedAddonQty} Refunded
                              </Text>
                            </View>
                          )}
                          {isAddonFullyRefunded && (
                            <View style={styles.addonFullRefundBadge}>
                              <Text style={styles.addonFullRefundText}>Refunded</Text>
                            </View>
                          )}
                          {addon.taxAmount !== undefined &&
                            addon.taxAmount > 0 && !effectiveTaxInclusive && (
                              <Text style={styles.addOnTax}>
                                +{" "}
                                {formatCurrency(addon.taxAmount, displayCurrency)}{" "}
                                {t("admin.orderManagement.tax")}
                              </Text>
                            )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Special Instructions */}
              {item.specialInstructions && !((item as any)?.itemType === "VOUCHER" || parseVoucherInstructions(item.specialInstructions)) && (
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
          );
          })}
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
            {(() => {
              const postDiscountSubtotal = (order.orderItems as any[]).reduce((sum, it) => sum + Number(it.totalPrice || 0), 0);
              const totalItemDiscount = (order.orderItems as any[]).reduce((sum, it) => sum + (Number(it.itemDiscountAmount) || 0), 0);
              const totalItemSurcharge = (order.orderItems as any[]).reduce((sum, it) => sum + (Number(it.itemSurchargeAmount) || 0), 0);
              const hasItemAdjustments = totalItemDiscount > 0 || totalItemSurcharge > 0;
              const itemsSubtotal = postDiscountSubtotal + totalItemDiscount - totalItemSurcharge;
              return (
                <>
                  {hasItemAdjustments ? (
                    <>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>
                          {t("admin.orderManagement.itemsSubtotal", { defaultValue: "Items subtotal" })}
                        </Text>
                        <Text style={styles.summaryValue}>
                          {formatCurrency(itemsSubtotal, displayCurrency)}
                        </Text>
                      </View>
                      {totalItemDiscount > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>
                            {t("admin.pos.itemDiscountsLabel", { defaultValue: "Item discounts" })}
                          </Text>
                          <Text style={[styles.summaryValue, { color: "#22c55e" }]}>
                            -{formatCurrency(totalItemDiscount, displayCurrency)}
                          </Text>
                        </View>
                      )}
                      {totalItemSurcharge > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryLabel, { color: "#f59e0b" }]}>
                            {t("admin.pos.itemSurchargesLabel", { defaultValue: "Item surcharges" })}
                          </Text>
                          <Text style={[styles.summaryValue, { color: "#f59e0b" }]}>
                            +{formatCurrency(totalItemSurcharge, displayCurrency)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { fontWeight: "600", color: "#D1D5DB" }]}>
                          {t("admin.orderManagement.subtotal")}
                        </Text>
                        <Text style={[styles.summaryValue, { fontWeight: "600", color: "#D1D5DB" }]}>
                          {formatCurrency(postDiscountSubtotal, displayCurrency)}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        {t("admin.orderManagement.subtotal")}
                      </Text>
                      <Text style={styles.summaryValue}>
                        {formatCurrency(postDiscountSubtotal, displayCurrency)}
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
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
              Number((order as any).takeawayServiceTaxAmount || 0) > 0 && !effectiveTaxInclusive && (
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
            {!effectiveTaxInclusive && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t("admin.orderManagement.fields.tax")}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(order.taxAmount, displayCurrency)}
                </Text>
              </View>
            )}
            {Number(order.discountAmount || 0) > 0 ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t("receipt.totalBeforeOrderDiscount", { defaultValue: "Total before order discount" })}
                  </Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(Number(order.totalAmount) + Number(order.discountAmount), displayCurrency)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {order.discountType === "PERCENTAGE"
                      ? t("receipt.discountPct", {
                          value: Number(order.discountValue || 0),
                          defaultValue: `Discount (${Number(order.discountValue || 0)}%)`,
                        })
                      : t("receipt.discountFixed", { defaultValue: "Discount (Fixed)" })}
                  </Text>
                  <Text style={[styles.summaryValue, { color: "#22c55e" }]}>
                    -{formatCurrency(Number(order.discountAmount), displayCurrency)}
                  </Text>
                </View>
              </>
            ) : null}
            {Number((order as any).voucherPaymentAmount || 0) > 0 && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t("admin.orderManagement.voucherPayment", { defaultValue: "Voucher Payment" })}
                  </Text>
                  <Text style={[styles.summaryValue, { color: "#ec4899" }]}>
                    -{formatCurrency(Number((order as any).voucherPaymentAmount || 0), displayCurrency)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.viewVouchersButton}
                  onPress={() => setShowVouchersListModal(true)}
                >
                  <Text style={styles.viewVouchersButtonText}>
                    {t("admin.orderManagement.viewVouchers", { defaultValue: "View Vouchers" })}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryTotalLabel}>
                {t("admin.orderManagement.total")}
              </Text>
              <Text style={styles.summaryTotalValue}>
                {formatCurrency(
                  Number(order.totalAmount),
                  displayCurrency
                )}
              </Text>
            </View>
            {(() => {
              const succeededRefunds = (order.refunds || []).filter(
                (r) => r.status === "SUCCEEDED"
              );
              const totalRefunded = succeededRefunds.reduce(
                (sum, r) => sum + Number(r.amount || 0),
                0
              );
              if (totalRefunded <= 0) return null;
              const netPayable = Math.max(0, Number(order.totalAmount) - totalRefunded);
              return (
                <>
                  {succeededRefunds.map((r, i) => (
                    <View key={r.id} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        {t("admin.orderManagement.refund", { defaultValue: "Refund" })} #{i + 1}
                        {r.refundType === "ITEM_SPECIFIC"
                          ? ` (${t("admin.orderManagement.refundTypes.itemspecific", { defaultValue: "By Item" })})`
                          : r.refundType === "PARTIAL"
                          ? ` (${t("admin.orderManagement.refundTypes.partial", { defaultValue: "Partial" })})`
                          : ""}
                      </Text>
                      <Text style={[styles.summaryValue, { color: "#ef4444" }]}>
                        -{formatCurrency(Number(r.amount), displayCurrency)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                    <Text style={styles.summaryTotalLabel}>
                      {t("admin.orderManagement.netPayable", { defaultValue: "Net Payable" })}
                    </Text>
                    <Text style={styles.summaryTotalValue}>
                      {formatCurrency(netPayable, displayCurrency)}
                    </Text>
                  </View>
                </>
              );
            })()}
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
                      const refundStatusText = t(
                        `admin.orderManagement.refundStatuses.${refund.status.toLowerCase()}`,
                        { defaultValue: statusInfo.text }
                      );
                      const refundTypeText = t(
                        `admin.orderManagement.refundTypes.${refund.refundType.toLowerCase().replace(/_/g, "")}`,
                        { defaultValue: refundService.formatRefundType(refund.refundType) }
                      );
                      return (
                        <View key={refund.id} style={styles.refundCard}>
                          <View style={styles.refundCardLeft}>
                            <Text style={styles.refundCardTitle}>
                              {t("admin.orderManagement.refund")} #{index + 1} -{" "}
                              {refundTypeText}
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
                              {refundStatusText}
                            </Text>
                            <TouchableOpacity
                              style={styles.refundViewBillButton}
                              onPress={() => router.push(`/refund-bill-preview?refundId=${refund.id}`)}
                            >
                              <MaterialCommunityIcons name="receipt" size={16} color="#3b82f6" />
                              <Text style={styles.refundViewBillButtonText}>
                                {t("admin.orderManagement.viewRefundBill", { defaultValue: "View Bill" })}
                              </Text>
                            </TouchableOpacity>
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
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowRefundModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowRefundModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
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
                        ["FULL", "ITEM_SPECIFIC"] as RefundType[]
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

                  {/* Item-Specific Refund */}
                  {refundFormData.refundType === "ITEM_SPECIFIC" && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>
                        {t("admin.orderManagement.selectItemsToRefund")}
                      </Text>
                      <View style={styles.refundItemsList}>
                        {order.orderItems.filter((item) => {
                          if ((item as any).itemType === "DEAL_COMPONENT") return false;
                          if (Number(item.totalPrice || 0) <= 0) return false;
                          const alreadyRefunded = refundedQtyByItemId.get(item.id) ?? 0;
                          return alreadyRefunded < item.quantity;
                        }).map((item) => {
                          const alreadyRefunded = refundedQtyByItemId.get(item.id) ?? 0;
                          const remainingQty = item.quantity - alreadyRefunded;
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
                                  {item.meal?.name || (item as any).deal?.name || 'Item'}
                                </Text>
                                <Text style={styles.refundItemPrice}>
                                  {formatCurrency(
                                    item.quantity > 0 ? (item.totalPrice / item.quantity) * remainingQty : item.totalPrice,
                                    displayCurrency
                                  )}
                                </Text>
                                {isSelected && (
                                  <View style={styles.refundItemQuantityRow}>
                                    <TouchableOpacity
                                      style={styles.refundItemStepperButton}
                                      onPress={() =>
                                        handleItemRefundQuantityChange(item.id, -1)
                                      }
                                    >
                                      <Text style={styles.refundItemStepperText}>-</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.refundItemQuantityText}>
                                      {(() => {
                                        const refundItem = refundFormData.items.find(
                                          (ri) => ri.orderItemId === item.id
                                        );
                                        return refundItem?.refundedQuantity ?? item.quantity;
                                      })()}
                                    </Text>
                                    <TouchableOpacity
                                      style={styles.refundItemStepperButton}
                                      onPress={() =>
                                        handleItemRefundQuantityChange(item.id, 1)
                                      }
                                    >
                                      <Text style={styles.refundItemStepperText}>+</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.refundItemQuantityLabel}>
                                      / {remainingQty}
                                    </Text>
                                  </View>
                                )}
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
                        {/* Addons being refunded - show per-addon refund quantity */}
                        {refundFormData.items.map((refundItem) => {
                          const orderItem = order.orderItems.find((i) => i.id === refundItem.orderItemId);
                          if (!orderItem || !(orderItem as any)?.orderItemAddOns || (orderItem as any).orderItemAddOns.length === 0) return null;
                          const selectedQty = refundItem.refundedQuantity ?? orderItem.quantity;
                          const totalItemQty = orderItem.quantity;
                          return (
                            <View key={`${refundItem.orderItemId}-addons`} style={styles.refundItemAddons}>
                              <Text style={styles.refundItemAddonLabel}>
                                {orderItem.meal.name} — included addons:
                              </Text>
                              {(orderItem as any).orderItemAddOns.map((addon: any) => {
                                const totalAddonQty = addon.quantity || 1;
                                const refundedAddonQty = Math.ceil((totalAddonQty * selectedQty) / totalItemQty);
                                const remainingAddonQty = totalAddonQty - refundedAddonQty;
                                return (
                                  <View key={addon.id} style={styles.refundItemAddonRow}>
                                    <View style={styles.refundItemAddonInfo}>
                                      <Text style={styles.refundItemAddonName}>
                                        {addon.addOnName}
                                      </Text>
                                      <Text style={styles.refundItemAddonQty}>
                                        {refundedAddonQty}×{totalAddonQty > 1 ? ` of ${totalAddonQty}` : ""} will be refunded
                                        {remainingAddonQty > 0 ? ` (${remainingAddonQty} remaining)` : ""}
                                      </Text>
                                    </View>
                                    <Text style={styles.refundItemAddonPrice}>
                                      {formatCurrency(addon.addOnPrice * refundedAddonQty, displayCurrency)}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Live refund total */}
                  {refundFormData.refundType === "ITEM_SPECIFIC" && refundFormData.items.length > 0 && (
                    <View style={[styles.summaryRow, { marginBottom: 12, paddingHorizontal: 4 }]}>
                      <Text style={[styles.summaryLabel, { fontSize: 15 }]}>
                        {t("admin.orderManagement.totalToRefund", { defaultValue: "Total to refund" })}
                      </Text>
                      <Text style={[styles.summaryValue, { fontSize: 15, fontWeight: "700", color: "#ec4899" }]}>
                        {formatCurrency(
                          refundFormData.items.reduce((s, i) => s + i.refundAmount, 0),
                          displayCurrency
                        )}
                      </Text>
                    </View>
                  )}

                  {/* Refund Reason */}
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, refundReasonError && styles.formLabelError]}>
                      {t("admin.orderManagement.reasonForRefundRequired", { defaultValue: t("admin.orderManagement.reasonForRefund") })}
                      {refundReasonError && " *"}
                    </Text>
                    <TextInput
                      style={[styles.textArea, refundReasonError && styles.textAreaError]}
                      multiline
                      numberOfLines={3}
                      placeholder={t(
                        "admin.orderManagement.refundReasonPlaceholder"
                      )}
                      placeholderTextColor="#6B7280"
                      value={refundFormData.reason || ""}
                      onChangeText={(text) => {
                        setRefundFormData({ ...refundFormData, reason: text });
                        if (refundReasonError) setRefundReasonError(false);
                      }}
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Preparation Time Bottom Sheet Modal */}
      <Modal
        visible={showPreparationTimeModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowPreparationTimeModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPreparationTimeModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
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
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowOrderStatusModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderStatusModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
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
                    const shouldAutoMarkRefunded = nextStatus === "CANCELLED";
                    const currentPaymentStatus =
                      (editFormData.paymentStatus || order?.paymentStatus) as Order["paymentStatus"] | undefined;
                    const isRefundedState =
                      currentPaymentStatus === "REFUNDED" || currentPaymentStatus === "PARTIALLY_REFUNDED";

                    setEditFormData({
                      ...editFormData,
                      status: nextStatus,
                      ...(shouldAutoMarkPaid && !isRefundedState ? { paymentStatus: "PAID" } : {}),
                      ...(shouldAutoMarkRefunded ? { paymentStatus: "REFUNDED" } : {}),
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
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowPaymentStatusModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentStatusModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
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
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
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
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
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

      {/* Device Deactivated Dialog */}
      <Modal visible={showDeviceDeactivatedDialog} transparent animationType="fade" onRequestClose={() => setShowDeviceDeactivatedDialog(false)}>
        <Pressable style={styles.deviceDeactivatedOverlay} onPress={() => setShowDeviceDeactivatedDialog(false)}>
          <Pressable style={styles.deviceDeactivatedContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.deviceDeactivatedIconContainer}>
              <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
            </View>
            <Text style={styles.deviceDeactivatedTitle}>{t("admin.orderManagement.deviceDeactivated.title", { defaultValue: "Device Deactivated" })}</Text>
            <Text style={styles.deviceDeactivatedDescription}>
              {t("admin.orderManagement.deviceDeactivated.description", { 
                defaultValue: "The device you were using has been deactivated. Please contact your administrator to select a new device or reactivate the current one.",
                deviceName: selectedDevice?.name || t("admin.posDevices.unknownDevice", { defaultValue: "Unknown Device" })
              })}
            </Text>
            <View style={styles.deviceDeactivatedButtons}>
              <TouchableOpacity 
                style={styles.deviceDeactivatedOkButton} 
                onPress={() => setShowDeviceDeactivatedDialog(false)}
              >
                <Text style={styles.deviceDeactivatedOkButtonText}>{t("common.ok", { defaultValue: "OK" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voucher Reprint Modal */}
      <Modal
        visible={showVoucherModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowVoucherModal(false);
          setVoucherModalSource(null);
        }}
      >
        <View style={styles.ticketModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setShowVoucherModal(false);
              setVoucherModalSource(null);
            }}
          />
          <View style={[styles.modalCard, { width: 380, backgroundColor: "#fff", maxHeight: "80%" }]}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              {/* Real Receipt Thermal style layout */}
              <View style={{ alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  {branchDetails?.name || order?.branch?.name || "Bellami Store"}
                </Text>
                <Text style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>Tax Voucher Receipt</Text>
              </View>

              {activeVoucherDetails && (
                <>
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>VOUCHER TYPE</Text>
                    <Text style={{ fontSize: 14, color: "#111827", fontWeight: "700", marginTop: 2 }}>
                      {activeVoucherDetails.type === "SINGLE_PURPOSE" ? "SINGLE-PURPOSE VOUCHER" : "MULTI-PURPOSE VOUCHER"}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                      {activeVoucherDetails.type === "SINGLE_PURPOSE" ? "Tax was immediately charged" : "Tax charged upon redemption"}
                    </Text>
                    {activeVoucherDetails.type === "SINGLE_PURPOSE" && activeVoucherDetails.vatRate !== undefined && activeVoucherDetails.vatRate !== null && (
                      <Text style={{ fontSize: 12, color: "#ec4899", fontWeight: "700", marginTop: 4 }}>
                        VAT Rate: {activeVoucherDetails.vatRate}%
                      </Text>
                    )}
                  </View>

                  <View style={{ backgroundColor: "#f4f4f5", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 20 }}>
                    <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>VOUCHER VALUE</Text>
                    <Text style={{ fontSize: 32, color: "#111827", fontWeight: "800", marginVertical: 4 }}>{formatCurrency(activeVoucherDetails.amount, order?.currency || "USD")}</Text>
                    
                    <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700", marginTop: 8 }}>VOUCHER CODE</Text>
                    <Text style={{ fontSize: 16, color: "#ec4899", fontWeight: "800", letterSpacing: 0.5, marginTop: 2 }}>{activeVoucherDetails.code}</Text>

                    {activeVoucherDetails.currentAmount !== undefined && (
                      <>
                        <View style={{ width: "100%", height: 1, backgroundColor: "#e4e4e7", marginVertical: 12 }} />
                        <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>
                          {t("admin.pos.remainingAmountUpper", { defaultValue: "REMAINING AMOUNT" })}
                        </Text>
                        <Text style={{ fontSize: 24, color: "#ec4899", fontWeight: "800", marginTop: 2 }}>
                          {formatCurrency(activeVoucherDetails.currentAmount, order?.currency || "USD")}
                        </Text>
                      </>
                    )}
                  </View>

                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 12, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: "#71717a" }}>Valid until:</Text>
                    <Text style={{ fontSize: 12, color: "#111827", fontWeight: "600" }}>{activeVoucherDetails.expires}</Text>
                  </View>

                  {/* Scannable QR-code block */}
                  <View style={{ alignItems: "center", marginVertical: 16 }}>
                    <QRCode
                      value={activeVoucherDetails.code}
                      size={120}
                      backgroundColor="#fff"
                      color="#000"
                    />
                    <Text style={{ fontSize: 11, color: "#71717a", fontWeight: "700", marginTop: 10, letterSpacing: 1 }}>{activeVoucherDetails.code}</Text>
                  </View>

                  <TouchableOpacity
                    style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 16 }}
                    onPress={async () => {
                      if (voucherModalSource === "vouchers_list") {
                        setShowVoucherModal(false);
                        setVoucherModalSource(null);
                      } else {
                        await printVoucherFromHistory(
                          activeVoucherDetails.code,
                          activeVoucherDetails.amount,
                          activeVoucherDetails.type,
                          activeVoucherDetails.expires,
                          activeVoucherDetails.currentAmount,
                          activeVoucherDetails.vatRate
                        );
                        setShowVoucherModal(false);
                        setVoucherModalSource(null);
                      }
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      {voucherModalSource === "vouchers_list" ? "Close" : "Print & Close"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Vouchers List Modal */}
      <Modal
        visible={showVouchersListModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVouchersListModal(false)}
      >
        <View style={styles.ticketModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowVouchersListModal(false)} />
          <View style={[styles.modalCard, { maxHeight: "80%", width: 420, backgroundColor: "#ffffff", padding: 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.orderManagement.vouchersUsed", { defaultValue: "Vouchers Used" })}
              </Text>
              <TouchableOpacity onPress={() => setShowVouchersListModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(order as any)?.voucherCodes && (order as any).voucherCodes.length > 0 ? (
                (order as any).voucherCodes.map((voucherCode: string, index: number) => (
                  <View key={index} style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ color: "#6b7280", fontSize: 12 }}>
                        {t("admin.orderManagement.voucherCode", { defaultValue: "Voucher Code" })}
                      </Text>
                      <Text style={{ color: "#ec4899", fontSize: 14, fontWeight: "700" }}>{voucherCode}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.primaryAction, { marginTop: 8, backgroundColor: "#ec4899" }]}
                      onPress={async () => {
                        try {
                          setLoadingVoucherDetails(true);
                          const token = await getToken();
                          const voucherDetails = await voucherService.getVoucherByCode(voucherCode, token || undefined);
                          setActiveVoucherModalDetails({
                            code: voucherDetails.voucherCode,
                            type: voucherDetails.voucherType,
                            expires: new Date(voucherDetails.expiresAt).toLocaleDateString(),
                            amount: voucherDetails.initialAmount,
                            currentAmount: voucherDetails.currentAmount,
                            vatRate: voucherDetails.vatRate,
                          });
                          setVoucherModalSource("vouchers_list");
                          setShowVoucherModal(true);
                          setShowVouchersListModal(false);
                        } catch (error) {
                          console.error("Failed to fetch voucher details:", error);
                          Alert.alert("Error", "Failed to load voucher details");
                        } finally {
                          setLoadingVoucherDetails(false);
                        }
                      }}
                      disabled={loadingVoucherDetails}
                    >
                      {loadingVoucherDetails ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.primaryActionText}>
                          {t("admin.orderManagement.viewReceipt", { defaultValue: "View Receipt" })}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={{ color: "#a1a1aa", fontSize: 14, textAlign: "center", paddingVertical: 32 }}>
                  {t("admin.orderManagement.noVouchers", { defaultValue: "No vouchers used for this order" })}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
    color: "#6b7280",
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
    color: "#111827",
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
    color: "#111827",
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  summaryHeader: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginRight: 4,
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
  posBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(236, 72, 153, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.35)",
  },
  posBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ec4899",
  },
  offlineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#f59e0b",
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
    color: "#6b7280",
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
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 14,
    color: "#374151",
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
    color: "#111827",
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
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  itemCardRefunded: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
    opacity: 0.72,
  },
  mealImageRefunded: {
    opacity: 1,
  },
  mealImageGreyscaleOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    opacity: 0,
  },
  itemNameRefunded: {
    color: "#4B5563",
  },
  itemPriceRefunded: {
    color: "#4B5563",
  },
  refundedBadge: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginHorizontal: 6,
  },
  refundedBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    backgroundColor: "#f3f4f6",
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
    color: "#111827",
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
  viewVoucherButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  viewVoucherButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3B82F6",
  },
  viewVouchersButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#dbeafe",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  viewVouchersButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
  },
  primaryAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sizeBadgeText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "500",
  },
  itemQuantity: {
    fontSize: 13,
    color: "#6b7280",
  },
  itemUnitPrice: {
    fontSize: 12,
    color: "#6b7280",
  },
  itemAdjustmentRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  itemDiscountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#16a34a",
  },
  itemDiscountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#22c55e",
  },
  itemRefundBadge: {
    backgroundColor: "#d1d5db",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  itemRefundText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  itemSurchargeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#451a03",
    borderWidth: 1,
    borderColor: "#d97706",
  },
  itemSurchargeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f59e0b",
  },
  itemTax: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  addOnsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  addOnsSectionTitle: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  addOnsGrid: {
    gap: 10,
  },
  addOnCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  addOnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  addOnName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  addOnQuantityBadge: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addOnQuantityText: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "600",
  },
  addOnPrice: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  addOnTax: {
    fontSize: 11,
    color: "#6b7280",
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
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
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
    color: "#374151",
    lineHeight: 20,
  },
  refundSummaryCard: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  refundSummaryRight: {
    alignItems: "flex-end",
  },
  refundSummaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  refundSummaryAmount: {
    fontSize: 14,
    color: "#374151",
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
    color: "#6b7280",
  },
  refundsList: {
    gap: 12,
  },
  refundCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    color: "#111827",
    fontWeight: "600",
  },
  refundCardDate: {
    fontSize: 11,
    color: "#6b7280",
  },
  refundCardReason: {
    fontSize: 11,
    color: "#6b7280",
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
  refundViewBillButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  refundViewBillButtonText: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "600",
    marginLeft: 4,
  },
  refundLoadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  refundEmptyText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    padding: 20,
  },
  previewBillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    backgroundColor: "#ec4899",
    borderRadius: 10,
    paddingHorizontal: 14,
    width: "100%",
  },
  previewBillButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  fiskalyRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    backgroundColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 14,
    width: "100%",
  },
  fiskalyRetryButtonText: {
    color: "#fff",
    fontWeight: "700",
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
  ticketModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  ticketModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  ticketModalSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%",
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
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
    color: "#111827",
    marginBottom: 12,
  },
  formLabelError: {
    color: "#ef4444",
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  refundTypeButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  refundTypeButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
  },
  refundTypeButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
    minHeight: 50,
  },
  inputHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
  },
  refundItemsList: {
    gap: 8,
  },
  refundItemCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    color: "#111827",
    fontWeight: "500",
    marginBottom: 4,
  },
  refundItemQuantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  refundItemQuantityLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  refundItemStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refundItemStepperButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  refundItemStepperText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 16,
  },
  refundItemQuantityText: {
    fontSize: 13,
    color: "#111827",
    minWidth: 24,
    textAlign: "center",
  },
  refundItemPrice: {
    fontSize: 13,
    color: "#6b7280",
  },
  refundItemAddons: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
  },
  refundItemAddonLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
  },
  refundItemAddonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  refundItemAddonInfo: {
    flex: 1,
    marginRight: 8,
  },
  refundItemAddonName: {
    fontSize: 12,
    color: "#374151",
  },
  refundItemAddonQty: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 1,
  },
  refundItemAddonPrice: {
    fontSize: 12,
    color: "#6b7280",
  },
  addOnCardRefunded: {
    opacity: 0.5,
  },
  addOnNameRefunded: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  addOnQuantityBadgeRefunded: {
    backgroundColor: "#d1d5db",
  },
  addOnQuantityTextRefunded: {
    color: "#9ca3af",
  },
  addOnPriceRefunded: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  addonPartialRefundBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 4,
  },
  addonPartialRefundText: {
    fontSize: 10,
    color: "#EF4444",
    fontWeight: "600",
  },
  addonFullRefundBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 4,
  },
  addonFullRefundText: {
    fontSize: 10,
    color: "#EF4444",
    fontWeight: "600",
  },
  refundModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    paddingBottom: 20,
  },
  refundCancelButton: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  refundCancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  textAreaError: {
    borderColor: "#ef4444",
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
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  statusPickerText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
    color: "#111827",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
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
  // Device Deactivated Dialog styles following tablet app standards
  deviceDeactivatedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deviceDeactivatedContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  deviceDeactivatedIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  deviceDeactivatedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  deviceDeactivatedDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  deviceDeactivatedButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deviceDeactivatedOkButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  deviceDeactivatedOkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
