import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
// DeliveryStatusBar imported but not used - kept for potential future use
// import DeliveryStatusBar from "@/components/ui/delivery-status-bar";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import Icon from "@mdi/react";
import { mdiPackageVariant, mdiClock, mdiCheckCircle, mdiCloseCircle, mdiTruck, mdiMapMarker, mdiRefresh, mdiBell, mdiCalendarClock, mdiAlertCircleOutline } from "@mdi/js";
import { useNavigate } from "react-router-dom";
import ApiService from "@/services/apiService";
import SocketService from "@/services/socketService";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import branchService, { type Branch } from "@/services/branchService";
import { useCartStore } from "@/store/cartStore";
import { ReceiptPreview } from "@/components/receipt/ReceiptPreview";
import { SettingsService } from "@/services/settingsService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScheduledOrderPicker } from "@/components/checkout/ScheduledOrderPicker";
// PickupLocationDisplay imported but not used - kept for potential future use
// import PickupLocationDisplay from "@/components/PickupLocationDisplay";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  selectedSize: string;
  specialInstructions?: string;
  taxAmount?: number | string;
  taxPercentage?: number | string;
  meal: {
    id: string;
    name: string;
    basePrice: number | string;
    image?: string;
  };
  orderItemAddOns: {
    id: string;
    addonId?: string;
    addOnName: string;
    addOnPrice: number | string;
    addonType?: "BOOLEAN" | "QUANTITY";
    quantity?: number;
    taxAmount?: number | string;
    taxPercentage?: number | string;
    addonDescription?: string;
  }[];
  orderItemOptionalIngredients?: {
    id: string;
    optionalIngredientId: string;
    isIncluded: boolean;
    ingredientName: string;
    optionalIngredient?: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  orderType: "DELIVERY" | "PICKUP";
  totalAmount: number | string;
  deliveryFee: number | string;
  takeawayServiceFee?: number | string | null;
  takeawayServiceTaxPercentage?: number | string;
  takeawayServiceTaxAmount?: number | string;
  taxAmount: number | string;
  itemTaxAmount?: number | string;
  addonTaxAmount?: number | string;
  deliveryTaxAmount?: number | string;
  currency: string;
  paymentStatus: string;
  paymentMethod?: string;
  paymentIntentId?: string;
  deliveryAddress?: string;
  deliveryBuilding?: string;
  deliveryFloor?: string;
  deliveryApartment?: string;
  deliveryExtraDetails?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  pickupPhone?: string;
  pickupNotes?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  createdAt: string;
  updatedAt: string;
  // Scheduled/Future Order fields
  scheduledDate?: string | null;
  isScheduledOrder?: boolean;
  // Preparation time fields
  preparationTime?: number | null;
  confirmedAt?: string | null;
  isMerged?: boolean;
  mergedAt?: string | null;
  orderItems: OrderItem[];
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

interface OrdersResponse {
  success: boolean;
  data: {
    orders: Order[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

const Orders: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { currency, settings } = useSettings();
  const { clearCart } = useCartStore();
  const isModifyFlowEnabled = true;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [unseenStatusChangeOrderIds, setUnseenStatusChangeOrderIds] = useState<
    Set<string>
  >(new Set());
  const [branches, setBranches] = useState<Branch[]>([]);
  const [mainBranch, setMainBranch] = useState<Branch | null>(null);
  const [orderToModify, setOrderToModify] = useState<Order | null>(null);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderToReschedule, setOrderToReschedule] = useState<Order | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleScheduledDate, setRescheduleScheduledDate] = useState<Date | null>(null);
  const [isModifying, setIsModifying] = useState(false);
  const isModifyDialogOpeningRef = useRef(false);

  const [isBillPreviewOpen, setIsBillPreviewOpen] = useState(false);
  const [billPreviewLoading, setBillPreviewLoading] = useState(false);
  const [billPreviewError, setBillPreviewError] = useState<string | null>(null);
  const [billPreviewPayload, setBillPreviewPayload] = useState<any | null>(null);
  const [billPreviewSettings, setBillPreviewSettings] = useState<any | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const getRemainingPrepMs = (order: Order | null): number | null => {
    if (!order) return null;
    const prepMin = order.preparationTime != null ? Number(order.preparationTime) : NaN;
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
    const anchorRaw = order.confirmedAt || (eligibleStatuses.has(String(order.status)) ? order.createdAt : null);
    if (!anchorRaw) return null;
    const anchor = new Date(anchorRaw);
    if (Number.isNaN(anchor.getTime())) return null;
    const end = anchor.getTime() + prepMin * 60 * 1000;
    return Math.max(0, end - nowMs);
  };

  const isOverdueScheduledOrder = (order: Order | null): boolean => {
    if (!order?.isScheduledOrder || !order?.scheduledDate) return false;
    const terminalStatuses = new Set(["DELIVERED", "PICKED_UP", "CANCELLED", "COMPLETED"]);
    if (terminalStatuses.has(String(order.status))) return false;
    return new Date(order.scheduledDate) < new Date();
  };

  const formatRemaining = (ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (isModifyDialogOpen) {
      isModifyDialogOpeningRef.current = false;
    }
  }, [isModifyDialogOpen]);

  useEffect(() => {
    loadOrders();
  }, [currentPage]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isDialogOpen) {
      // Save current overflow style
      const originalOverflow = document.body.style.overflow;
      // Lock body scroll
      document.body.style.overflow = "hidden";
      
      // Cleanup: restore original overflow when sheet closes
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isDialogOpen]);

  const isPaidLike = (o: Order | null | undefined) => {
    const s = String(o?.paymentStatus || "").toUpperCase();
    return s === "PAID" || s === "REFUNDED" || s === "PARTIALLY_REFUNDED";
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!isBillPreviewOpen) {
          setBillPreviewPayload(null);
          setBillPreviewError(null);
          setBillPreviewLoading(false);
          setBillPreviewSettings(null);
          return;
        }

        if (!selectedOrder?.id) {
          setBillPreviewError(t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." }));
          setBillPreviewPayload(null);
          return;
        }

        setBillPreviewLoading(true);
        setBillPreviewError(null);

        const token = (await getToken()) || undefined;
        const api = ApiService.getInstance();
        const res: any = await api.get(`/api/order/user/${selectedOrder.id}/receipt`, token);

        const data = (res as any)?.data?.data ?? (res as any)?.data ?? null;
        if (!data?.order) {
          throw new Error(t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." }));
        }

        const branchId = String((data.order as any)?.branchId || (data.order as any)?.branch?.id || "").trim();
        if (branchId) {
          SettingsService.getSettings(token, { branchId })
            .then((r) => (r as any)?.data?.data ?? (r as any)?.data ?? r)
            .then((s) => {
              if (!cancelled) setBillPreviewSettings(s);
            })
            .catch(() => {
              if (!cancelled) setBillPreviewSettings(null);
            });
        } else {
          setBillPreviewSettings(null);
        }

        if (cancelled) return;
        setBillPreviewPayload(data);
      } catch (e: any) {
        if (cancelled) return;
        setBillPreviewPayload(null);
        setBillPreviewError(e?.message || t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." }));
      } finally {
        if (!cancelled) setBillPreviewLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, isBillPreviewOpen, selectedOrder?.id, t]);

  // Fetch branches and main branch
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const allBranches = await branchService.getBranches();
        setBranches(allBranches);
        
        // Find main branch
        if (settings?.mainBranchId) {
          const main = allBranches.find(b => b.id === settings.mainBranchId);
          if (main) {
            setMainBranch(main);
          }
        }
      } catch (error) {
        console.error("Error fetching branches:", error);
      }
    };
    
    fetchBranches();
  }, [settings?.mainBranchId]);

  // Listen for order status changes to update the orders list (if user is on Orders page)
  // Note: Global notification handling (sound, OS notification, toast) is done in App.tsx
  useEffect(() => {
    const socketService = SocketService.getInstance();
    let isMounted = true;

    // Handle order status change for updating the orders list locally
    const handleOrderStatusChange = (data: {
      orderId: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      updatedAt: string;
    }) => {
      if (!isMounted) return;

      // Update order in the list if it exists
      setOrders((prev) =>
        prev.map((order) =>
          order.id === data.orderId
            ? {
                ...order,
                status: data.status,
                paymentStatus: data.paymentStatus,
                updatedAt: data.updatedAt,
              }
            : order
        )
      );

      // Update selectedOrder if it's the same order (for real-time progress bar update)
      setSelectedOrder((prev) => {
        if (prev && prev.id === data.orderId) {
          return {
            ...prev,
            status: data.status,
            paymentStatus: data.paymentStatus,
            updatedAt: data.updatedAt,
          };
        }
        return prev;
      });

      // Add to unseen status changes (for badge on order card)
      setUnseenStatusChangeOrderIds((prev) => {
        const newSet = new Set([...prev, data.orderId]);
        // Store in localStorage for tab badge
        localStorage.setItem(
          "unseenStatusChanges",
          JSON.stringify(Array.from(newSet))
        );
        return newSet;
      });
    };

    // Register listener for updating the orders list
    // The global notification (sound, OS notification) is handled in App.tsx
    socketService.on("order-status-changed", handleOrderStatusChange);

    // Cleanup
    return () => {
      isMounted = false;
      socketService.off("order-status-changed", handleOrderStatusChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark order status change as seen when viewing order details
  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
    // Remove from unseen status changes when viewing
    setUnseenStatusChangeOrderIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(order.id);
      // Update localStorage
      localStorage.setItem(
        "unseenStatusChanges",
        JSON.stringify(Array.from(newSet))
      );
      return newSet;
    });
  };

  // Load unseen status changes from localStorage on mount and request notification permission
  useEffect(() => {
    try {
      const stored = localStorage.getItem("unseenStatusChanges");
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setUnseenStatusChangeOrderIds(new Set(ids));
      }
    } catch (error) {
      console.error("Error loading unseen status changes:", error);
    }

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const loadOrders = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const result: OrdersResponse = await apiService.getUserOrders(
        token,
        currentPage,
        10
      );

      if (result.success) {
        setOrders(result.data.orders);
        setTotalPages(result.data.pagination.pages);
      } else {
        setError(t("orders.loadError"));
      }
    } catch (error) {
      console.error("Failed to load orders:", error);
      setError(t("orders.loadError"));
      toast.error(t("orders.loadError"));
    } finally {
      setLoading(false);
    }
  };

  // @ts-expect-error - Helper function available for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return <Icon path={mdiClock} size={0.67} />;
      case "confirmed":
        return <Icon path={mdiCheckCircle} size={0.67} />;
      case "preparing":
        return <Icon path={mdiPackageVariant} size={0.67} />;
      case "ready_for_delivery":
        return <Icon path={mdiClock} size={0.67} />;
      case "ready_for_pickup":
        return <Icon path={mdiClock} size={0.67} />;
      case "out_for_delivery":
        return <Icon path={mdiTruck} size={0.67} />;
      case "delivered":
        return <Icon path={mdiCheckCircle} size={0.67} />;
      case "picked_up":
        return <Icon path={mdiCheckCircle} size={0.67} />;
      case "cancelled":
        return <Icon path={mdiCloseCircle} size={0.67} />;
      default:
        return <Icon path={mdiClock} size={0.67} />;
    }
  };

  // @ts-expect-error - Helper function available for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "preparing":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "ready_for_delivery":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "ready_for_pickup":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "out_for_delivery":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "delivered":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "picked_up":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const formatStatus = (status: string) => {
    const statusKey = `orders.statuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status.replace("_", " ") });
    return translated !== statusKey ? translated : status.replace("_", " ");
  };

  const getStatusColorHex = (status: string): string => {
    const colors: Record<string, string> = {
      PENDING: "#f59e0b",
      CONFIRMED: "#3b82f6",
      PREPARING: "#f97316",
      OUT_FOR_DELIVERY: "#a855f7",
      READY_FOR_DELIVERY: "#a855f7",
      READY_FOR_PICKUP: "#a855f7",
      DELIVERED: "#10b981",
      PICKED_UP: "#10b981",
      CANCELLED: "#ef4444",
    };
    return colors[status] || "#9BA1A6";
  };

  const getPaymentStatusText = (paymentStatus: string): string => {
    const normalizedStatus = paymentStatus.toUpperCase().trim();
    const statusKey = normalizedStatus.toLowerCase();
    return t(`orders.paymentStatuses.${statusKey}`, {
      defaultValue: paymentStatus,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get branch name with fallback to main branch
  const getBranchName = (order: Order): string => {
    // If order has branch with name, use it
    if (order.branch?.name) {
      return order.branch.name;
    }
    
    // If order has branchId, try to find it in branches list
    if (order.branchId) {
      const branch = branches.find(b => b.id === order.branchId);
      if (branch?.name) {
        return branch.name;
      }
    }
    
    // Fallback to main branch name
    if (mainBranch?.name) {
      return mainBranch.name;
    }
    
    // Final fallback
    return "Main Branch";
  };

  // Helper function to get delivery progress percentage
  // Matches the calculation in DeliveryStatusBar component
  // With 6 steps (0-5): PENDING=0%, CONFIRMED=20%, PREPARING=40%, READY_FOR_DELIVERY=60%, OUT_FOR_DELIVERY=80%, DELIVERED=100%
  const getDeliveryProgress = (
    status: string,
    orderType: "DELIVERY" | "PICKUP" = "DELIVERY"
  ) => {
    const normalizedStatus = status.toUpperCase().trim();

    if (orderType === "PICKUP") {
      switch (normalizedStatus) {
        case "PENDING":
          return 0;
        case "CONFIRMED":
          return 25;
        case "PREPARING":
          return 50;
        case "READY_FOR_PICKUP":
          return 75;
        case "PICKED_UP":
          return 100;
        case "CANCELLED":
          return 0;
        default:
          return 0;
      }
    } else {
      switch (normalizedStatus) {
        case "PENDING":
          return 0;
        case "CONFIRMED":
          return 20;
        case "PREPARING":
          return 40;
        case "READY_FOR_DELIVERY":
          return 60;
        case "OUT_FOR_DELIVERY":
          return 80;
        case "DELIVERED":
          return 100;
        case "CANCELLED":
          return 0;
        default:
          return 0;
      }
    }
  };

  // handleViewOrder is now defined above in the useEffect

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setIsDialogOpen(false);
      // Use setTimeout to clear selected order after animation completes
      // This prevents flickering during close animation
      setTimeout(() => {
        setSelectedOrder(null);
      }, 300);
    } else {
      setIsDialogOpen(true);
    }
  };

  const getBranchForOrder = (order: Order): Branch | null => {
    const orderBranchId = (order as any)?.branchId || order.branch?.id;
    if (orderBranchId) {
      const found = branches.find((b) => b.id === orderBranchId);
      if (found) return found;
    }
    return mainBranch || null;
  };

  const getEffectiveBoolean = (
    branchValue: boolean | null | undefined,
    globalValue: boolean | null | undefined
  ): boolean => {
    return branchValue !== null && branchValue !== undefined
      ? Boolean(branchValue)
      : Boolean(globalValue);
  };

  const getEffectiveNumber = (
    branchValue: number | null | undefined,
    globalValue: number | null | undefined,
    fallback: number
  ): number => {
    if (branchValue !== null && branchValue !== undefined) return Number(branchValue);
    if (globalValue !== null && globalValue !== undefined) return Number(globalValue);
    return fallback;
  };

  const getEffectiveScheduledOrderManagement = (order: Order) => {
    const branch = getBranchForOrder(order);
    return {
      allowModification: getEffectiveBoolean(
        branch?.scheduledOrderAllowModification,
        settings?.scheduledOrderAllowModification
      ),
      allowShallowModification: getEffectiveBoolean(
        (branch as any)?.scheduledOrderAllowShallowModification,
        (settings as any)?.scheduledOrderAllowShallowModification
      ),
      modificationWindowHours: getEffectiveNumber(
        branch?.scheduledOrderModificationWindowHours,
        settings?.scheduledOrderModificationWindowHours,
        0
      ),
      allowCancellation: getEffectiveBoolean(
        branch?.scheduledOrderAllowCancellation,
        settings?.scheduledOrderAllowCancellation
      ),
      cancellationWindowHours: getEffectiveNumber(
        branch?.scheduledOrderCancellationWindowHours,
        settings?.scheduledOrderCancellationWindowHours,
        0
      ),
    };
  };

  const canModifyScheduledOrder = (order: Order): boolean => {
    if (!order.isScheduledOrder || !order.scheduledDate) return false;
    const effective = getEffectiveScheduledOrderManagement(order);
    if (!effective.allowModification) return false;
    if (order.status === "CANCELLED" || order.status === "DELIVERED") return false;

    const windowHours = Number(effective.modificationWindowHours || 0);
    if (windowHours <= 0) return true;

    const scheduled = new Date(order.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > windowHours;
  };

  const canCancelOrder = (order: Order): boolean => {
    if (order.isScheduledOrder && order.scheduledDate) {
      return canCancelScheduledOrder(order);
    }

    if (order.status === "CANCELLED" || order.status === "DELIVERED" || order.status === "PICKED_UP") {
      return false;
    }

    return true;
  };

  const canCancelScheduledOrder = (order: Order): boolean => {
    if (!order.isScheduledOrder || !order.scheduledDate) return false;
    const effective = getEffectiveScheduledOrderManagement(order);
    if (!effective.allowCancellation) return false;
    if (order.status === "CANCELLED" || order.status === "DELIVERED" || order.status === "PICKED_UP") return false;

    const windowHours = Number(effective.cancellationWindowHours || 0);
    if (windowHours <= 0) return true;

    const scheduled = new Date(order.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > windowHours;
  };

  const getRefundTimingMessage = (order: Order): string => {
    if (order.paymentMethod === "CASH_ON_DELIVERY" || order.paymentMethod === "CARD_ON_DELIVERY") {
      return t("orders.cancelScheduled.codRefund", {
        defaultValue: "No charge was made. The order will be cancelled.",
      });
    }

    const provider = (order as any)?.payment?.paymentProvider;
    if (provider === "PAYPAL") {
      return t("orders.cancelScheduled.paypalRefundTiming", {
        defaultValue: "PayPal refunds typically take 3–5 business days.",
      });
    }

    // Default to Stripe messaging for ONLINE_PAYMENT
    return t("orders.cancelScheduled.stripeRefundTiming", {
      defaultValue:
        "Stripe refunds typically take 5–7 business days (card) or 1–2 business days (bank).",
    });
  };

  const handleStartModify = (order: Order) => {
    setOrderToModify(order);
    isModifyDialogOpeningRef.current = true;
    setIsModifyDialogOpen(true);
  };

  const handleStartCancel = (order: Order) => {
    setOrderToCancel(order);
    setCancelReason("");
  };

  const canRescheduleScheduledOrder = (order: Order): boolean => {
    if (!order.isScheduledOrder || !order.scheduledDate) return false;
    const effective = getEffectiveScheduledOrderManagement(order);
    if (!effective.allowShallowModification) return false;
    if (order.status === "CANCELLED" || order.status === "DELIVERED") return false;

    const windowHours = Number(effective.modificationWindowHours || 0);
    if (windowHours <= 0) return true;

    const scheduled = new Date(order.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > windowHours;
  };

  const handleStartReschedule = (order: Order) => {
    setOrderToReschedule(order);
    if (order.scheduledDate) {
      const d = new Date(order.scheduledDate);
      setRescheduleScheduledDate(isNaN(d.getTime()) ? null : d);
    } else {
      setRescheduleScheduledDate(null);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!orderToReschedule) return;

    try {
      setIsRescheduling(true);
      const token = await getToken();
      if (!token) {
        toast.error(t("checkout.step2.authenticationRequired"));
        return;
      }

      const isAsap = rescheduleScheduledDate === null;
      if (!isAsap && !rescheduleScheduledDate) {
        toast.error(
          t("orders.reschedule.required", {
            defaultValue: "Please select a new date and time.",
          })
        );
        return;
      }

      const apiService = ApiService.getInstance();
      await apiService.rescheduleOrder(token, orderToReschedule.id, {
        scheduledDate: isAsap ? null : (rescheduleScheduledDate as Date).toISOString(),
        reason: "user_shallow_reschedule",
      });

      toast.success(
        t("orders.reschedule.success", {
          defaultValue: "Order rescheduled successfully.",
        })
      );

      setOrderToReschedule(null);
      setIsDialogOpen(false);
      await loadOrders();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("orders.reschedule.error", {
            defaultValue: "Failed to reschedule order",
          })
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;

    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      toast.error(
        t("orders.cancelScheduled.reasonRequired", {
          defaultValue: "Please provide a reason for cancellation.",
        })
      );
      return;
    }

    try {
      setIsCancelling(true);
      const token = await getToken();
      if (!token) {
        toast.error(t("checkout.step2.authenticationRequired"));
        return;
      }

      const apiService = ApiService.getInstance();
      await apiService.cancelOrder(token, orderToCancel.id, {
        cancelType: "USER_CANCEL",
        reason: trimmedReason,
      });

      toast.success(
        t("orders.cancelScheduled.success", {
          defaultValue: "Order cancelled successfully.",
        })
      );

      setOrderToCancel(null);
      setCancelReason("");
      setIsDialogOpen(false);
      await loadOrders();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("orders.cancelError", { defaultValue: "Failed to cancel order" })
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirmModify = async () => {
    if (!orderToModify) return;
    try {
      setIsModifying(true);
      const token = await getToken();
      if (!token) {
        toast.error(t("checkout.step2.authenticationRequired"));
        return;
      }

      const apiService = ApiService.getInstance();
      await apiService.cancelOrder(token, orderToModify.id, {
        cancelType: "MODIFICATION",
        reason: "user_modify_flow",
      });

      // Leave cart empty when entering order modification mode
      clearCart();

      try {
        sessionStorage.setItem("modifyingOrderId", orderToModify.id);
        const lockedBranchId =
          orderToModify.branchId || orderToModify.branch?.id || null;
        if (lockedBranchId) {
          sessionStorage.setItem("modifyingOrderBranchId", lockedBranchId);
        }
        sessionStorage.setItem(
          "modifyingOrderPrefill",
          JSON.stringify({
            replacesOrderId: orderToModify.id,
            prefillOrderType: orderToModify.orderType,
            prefillScheduledDate: orderToModify.scheduledDate || undefined,
            prefillDeliveryInfo: {
              address: orderToModify.deliveryAddress || "",
              building: orderToModify.deliveryBuilding || "",
              floor: orderToModify.deliveryFloor || "",
              apartment: orderToModify.deliveryApartment || "",
              extraDetails: orderToModify.deliveryExtraDetails || "",
              phone: orderToModify.deliveryPhone || "",
              notes: orderToModify.deliveryNotes || "",
            },
            prefillPickupInfo: {
              phone: orderToModify.pickupPhone || "",
              notes: orderToModify.pickupNotes || "",
            },
          })
        );

        window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderId" }));
        window.dispatchEvent(
          new StorageEvent("storage", { key: "modifyingOrderBranchId" })
        );
        window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderPrefill" }));
      } catch {
        // ignore storage failures
      }

      setIsModifyDialogOpen(false);
      setIsDialogOpen(false);

      navigate("/");
    } catch (e: any) {
      toast.error(e?.message || t("orders.cancelError", { defaultValue: "Failed to cancel order" }));
    } finally {
      setIsModifying(false);
    }
  };

  const orderDetailsSheet = (
      <Sheet open={isDialogOpen} onOpenChange={handleDialogClose}>
        <SheetContent 
          side="bottom" 
          className="max-h-[90vh] overflow-y-auto bg-[#151718] border-t border-[#262626] text-white p-0 rounded-t-3xl"
        >
          <div className="px-4 pb-6 pt-8">
            {selectedOrder && (
              <>
          {/* Modal Header */}
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold text-white text-left">
              {t("orders.orderNumber")} {selectedOrder.orderNumber}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6">
            {/* Status */}
            <div>
              <p className="text-[13px] text-[#9BA1A6] mb-2">{t("orders.status")}</p>
              <div className="flex items-center bg-[#262626] px-3 py-2 rounded-lg">
                <div 
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: getStatusColorHex(selectedOrder.status) }}
                />
                <span className="text-sm text-white font-medium">
                  {formatStatus(selectedOrder.status)}
                </span>
              </div>
            </div>

            {/* Bill Preview */}
            {isPaidLike(selectedOrder) ? (
              <div>
                <h3 className="text-lg font-bold text-white mt-4 mb-3">
                  {t("orders.billPreviewTitle", { defaultValue: "Bill" })}
                </h3>
                <Button
                  onClick={() => setIsBillPreviewOpen(true)}
                  className="w-full bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("orders.billPreview", { defaultValue: "View Bill" })}
                </Button>
              </div>
            ) : null}

            {/* Scheduled Date - Prominent Display for Scheduled Orders */}
            {selectedOrder.isScheduledOrder && selectedOrder.scheduledDate && (
              (() => {
                const isOverdue = isOverdueScheduledOrder(selectedOrder);
                return (
              <div className={`rounded-xl border p-4 ${
                isOverdue
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-purple-500/50 bg-purple-500/10"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    isOverdue
                      ? "bg-red-500/20"
                      : "bg-purple-500/20"
                  }`}>
                    <Icon 
                      path={isOverdue ? mdiAlertCircleOutline : mdiCalendarClock} 
                      size={0.9} 
                      className={isOverdue ? "text-red-400" : "text-purple-400"}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-medium uppercase ${
                      isOverdue ? "text-red-400" : "text-purple-400"
                    }`}>
                      {selectedOrder.orderType === "PICKUP"
                        ? t("admin.orderManagement.scheduled.pickupFor", { defaultValue: "Pickup Scheduled For" })
                        : t("admin.orderManagement.scheduled.deliveryFor", { defaultValue: "Delivery Scheduled For" })}
                    </span>
                    <span className={`text-base font-bold ${
                      isOverdue ? "text-red-300" : "text-purple-300"
                    }`}>
                      {new Date(selectedOrder.scheduledDate).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      {t("admin.orderManagement.scheduled.at", { defaultValue: "at" })}{" "}
                      {new Date(selectedOrder.scheduledDate).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
                );
              })()
            )}

            {/* Branch Name */}
            <div>
              <div className="flex items-center bg-[#262626] rounded-lg p-3 border border-[#333]">
                <Icon path={mdiMapMarker} size={0.67} className="text-[#ec4899] mr-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[#9BA1A6] mb-1">
                    {t("orders.servingBranch")}
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {getBranchName(selectedOrder)}
                  </p>
                </div>
              </div>
            </div>

            {/* Delivery/Pickup Details */}
            <div>
              <h3 className="text-lg font-bold text-white mt-4 mb-3">
                {selectedOrder.orderType === "PICKUP"
                  ? t("orders.pickupDetails", { defaultValue: "Pickup details" })
                  : t("orders.deliveryDetails", { defaultValue: "Delivery details" })}
              </h3>
              <div className="bg-[#1a1a1a] rounded-xl p-4">
                {selectedOrder.orderType === "PICKUP" ? (
                  <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-[15px] text-[#999]">
                        {t("orders.phone", { defaultValue: "Phone" })}:
                      </span>
                      <span className="text-[15px] text-white font-medium text-right break-words">
                        {selectedOrder.pickupPhone || "-"}
                      </span>
                    </div>
                    {selectedOrder.pickupNotes ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-[15px] text-[#999]">
                          {t("orders.notes", { defaultValue: "Notes" })}:
                        </span>
                        <span className="text-[15px] text-white font-medium text-right break-words">
                          {selectedOrder.pickupNotes}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-[15px] text-[#999]">
                        {t("orders.postalCode", { defaultValue: "Postal Code" })}:
                      </span>
                      <span className="text-[15px] text-white font-medium text-right break-words">
                        {(selectedOrder as any).deliveryPostalCode || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[15px] text-[#999]">
                        {t("orders.streetAddress", { defaultValue: "Street address" })}:
                      </span>
                      <span className="text-[15px] text-white font-medium text-right break-words">
                        {(selectedOrder as any).deliveryStreetAddress ||
                          selectedOrder.deliveryAddress ||
                          "-"}
                      </span>
                    </div>

                    {(() => {
                      const hasBuildingDetails =
                        !!selectedOrder.deliveryBuilding ||
                        !!selectedOrder.deliveryFloor ||
                        !!selectedOrder.deliveryApartment ||
                        !!selectedOrder.deliveryExtraDetails;

                      const houseNumber = (selectedOrder as any)
                        .deliveryHouseNumber as string | undefined;

                      return (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-[15px] text-[#999]">
                              {t("orders.houseNumber", { defaultValue: "House number" })}:
                            </span>
                            <span className="text-[15px] text-white font-medium text-right break-words">
                              {houseNumber || "-"}
                            </span>
                          </div>

                          {hasBuildingDetails ? (
                            <>
                              {selectedOrder.deliveryBuilding ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-[15px] text-[#999]">
                                    {t("orders.building", { defaultValue: "Building" })}:
                                  </span>
                                  <span className="text-[15px] text-white font-medium text-right break-words">
                                    {selectedOrder.deliveryBuilding}
                                  </span>
                                </div>
                              ) : null}
                              {selectedOrder.deliveryFloor ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-[15px] text-[#999]">
                                    {t("orders.floor", { defaultValue: "Floor" })}:
                                  </span>
                                  <span className="text-[15px] text-white font-medium text-right break-words">
                                    {selectedOrder.deliveryFloor}
                                  </span>
                                </div>
                              ) : null}
                              {selectedOrder.deliveryApartment ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-[15px] text-[#999]">
                                    {t("orders.apartment", { defaultValue: "Apartment/Unit" })}:
                                  </span>
                                  <span className="text-[15px] text-white font-medium text-right break-words">
                                    {selectedOrder.deliveryApartment}
                                  </span>
                                </div>
                              ) : null}
                              {selectedOrder.deliveryExtraDetails ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-[15px] text-[#999]">
                                    {t("orders.extraDetails", { defaultValue: "Extra Details" })}:
                                  </span>
                                  <span className="text-[15px] text-white font-medium text-right break-words">
                                    {selectedOrder.deliveryExtraDetails}
                                  </span>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      );
                    })()}

                    <div className="flex justify-between gap-4">
                      <span className="text-[15px] text-[#999]">
                        {t("orders.phone", { defaultValue: "Phone" })}:
                      </span>
                      <span className="text-[15px] text-white font-medium text-right break-words">
                        {selectedOrder.deliveryPhone || "-"}
                      </span>
                    </div>
                    {selectedOrder.deliveryNotes ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-[15px] text-[#999]">
                          {t("orders.notes", { defaultValue: "Notes" })}:
                        </span>
                        <span className="text-[15px] text-white font-medium text-right break-words">
                          {selectedOrder.deliveryNotes}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div>
              <h3 className="text-lg font-bold text-white mt-4 mb-3">
                {t("orders.orderItems")}
              </h3>
              <div className="space-y-2">
                {selectedOrder.orderItems
                  .filter((item: any) => item.itemType !== "DEAL_COMPONENT")
                  .map((item: any) => {
                    const isDeal = item.itemType === "DEAL" || item.deal;
                    const itemName = isDeal ? item.deal?.name : item.meal?.name;
                    const itemImage = isDeal ? item.deal?.image : item.meal?.image;
                    const dealChildItems = item.dealChildItems || [];

                    return (
                  <div
                    key={item.id}
                    className="flex bg-[#1a1a1a] rounded-xl p-3"
                  >
                    {itemImage && (
                      <img
                        src={
                          isExternalImage(itemImage)
                            ? itemImage
                            : getOptimizedImageUrl(itemImage)
                        }
                        alt={itemName || "Item"}
                        className="w-[60px] h-[60px] rounded-lg object-cover mr-3 bg-[#333] flex-shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/placeholder-meal.png";
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-[15px] font-semibold text-white flex-1 mr-2">
                          {itemName}
                        </h4>
                        <p className="text-[15px] font-semibold text-[#ec4899]">
                          {formatPrice(Number(item.totalPrice || 0), currency)}
                        </p>
                      </div>
                      {!isDeal && (
                        <p className="text-[13px] text-[#999] mb-1">
                          {t("checkout.step2.sizeQty", {
                            size: item.selectedSize,
                            quantity: item.quantity,
                            defaultValue: `Size: ${item.selectedSize} • Qty: ${item.quantity}`,
                          })}
                        </p>
                      )}
                      {isDeal && (
                        <p className="text-[13px] text-[#999] mb-1">
                          {t("orders.qty", { defaultValue: "Qty" })}: {item.quantity}
                        </p>
                      )}
                      <p className="text-[12px] text-[#999] mb-1">
                        @ {formatPrice(Number(item.unitPrice || 0), currency)}{" "}
                        {t("orders.perItem", { defaultValue: "per item" })}
                      </p>

                      {/* Deal Components */}
                      {isDeal && dealChildItems.length > 0 && (
                        <div className="mt-2 pl-2 border-l-2 border-[#ec4899]/30">
                          <p className="text-[12px] font-semibold text-[#9BA1A6] mb-1.5 uppercase tracking-wide">
                            {t("orders.dealComponents", { defaultValue: "Includes" })}:
                          </p>
                          <div className="space-y-1">
                            {dealChildItems.map((child: any) => (
                              <div key={child.id} className="flex justify-between items-center">
                                <span className="text-[12px] text-[#ccc]">
                                  {child.dealComponent?.name || "Component"} ×{child.quantity}
                                </span>
                                <span className="text-[12px] text-white">
                                  {formatPrice(Number(child.totalPrice || 0), currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add-ons */}
                      {item.orderItemAddOns && item.orderItemAddOns.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[13px] text-[#999] mb-1.5">
                            {t("orders.addons")}:
                          </p>
                          <div className="space-y-1.5">
                            {item.orderItemAddOns.map((addOn: any, index: number) => (
                              <div key={index} className="flex justify-between items-center">
                                <div className="bg-pink-500/20 border border-pink-500/30 px-2 py-1 rounded-md flex-1 mr-2">
                                  <span className="text-[12px] text-[#ec4899]">
                                    {addOn.addOnName}
                                    {addOn.quantity && addOn.quantity > 1 && (
                                      <span> ×{addOn.quantity}</span>
                                    )}
                                  </span>
                                </div>
                                <span className="text-[13px] text-white font-medium">
                                  {formatPrice(Number(addOn.addOnPrice || 0), currency)}
                                  {addOn.quantity && addOn.quantity > 1 && (
                                    <span className="text-[11px] text-[#999]">
                                      {" "}×{addOn.quantity}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Optional Ingredients - Only Included */}
                      {item.orderItemOptionalIngredients &&
                        item.orderItemOptionalIngredients.length > 0 && (
                          <div className="mt-2">
                            {(() => {
                              const included =
                                item.orderItemOptionalIngredients.filter(
                                  (ing: any) => ing.isIncluded
                                );

                              return (
                                <>
                                  {included.length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-[12px] font-semibold text-[#999] mb-1.5 uppercase tracking-wide">
                                        {t("mealCustomization.includedIngredients", {
                                          defaultValue: "Included ingredients",
                                        })}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {included.map((ing: any) => (
                                          <div
                                            key={ing.id}
                                            className="bg-green-500/20 border border-green-500/30 px-2 py-1 rounded-md"
                                          >
                                            <span className="text-[12px] text-white">
                                              {ing.ingredientName}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                      {/* Special Instructions */}
                      {item.specialInstructions && (
                        <p className="text-[12px] text-[#999] italic mt-1">
                          {t("checkout.step2.note", { defaultValue: "Note" })}: {item.specialInstructions}
                        </p>
                      )}

                      {/* Tax Breakdown */}
                      {(item.taxAmount !== undefined &&
                        Number(item.taxAmount || 0) > 0) ||
                      (item.orderItemAddOns &&
                        item.orderItemAddOns.some(
                          (a: any) =>
                            a.taxAmount !== undefined &&
                            Number(a.taxAmount || 0) > 0
                        )) ? (
                        <div className="mt-3 pt-3 border-t border-[#333]">
                          <p className="text-[12px] font-semibold text-[#9BA1A6] mb-2">
                            {t("orders.taxBreakdown")}:
                          </p>
                          <div className="space-y-1">
                            {isDeal ? (
                              (dealChildItems || []).map((child: any) => {
                                const taxAmount = Number(child.taxAmount || 0);
                                const taxPctRaw =
                                  child.taxPercentage ??
                                  child.dealComponent?.effectiveTaxPercentage ??
                                  child.dealComponent?.taxPercentage;
                                const taxPercentage =
                                  taxPctRaw !== null && taxPctRaw !== undefined
                                    ? Number(taxPctRaw)
                                    : null;

                                if (!(taxAmount > 0)) return null;

                                return (
                                  <div key={child.id} className="flex justify-between items-center">
                                    <span className="text-[12px] text-[#9BA1A6]">
                                      {child.dealComponent?.name || "Component"}
                                      {child.quantity ? ` ×${child.quantity}` : ""}
                                      {taxPercentage !== null ? ` (${taxPercentage}%)` : ""}:
                                    </span>
                                    <span className="text-[12px] text-white font-medium">
                                      {formatPrice(taxAmount, currency)}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              item.taxAmount !== undefined &&
                              Number(item.taxAmount || 0) > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-[12px] text-[#9BA1A6]">
                                    {t("orders.meal")}
                                    {item.taxPercentage
                                      ? ` (${Number(item.taxPercentage)}%)`
                                      : ""}
                                    :
                                  </span>
                                  <span className="text-[12px] text-white font-medium">
                                    {formatPrice(Number(item.taxAmount || 0), currency)}
                                  </span>
                                </div>
                              )
                            )}
                            {item.orderItemAddOns &&
                              item.orderItemAddOns
                                .filter(
                                  (a: any) =>
                                    a.taxAmount !== undefined &&
                                    Number(a.taxAmount || 0) > 0
                                )
                                .map((addon: any, idx: number, array: any[]) => (
                                  <div
                                    key={addon.id}
                                    className={`flex justify-between items-center ${idx === array.length - 1 ? "" : ""}`}
                                  >
                                    <span className="text-[12px] text-[#9BA1A6]">
                                      + {addon.addOnName}
                                      {addon.taxPercentage
                                        ? ` (${Number(addon.taxPercentage)}%)`
                                        : ""}
                                      :
                                    </span>
                                    <span className="text-[12px] text-white font-medium">
                                      {formatPrice(Number(addon.taxAmount || 0), currency)}
                                    </span>
                                  </div>
                                ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                    );
                  })}
              </div>
            </div>

            {/* Order Summary */}
            <div>
              <h3 className="text-lg font-bold text-white mt-4 mb-3">
                {t("orders.orderSummary")}
              </h3>
              <div className="bg-[#1a1a1a] rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-[15px] text-[#999]">
                    {t("orders.subtotal")}:
                  </span>
                  <span className="text-[15px] text-white font-medium">
                    {formatPrice(
                      Number(selectedOrder.totalAmount) -
                        Number(selectedOrder.deliveryFee) -
                        Number(selectedOrder.taxAmount),
                      currency
                    )}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-[15px] text-[#999]">
                    {t("orders.deliveryFee")}:
                  </span>
                  <span className="text-[15px] text-white font-medium">
                    {formatPrice(Number(selectedOrder.deliveryFee), currency)}
                  </span>
                </div>
                {selectedOrder.orderType === "PICKUP" &&
                  selectedOrder.takeawayServiceFee !== undefined &&
                  selectedOrder.takeawayServiceFee !== null &&
                  Number(selectedOrder.takeawayServiceFee) > 0 && (
                    <div className="flex justify-between mb-2">
                      <span className="text-[15px] text-[#999]">
                        {t("orders.takeawayServiceFee", {
                          defaultValue: "Takeaway service fee",
                        })}
                        :
                      </span>
                      <span className="text-[15px] text-white font-medium">
                        {formatPrice(
                          Number(selectedOrder.takeawayServiceFee),
                          currency
                        )}
                      </span>
                    </div>
                  )}
                {selectedOrder.orderType === "PICKUP" &&
                  selectedOrder.takeawayServiceTaxAmount !== undefined &&
                  Number(selectedOrder.takeawayServiceTaxAmount) > 0 &&
                  // Only show separately when pricing is not tax-inclusive
                  !((selectedOrder as any).taxInclusive ?? settings?.taxInclusive ?? false) && (
                    <div className="flex justify-between ml-4 mb-1">
                      <span className="text-[12px] text-[#999]">
                        • {t("orders.takeawayServiceTax", { defaultValue: "Takeaway service tax" })}
                      </span>
                      <span className="text-[12px] text-white font-medium">
                        {formatPrice(Number(selectedOrder.takeawayServiceTaxAmount), currency)}
                      </span>
                    </div>
                  )}
                {selectedOrder.deliveryTaxAmount !== undefined &&
                  Number(selectedOrder.deliveryTaxAmount) > 0 && (
                    <div className="flex justify-between ml-4 mb-1">
                      <span className="text-[12px] text-[#999]">
                        • {t("orders.deliveryTax")}
                      </span>
                      <span className="text-[12px] text-white font-medium">
                        {formatPrice(Number(selectedOrder.deliveryTaxAmount), currency)}
                      </span>
                    </div>
                  )}
                <div className="flex justify-between mb-2">
                  <span className="text-[15px] text-[#999]">
                    {t("orders.tax")}:
                  </span>
                  <span className="text-[15px] text-white font-medium">
                    {formatPrice(Number(selectedOrder.taxAmount), currency)}
                  </span>
                </div>
                {(selectedOrder.itemTaxAmount !== undefined ||
                  selectedOrder.addonTaxAmount !== undefined) && (
                  <>
                    {selectedOrder.itemTaxAmount !== undefined && (
                      <div className="flex justify-between ml-4 mb-1">
                        <span className="text-[12px] text-[#999]">
                          • {t("orders.itemTax")}
                        </span>
                        <span className="text-[12px] text-white font-medium">
                          {formatPrice(Number(selectedOrder.itemTaxAmount || 0), currency)}
                        </span>
                      </div>
                    )}
                    {selectedOrder.addonTaxAmount !== undefined && (
                      <div className="flex justify-between ml-4 mb-1">
                        <span className="text-[12px] text-[#999]">
                          • {t("orders.addonTax")}
                        </span>
                        <span className="text-[12px] text-white font-medium">
                          {formatPrice(Number(selectedOrder.addonTaxAmount || 0), currency)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between mt-3 pt-3 border-t border-[#333]">
                  <span className="text-lg font-bold text-white">
                    {t("orders.total")}:
                  </span>
                  <span className="text-xl font-bold text-[#ec4899]">
                    {formatPrice(Number(selectedOrder.totalAmount), currency)}
                  </span>
                </div>
                {!selectedOrder.isScheduledOrder &&
                  (() => {
                    const remaining = getRemainingPrepMs(selectedOrder);
                    if (remaining === null) return null;
                    return (
                      <div className="flex justify-between mt-2">
                        <span className="text-sm text-[#999]">
                          {t("admin.orderManagement.preparationTimeRemaining", {
                            defaultValue: "Preparation time remaining",
                          })}:
                        </span>
                        <span className="text-sm font-semibold text-purple-400">
                          {formatRemaining(remaining)}
                        </span>
                      </div>
                    );
                  })()}
              </div>
            </div>

            {/* Payment Info */}
            <div>
              <h3 className="text-lg font-bold text-white mt-4 mb-3">
                {t("orders.paymentInformation")}
              </h3>
              <div className="bg-[#1a1a1a] rounded-xl p-4">
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-[#999]">
                    {t("orders.paymentStatus")}:
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      selectedOrder.paymentStatus === "PAID"
                        ? "text-[#10b981]"
                        : "text-[#ef4444]"
                    }`}
                  >
                    {getPaymentStatusText(selectedOrder.paymentStatus)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#999]">
                    {t("orders.paymentMethod")}:
                  </span>
                  <span className="text-sm text-white font-medium">
                    {selectedOrder.paymentMethod === "CASH_ON_DELIVERY"
                      ? t("orders.cashOnDelivery", { defaultValue: "Cash on Delivery" })
                      : t("orders.onlinePayment", { defaultValue: "Online Payment" })}
                  </span>
                </div>
              </div>
            </div>

            {isModifyFlowEnabled && selectedOrder && canModifyScheduledOrder(selectedOrder) && (
              <div>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleStartModify(selectedOrder);
                  }}
                  className="w-full bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("orders.modify", { defaultValue: "Modify Order" })}
                </Button>
              </div>
            )}

            {selectedOrder && canRescheduleScheduledOrder(selectedOrder) && (
              <div>
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleStartReschedule(selectedOrder);
                  }}
                  className="w-full"
                >
                  {t("orders.reschedule.button", { defaultValue: "Reschedule" })}
                </Button>
              </div>
            )}

            {selectedOrder && canCancelOrder(selectedOrder) && (
              <div>
                <Button
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleStartCancel(selectedOrder);
                  }}
                  className="w-full"
                >
                  {t("orders.cancelScheduled.button", { defaultValue: "Cancel Order" })}
                </Button>
              </div>
            )}
          </div>
              </>
        )}
          </div>
        </SheetContent>
      </Sheet>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("orders.loading")}
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("orders.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("orders.loadingDescription")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <Card>
          <CardContent className="text-center py-8">
            <Icon path={mdiCloseCircle} size={2.00} className="mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("orders.loadErrorTitle")}
            </h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button
              onClick={loadOrders}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("orders.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">

      {orders.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Icon path={mdiPackageVariant} size={2.67} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {t("orders.noOrders")}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t("orders.noOrdersDescription")}
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("orders.browseMenu")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div 
              key={order.id} 
              onClick={() => handleViewOrder(order)}
              className="cursor-pointer"
            >
            <Card className={`hover:shadow-lg transition-shadow ${order.status === "CANCELLED" ? "border-red-500/50 bg-red-50/5 opacity-75" : ""}`}>
              <CardContent className="p-4">
                {/* Header Row: Order ID/Date on left, Price/Badge on right */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-foreground mb-2">
                      #{order.orderNumber.length > 10 
                        ? `${order.orderNumber.substring(0, 10)}...` 
                        : order.orderNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="text-base font-bold text-foreground">
                      {formatPrice(Number(order.totalAmount), currency)}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0.5 ${
                        order.orderType === "PICKUP"
                          ? "border-pink-500 text-pink-500 bg-pink-500/10"
                          : "border-blue-500 text-blue-500 bg-blue-500/10"
                      }`}
                    >
                      {order.orderType === "PICKUP"
                        ? t("admin.orderManagement.orderTypes.pickup", {
                            defaultValue: "Pickup",
                          })
                        : t("admin.orderManagement.orderTypes.delivery", {
                            defaultValue: "Delivery",
                          })}
                    </Badge>
                    {/* Scheduled Order Badge */}
                    {order.isScheduledOrder && (
                      (() => {
                        const isOverdue = isOverdueScheduledOrder(order);
                        return (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 flex items-center gap-1 ${
                          isOverdue
                            ? "border-red-500 text-red-500 bg-red-500/10"
                            : "border-purple-500 text-purple-500 bg-purple-500/10"
                        }`}
                      >
                        <Icon 
                          path={isOverdue ? mdiAlertCircleOutline : mdiCalendarClock} 
                          size={0.4} 
                        />
                        {isOverdue
                          ? t("admin.orderManagement.scheduled.overdue", { defaultValue: "Overdue" })
                          : t("admin.orderManagement.scheduled.label", { defaultValue: "Scheduled" })}
                      </Badge>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* Scheduled Date Display */}
                {order.isScheduledOrder && order.scheduledDate && (
                  (() => {
                    const isOverdue = isOverdueScheduledOrder(order);
                    return (
                  <div className={`rounded-md border p-2 mb-3 ${
                    isOverdue
                      ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                      : "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                  }`}>
                    <div className="flex items-center gap-2">
                      <Icon 
                        path={isOverdue ? mdiAlertCircleOutline : mdiCalendarClock} 
                        size={0.6} 
                        className={isOverdue ? "text-red-600" : "text-purple-600"}
                      />
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-medium uppercase ${
                          isOverdue ? "text-red-600" : "text-purple-600"
                        }`}>
                          {order.orderType === "PICKUP"
                            ? t("admin.orderManagement.scheduled.pickupFor", { defaultValue: "Pickup Scheduled For" })
                            : t("admin.orderManagement.scheduled.deliveryFor", { defaultValue: "Delivery Scheduled For" })}
                        </span>
                        <span className={`text-sm font-semibold ${
                          isOverdue ? "text-red-700 dark:text-red-400" : "text-purple-700 dark:text-purple-400"
                        }`}>
                          {new Date(order.scheduledDate).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          {t("admin.orderManagement.scheduled.at", { defaultValue: "at" })}{" "}
                          {new Date(order.scheduledDate).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                )}

                {/* Items Preview Row */}
                <div className="flex items-center justify-between mb-3">
                  {/* Item Avatars */}
                  <div className="flex items-center -space-x-2">
                    {order.orderItems
                      .filter((item: any) => item.itemType !== "DEAL_COMPONENT")
                      .slice(0, 3)
                      .map((item: any) => {
                        const isDeal = item.itemType === "DEAL" || item.deal;
                        const itemImage = isDeal ? item.deal?.image : item.meal?.image;
                        const itemName = isDeal ? item.deal?.name : item.meal?.name;

                        return (
                      <div key={item.id} className="relative">
                        {itemImage ? (
                          <img
                            src={
                              isExternalImage(itemImage)
                                ? itemImage
                                : getOptimizedImageUrl(itemImage)
                            }
                            alt={itemName || "Item"}
                            className="w-10 h-10 rounded-full object-cover border-2 border-background"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "/placeholder-meal.png";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                            <Icon path={mdiPackageVariant} size={0.83} className="text-muted-foreground" />
                          </div>
                        )}
                        {item.quantity > 1 && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                            {item.quantity}
                          </div>
                        )}
                      </div>
                        );
                      })}
                    {order.orderItems.length > 3 && (
                      <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                        <span className="text-xs font-medium text-muted-foreground">
                          +{order.orderItems.length - 3}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Unseen status change badge */}
                  {unseenStatusChangeOrderIds.has(order.id) && (
                    <Icon path={mdiBell} size={0.67} className="text-orange-500 animate-pulse" />
                  )}
                </div>

                {/* Delivery/Pickup Progress Bar or Cancelled Status */}
                <div className="mt-3">
                  {order.status === "CANCELLED" ? (
                    <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-red-500/10 border border-red-500/30">
                      <Icon path={mdiCloseCircle} size={0.67} className="text-red-500" />
                      <span className="text-sm font-semibold text-red-500">
                        {t("orders.statusLabels.cancelled", { defaultValue: "Order Cancelled" })}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted-foreground">
                          {t("orders.deliveryProgress", {
                            defaultValue: "Delivery Progress",
                          })}
                        </span>
                        <span 
                          className="text-xs font-medium"
                          style={{ color: getStatusColorHex(order.status) }}
                        >
                          {getDeliveryProgress(order.status, order.orderType)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${getDeliveryProgress(order.status, order.orderType)}%`,
                            backgroundColor: getStatusColorHex(order.status),
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="border-border text-foreground hover:bg-muted"
              >
                {t("common.previous")}
              </Button>
              <span className="flex items-center px-4 text-muted-foreground">
                {t("orders.page", { current: currentPage, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="border-border text-foreground hover:bg-muted"
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Order Details Dialog */}
      {orderDetailsSheet}

      <Dialog open={isBillPreviewOpen} onOpenChange={setIsBillPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("orders.billPreviewTitle", { defaultValue: "Bill Preview" })}
            </DialogTitle>
          </DialogHeader>

          {billPreviewLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              {t("common.loading", { defaultValue: "Loading..." })}
            </div>
          ) : billPreviewError ? (
            <div className="py-6 text-red-400">{billPreviewError}</div>
          ) : billPreviewPayload?.order ? (
            <ReceiptPreview
              order={billPreviewPayload.order}
              settings={billPreviewSettings || settings}
              branchDetails={(billPreviewPayload.order as any)?.branch || null}
              fiskalySignaturePayload={billPreviewPayload?.fiskaly?.signaturePayload || null}
              fiskalyCorrections={billPreviewPayload?.fiskalyCorrections || []}
              showPrint
              onClose={() => setIsBillPreviewOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isModifyDialogOpen}
        onOpenChange={(open) => {
          if (isModifying) return;
          setIsModifyDialogOpen(open);
          if (!open) {
            setOrderToModify(null);
          }
        }}
      >
        <DialogContent className="bg-[#151718] border border-[#262626] text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("orders.modifyTitle", { defaultValue: "Modify scheduled order" })}
            </DialogTitle>
            <DialogDescription>
              {t("orders.modifyDescription", {
                defaultValue:
                  "To modify this scheduled order, we will cancel the current order. If you paid online, your payment will be refunded automatically (based on the cancellation policy). Then you can place a new order with your changes.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsModifyDialogOpen(false)}
              disabled={isModifying}
              className="border border-[#404040] text-[#9CA3AF] bg-transparent hover:bg-[#1a1a1a]"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleConfirmModify}
              disabled={isModifying}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {isModifying
                ? t("orders.modifying", { defaultValue: "Processing..." })
                : t("orders.confirmModify", { defaultValue: "Cancel & Continue" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(orderToCancel)}
        onOpenChange={(open) => {
          if (!open && !isCancelling) {
            setOrderToCancel(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="bg-[#151718] border border-[#262626] text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {orderToCancel?.isScheduledOrder && orderToCancel?.scheduledDate
                ? t("orders.cancelScheduled.titleScheduled", {
                    defaultValue: "Cancel scheduled order",
                  })
                : t("orders.cancelScheduled.titleAsap", {
                    defaultValue: "Cancel order",
                  })}
            </DialogTitle>
            <DialogDescription>
              {orderToCancel?.isScheduledOrder && orderToCancel?.scheduledDate
                ? t("orders.cancelScheduled.descriptionScheduled", {
                    defaultValue: "Are you sure you want to cancel this scheduled order?",
                  })
                : t("orders.cancelScheduled.descriptionAsap", {
                    defaultValue: "Are you sure you want to cancel this order?",
                  })}
            </DialogDescription>
          </DialogHeader>

          {orderToCancel && (
            <div className="text-sm text-[#9BA1A6] space-y-2">
              <div className="space-y-2">
                <div className="text-white font-medium">
                  {t("orders.cancelScheduled.reasonLabel", {
                    defaultValue: "Reason for cancellation",
                  })}
                </div>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t("orders.cancelScheduled.reasonPlaceholder", {
                    defaultValue: "Please tell us why you are cancelling...",
                  })}
                  className="bg-[#0f1112] border border-[#262626] text-white placeholder:text-[#6b7280]"
                />
                <div className="text-xs text-[#6b7280]">
                  {t("orders.cancelScheduled.reasonRequiredHint", {
                    defaultValue: "This field is required.",
                  })}
                </div>
              </div>
              <div>
                <span className="text-white font-medium">
                  {t("orders.cancelScheduled.refundTimingLabel", {
                    defaultValue: "Refund timing",
                  })}
                </span>
                <div>{getRefundTimingMessage(orderToCancel)}</div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOrderToCancel(null);
                setCancelReason("");
              }}
              disabled={isCancelling}
              className="border border-[#404040] text-[#9CA3AF] bg-transparent hover:bg-[#1a1a1a]"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={isCancelling || !cancelReason.trim()}
            >
              {isCancelling
                ? t("orders.cancelScheduled.cancelling", {
                    defaultValue: "Cancelling...",
                  })
                : t("orders.cancelScheduled.confirm", {
                    defaultValue: "Confirm cancel",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(orderToReschedule)}
        onOpenChange={(open) => {
          if (!open && !isRescheduling) setOrderToReschedule(null);
        }}
      >
        <DialogContent className="bg-[#151718] border border-[#262626] text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("orders.reschedule.title", {
                defaultValue: "Reschedule order",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("orders.reschedule.description", {
                defaultValue: "Select a new date and time for this order.",
              })}
            </DialogDescription>
          </DialogHeader>

          {orderToReschedule && (() => {
            const branch = getBranchForOrder(orderToReschedule);
            const masterFutureOrdersEnabled =
              (branch as any)?.futureOrdersEnabled ?? settings?.futureOrdersEnabled ?? false;
            const perTypeFutureEnabled =
              orderToReschedule.orderType === "PICKUP"
                ? ((branch as any)?.enableFuturePickupOrders ?? settings?.enableFuturePickupOrders ?? false)
                : ((branch as any)?.enableFutureDeliveryOrders ?? settings?.enableFutureDeliveryOrders ?? false);
            const isFutureOrderEnabled = masterFutureOrdersEnabled && perTypeFutureEnabled;
            const futureOrderMaxDays =
              orderToReschedule.orderType === "PICKUP"
                ? (branch?.futurePickupOrderDays ?? settings?.futurePickupOrderDays ?? 0)
                : (branch?.futureDeliveryOrderDays ?? settings?.futureDeliveryOrderDays ?? 0);
            const timeSlotIntervalMinutes =
              branch?.scheduledOrderTimeSlotInterval ??
              settings?.scheduledOrderTimeSlotInterval ??
              30;
            const branchIdForPicker = (orderToReschedule as any)?.branchId || orderToReschedule.branch?.id || branch?.id;

            return (
              <div className="rounded-xl border border-[#262626] bg-[#1a1a1a] p-4">
                <ScheduledOrderPicker
                  orderType={orderToReschedule.orderType}
                  isEnabled={isFutureOrderEnabled}
                  maxDays={futureOrderMaxDays}
                  timeSlotIntervalMinutes={timeSlotIntervalMinutes}
                  scheduledDate={rescheduleScheduledDate}
                  onScheduledDateChange={(date) => setRescheduleScheduledDate(date)}
                  branchId={branchIdForPicker}
                />
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOrderToReschedule(null)}
              disabled={isRescheduling}
              className="border border-[#404040] text-[#9CA3AF] bg-transparent hover:bg-[#1a1a1a]"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={isRescheduling}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {isRescheduling
                ? t("orders.reschedule.saving", {
                    defaultValue: "Saving...",
                  })
                : t("orders.reschedule.confirm", {
                    defaultValue: "Confirm reschedule",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default Orders;
