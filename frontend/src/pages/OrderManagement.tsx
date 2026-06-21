import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import {
  mdiAccount,
  mdiAlertCircle,
  mdiBluetooth,
  mdiCalendar,
  mdiCheckCircle,
  mdiCellphone,
  mdiChevronLeft,
  mdiChevronRight,
  mdiCloseCircle,
  mdiClock,
  mdiCreditCard,
  mdiCurrencyUsd,
  mdiDotsVertical,
  mdiEye,
  mdiLoading,
  mdiLock,
  mdiMagnify,
  mdiOfficeBuilding,
  mdiPackageVariant,
  mdiPencil,
  mdiPrinter,
  mdiReceipt,
  mdiRefresh,
  mdiSort,
} from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { DatePicker } from "@/components/ui/date-picker";
import { ReceiptPreview } from "@/components/receipt/ReceiptPreview";
import ApiService from "@/services/apiService";
import {
  orderService,
  type Order,
  type OrderUpdateData,
} from "@/services/orderService";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import {
  refundService,
  type RefundType,
  type RefundItem,
  type CreateRefundRequest,
} from "@/services/refundService";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { notificationService } from "@/services/notificationService";
import type { NotificationItem } from "@/services/notificationService";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { useTranslation } from "react-i18next";
import branchService, { type Branch } from "@/services/branchService";
import PickupLocationDisplay from "@/components/PickupLocationDisplay";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import { toast } from "sonner";
import { SettingsService, type Settings } from "@/services/settingsService";

const OrderManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { currency, settings } = useSettings();
  const { subscribe } = useAdminWebSocket();
  const { t } = useTranslation();
  const { assignedBranchIds, can, isBranchAdmin, isSuperAdmin } = usePermissions();

  const selectedOrganizationId = useMemo(() => {
    try {
      return (window.localStorage.getItem("bellami:selectedOrganizationId") || "").trim();
    } catch {
      return "";
    }
  }, []);

  const [openOrderMenuId, setOpenOrderMenuId] = useState<string | null>(null);

  const canCancelOrders = can(RESOURCES.ORDERS, ACTIONS.CANCEL);
  const canEditOrders =
    can(RESOURCES.ORDERS, ACTIONS.UPDATE) ||
    can(RESOURCES.ORDERS, ACTIONS.UPDATE_STATUS);
  const canRefundOrders = can(RESOURCES.ORDERS, ACTIONS.REFUND);

  const formatStatus = (status: string) => {
    const statusKey = `admin.orderManagement.statuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status.replace("_", " ") });
    return translated !== statusKey ? translated : status.replace("_", " ");
  };

  const isClosedOrder = (order: Order) => order.businessDaySession?.status === "CLOSED";

  const formatPaymentStatus = (status: string) => {
    const statusKey = `admin.orderManagement.paymentStatuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status.replace("_", " ") });
    return translated !== statusKey ? translated : status.replace("_", " ");
  };

  const formatPaymentMethod = (method: string) => {
    const methodKey = `admin.orderManagement.paymentMethods.${method
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(methodKey, { defaultValue: method.replace("_", " ") });
    return translated !== methodKey ? translated : method.replace("_", " ");
  };

  const getRefundedByLabel = (order: Order): string | null => {
    if (order.paymentStatus !== "REFUNDED" && order.paymentStatus !== "PARTIALLY_REFUNDED") {
      return null;
    }

    const succeededRefunds = (order.refunds || []).filter((r) => r.status === "SUCCEEDED");
    if (succeededRefunds.length === 0) return null;

    const latestSucceededRefund = succeededRefunds
      .slice()
      .sort((a, b) => {
        const aTime = new Date((a.refundedAt || a.createdAt) as any).getTime();
        const bTime = new Date((b.refundedAt || b.createdAt) as any).getTime();
        return bTime - aTime;
      })[0];

    const refundedBy = latestSucceededRefund?.refundedBy;
    if (!refundedBy) return null;
    if (refundedBy === "system") return t("admin.orderManagement.refundedBy.system", { defaultValue: "System" });

    const orderUserId = order.user?.id || order.userId;
    if (orderUserId && refundedBy === orderUserId) {
      return t("admin.orderManagement.refundedBy.customer", { defaultValue: "Customer" });
    }

    return t("admin.orderManagement.refundedBy.staff", { defaultValue: "Staff" });
  };

  const getRemainingPrepMs = (order: Order): number | null => {
    const prepMin = order.preparationTime != null ? Number(order.preparationTime) : NaN;
    if (!Number.isFinite(prepMin) || prepMin <= 0) return null;
    if (!order.confirmedAt) return null;
    const anchor = new Date(order.confirmedAt);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const highlightOrderId = searchParams.get("highlightOrder");
  const branchIdFromUrl = searchParams.get("branchId");
  const orderCardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [queueCounts, setQueueCounts] = useState<{ asap: number; scheduled: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPaymentStatus, setSelectedPaymentStatus] =
    useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [selectedOrderType, setSelectedOrderType] = useState<
    "" | "DELIVERY" | "PICKUP"
  >("");
  const [activeQueueTab, setActiveQueueTab] = useState<"asap" | "scheduled">(
    "asap"
  );
  const [asapBusinessDayStatus, setAsapBusinessDayStatus] = useState<
    "OPEN" | "CLOSED" | ""
  >("");
  const [scheduledBusinessDayStatus, setScheduledBusinessDayStatus] = useState<
    "OPEN" | "CLOSED" | ""
  >("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState<
    "createdAt" | "totalAmount" | "orderNumber"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showUpcomingScheduledOrders, setShowUpcomingScheduledOrders] = useState(false);
  const [upcomingScheduledCount, setUpcomingScheduledCount] = useState<number>(0);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedBranchForCurrency = useMemo(() => {
    if (!selectedBranchId) return null;
    return branches.find((b) => b.id === selectedBranchId) || null;
  }, [branches, selectedBranchId]);

  const displayCurrency = useMemo(() => {
    const branchCurrency = (selectedBranchForCurrency as any)?.currency;
    return (
      (typeof branchCurrency === "string" && branchCurrency.trim()) ||
      (typeof (settings as any)?.currency === "string" && String((settings as any).currency).trim()) ||
      (typeof currency === "string" && currency.trim()) ||
      "USD"
    );
  }, [currency, selectedBranchForCurrency, settings]);

  const handleSort = (field: "createdAt" | "totalAmount" | "orderNumber") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" ? "desc" : field === "orderNumber" ? "asc" : "asc");
    }
    setCurrentPage(1);
  };
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isBillPreviewOpen, setIsBillPreviewOpen] = useState(false);
  const [billPreviewSettings, setBillPreviewSettings] = useState<Settings | null>(null);
  const [billPreviewLoading, setBillPreviewLoading] = useState(false);
  const [billPreviewError, setBillPreviewError] = useState<string | null>(null);
  const [billPreviewPayload, setBillPreviewPayload] = useState<any | null>(null);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<OrderUpdateData>({});
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [refundFormData, setRefundFormData] = useState<{
    refundType: RefundType;
    amount?: number;
    items: RefundItem[];
    reason?: string;
  }>({
    refundType: "FULL",
    items: [],
  });
  const [orderRefunds, setOrderRefunds] = useState<any[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [unseenNotificationOrderIds, setUnseenNotificationOrderIds] = useState<
    Set<string>
  >(new Set());
  const searchingForOrderRef = useRef<string | null>(null);
  const suppressHighlightOpenRef = useRef(false);
  const lastOpenedHighlightOrderRef = useRef<string | null>(null);
  const highlightDialogOpenedAtRef = useRef<number>(0);

  // Define getAllowedStatuses before it's used
  const getAllowedStatuses = (orderType: Order["orderType"]) => {
    const baseStatuses: Order["status"][] = ["PENDING", "CONFIRMED", "PREPARING"];
    const pickupStatuses: Order["status"][] = ["READY_FOR_PICKUP", "PICKED_UP"];
    const deliveryStatuses: Order["status"][] = [
      "READY_FOR_DELIVERY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];
    return [
      ...baseStatuses,
      ...(orderType === "PICKUP" ? pickupStatuses : deliveryStatuses),
      "CANCELLED",
    ];
  };
  
  const allStatusesForFilter: Order["status"][] = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PICKED_UP",
    "CANCELLED",
  ];
  const statusFilterOptions = selectedOrderType
    ? getAllowedStatuses(selectedOrderType)
    : allStatusesForFilter;

  // Determine if tax is inclusive based on selected branch or settings
  // Branch setting takes precedence over global settings
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const filteredBranches = useMemo(() => {
    return branches;
  }, [branches]);

  const getEffectiveBoolean = (
    branchValue: boolean | null | undefined,
    globalValue: boolean | null | undefined
  ): boolean => {
    if (branchValue !== null && branchValue !== undefined) return Boolean(branchValue);
    if (globalValue !== null && globalValue !== undefined) return Boolean(globalValue);
    return false;
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

  const futureOrdersEnabledEffective = getEffectiveBoolean(
    (selectedBranch as any)?.futureOrdersEnabled,
    (settings as any)?.futureOrdersEnabled
  );
  const futurePickupEnabledEffective =
    futureOrdersEnabledEffective &&
    getEffectiveBoolean(
      (selectedBranch as any)?.enableFuturePickupOrders,
      (settings as any)?.enableFuturePickupOrders
    );
  const futureDeliveryEnabledEffective =
    futureOrdersEnabledEffective &&
    getEffectiveBoolean(
      (selectedBranch as any)?.enableFutureDeliveryOrders,
      (settings as any)?.enableFutureDeliveryOrders
    );

  const shouldShowFutureTabs =
    Boolean(selectedBranchId) &&
    (futurePickupEnabledEffective || futureDeliveryEnabledEffective);

  const futurePickupDaysEffective = getEffectiveNumber(
    (selectedBranch as any)?.futurePickupOrderDays,
    (settings as any)?.futurePickupOrderDays,
    0
  );
  const futureDeliveryDaysEffective = getEffectiveNumber(
    (selectedBranch as any)?.futureDeliveryOrderDays,
    (settings as any)?.futureDeliveryOrderDays,
    0
  );

  const scheduledWindowDays = (() => {
    if (selectedOrderType === "PICKUP") return futurePickupDaysEffective;
    if (selectedOrderType === "DELIVERY") return futureDeliveryDaysEffective;
    return Math.max(futurePickupDaysEffective, futureDeliveryDaysEffective);
  })();

  const withinScheduledWindow = (o: Order): boolean => {
    if (!o.isScheduledOrder) return false;
    if (o.orderType === "PICKUP" && !futurePickupEnabledEffective) return false;
    if (o.orderType === "DELIVERY" && !futureDeliveryEnabledEffective) return false;
    if (!o.scheduledDate) return true;

    const d = new Date(o.scheduledDate);
    if (Number.isNaN(d.getTime())) return true;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const end = new Date(todayStart);

    end.setDate(end.getDate() + Math.max(0, Number(scheduledWindowDays || 0)));
    end.setHours(23, 59, 59, 999);
    return d.getTime() <= end.getTime();
  };

  const asapVisibleOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.isScheduledOrder) return false;
      if (asapBusinessDayStatus === "OPEN" && isClosedOrder(o)) return false;
      if (asapBusinessDayStatus === "CLOSED" && !isClosedOrder(o)) return false;
      return true;
    });
  }, [asapBusinessDayStatus, orders]);

  const scheduledVisibleOrders = useMemo(() => {
    return orders.filter((o) => withinScheduledWindow(o));
  }, [orders, scheduledWindowDays, futureDeliveryEnabledEffective, futurePickupEnabledEffective]);

  const displayedOrders = shouldShowFutureTabs
    ? activeQueueTab === "scheduled"
      ? scheduledVisibleOrders
      : asapVisibleOrders
    : orders;
  const isTaxInclusive =
    selectedBranch?.taxInclusive !== null && selectedBranch?.taxInclusive !== undefined
      ? selectedBranch.taxInclusive
      : settings?.taxInclusive ?? false;

  const isTaxInclusiveForSelectedOrder =
    (selectedOrder as any)?.taxInclusive !== null &&
    (selectedOrder as any)?.taxInclusive !== undefined
      ? Boolean((selectedOrder as any).taxInclusive)
      : Boolean(isTaxInclusive);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        setBranches(fetchedBranches);

      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [getToken, isSuperAdmin]);

  // Default filters: show OPEN orders for today
  useEffect(() => {
    if (!startDate && !endDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setStartDate(today);
      setEndDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select the only branch if there is exactly one (and nothing else already selected)
  useEffect(() => {
    if (selectedBranchId) return;
    if (branchIdFromUrl) return;
    if (highlightOrderId) return;
    if (!isSuperAdmin && branches.length > 0) {
      // Non-superadmin staff should always have a concrete branch selected
      setSelectedBranchId(branches[0].id);
      return;
    }
    if (assignedBranchIds.length === 1) {
      const candidate = assignedBranchIds[0];
      if (!candidate) return;
      const exists = branches.some((b) => b.id === candidate);
      if (exists) {
        setSelectedBranchId(candidate);
      }
      return;
    }
    if (branches.length === 1 && branches[0]?.id) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId, branchIdFromUrl, highlightOrderId, assignedBranchIds, isBranchAdmin, isSuperAdmin]);

  // Handle branchId from URL - separate effect to watch for URL changes
  useEffect(() => {
    if (branchIdFromUrl && branches.length > 0) {
      const branchExists = branches.some(b => b.id === branchIdFromUrl);
      const hasExplicitBranchAssignments = assignedBranchIds.length > 0;
      const branchAllowed =
        isSuperAdmin ||
        !hasExplicitBranchAssignments ||
        assignedBranchIds.includes(branchIdFromUrl);
      if (branchExists) {
        if (branchAllowed) {
          setSelectedBranchId(branchIdFromUrl);
        }
        // Remove branchId from URL after setting it (but keep it for a moment to ensure it's processed)
        setTimeout(() => {
          setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("branchId");
            return newParams;
          });
        }, 100);
      } else {
        console.warn("[OrderManagement] Branch from URL not found:", branchIdFromUrl);
        // Remove invalid branchId from URL so it can't force cross-branch viewing
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.delete("branchId");
          return newParams;
        });
      }
    }
  }, [branchIdFromUrl, branches, setSearchParams, assignedBranchIds, isSuperAdmin]);

  // Extract branch from highlighted order to set in dropdown
  useEffect(() => {
    const extractBranchFromHighlightedOrder = async () => {
      // If highlightOrder is present, fetch the order and set its branch in the dropdown
      if (highlightOrderId && branches.length > 0) {
        try {
          const token = await getToken();
          if (token) {
            const order = await orderService.getOrderById(highlightOrderId, token);
            const orderBranchId = order.branch?.id;
            
            if (orderBranchId) {
              const branchExists = branches.some(b => b.id === orderBranchId);
              if (branchExists && selectedBranchId !== orderBranchId) {
                setSelectedBranchId(orderBranchId);
              }
            }
          }
        } catch (error) {
          console.error("[OrderManagement] Error fetching highlighted order to extract branch:", error);
        }
      }
    };

    extractBranchFromHighlightedOrder();
  }, [highlightOrderId, branches, selectedBranchId, getToken]);

  // Load data for non-search operations
  useEffect(() => {
    if (searchTerm) return;
    // If highlightOrder is present, load data even without branch selection
    // The backend will filter to show only that order
    if (highlightOrderId || selectedBranchId) {
      // Clear orders first to avoid showing stale data from previous branch
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      loadData();
    } else {
      // Clear orders if no branch is selected and no order to highlight
      setLoading(false);
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    selectedStatus,
    selectedPaymentStatus,
    selectedPaymentMethod,
    selectedOrderType,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    selectedBranchId,
    highlightOrderId,
    startDate?.getTime(),
    endDate?.getTime(),
    sortBy,
    sortOrder,
    shouldShowFutureTabs,
    activeQueueTab,
    showUpcomingScheduledOrders,
    searchTerm,
  ]);

  // Fetch unseen notification order IDs
  useEffect(() => {
    const fetchUnseenNotifications = async () => {
      try {
        const token = await getToken();
        if (token) {
          const unseen = await notificationService.getUnseenNotifications(
            token
          );
          const orderIds = new Set(
            unseen.filter((n) => n.order).map((n) => n.order!.id)
          );
          setUnseenNotificationOrderIds(orderIds);
        }
      } catch (error) {
        // Error fetching unseen notifications
      }
    };

    fetchUnseenNotifications();

    // Refresh unseen notifications periodically (every 30 seconds)
    const interval = setInterval(fetchUnseenNotifications, 30000);

    return () => clearInterval(interval);
  }, [getToken]);

  // Debounced search effect - only updates menu items
  useEffect(() => {
    if (!searchTerm) return;
    if (!highlightOrderId && !selectedBranchId) return;

    const timeoutId = setTimeout(() => {
      loadSearchResults();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchTerm,
    currentPage,
    selectedStatus,
    selectedPaymentStatus,
    selectedPaymentMethod,
    selectedOrderType,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    selectedBranchId,
    highlightOrderId,
    startDate?.getTime(),
    endDate?.getTime(),
    sortBy,
    sortOrder,
    shouldShowFutureTabs,
    activeQueueTab,
    showUpcomingScheduledOrders,
  ]);

  // Scroll to and highlight order when highlightOrderId is present, and open dialog
  useEffect(() => {
    if (suppressHighlightOpenRef.current) return;

    // Always open the dialog for highlighted orders (even if the order isn't in the current list)
    // This is important when you're already on the orders page and filters/tabs/pagination exclude that order.
    if (
      highlightOrderId &&
      lastOpenedHighlightOrderRef.current !== highlightOrderId &&
      !isViewDialogOpen
    ) {
      lastOpenedHighlightOrderRef.current = highlightOrderId;
      (async () => {
        try {
          const token = await getToken();
          if (!token) return;

          const orderDetails = await orderService.getOrderById(
            highlightOrderId,
            token
          );

          // Ensure branch selection matches the order (so list loads / highlight can work)
          const orderBranchId = (orderDetails as any)?.branch?.id || (orderDetails as any)?.branchId;
          if (orderBranchId && selectedBranchId !== orderBranchId) {
            setSelectedBranchId(orderBranchId);
          }

          setSelectedOrder(orderDetails);
          highlightDialogOpenedAtRef.current = Date.now();
          setIsViewDialogOpen(true);
        } catch (e) {
          lastOpenedHighlightOrderRef.current = null;
        }
      })();
    }

    // Only highlight if branch is selected and orders are loaded
    if (highlightOrderId && selectedBranchId && !loading && !menuItemsLoading) {
      const orderExists = orders.some((order) => order.id === highlightOrderId);

      if (orderExists) {
        // Order is on current page, open dialog and highlight it
        searchingForOrderRef.current = null; // Clear search flag
        
        // Find the order and open the dialog
        const order = orders.find((o) => o.id === highlightOrderId);
        if (order && !isViewDialogOpen) {
          handleViewOrder(order);
        }
        
        setTimeout(() => {
          const cardElement = orderCardRefs.current[highlightOrderId];
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
            // Add highlight class
            cardElement.classList.add(
              "ring-2",
              "ring-pink-500",
              "ring-offset-2"
            );
            // Remove highlight after 3 seconds
            setTimeout(() => {
              cardElement.classList.remove(
                "ring-2",
                "ring-pink-500",
                "ring-offset-2"
              );
              // Clear search term if it was set for highlighting, before clearing ref
              const wasSearchingForThis =
                searchingForOrderRef.current === highlightOrderId;

              // Remove query parameter
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("highlightOrder");
                return next;
              });

              // Clear search term if it was set for highlighting
              if (wasSearchingForThis) {
                setTimeout(() => {
                  setSearchTerm("");
                }, 100);
              }
            }, 3000);
          }
        }, 500);
      } else if (
        orders.length > 0 &&
        searchingForOrderRef.current !== highlightOrderId
      ) {
        // Order not found on current page, search for it by orderNumber
        // Prevent multiple searches for the same order
        searchingForOrderRef.current = highlightOrderId;

        const findOrderPage = async () => {
          try {
            // First, get the order details to get its orderNumber and open dialog
            const token = await getToken();
            if (!token) {
              searchingForOrderRef.current = null;
              return;
            }

            const orderDetails = await orderService.getOrderById(
              highlightOrderId,
              token
            );

            // Open the dialog with the order details
            if (!isViewDialogOpen) {
              setSelectedOrder(orderDetails);
              highlightDialogOpenedAtRef.current = Date.now();
              setIsViewDialogOpen(true);
            }

            // Search for the order using its orderNumber
            // This will find the order regardless of which page it's on
            const searchValue = orderDetails.orderNumber;
            setSearchTerm(searchValue);
            setCurrentPage(1); // Reset to first page when searching

            // The search will trigger loadSearchResults via the debounced useEffect
            // Once search completes and orders are loaded, this useEffect will run again
            // and find the order, then highlight it
          } catch (error) {
            // Error finding order page
            searchingForOrderRef.current = null;
            // If order not found, remove the query parameter
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("highlightOrder");
              return next;
            });
          }
        };

        findOrderPage();
      }
    }
  }, [
    highlightOrderId,
    location.search,
    orders,
    loading,
    menuItemsLoading,
    selectedBranchId,
    setSearchParams,
    getToken,
    searchTerm,
    isViewDialogOpen,
  ]);

  // WebSocket connection for real-time orders
  useEffect(() => {
    // Listen for new order events
    const handleNewOrder = (data: {
      notification: NotificationItem;
      order: any;
    }) => {
      // Only handle events for the currently selected organization (super admin can switch orgs)
      const eventOrganizationId =
        (data as any)?.organizationId ||
        data.order?.organizationId ||
        data.order?.branch?.organizationId;
      if (isSuperAdmin && selectedOrganizationId && eventOrganizationId && String(eventOrganizationId) !== String(selectedOrganizationId)) {
        return;
      }

      // Only add order if it belongs to the selected branch
      const orderBranchId = data.order.branch?.id || (data.order as any).branchId;
      if (selectedBranchId && orderBranchId !== selectedBranchId) {
        return;
      }
      
      // Add new order to the beginning of the list
      setOrders((prev) => {
        // Check if order already exists
        if (prev.some((o) => o.id === data.order.id)) {
          return prev;
        }
        return [data.order, ...prev];
      });

      // Mark as new order for temporary styling
      setNewOrderIds((prev) => new Set([...prev, data.order.id]));

      // Add to unseen notifications (since new orders have unseen notifications)
      setUnseenNotificationOrderIds(
        (prev) => new Set([...prev, data.order.id])
      );

      // Remove temporary styling after 10 seconds
      setTimeout(() => {
        setNewOrderIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.order.id);
          return newSet;
        });
      }, 10000);

      // Scroll to new order if it's in view
      setTimeout(() => {
        const cardElement = orderCardRefs.current[data.order.id];
        if (cardElement) {
          cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    };

    // Handle notification seen event (when another admin marks notification as seen)
    const handleNotificationSeen = (data: {
      orderId: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      // Remove from unseen set in real-time
      setUnseenNotificationOrderIds((prev) => {
        const updated = new Set(prev);
        updated.delete(data.orderId);
        return updated;
      });
    };

    // Handle all notifications seen event
    const handleAllNotificationsSeen = () => {
      // Clear all unseen order IDs
      setUnseenNotificationOrderIds(new Set());
    };

    // Handle order updated event (when order is merged/updated)
    const handleOrderUpdated = (data: {
      notification: NotificationItem;
      order: any;
      newItems?: any[];
      isMergeRequest?: boolean;
    }) => {
      // Only handle events for the currently selected organization (super admin can switch orgs)
      const eventOrganizationId =
        (data as any)?.organizationId ||
        data.order?.organizationId ||
        data.order?.branch?.organizationId;
      if (isSuperAdmin && selectedOrganizationId && eventOrganizationId && String(eventOrganizationId) !== String(selectedOrganizationId)) {
        return;
      }

      // Only handle order if it belongs to the selected branch
      const orderBranchId = data.order.branchId || data.order.branch?.id;
      if (selectedBranchId && orderBranchId !== selectedBranchId) {
        // If order is in the list but belongs to different branch, remove it
        setOrders((prev) => {
          const orderIndex = prev.findIndex((o) => o.id === data.order.id);
          if (orderIndex !== -1) {
            // Remove order from list if it doesn't belong to selected branch
            return prev.filter((o) => o.id !== data.order.id);
          }
          return prev;
        });
        return;
      }
      
      // Update the existing order in the list
      setOrders((prev) => {
        const orderIndex = prev.findIndex((o) => o.id === data.order.id);
        if (orderIndex !== -1) {
          // Update existing order
          const updated = [...prev];
          updated[orderIndex] = data.order;
          return updated;
        } else {
          // If order not in list, add it to the beginning (only if it belongs to selected branch)
          return [data.order, ...prev];
        }
        return prev;
      });

      // Update selectedOrder if it's the same order (for real-time dialog update)
      setSelectedOrder((prev) => {
        if (prev && prev.id === data.order.id) {
          return data.order;
        }
        return prev;
      });

      const isMergeEvent = Boolean(data.isMergeRequest) && (data.newItems || []).length > 0;

      // Only highlight/mark unseen if there are actually new merged items.
      if (isMergeEvent) {
        // Mark as updated order for temporary styling
        setNewOrderIds((prev) => new Set([...prev, data.order.id]));

        // Add to unseen notifications (merge requests should be treated as unseen)
        setUnseenNotificationOrderIds((prev) => new Set([...prev, data.order.id]));

        // Remove temporary styling after 10 seconds
        setTimeout(() => {
          setNewOrderIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(data.order.id);
            return newSet;
          });
        }, 10000);

        // Scroll to updated order if it's in view
        setTimeout(() => {
          const cardElement = orderCardRefs.current[data.order.id];
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 300);
      }
    };

    // Subscribe to all events with automatic cleanup
    const unsubscribe1 = subscribe("new-order", handleNewOrder);
    const unsubscribe2 = subscribe("notification-seen", handleNotificationSeen);
    const unsubscribe3 = subscribe(
      "all-notifications-seen",
      handleAllNotificationsSeen
    );
    const unsubscribe4 = subscribe("order-updated", handleOrderUpdated);

    // Cleanup on unmount
    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, selectedBranchId, isSuperAdmin, selectedOrganizationId]);

  const loadData = async () => {
    // If highlightOrder is present, we should load even without branch selection
    // The backend will filter to show only that order
    if (isBranchAdmin && !highlightOrderId && !selectedBranchId) {
      setLoading(false);
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      return;
    }
    if (!highlightOrderId && !selectedBranchId) {
      // Don't load if no branch is selected and no order to highlight
      setLoading(false);
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      // Format dates as YYYY-MM-DD (backend expects this format)
      // Normalize to local date (start of day) to avoid timezone issues
      const formatDate = (date: Date): string => {
        const localDate = new Date(date);
        localDate.setHours(0, 0, 0, 0); // Set to local midnight
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, "0");
        const day = String(localDate.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      // If only start date is selected, use it for both (single date filter)
      // If both are selected, use date range
      let startDateStr: string | undefined;
      let endDateStr: string | undefined;
      if (startDate && !endDate) {
        // Single date filter - use start date for both start and end
        const dateStr = formatDate(startDate);
        startDateStr = dateStr;
        endDateStr = dateStr;
      } else if (startDate && endDate) {
        // Date range filter - use both dates
        startDateStr = formatDate(startDate);
        endDateStr = formatDate(endDate);
      }

      const activeQueue: "asap" | "scheduled" = activeQueueTab;
      const activeIsScheduled: "asap" | "scheduled" | "all" = shouldShowFutureTabs
        ? activeQueue
        : "all";
      const activeBusinessDayStatus: "OPEN" | "CLOSED" | "" =
        activeQueue === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus;

      const scheduledScope =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? "upcoming"
          : "all";

      const effectiveStartDateStr =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? undefined
          : startDateStr;
      const effectiveEndDateStr =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? undefined
          : endDateStr;

      const response = await orderService.getOrders(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        selectedStatus,
        selectedPaymentStatus,
        selectedPaymentMethod,
        effectiveStartDateStr,
        effectiveEndDateStr,
        selectedBranchId || undefined,
        highlightOrderId || undefined,
        selectedOrderType || undefined,
        activeIsScheduled,
        scheduledScope,
        activeBusinessDayStatus,
        token || undefined
      );

      let nextQueueCounts: { asap: number; scheduled: number } | null = null;
      if (shouldShowFutureTabs) {
        const asapCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          // ASAP should respect createdAt date filters
          startDateStr,
          endDateStr,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "asap",
          "all",
          asapBusinessDayStatus,
          token || undefined
        );

        const scheduledCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          // Scheduled uses scheduledDate filtering in backend
          effectiveStartDateStr,
          effectiveEndDateStr,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "scheduled",
          scheduledScope,
          scheduledBusinessDayStatus,
          token || undefined
        );

        const upcomingCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          undefined,
          undefined,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "scheduled",
          "upcoming",
          scheduledBusinessDayStatus,
          token || undefined
        );

        const [asapCountRes, scheduledCountRes, upcomingCountRes] = await Promise.all([
          asapCountPromise,
          scheduledCountPromise,
          upcomingCountPromise,
        ]);
        nextQueueCounts = {
          asap: asapCountRes.pagination.totalCount,
          scheduled: scheduledCountRes.pagination.totalCount,
        };
        setUpcomingScheduledCount(upcomingCountRes.pagination.totalCount);
      } else {
        setUpcomingScheduledCount(0);
      }

      setOrders(response.orders);
      setQueueCounts(nextQueueCounts);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      // Error loading orders
    } finally {
      setLoading(false);
    }
  };

  const loadSearchResults = async () => {
    if (isBranchAdmin && !highlightOrderId && !selectedBranchId) {
      return;
    }
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      // Format dates as YYYY-MM-DD (backend expects this format)
      // Normalize to local date (start of day) to avoid timezone issues
      const formatDate = (date: Date): string => {
        const localDate = new Date(date);
        localDate.setHours(0, 0, 0, 0); // Set to local midnight
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, "0");
        const day = String(localDate.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      // If only start date is selected, use it for both (single date filter)
      // If both are selected, use date range
      let startDateStr: string | undefined;
      let endDateStr: string | undefined;
      if (startDate && !endDate) {
        // Single date filter - use start date for both start and end
        const dateStr = formatDate(startDate);
        startDateStr = dateStr;
        endDateStr = dateStr;
      } else if (startDate && endDate) {
        // Date range filter - use both dates
        startDateStr = formatDate(startDate);
        endDateStr = formatDate(endDate);
      }

      const activeQueue: "asap" | "scheduled" = activeQueueTab;
      const activeIsScheduled: "asap" | "scheduled" | "all" = shouldShowFutureTabs
        ? activeQueue
        : "all";
      const activeBusinessDayStatus: "OPEN" | "CLOSED" | "" =
        activeQueue === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus;

      const scheduledScope =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? "upcoming"
          : "all";

      const effectiveStartDateStr =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? undefined
          : startDateStr;
      const effectiveEndDateStr =
        shouldShowFutureTabs && activeQueueTab === "scheduled" && showUpcomingScheduledOrders
          ? undefined
          : endDateStr;

      const response = await orderService.getOrders(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        selectedStatus,
        selectedPaymentStatus,
        selectedPaymentMethod,
        effectiveStartDateStr,
        effectiveEndDateStr,
        selectedBranchId || undefined,
        highlightOrderId || undefined,
        selectedOrderType || undefined,
        activeIsScheduled,
        scheduledScope,
        activeBusinessDayStatus,
        token || undefined
      );

      let nextQueueCounts: { asap: number; scheduled: number } | null = null;
      if (shouldShowFutureTabs) {
        const asapCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          startDateStr,
          endDateStr,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "asap",
          "all",
          asapBusinessDayStatus,
          token || undefined
        );

        const scheduledCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          effectiveStartDateStr,
          effectiveEndDateStr,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "scheduled",
          scheduledScope,
          scheduledBusinessDayStatus,
          token || undefined
        );

        const upcomingCountPromise = orderService.getOrders(
          1,
          1,
          searchTerm,
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          undefined,
          undefined,
          selectedBranchId || undefined,
          highlightOrderId || undefined,
          selectedOrderType || undefined,
          "scheduled",
          "upcoming",
          scheduledBusinessDayStatus,
          token || undefined
        );

        const [asapCountRes, scheduledCountRes, upcomingCountRes] = await Promise.all([
          asapCountPromise,
          scheduledCountPromise,
          upcomingCountPromise,
        ]);
        nextQueueCounts = {
          asap: asapCountRes.pagination.totalCount,
          scheduled: scheduledCountRes.pagination.totalCount,
        };
        setUpcomingScheduledCount(upcomingCountRes.pagination.totalCount);
      } else {
        setUpcomingScheduledCount(0);
      }

      setOrders(response.orders);
      setQueueCounts(nextQueueCounts);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      // Error loading search results
    } finally {
      setMenuItemsLoading(false);
    }
  };

  // Event handlers
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    // Clear highlight when searching manually
    if (highlightOrderId && value !== searchTerm) {
      setSearchParams((prev) => {
        prev.delete("highlightOrder");
        return prev;
      });
    }
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handlePaymentStatusFilter = (status: string) => {
    setSelectedPaymentStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handlePaymentMethodFilter = (method: string) => {
    setSelectedPaymentMethod(method === "all" ? "" : method);
    setCurrentPage(1);
  };

  const handleOrderTypeFilter = (type: string) => {
    setSelectedOrderType(type === "all" ? "" : (type as "DELIVERY" | "PICKUP"));
    setCurrentPage(1);
  };

  const handleBusinessDayStatusFilter = (target: "asap" | "scheduled", value: string) => {
    const next = value === "all" ? "" : (value as any);
    if (target === "scheduled") {
      setScheduledBusinessDayStatus(next);
    } else {
      setAsapBusinessDayStatus(next);
    }
    setCurrentPage(1);
  };

  const showClosedBusinessDayToast = (error: any) => {
    const code = error?.response?.data?.code;
    if (code === "BUSINESS_DAY_CLOSED") {
      toast.error(
        t("admin.orderManagement.errors.businessDayClosed", {
          defaultValue: "This order belongs to a closed day and cannot be edited.",
        })
      );
      return true;
    }

    if (code === "POS_DEVICE_REQUIRED") {
      toast.error(
        t("admin.orderManagement.errors.posDeviceRequired", {
          defaultValue:
            "Select an active POS device for this branch to update the order.",
        })
      );
      return true;
    }

    const msg =
      error?.response?.data?.error ||
      error?.message ||
      t("admin.orderManagement.errors.generic", { defaultValue: "Something went wrong." });
    toast.error(msg);
    return false;
  };

  const handleBranchFilter = (branchId: string) => {
    if (isBranchAdmin && !branchId) return;
    setSelectedBranchId(branchId === "" ? "" : branchId);
    setCurrentPage(1);
  };

  const handleViewOrder = async (order: Order) => {
    setIsViewDialogOpen(true);

    // Fetch full order details to ensure we have all nested data including optional ingredients
    try {
      const token = await getToken();
      const fullOrderDetails = await orderService.getOrderById(
        order.id,
        token || undefined
      );

      // Set the fetched order details (service already handles response.data extraction)
      setSelectedOrder(fullOrderDetails);
    } catch (error) {
      console.error("Error fetching order details:", error);
      // Fallback to the order from list if fetch fails
      setSelectedOrder(order);
    }

    // Mark notification as seen when viewing order details
    try {
      const token = await getToken();
      if (token) {
        await notificationService.markAsSeen(order.id, token);
        // Remove from unseen set immediately for instant UI feedback
        setUnseenNotificationOrderIds((prev) => {
          const updated = new Set(prev);
          updated.delete(order.id);
          return updated;
        });
      }
    } catch (error) {
      // Error marking notification as seen
    }

    // Load refunds for this order if it has been refunded
    if (
      order.paymentStatus === "PARTIALLY_REFUNDED" ||
      order.paymentStatus === "REFUNDED"
    ) {
      await loadOrderRefunds(order.id);
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
      setOrderRefunds([]);
    } finally {
      setLoadingRefunds(false);
    }
  };

  const handleEditOrder = async (order: Order) => {
    if (!canEditOrders) {
      return;
    }

    if (order.status === "CANCELLED") {
      toast.error(
        t("admin.orderManagement.errors.orderCancelledReadOnly", {
          defaultValue: "Cancelled orders cannot be edited.",
        })
      );
      return;
    }
    setSelectedOrder(order);
    setEditFormData({
      status: order.status,
      paymentStatus: order.paymentStatus,
    });
    setIsEditDialogOpen(true);

    // Mark notification as seen when editing order
    try {
      const token = await getToken();
      if (token) {
        await notificationService.markAsSeen(order.id, token);
        // Remove from unseen set immediately for instant UI feedback
        setUnseenNotificationOrderIds((prev) => {
          const updated = new Set(prev);
          updated.delete(order.id);
          return updated;
        });
      }
    } catch (error) {
      // Error marking notification as seen
    }
  };

  const handleUpdateOrder = async () => {
    if (!selectedOrder) return;

    if (selectedOrder.status === "CANCELLED") {
      toast.error(
        t("admin.orderManagement.errors.orderCancelledReadOnly", {
          defaultValue: "Cancelled orders cannot be edited.",
        })
      );
      return;
    }

    try {
      setIsActionLoading(selectedOrder.id);
      const token = await getToken();

      const { deliveryNotes: _deliveryNotes, ...updateData } = editFormData;
      await orderService.updateOrder(
        selectedOrder.id,
        updateData,
        token || undefined
      );
      await loadData();
      setIsEditDialogOpen(false);
    } catch (error) {
      showClosedBusinessDayToast(error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleStartCancelOrder = (order: Order) => {
    if (order.status === "CANCELLED") return;
    setOrderToCancel(order);
    setCancelReason("");
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    const reason = String(cancelReason || "").trim();
    if (!reason) {
      toast.error(
        t("admin.orderManagement.cancelOrderDialog.reasonRequired", {
          defaultValue: "Please provide a reason for cancellation.",
        })
      );
      return;
    }

    try {
      setIsCancelling(true);
      setIsActionLoading(orderToCancel.id);
      const token = await getToken();
      await orderService.cancelOrder(orderToCancel.id, reason, token || undefined);
      await loadData();
      setOrderToCancel(null);
      setCancelReason("");
      setIsEditDialogOpen(false);
      setIsViewDialogOpen(false);
    } catch (error) {
      showClosedBusinessDayToast(error);
    } finally {
      setIsCancelling(false);
      setIsActionLoading(null);
    }
  };

  const handlePreviewBill = (order: Order) => {
    setSelectedOrder(order);
    setIsBillPreviewOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!isBillPreviewOpen) {
          setBillPreviewSettings(null);
          setBillPreviewPayload(null);
          setBillPreviewError(null);
          setBillPreviewLoading(false);
          return;
        }

        if (!selectedOrder?.id) {
          setBillPreviewError(
            t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." })
          );
          setBillPreviewPayload(null);
          setBillPreviewSettings(null);
          return;
        }

        setBillPreviewLoading(true);
        setBillPreviewError(null);

        const token = (await getToken()) || undefined;
        const api = ApiService.getInstance();
        const res: any = await api.get(`/api/order/${selectedOrder.id}/receipt`, token);

        const data = (res as any)?.data?.data ?? (res as any)?.data ?? null;
        if (!data?.order) {
          throw new Error(
            t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." })
          );
        }

        const branchId = String(
          (data.order as any)?.branchId || (data.order as any)?.branch?.id || ""
        ).trim();
        if (branchId) {
          SettingsService.getSettings(token, { branchId })
            .then((r) => (r as any)?.data?.data ?? (r as any)?.data ?? r)
            .then((s) => {
              if (!cancelled) setBillPreviewSettings((s as any) || null);
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
        setBillPreviewSettings(null);
        setBillPreviewPayload(null);
        setBillPreviewError(
          e?.message ||
            t("orders.billPreviewError", { defaultValue: "Failed to load bill preview." })
        );
      } finally {
        if (!cancelled) setBillPreviewLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, isBillPreviewOpen, selectedOrder?.id, t]);

  const handleRefundOrder = (order: Order) => {
    if (isClosedOrder(order)) {
      toast.error(
        t("admin.orderManagement.errors.businessDayClosed", {
          defaultValue: "This order belongs to a closed day and cannot be edited.",
        })
      );
      return;
    }
    setSelectedOrder(order);
    setRefundFormData({
      refundType: "FULL",
      items: [],
    });
    setIsRefundDialogOpen(true);
  };

  const handleRefundTypeChange = (refundType: RefundType) => {
    setRefundFormData({
      ...refundFormData,
      refundType,
      amount: undefined,
      items: [],
    });
  };

  const handleItemRefundToggle = (orderItemId: string, isSelected: boolean) => {
    if (isSelected) {
      const orderItem = selectedOrder?.orderItems.find(
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

  const handleItemRefundAmountChange = (
    orderItemId: string,
    amount: number
  ) => {
    setRefundFormData({
      ...refundFormData,
      items: refundFormData.items.map((item) =>
        item.orderItemId === orderItemId
          ? { ...item, refundAmount: amount }
          : item
      ),
    });
  };

  const handleProcessRefund = async () => {
    if (!selectedOrder) return;

    if (!String(refundFormData.reason || "").trim()) {
      toast.error(
        t("admin.orderManagement.errors.refundReasonRequired", {
          defaultValue: "Reason for refund is required.",
        })
      );
      return;
    }

    try {
      setIsActionLoading(selectedOrder.id);
      const token = await getToken();

      const refundRequest: CreateRefundRequest = {
        orderId: selectedOrder.id,
        refundType: refundFormData.refundType,
        reason: refundFormData.reason,
      };

      if (refundFormData.refundType === "PARTIAL" && refundFormData.amount) {
        refundRequest.amount = refundFormData.amount;
      } else if (refundFormData.refundType === "ITEM_SPECIFIC") {
        refundRequest.items = refundFormData.items;
      }

      await refundService.createRefund(refundRequest, token || undefined);

      const updatedOrder = await orderService.getOrderById(
        selectedOrder.id,
        token || undefined
      );
      setSelectedOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );
      await loadData();

      // Reload refunds for the current order
      if (selectedOrder) {
        await loadOrderRefunds(selectedOrder.id);
      }

      setIsRefundDialogOpen(false);
      setRefundFormData({
        refundType: "FULL",
        items: [],
      });
    } catch (error) {
      // Error processing refund
    } finally {
      setIsActionLoading(null);
    }
  };

  const getPaymentStatusIcon = (status: Order["paymentStatus"]) => {
    switch (status) {
      case "PENDING":
        return <Icon path={mdiClock} size={0.50} className="text-yello" />;
      case "PAID":
        return <Icon path={mdiCheckCircle} size={0.50} className="text-green-500" />;
      case "FAILED":
        return <Icon path={mdiCloseCircle} size={0.50} className="text-red-500" />;
      case "REFUNDED":
        return <Icon path={mdiAlertCircle} size={0.50} className="text-blue-500" />;
      case "PARTIALLY_REFUNDED":
        return <Icon path={mdiAlertCircle} size={0.50} className="text-orange-500" />;
      default:
        return <Icon path={mdiAlertCircle} size={0.50} className="text-gray-500" />;
    }
  };

  const getPaymentMethodIcon = (method: Order["paymentMethod"]) => {
    switch (method) {
      case "CASH_ON_DELIVERY":
        return <Icon path={mdiCurrencyUsd} size={0.50} />;
      case "CARD_ON_DELIVERY":
        return <Icon path={mdiCreditCard} size={0.50} />;
      case "ONLINE_PAYMENT":
        return <Icon path={mdiCreditCard} size={0.50} />;
      default:
        return <Icon path={mdiCurrencyUsd} size={0.50} />;
    }
  };

  const getStatusColor = (status: Order["status"]) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "CONFIRMED":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "PREPARING":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "READY_FOR_DELIVERY":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "READY_FOR_PICKUP":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "OUT_FOR_DELIVERY":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "DELIVERED":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "PICKED_UP":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "CANCELLED":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getPaymentStatusColor = (status: Order["paymentStatus"]) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "PAID":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "FAILED":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "REFUNDED":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "PARTIALLY_REFUNDED":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const formatOrderNumber = (orderNumber: string) => {
    return `#${orderNumber}`;
  };

  const getCancellationReason = (order: Order | null): string | null => {
    if (!order) return null;
    const direct = (order as any)?.cancellationReason;
    if (typeof direct === "string" && direct.trim()) return direct.trim();

    const history = (order as any)?.history;
    if (!Array.isArray(history)) return null;

    const cancelledEntries = history.filter((h: any) =>
      String(h?.type || "").toUpperCase() === "CANCELLED"
    );
    const last = cancelledEntries.length > 0 ? cancelledEntries[cancelledEntries.length - 1] : null;
    const reason = last?.details?.reason;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
    return null;
  };

  const isOverdueScheduledOrder = (order: Order | null): boolean => {
    if (!order?.isScheduledOrder || !order?.scheduledDate) return false;
    const terminalStatuses = new Set(["DELIVERED", "PICKED_UP", "CANCELLED", "COMPLETED"]);
    if (terminalStatuses.has(String((order as any).status))) return false;
    return new Date(order.scheduledDate) < new Date();
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount, displayCurrency);
  };

  const formatOrderDetailsDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = String(d.getDate());
    const month = monthNames[d.getMonth()] || "";
    const year = String(d.getFullYear());
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return `${day}-${month}-${year} ${t("admin.orderManagement.scheduled.at", { defaultValue: "at" })} ${time}`;
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

  if (loading && selectedBranchId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.orderManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.orderManagement.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.orderManagement.loading")}
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.orderManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSearch(e.target.value)
                  }
                  className="pl-9 bg-transparent text-foreground border-border"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Select
                  value={selectedBranchId || ""}
                  onValueChange={(value: string) => handleBranchFilter(value)}
                  disabled={loadingBranches}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={
                        loadingBranches
                          ? t("common.loading")
                          : t("admin.orderManagement.selectBranch")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBranches.map((branch: Branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Business day filter: ASAP */}
                <Select
                  value={asapBusinessDayStatus || "all"}
                  onValueChange={(value: string) =>
                    handleBusinessDayStatusFilter("asap", value)
                  }
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.businessDayStatus", {
                        defaultValue: "Business Day",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.orderManagement.businessDayStatusAllAsap", {
                        defaultValue: "All ASAP Business Days",
                      })}
                    </SelectItem>
                    <SelectItem value="OPEN">
                      {t("admin.orderManagement.businessDayStatusOpen", {
                        defaultValue: "Open",
                      })}
                    </SelectItem>
                    <SelectItem value="CLOSED">
                      {t("admin.orderManagement.businessDayStatusClosed", {
                        defaultValue: "Closed",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Business day filter: Scheduled */}
                {shouldShowFutureTabs && (
                  <Select
                    value={scheduledBusinessDayStatus || "all"}
                    onValueChange={(value: string) =>
                      handleBusinessDayStatusFilter("scheduled", value)
                    }
                  >
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue
                        placeholder={t("admin.orderManagement.businessDayStatus", {
                          defaultValue: "Business Day",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t(
                          "admin.orderManagement.businessDayStatusAllScheduled",
                          { defaultValue: "All Scheduled Business Days" }
                        )}
                      </SelectItem>
                      <SelectItem value="OPEN">
                        {t("admin.orderManagement.businessDayStatusOpen", {
                          defaultValue: "Open",
                        })}
                      </SelectItem>
                      <SelectItem value="CLOSED">
                        {t("admin.orderManagement.businessDayStatusClosed", {
                          defaultValue: "Closed",
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={selectedStatus || "all"}
                  onValueChange={(value: string) => handleStatusFilter(value)}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.deliveryStatusAll", {
                        defaultValue: "All Delivery Status",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.orderManagement.deliveryStatusAll", {
                        defaultValue: "All Delivery Status",
                      })}
                    </SelectItem>
                  {statusFilterOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatStatus(status)}
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedPaymentStatus || "all"}
                  onValueChange={(value: string) =>
                    handlePaymentStatusFilter(value)
                  }
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.paymentStatusAll", {
                        defaultValue: "All Payment Status",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.orderManagement.paymentStatusAll", {
                        defaultValue: "All Payment Status",
                      })}
                    </SelectItem>
                    <SelectItem value="PENDING">
                      {t("admin.orderManagement.paymentStatuses.pending")}
                    </SelectItem>
                    <SelectItem value="PAID">
                      {t("admin.orderManagement.paymentStatuses.paid")}
                    </SelectItem>
                    <SelectItem value="FAILED">
                      {t("admin.orderManagement.paymentStatuses.failed")}
                    </SelectItem>
                    <SelectItem value="REFUNDED">
                      {t("admin.orderManagement.paymentStatuses.refunded")}
                    </SelectItem>
                    <SelectItem value="PARTIALLY_REFUNDED">
                      {t(
                        "admin.orderManagement.paymentStatuses.partiallyRefunded"
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedPaymentMethod || undefined}
                  onValueChange={(value: string) => handlePaymentMethodFilter(value)}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.paymentMethodLabel", {
                        defaultValue: "Payment Method",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.orderManagement.allMethods")}
                    </SelectItem>
                    <SelectItem value="CASH_ON_DELIVERY">
                      {t("admin.orderManagement.paymentMethods.cashOnDelivery")}
                    </SelectItem>
                    <SelectItem value="CARD_ON_DELIVERY">
                      {t("admin.orderManagement.paymentMethods.cardOnDelivery")}
                    </SelectItem>
                    <SelectItem value="ONLINE_PAYMENT">
                      {t("admin.orderManagement.paymentMethods.onlinePayment")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedOrderType || undefined}
                  onValueChange={(value: string) => handleOrderTypeFilter(value)}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.orderType", {
                        defaultValue: "Order Type",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.orderManagement.filterAllTypes", {
                        defaultValue: t("admin.orderManagement.allTypes", {
                          defaultValue: "All Types",
                        }),
                      })}
                    </SelectItem>
                    <SelectItem value="DELIVERY">
                      {t("admin.orderManagement.delivery", {
                        defaultValue: "Delivery",
                      })}
                    </SelectItem>
                    <SelectItem value="PICKUP">
                      {t("admin.orderManagement.pickup", {
                        defaultValue: "Pickup",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Date Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <DatePicker
                    date={startDate}
                    onDateChange={(date) => {
                      setStartDate(date);
                      setCurrentPage(1);
                      if (date && endDate && date > endDate) {
                        setEndDate(undefined);
                      }
                    }}
                    maxDate={endDate || new Date()}
                    placeholder={t("admin.orderManagement.selectStartDate")}
                    variant="outline"
                    className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
                  />
                  <DatePicker
                    date={endDate}
                    onDateChange={(date) => {
                      setEndDate(date);
                      setCurrentPage(1);
                    }}
                    minDate={startDate}
                    maxDate={new Date()}
                    placeholder={t("admin.orderManagement.selectEndDate")}
                    variant="outline"
                    className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
                  />
                </div>

                {/* Sort */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">{t("admin.orderManagement.sortBy")}:</span>
                  <Button
                    size="sm"
                    onClick={() => handleSort("createdAt")}
                    className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                  >
                    <span className={sortBy === "createdAt" ? "text-white" : ""}>
                      {sortBy === "createdAt"
                        ? sortOrder === "desc"
                          ? t("admin.orderManagement.newestFirst")
                          : t("admin.orderManagement.oldestFirst")
                        : t("admin.orderManagement.newestFirst")}
                    </span>
                    {sortBy === "createdAt" && (
                      <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSort("totalAmount")}
                    className={sortBy === "totalAmount" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                  >
                    <span className={sortBy === "totalAmount" ? "text-white" : ""}>
                      {sortBy === "totalAmount"
                        ? sortOrder === "desc"
                          ? t("admin.orderManagement.highestAmount")
                          : t("admin.orderManagement.lowestAmount")
                        : t("admin.orderManagement.highestAmount")}
                    </span>
                    {sortBy === "totalAmount" && (
                      <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSort("orderNumber")}
                    className={sortBy === "orderNumber" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                  >
                    <span className={sortBy === "orderNumber" ? "text-white" : ""}>
                      {t("admin.orderManagement.orderNumberAZ")}
                    </span>
                    {sortBy === "orderNumber" && (
                      <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.orderManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.orderManagement.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.orderManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.orderManagement.description")}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.orderManagement.searchPlaceholder")}
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleSearch(e.target.value)
                }
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Select
                value={selectedBranchId || ""}
                onValueChange={(value: string) => handleBranchFilter(value)}
                disabled={loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                      placeholder={
                        loadingBranches
                          ? t("common.loading")
                          : t("admin.orderManagement.selectBranch")
                      }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredBranches.map((branch: Branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Business day filter: ASAP */}
              <Select
                value={asapBusinessDayStatus || "all"}
                onValueChange={(value: string) =>
                  handleBusinessDayStatusFilter("asap", value)
                }
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.orderManagement.businessDayStatus", {
                      defaultValue: "Business Day",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.orderManagement.businessDayStatusAllAsap", {
                      defaultValue: "All ASAP Business Days",
                    })}
                  </SelectItem>
                  <SelectItem value="OPEN">
                    {t("admin.orderManagement.businessDayStatusOpen", {
                      defaultValue: "Open",
                    })}
                  </SelectItem>
                  <SelectItem value="CLOSED">
                    {t("admin.orderManagement.businessDayStatusClosed", {
                      defaultValue: "Closed",
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Business day filter: Scheduled */}
              {shouldShowFutureTabs && (
                <Select
                  value={scheduledBusinessDayStatus || "all"}
                  onValueChange={(value: string) =>
                    handleBusinessDayStatusFilter("scheduled", value)
                  }
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.orderManagement.businessDayStatus", {
                        defaultValue: "Business Day",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t(
                        "admin.orderManagement.businessDayStatusAllScheduled",
                        { defaultValue: "All Scheduled Business Days" }
                      )}
                    </SelectItem>
                    <SelectItem value="OPEN">
                      {t("admin.orderManagement.businessDayStatusOpen", {
                        defaultValue: "Open",
                      })}
                    </SelectItem>
                    <SelectItem value="CLOSED">
                      {t("admin.orderManagement.businessDayStatusClosed", {
                        defaultValue: "Closed",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select
                value={selectedStatus || "all"}
                onValueChange={(value: string) => handleStatusFilter(value)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.orderManagement.deliveryStatusAll", {
                      defaultValue: "All Delivery Status",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.orderManagement.deliveryStatusAll", {
                      defaultValue: "All Delivery Status",
                    })}
                  </SelectItem>
                  {statusFilterOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatStatus(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedPaymentStatus || "all"}
                onValueChange={(value: string) =>
                  handlePaymentStatusFilter(value)
                }
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.orderManagement.paymentStatusAll", {
                      defaultValue: "All Payment Status",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.orderManagement.paymentStatusAll", {
                      defaultValue: "All Payment Status",
                    })}
                  </SelectItem>
                  <SelectItem value="PENDING">
                    {t("admin.orderManagement.paymentStatuses.pending")}
                  </SelectItem>
                  <SelectItem value="PAID">
                    {t("admin.orderManagement.paymentStatuses.paid")}
                  </SelectItem>
                  <SelectItem value="FAILED">
                    {t("admin.orderManagement.paymentStatuses.failed")}
                  </SelectItem>
                  <SelectItem value="REFUNDED">
                    {t("admin.orderManagement.paymentStatuses.refunded")}
                  </SelectItem>
                  <SelectItem value="PARTIALLY_REFUNDED">
                    {t(
                      "admin.orderManagement.paymentStatuses.partiallyRefunded"
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={selectedPaymentMethod || undefined}
                onValueChange={(value: string) =>
                  handlePaymentMethodFilter(value)
                }
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.orderManagement.paymentMethodLabel", {
                      defaultValue: "Payment Method",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.orderManagement.allMethods")}
                  </SelectItem>
                  <SelectItem value="CASH_ON_DELIVERY">
                    {t("admin.orderManagement.paymentMethods.cashOnDelivery")}
                  </SelectItem>
                  <SelectItem value="CARD_ON_DELIVERY">
                    {t("admin.orderManagement.paymentMethods.cardOnDelivery")}
                  </SelectItem>
                  <SelectItem value="ONLINE_PAYMENT">
                    {t("admin.orderManagement.paymentMethods.onlinePayment")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={selectedOrderType || undefined}
                onValueChange={(value: string) => handleOrderTypeFilter(value)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.orderManagement.orderType", {
                      defaultValue: "Order Type",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.orderManagement.filterAllTypes", {
                      defaultValue: t("admin.orderManagement.allTypes", {
                        defaultValue: "All Types",
                      }),
                    })}
                  </SelectItem>
                  <SelectItem value="DELIVERY">
                    {t("admin.orderManagement.delivery", {
                      defaultValue: "Delivery",
                    })}
                  </SelectItem>
                  <SelectItem value="PICKUP">
                    {t("admin.orderManagement.pickup", {
                      defaultValue: "Pickup",
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Date Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <DatePicker
                  date={startDate}
                  onDateChange={(date) => {
                    setStartDate(date);
                    setCurrentPage(1);
                    if (date && endDate && date > endDate) {
                      setEndDate(undefined);
                    }
                  }}
                  maxDate={endDate || new Date()}
                  placeholder={t("admin.orderManagement.selectStartDate")}
                  variant="outline"
                  className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
                />
                <DatePicker
                  date={endDate}
                  onDateChange={(date) => {
                    setEndDate(date);
                    setCurrentPage(1);
                  }}
                  minDate={startDate}
                  maxDate={new Date()}
                  placeholder={t("admin.orderManagement.selectEndDate")}
                  variant="outline"
                  className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
                />
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.orderManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "createdAt" ? "text-white" : ""}>
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.orderManagement.newestFirst")
                        : t("admin.orderManagement.oldestFirst")
                      : t("admin.orderManagement.newestFirst")}
                  </span>
                  {sortBy === "createdAt" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("totalAmount")}
                  className={sortBy === "totalAmount" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "totalAmount" ? "text-white" : ""}>
                    {sortBy === "totalAmount"
                      ? sortOrder === "desc"
                        ? t("admin.orderManagement.highestAmount")
                        : t("admin.orderManagement.lowestAmount")
                      : t("admin.orderManagement.highestAmount")}
                  </span>
                  {sortBy === "totalAmount" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("orderNumber")}
                  className={sortBy === "orderNumber" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "orderNumber" ? "text-white" : ""}>
                    {t("admin.orderManagement.orderNumberAZ")}
                  </span>
                  {sortBy === "orderNumber" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Grid */}
      <div className="relative">
        {!selectedBranchId ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Icon path={mdiOfficeBuilding} size={2.00} className="text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t("admin.orderManagement.selectBranchToView")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.orderManagement.selectBranchToViewSubtext")}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {menuItemsLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-2 text-pink-500">
                  <Icon path={mdiLoading} size={0.83} className="animate-spin" />
                  <span className="text-sm font-medium">
                    {t("admin.orderManagement.searchingOrders")}
                  </span>
                </div>
              </div>
            )}

            {shouldShowFutureTabs && (
              <Tabs
                value={activeQueueTab}
                onValueChange={(v) => {
                  setActiveQueueTab(v as any);
                  if (String(v) !== "scheduled") {
                    setShowUpcomingScheduledOrders(false);
                  }
                  setCurrentPage(1);
                  setOrders([]);
                  setQueueCounts(null);
                  setTotalPages(1);
                  setTotalCount(0);
                }}
                className="mb-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <TabsList className="justify-start">
                    <TabsTrigger
                      value="asap"
                      className="group data-[state=active]:bg-pink-500 data-[state=active]:text-white"
                    >
                      {t("admin.orderManagement.tabs.asap", { defaultValue: "ASAP" })}
                      <span className="ml-2 text-xs text-muted-foreground group-data-[state=active]:text-white/80">
                        ({queueCounts?.asap ?? asapVisibleOrders.length})
                      </span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="scheduled"
                      className="group data-[state=active]:bg-pink-500 data-[state=active]:text-white"
                    >
                      {t("admin.orderManagement.tabs.scheduled", { defaultValue: "Scheduled" })}
                      <span className="ml-2 text-xs text-muted-foreground group-data-[state=active]:text-white/80">
                        ({queueCounts?.scheduled ?? scheduledVisibleOrders.length})
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  {activeQueueTab === "scheduled" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowUpcomingScheduledOrders((prev) => !prev);
                        setCurrentPage(1);
                        setOrders([]);
                        setQueueCounts(null);
                        setTotalPages(1);
                        setTotalCount(0);
                      }}
                      className={
                        showUpcomingScheduledOrders
                          ? "bg-pink-500 hover:bg-pink-600 text-white"
                          : "bg-transparent text-foreground border border-border hover:bg-muted"
                      }
                    >
                      {t("admin.orderManagement.upcomingScheduledOrders", {
                        defaultValue: "Upcoming Scheduled Orders",
                      })}
                      <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold bg-pink-500/15 text-pink-300 border border-pink-500/30">
                        {upcomingScheduledCount}
                      </span>
                    </Button>
                  )}
                </div>
              </Tabs>
            )}
            {displayedOrders.length === 0 && !loading && !menuItemsLoading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <Icon path={mdiPackageVariant} size={2.00} className="text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {t("admin.orderManagement.noOrders")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.orderManagement.noOrdersDescription")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {!shouldShowFutureTabs && (
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    {t("admin.orderManagement.orders")}
                  </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedOrders.map((order: Order) => (
                    <Card
                      key={order.id}
                      ref={(el) => {
                        orderCardRefs.current[order.id] = el;
                      }}
                      className={cn(
                        "transition-all duration-300 hover:shadow-lg border",
                        newOrderIds.has(order.id) &&
                          "border-pink-500 bg-pink-50 dark:bg-pink-950/20",
                        unseenNotificationOrderIds.has(order.id) &&
                          !newOrderIds.has(order.id) &&
                          "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-950/20 border-orange-500",
                        isClosedOrder(order) &&
                          !order.isScheduledOrder &&
                          "opacity-50 pointer-events-none",
                        order.isScheduledOrder &&
                          highlightOrderId === order.id &&
                          "ring-2 ring-blue-500 ring-offset-2"
                      )}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <CardTitle className="text-base font-semibold truncate min-w-0">
                                {formatOrderNumber(order.orderNumber)}
                              </CardTitle>
                              {order.isMerged ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                  {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                                </span>
                              ) : null}
                              {unseenNotificationOrderIds.has(order.id) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 text-[10px] font-semibold">
                                  <Icon path={mdiAlertCircle} size={0.5} />
                                  {t("admin.orderManagement.new", { defaultValue: "New" })}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs px-2 py-0.5",
                                  order.orderType === "PICKUP"
                                    ? "border-green-500 text-green-600"
                                    : "border-blue-500 text-blue-600"
                                )}
                              >
                                {order.orderType === "PICKUP"
                                  ? t("admin.orderManagement.pickup", {
                                      defaultValue: "Pickup",
                                    })
                                  : t("admin.orderManagement.delivery", {
                                      defaultValue: "Delivery",
                                    })}
                              </Badge>

                              {isClosedOrder(order) ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs px-2 py-0.5 flex items-center gap-1 border-muted-foreground text-muted-foreground"
                                >
                                  <Icon path={mdiLock} size={0.45} />
                                  {t("admin.orderManagement.closedOrder", { defaultValue: "Closed" })}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <DropdownMenu
                            open={openOrderMenuId === order.id}
                            onOpenChange={(open) => {
                              setOpenOrderMenuId(open ? order.id : null);
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 touch-manipulation flex-shrink-0 relative z-10 pointer-events-auto"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  setOpenOrderMenuId((prev) =>
                                    prev === order.id ? null : order.id
                                  );
                                }}
                              >
                                <Icon path={mdiDotsVertical} size={0.67} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setOpenOrderMenuId(null);
                                  handleViewOrder(order);
                                }}
                              >
                                <Icon path={mdiEye} size={0.67} className="mr-2" />
                                {t("admin.orderManagement.viewDetails")}
                              </DropdownMenuItem>
                              {canEditOrders && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setOpenOrderMenuId(null);
                                    handleEditOrder(order);
                                  }}
                                  disabled={isClosedOrder(order) && !order.isScheduledOrder}
                                >
                                  <Icon path={mdiPencil} size={0.67} className="mr-2" />
                                  {t("admin.orderManagement.editOrder")}
                                </DropdownMenuItem>
                              )}
                              {canCancelOrders &&
                                order.status !== "CANCELLED" &&
                                order.status !== "DELIVERED" && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setOpenOrderMenuId(null);
                                      handleStartCancelOrder(order);
                                    }}
                                    disabled={
                                      isActionLoading === order.id ||
                                      (isClosedOrder(order) && !order.isScheduledOrder)
                                    }
                                    className="text-orange-600"
                                  >
                                    <Icon path={mdiCloseCircle} size={0.67} className="mr-2" />
                                    {t("admin.orderManagement.cancelOrder")}
                                  </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        {/* Order Summary */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon path={mdiCurrencyUsd} size={0.67} className="text-green-600" />
                            <span className="font-semibold text-lg">
                              {formatCurrency(order.totalAmount)}
                            </span>
                          </div>
                          <span
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded-full",
                              getStatusColor(order.status)
                            )}
                          >
                            {formatStatus(order.status)}
                          </span>
                        </div>

                        {/* Customer Info */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon path={mdiAccount} size={0.67} />
                          <span className="truncate">
                            {order.user
                              ? `${order.user.firstName || ""} ${
                                  order.user.lastName || ""
                                }`.trim() || order.user.email
                              : order.guestName ||
                                t("admin.orderManagement.guest")}
                          </span>
                        </div>

                        {/* Branch Info */}
                        {order.branch && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Icon path={mdiOfficeBuilding} size={0.67} />
                            <span className="truncate">
                              {t("admin.orderManagement.branch")}: {order.branch.name}
                            </span>
                          </div>
                        )}

                        {/* Order Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Icon path={mdiCalendar} size={0.50} />
                            <span>{formatDate(order.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Icon path={mdiPackageVariant} size={0.50} />
                            <span>
                              {order._count?.orderItems || 0}{" "}
                              {t("admin.orderManagement.items")}
                            </span>
                          </div>
                        </div>

                        {order.isScheduledOrder && order.scheduledDate && (
                          (() => {
                            const isOverdue = isOverdueScheduledOrder(order);
                            return (
                          <div
                            className={cn(
                              "rounded-md border p-2",
                              isOverdue
                                ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                : "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Icon
                                path={mdiCalendar}
                                size={0.60}
                                className={
                                  isOverdue
                                    ? "text-red-600"
                                    : "text-purple-600"
                                }
                              />
                              <div className="min-w-0">
                                <div
                                  className={cn(
                                    "text-[10px] font-medium uppercase",
                                    isOverdue
                                      ? "text-red-600"
                                      : "text-purple-600"
                                  )}
                                >
                                  {order.orderType === "PICKUP"
                                    ? t("admin.orderManagement.scheduled.pickupFor", {
                                        defaultValue: "Pickup Scheduled For",
                                      })
                                    : t("admin.orderManagement.scheduled.deliveryFor", {
                                        defaultValue: "Delivery Scheduled For",
                                      })}
                                </div>
                                <div
                                  className={cn(
                                    "text-sm font-semibold truncate",
                                    isOverdue
                                      ? "text-red-700 dark:text-red-400"
                                      : "text-purple-700 dark:text-purple-400"
                                  )}
                                >
                                  {new Date(order.scheduledDate).toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}{" "}
                                  {t("admin.orderManagement.scheduled.at", {
                                    defaultValue: "at",
                                  })}{" "}
                                  {new Date(order.scheduledDate).toLocaleTimeString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                            );
                          })()
                        )}

                        {/* Payment Status */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1">
                            {getPaymentStatusIcon(order.paymentStatus)}
                            <span className="text-muted-foreground">
                              {formatPaymentStatus(order.paymentStatus)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {getPaymentMethodIcon(order.paymentMethod)}
                            <span className="text-muted-foreground">
                              {formatPaymentMethod(order.paymentMethod)}
                            </span>
                          </div>
                        </div>

                        {getRefundedByLabel(order) && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.refundedBy.label", { defaultValue: "Refunded by" })}: {getRefundedByLabel(order)}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {selectedBranchId && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.orderManagement.showingOrders", {
              count: orders.length,
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronLeft} size={0.67} />
            </Button>
            <span className="text-sm text-foreground font-medium px-3 py-1 bg-muted rounded-md">
              {t("admin.orderManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}

      {/* View Order Dialog */}
      <Dialog
        open={isViewDialogOpen}
        onOpenChange={(open) => {
          if (!open && highlightOrderId) {
            const msSinceProgrammaticOpen =
              Date.now() - (highlightDialogOpenedAtRef.current || 0);
            if (msSinceProgrammaticOpen > 0 && msSinceProgrammaticOpen < 400) {
              return;
            }
          }
          setIsViewDialogOpen(open);
          if (!open && highlightOrderId) {
            suppressHighlightOpenRef.current = true;
            searchingForOrderRef.current = null;
            lastOpenedHighlightOrderRef.current = null;
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("highlightOrder");
              return next;
            });

            // Allow highlight-opening again after the URL param has been removed
            window.setTimeout(() => {
              suppressHighlightOpenRef.current = false;
            }, 250);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground p-3">
          <DialogHeader className="px-0 pb-2">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.orderManagement.orderDetails")} -{" "}
              {selectedOrder && formatOrderNumber(selectedOrder.orderNumber)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Card>
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        {t("admin.orderManagement.orderInformation")}
                      </CardTitle>
                      {selectedOrder.isMerged ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm px-3 pb-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.status")}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          getStatusColor(selectedOrder.status)
                        )}
                      >
                        {formatStatus(selectedOrder.status)}
                      </span>
                    </div>

                    {selectedOrder.status === "CANCELLED" ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t("admin.orderManagement.cancellationReasonLabel", {
                            defaultValue: "Cancellation reason",
                          })}
                        </span>
                        <span className="text-foreground font-medium text-right max-w-[60%] wrap-break-word">
                          {getCancellationReason(selectedOrder) ||
                            t("admin.orderManagement.cancellationReasonNotProvided", {
                              defaultValue: "Not provided",
                            })}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.paymentStatus")}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          getPaymentStatusColor(selectedOrder.paymentStatus)
                        )}
                      >
                        {formatPaymentStatus(selectedOrder.paymentStatus)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.paymentMethod")}
                      </span>
                      <span>
                        {formatPaymentMethod(selectedOrder.paymentMethod)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.orderType", { defaultValue: "Order Type" })}
                      </span>
                      <span className="font-medium">
                        {selectedOrder.orderType === "DELIVERY"
                          ? t("admin.orderManagement.orderTypes.delivery", { defaultValue: "Delivery" })
                          : t("admin.orderManagement.orderTypes.pickup", { defaultValue: "Pickup" })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.totalAmount")}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(selectedOrder.totalAmount)}
                      </span>
                    </div>
                    {!selectedOrder.isScheduledOrder &&
                      (() => {
                        const remaining = getRemainingPrepMs(selectedOrder);
                        if (remaining === null) return null;
                        return (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.preparationTimeRemaining", {
                                defaultValue: "Preparation time remaining",
                              })}
                            </span>
                            <span className="font-semibold text-purple-400">
                              {formatRemaining(remaining)}
                            </span>
                          </div>
                        );
                      })()}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.deliveryFee")}
                      </span>
                      <span>{formatCurrency(selectedOrder.deliveryFee)}</span>
                    </div>
                    {selectedOrder.orderType === "PICKUP" &&
                      (selectedOrder as any).takeawayServiceFee !== undefined &&
                      (selectedOrder as any).takeawayServiceFee !== null &&
                      Number((selectedOrder as any).takeawayServiceFee) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.takeawayServiceFee", {
                              defaultValue: "Takeaway service fee",
                            })}
                          </span>
                          <span>
                            {formatCurrency(Number((selectedOrder as any).takeawayServiceFee))}
                          </span>
                        </div>
                      )}
                    {selectedOrder.orderType === "PICKUP" &&
                      !isTaxInclusiveForSelectedOrder &&
                      (selectedOrder as any).takeawayServiceTaxAmount !== undefined &&
                      Number((selectedOrder as any).takeawayServiceTaxAmount) > 0 && (
                        <div className="flex justify-between ml-4">
                          <span className="text-xs text-muted-foreground">
                            {t("admin.orderManagement.fields.takeawayServiceTax", {
                              defaultValue: "Takeaway service tax",
                            })}
                          </span>
                          <span className="text-xs">
                            {formatCurrency(
                              Number((selectedOrder as any).takeawayServiceTaxAmount)
                            )}
                          </span>
                        </div>
                      )}
                    {selectedOrder.deliveryTaxAmount !== undefined &&
                      selectedOrder.deliveryTaxAmount > 0 && (
                        <div className="flex justify-between ml-4">
                          <span className="text-xs text-muted-foreground">
                            {t("admin.orderManagement.fields.deliveryTax")}
                          </span>
                          <span className="text-xs">
                            {formatCurrency(selectedOrder.deliveryTaxAmount)}
                          </span>
                        </div>
                      )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.tax")}
                      </span>
                      <span>{formatCurrency(selectedOrder.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("admin.orderManagement.fields.created")}
                      </span>
                      <span>{formatOrderDetailsDateTime(selectedOrder.createdAt)}</span>
                    </div>

                    {selectedOrder.isScheduledOrder && selectedOrder.scheduledDate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {selectedOrder.orderType === "PICKUP"
                            ? t("admin.orderManagement.scheduled.pickupFor", {
                                defaultValue: "Pickup Scheduled For",
                              })
                            : t("admin.orderManagement.scheduled.deliveryFor", {
                                defaultValue: "Delivery Scheduled For",
                              })}
                        </span>
                        <span>{formatOrderDetailsDateTime(selectedOrder.scheduledDate)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 px-3 pt-3">
                    <CardTitle className="text-sm">
                      {t("admin.orderManagement.customerInformation")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm px-3 pb-3">
                    {selectedOrder.user ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.name")}
                          </span>
                          <span>
                            {selectedOrder.user.firstName}{" "}
                            {selectedOrder.user.lastName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.email")}
                          </span>
                          <span>{selectedOrder.user.email}</span>
                        </div>
                        {selectedOrder.user.phone && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.fields.phone")}
                            </span>
                            <span>{selectedOrder.user.phone}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.name")}
                          </span>
                          <span>
                            {selectedOrder.guestName ||
                              t("admin.orderManagement.guest")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.email")}
                          </span>
                          <span>
                            {selectedOrder.guestEmail ||
                              t("admin.orderManagement.notAvailable")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.phone")}
                          </span>
                          <span>
                            {selectedOrder.guestPhone ||
                              selectedOrder.deliveryPhone ||
                              t("admin.orderManagement.notAvailable")}
                          </span>
                        </div>
                      </>
                    )}
                    {selectedOrder.orderType === "PICKUP" && (
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.pickupPhone", {
                              defaultValue: "Pickup Phone",
                            })}
                          </span>
                          <span>
                            {selectedOrder.pickupPhone ||
                              t("admin.orderManagement.notAvailable")}
                          </span>
                        </div>
                        {selectedOrder.pickupNotes && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.pickupNotes", {
                                defaultValue: "Pickup Notes",
                              })}
                            </span>
                            <span className="text-right">
                              {selectedOrder.pickupNotes}
                            </span>
                          </div>
                        )}
                        {selectedOrder.branch && (
                          <div className="mt-3">
                            <PickupLocationDisplay branch={selectedOrder.branch as Branch | null} compact />
                          </div>
                        )}
                      </div>
                    )}
                    {(selectedOrder.deliveryAddress || (selectedOrder as any).deliveryStreetAddress || (selectedOrder as any).deliveryPostalCode) && (
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.address")}
                          </span>
                          <span className="text-right">
                            {(() => {
                              const street = (selectedOrder as any).deliveryStreetAddress as
                                | string
                                | undefined;
                              const house = (selectedOrder as any).deliveryHouseNumber as
                                | string
                                | undefined;
                              if (street && house) return `${street} ${house}`;
                              if (street) return street;
                              return selectedOrder.deliveryAddress;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("admin.orderManagement.fields.postalCode", {
                              defaultValue: "Postal Code",
                            })}
                          </span>
                          <span className="text-right">
                            {(selectedOrder as any).deliveryPostalCode || ""}
                          </span>
                        </div>
                        {selectedOrder.deliveryBuilding && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.fields.building")}
                            </span>
                            <span className="text-right">
                              {selectedOrder.deliveryBuilding}
                            </span>
                          </div>
                        )}
                        {selectedOrder.deliveryFloor && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.fields.floor")}
                            </span>
                            <span className="text-right">
                              {selectedOrder.deliveryFloor}
                            </span>
                          </div>
                        )}
                        {selectedOrder.deliveryApartment && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.fields.apartmentUnit")}
                            </span>
                            <span className="text-right">
                              {selectedOrder.deliveryApartment}
                            </span>
                          </div>
                        )}
                        {selectedOrder.deliveryExtraDetails && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("admin.orderManagement.fields.extraDetails")}
                            </span>
                            <span className="text-right">
                              {selectedOrder.deliveryExtraDetails}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedOrder.deliveryNotes && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t("admin.orderManagement.deliveryNotes")}
                        </span>
                        <span className="text-right">
                          {selectedOrder.deliveryNotes}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Order Items */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t("admin.orderManagement.orderItems")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-2">
                    {selectedOrder.orderItems
                      .filter((item: any) => item.itemType !== "DEAL_COMPONENT")
                      .map((item: any) => {
                        const isDeal = item.itemType === "DEAL" || item.deal;
                        const itemName = isDeal ? item.deal?.name : item.meal?.name;
                        const itemImage = isDeal ? item.deal?.image : item.meal?.image;
                        const dealChildItems = item.dealChildItems || [];
                        const dealTaxTotal = isDeal
                          ? (dealChildItems || []).reduce(
                              (sum: number, child: any) => sum + Number(child.taxAmount || 0),
                              0
                            )
                          : 0;

                        return (
                      <div
                        key={item.id}
                        className="border rounded-lg overflow-hidden bg-card"
                      >
                        {/* Item Header - Image, Name, Price */}
                        <div className="flex gap-2 p-2">
                          {/* Meal/Deal Image */}
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            <img
                              src={
                                itemImage
                                  ? isExternalImage(itemImage)
                                    ? itemImage
                                    : getOptimizedImageUrl(itemImage)
                                  : "/placeholder-meal.png"
                              }
                              alt={itemName || "Item"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/placeholder-meal.png";
                              }}
                            />
                          </div>

                          {/* Item Details */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div>
                                <h4 className="font-semibold text-base mb-1">
                                  {isDeal && <Badge variant="secondary" className="mr-2 text-xs">Deal</Badge>}
                                  {itemName}
                                </h4>
                                {!isDeal && item.selectedSize && (
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {item.selectedSize}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                      × {item.quantity}
                                    </span>
                                  </div>
                                )}
                                {(!item.selectedSize || isDeal) && (
                                  <span className="text-sm text-muted-foreground">
                                    {t("admin.orderManagement.fields.quantity")}{" "}
                                    {item.quantity}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-foreground">
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </p>
                                {((isDeal && dealTaxTotal > 0) ||
                                  (!isDeal && item.taxAmount !== undefined && item.taxAmount > 0)) && (
                                    <p className="text-xs text-muted-foreground">
                                      {t("admin.orderManagement.fields.tax")}: {" "}
                                      {formatCurrency(isDeal ? dealTaxTotal : item.taxAmount)}
                                      {!isDeal && item.taxPercentage && ` (${item.taxPercentage}%)`}
                                    </p>
                                  )}
                              </div>
                            </div>

                            {/* Deal Components */}
                            {isDeal && dealChildItems.length > 0 && (
                              <div className="mt-2 pl-2 border-l-2 border-primary/30">
                                <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                                  {t("admin.orderManagement.dealComponents", { defaultValue: "Includes" })}:
                                </p>
                                <div className="space-y-1">
                                  {dealChildItems.map((child: any) => (
                                    <div key={child.id} className="flex justify-between items-center text-xs">
                                      <span className="text-muted-foreground">
                                        {child.dealComponent?.name || "Component"} ×{child.quantity}
                                      </span>
                                      <span className="text-foreground">
                                        {formatCurrency(child.totalPrice || 0)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Special Instructions */}
                            {item.specialInstructions && (
                              <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                                <p className="text-xs font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                                  {t(
                                    "admin.orderManagement.fields.specialInstructions"
                                  )}
                                  :
                                </p>
                                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                                  {item.specialInstructions}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {item.orderItemAddOns &&
                          item.orderItemAddOns.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs pl-3 font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                                {t("admin.orderManagement.fields.addons")}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(item.orderItemAddOns || []).map((addon: any) => (
                                  <div
                                    key={addon.id}
                                    className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-md text-xs border border-border"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-foreground font-medium">
                                        {addon.addOnName}
                                      </span>
                                      {addon.quantity && addon.quantity > 1 && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          ×{addon.quantity}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <span className="text-foreground font-semibold">
                                        {formatCurrency(
                                          addon.addOnPrice *
                                            (addon.quantity || 1)
                                        )}
                                      </span>
                                      {addon.taxAmount !== undefined &&
                                        addon.taxAmount > 0 && (
                                          <div className="text-[10px] text-muted-foreground mt-0.5">
                                            + {formatCurrency(addon.taxAmount)}
                                            {addon.taxPercentage &&
                                              ` ${t(
                                                "admin.orderManagement.fields.tax"
                                              ).toLowerCase()}`}
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Optional Ingredients - Only show included */}
                        {item.orderItemOptionalIngredients &&
                          item.orderItemOptionalIngredients.length > 0 && (
                            <div className="mt-3">
                              {(() => {
                                const included =
                                  item.orderItemOptionalIngredients.filter(
                                    (ing: any) => ing.isIncluded
                                  );

                                return (
                                  <>
                                    {included.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-xs pl-3 font-medium text-green-600 dark:text-green-400 mb-2 uppercase tracking-wide">
                                          {t(
                                            "mealCustomization.includedIngredients"
                                          )}
                                        </p>
                                        <div className="flex flex-wrap gap-2 pl-3">
                                          {included.map((ing: any) => (
                                            <Badge
                                              key={ing.id}
                                              className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                                            >
                                              {ing.ingredientName}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                        {/* Price Breakdown - Show tax breakdown with "Included" label when tax-inclusive */}
                        {((isDeal && dealTaxTotal > 0) ||
                        (item.taxAmount !== undefined && item.taxAmount > 0) ||
                        (item.orderItemAddOns || []).some(
                          (a: any) => a.taxAmount !== undefined && a.taxAmount > 0
                        )) ? (
                          <div className="border-t bg-muted/30 px-4 py-2 mt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                              {isTaxInclusive
                                ? t("admin.orderManagement.fields.includedTaxBreakdown", { defaultValue: "Included Tax Breakdown" })
                                : t("admin.orderManagement.fields.taxBreakdown")}
                            </p>
                            <div className="space-y-1.5 text-xs">
                              {isDeal
                                ? (dealChildItems || []).map((child: any) => {
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
                                      <div key={child.id} className="flex justify-between">
                                        <span className="text-muted-foreground">
                                          {child.dealComponent?.name || "Component"}
                                          {child.quantity ? ` ×${child.quantity}` : ""}
                                          {taxPercentage !== null ? ` (${taxPercentage}%)` : ""}
                                        </span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrency(taxAmount)}
                                        </span>
                                      </div>
                                    );
                                  })
                                : item.taxAmount !== undefined &&
                                  item.taxAmount > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        {isTaxInclusive
                                          ? t("admin.orderManagement.fields.includedMealTax", { defaultValue: "Included meal tax" })
                                          : t("admin.orderManagement.fields.mealTax")}
                                        {item.taxPercentage && ` (${item.taxPercentage}%)`}
                                      </span>
                                      <span className="text-foreground font-medium">
                                        {formatCurrency(item.taxAmount)}
                                      </span>
                                    </div>
                                  )}
                              {(item.orderItemAddOns || [])
                                .filter(
                                  (a: any) =>
                                    a.taxAmount !== undefined && a.taxAmount > 0
                                )
                                .map((addon: any) => (
                                  <div
                                    key={addon.id}
                                    className="flex justify-between"
                                  >
                                    <span className="text-muted-foreground">
                                      + {addon.addOnName}
                                      {isTaxInclusive && ` (${t("admin.orderManagement.fields.included", { defaultValue: "included" })})`}
                                      {addon.taxPercentage &&
                                        ` (${addon.taxPercentage}%)`}
                                    </span>
                                    <span className="text-foreground font-medium">
                                      {formatCurrency(addon.taxAmount || 0)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* Refund History */}
              {selectedOrder.paymentStatus === "PARTIALLY_REFUNDED" ||
              selectedOrder.paymentStatus === "REFUNDED" ? (
                <Card>
                  <CardHeader className="pb-2 px-3 pt-3">
                    <CardTitle className="text-lg">
                      {t("admin.orderManagement.refundHistory")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {loadingRefunds ? (
                      <div className="flex justify-center py-4">
                        <Icon path={mdiLoading} size={1.00} className="animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Refund Summary */}
                        <div className="flex justify-between items-center p-3 rounded-lg border border-border bg-muted/30">
                          <div>
                            <div className="font-medium">
                              {t("admin.orderManagement.totalOrderAmount")}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatCurrency(selectedOrder.totalAmount)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-green-700 dark:text-green-400">
                              {t("admin.orderManagement.totalRefunded")}: {" "}
                              {formatCurrency(
                                orderRefunds.reduce(
                                  (sum, refund) => sum + refund.amount,
                                  0
                                )
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {t("admin.orderManagement.fields.paymentStatus")} {" "}
                              {formatPaymentStatus(selectedOrder.paymentStatus)}
                            </div>
                          </div>
                        </div>

                        {/* Individual Refunds */}
                        {orderRefunds.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-sm font-medium">
                              {t("admin.orderManagement.refundDetails")}:
                            </div>
                            {orderRefunds.map((refund, index) => (
                              <div
                                key={refund.id}
                                className="flex justify-between items-center p-2 rounded border border-border bg-muted/10"
                              >
                                <div>
                                  <div className="text-sm font-medium">
                                    {t("admin.orderManagement.refundDetails")} #
                                    {index + 1} -{" "}
                                    {refund.refundType === "FULL" &&
                                      t("admin.orderManagement.fullRefund")}
                                    {refund.refundType === "PARTIAL" &&
                                      t(
                                        "admin.orderManagement.partialRefund"
                                      ).split(" (")[0]}
                                    {refund.refundType === "ITEM_SPECIFIC" &&
                                      t(
                                        "admin.orderManagement.itemSpecificRefund"
                                      )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(
                                      refund.createdAt
                                    ).toLocaleString()}
                                  </div>
                                  {refund.reason && (
                                    <div className="text-xs text-muted-foreground">
                                      {
                                        t(
                                          "admin.orderManagement.reasonForRefund"
                                        ).split(" (")[0]
                                      }
                                      : {refund.reason}
                                    </div>
                                  )}
                                  {(refund.stripeRefundId ||
                                    refund.paypalRefundId) && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {refund.stripeRefundId && (
                                        <div>
                                          Stripe ID: {refund.stripeRefundId}
                                        </div>
                                      )}
                                      {refund.paypalRefundId && (
                                        <div>
                                          PayPal ID: {refund.paypalRefundId}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-green-700 dark:text-green-400">
                                    {formatCurrency(refund.amount)}
                                  </div>
                                  <div
                                    className={`text-xs ${
                                      refund.status === "SUCCEEDED"
                                        ? "text-green-700 dark:text-green-400"
                                        : refund.status === "FAILED"
                                        ? "text-red-700 dark:text-red-400"
                                        : refund.status === "PENDING"
                                        ? "text-yellow-700 dark:text-yellow-400"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {t(
                                      `admin.orderManagement.refundStatuses.${refund.status.toLowerCase()}`
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground text-center py-2">
                            {t("admin.orderManagement.noRefundDetails")}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex justify-center gap-4 pt-4">
                <Button
                  onClick={() => handlePreviewBill(selectedOrder)}
                  variant="outline"
                  className="border-pink-500/50 text-pink-300 bg-transparent hover:bg-transparent px-6 py-2"
                >
                  <Icon path={mdiReceipt} size={0.67} className="mr-2" />
                  {t("admin.orderManagement.previewBill", { defaultValue: "Preview Bill" })}
                </Button>
              </div>

              {/* Action Buttons at Bottom */}
              <div className="flex justify-center gap-4 pt-4">
                {/* Edit Button (available until business day is closed) */}
                {canEditOrders && !isClosedOrder(selectedOrder) && (
                  <Button
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      handleEditOrder(selectedOrder);
                    }}
                    className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2"
                  >
                    <Icon path={mdiPencil} size={0.67} className="mr-2 flex-shrink-0" />
                    {t("admin.orderManagement.editOrder")}
                  </Button>
                )}
                {/* Refund Button for Paid Orders */}
                {canRefundOrders &&
                  (selectedOrder.paymentStatus === "PAID" ||
                    selectedOrder.paymentStatus === "PARTIALLY_REFUNDED") && (
                  <Button
                    onClick={() => handleRefundOrder(selectedOrder)}
                    disabled={isClosedOrder(selectedOrder)}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2"
                  >
                    <Icon path={mdiCurrencyUsd} size={0.67} className="mr-2 flex-shrink-0" />
                    {t("admin.orderManagement.processRefund")}
                  </Button>
                )}
              </div>
            </div>
          )}
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
              {t("admin.orderManagement.cancelOrderDialog.title", {
                defaultValue: "Cancel order",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.orderManagement.cancelOrderDialog.confirm", {
                defaultValue: "Are you sure to cancel the order {{orderId}}?",
                orderId:
                  orderToCancel?.orderNumber
                    ? formatOrderNumber(orderToCancel.orderNumber)
                    : orderToCancel?.id,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-white font-medium">
              {t("admin.orderManagement.cancelOrderDialog.reasonLabel", {
                defaultValue: "Reason for cancellation",
              })}
            </div>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("admin.orderManagement.cancelOrderDialog.reasonPlaceholder", {
                defaultValue: "Please tell us why you are cancelling...",
              })}
              className="bg-[#0f1112] border border-[#262626] text-white placeholder:text-[#6b7280]"
            />
            <div className="text-xs text-[#6b7280]">
              {t("admin.orderManagement.cancelOrderDialog.reasonRequiredHint", {
                defaultValue: "This field is required.",
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isCancelling) return;
                setOrderToCancel(null);
                setCancelReason("");
              }}
              disabled={isCancelling}
              className="border border-[#404040] text-[#9CA3AF] bg-transparent hover:bg-[#1a1a1a]"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleConfirmCancelOrder}
              disabled={isCancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isCancelling
                ? t("admin.orderManagement.cancelling", { defaultValue: "Cancelling..." })
                : t("admin.orderManagement.cancelOrder", { defaultValue: "Cancel Order" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill Preview Dialog */}
      <Dialog open={isBillPreviewOpen} onOpenChange={setIsBillPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
              <Icon path={mdiReceipt} size={1} />
              {t("admin.orderManagement.previewBillTitle", { defaultValue: "Bill Preview" })} -{" "}
              {selectedOrder && formatOrderNumber(selectedOrder.orderNumber)}
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

      {/* Edit Order Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.orderManagement.editOrderTitle")} -{" "}
              {selectedOrder && formatOrderNumber(selectedOrder.orderNumber)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">
                    {t("admin.orderManagement.orderStatus")}
                  </Label>
                  <Select
                    value={editFormData.status || selectedOrder.status}
                    onValueChange={(value: string) => {
                      if (value === "CANCELLED") {
                        handleStartCancelOrder(selectedOrder);
                        return;
                      }
                      const nextStatus = value as Order["status"];
                      const shouldAutoMarkPaid = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
                      const currentPaymentStatus =
                        (editFormData.paymentStatus || selectedOrder.paymentStatus) as Order["paymentStatus"];
                      const isRefundedState =
                        currentPaymentStatus === "REFUNDED" || currentPaymentStatus === "PARTIALLY_REFUNDED";

                      setEditFormData({
                        ...editFormData,
                        status: nextStatus,
                        ...(shouldAutoMarkPaid && !isRefundedState ? { paymentStatus: "PAID" } : {}),
                      });
                    }}
                    disabled={selectedOrder.status === "CANCELLED"}
                  >
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAllowedStatuses(selectedOrder.orderType).map(
                        (statusOption) => (
                          <SelectItem key={statusOption} value={statusOption}>
                            {formatStatus(statusOption)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentStatus">
                    {t("admin.orderManagement.paymentStatus")}
                  </Label>
                  <Select
                    value={
                      editFormData.paymentStatus || selectedOrder.paymentStatus
                    }
                    onValueChange={(value: string) =>
                      setEditFormData({
                        ...editFormData,
                        paymentStatus: value as Order["paymentStatus"],
                      })
                    }
                    disabled={selectedOrder.status === "CANCELLED"}
                  >
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">
                        {t("admin.orderManagement.paymentStatuses.pending")}
                      </SelectItem>
                      <SelectItem value="PAID">
                        {t("admin.orderManagement.paymentStatuses.paid")}
                      </SelectItem>
                      <SelectItem value="FAILED">
                        {t("admin.orderManagement.paymentStatuses.failed")}
                      </SelectItem>
                      <SelectItem value="REFUNDED">
                        {t("admin.orderManagement.paymentStatuses.refunded")}
                      </SelectItem>
                      <SelectItem value="PARTIALLY_REFUNDED">
                        {t(
                          "admin.orderManagement.paymentStatuses.partiallyRefunded"
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preparationTime">
                  {t("admin.orderManagement.preparationTime", { defaultValue: "Preparation Time" })}
                </Label>
                <Select
                  value={String(editFormData.preparationTime ?? selectedOrder.preparationTime ?? "")}
                  onValueChange={(value: string) =>
                    setEditFormData({
                      ...editFormData,
                      preparationTime: value ? Number(value) : undefined,
                    })
                  }
                  disabled={selectedOrder.status === "CANCELLED"}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.orderManagement.selectPreparationTime", { defaultValue: "Select time" })} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                    <SelectItem value="45">45 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                    <SelectItem value="60">60 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryNotes">
                  {t("admin.orderManagement.deliveryNotes")}
                </Label>
                <Textarea
                  id="deliveryNotes"
                  value={selectedOrder.deliveryNotes || ""}
                  readOnly
                  placeholder={t(
                    "admin.orderManagement.deliveryNotesPlaceholder"
                  )}
                  rows={3}
                  className="bg-transparent text-foreground border-border"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isActionLoading === selectedOrder.id}
                  className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleUpdateOrder}
                  disabled={isActionLoading === selectedOrder.id || selectedOrder.status === "CANCELLED"}
                  className="bg-pink-500 hover:bg-pink-600 text-white h-10"
                >
                  {isActionLoading === selectedOrder.id ? (
                    <>
                      <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.orderManagement.updating")}
                    </>
                  ) : (
                    t("admin.orderManagement.updateOrder")
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Bill Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
              <Icon path={mdiPrinter} size={1} />
              {t("admin.orderManagement.printBillTitle")} -{" "}
              {selectedOrder && formatOrderNumber(selectedOrder.orderNumber)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Mobile App Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center flex-shrink-0">
                    <Icon path={mdiCellphone} size={0.83} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      {t("admin.orderManagement.mobileAppRequired")}
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      {t("admin.orderManagement.mobileAppDescription")}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-xs font-semibold">
                          1
                        </div>
                        <span>{t("admin.orderManagement.step1")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-xs font-semibold">
                          2
                        </div>
                        <span>{t("admin.orderManagement.step2")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-xs font-semibold">
                          3
                        </div>
                        <span>
                          {t("admin.orderManagement.step3")}{" "}
                          <span className="font-semibold">
                            {formatOrderNumber(selectedOrder.orderNumber)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-xs font-semibold">
                          4
                        </div>
                        <span>{t("admin.orderManagement.step4")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bluetooth Connection Instructions */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center flex-shrink-0">
                    <Icon path={mdiBluetooth} size={0.83} className="text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                      {t("admin.orderManagement.bluetoothSetup")}
                    </h3>
                    <div className="space-y-2 text-sm text-green-800 dark:text-green-200">
                      <p>• {t("admin.orderManagement.bluetoothStep1")}</p>
                      <p>• {t("admin.orderManagement.bluetoothStep2")}</p>
                      <p>• {t("admin.orderManagement.bluetoothStep3")}</p>
                      <p>• {t("admin.orderManagement.bluetoothStep4")}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Summary for Reference */}
              <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  {t("admin.orderManagement.orderSummaryReference")}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {t("admin.orderManagement.fields.orderNumber")}
                    </span>
                    <p className="font-semibold">
                      {formatOrderNumber(selectedOrder.orderNumber)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {t("admin.orderManagement.fields.totalAmount")}
                    </span>
                    <p className="font-semibold">
                      {formatCurrency(selectedOrder.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {t("admin.orderManagement.fields.customer")}
                    </span>
                    <p className="font-semibold">
                      {selectedOrder.user
                        ? `${selectedOrder.user.firstName || ""} ${
                            selectedOrder.user.lastName || ""
                          }`.trim() || selectedOrder.user.email
                        : selectedOrder.guestName ||
                          t("admin.orderManagement.guest")}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {t("admin.orderManagement.fields.orderDate")}
                    </span>
                    <p className="font-semibold">
                      {formatDate(selectedOrder.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsPrintDialogOpen(false)}
                >
                  {t("common.close")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="max-w-4xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.orderManagement.processRefundTitle")} -{" "}
              {selectedOrder && formatOrderNumber(selectedOrder.orderNumber)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("admin.orderManagement.orderSummary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">
                        {t("admin.orderManagement.fields.totalAmount")}
                      </span>
                      <span className="ml-2">
                        {formatPrice(
                          parseFloat(selectedOrder.totalAmount.toString()),
                          displayCurrency
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">
                        {t("admin.orderManagement.fields.paymentStatus")}
                      </span>
                      <span className="ml-2">
                        {formatPaymentStatus(selectedOrder.paymentStatus)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Refund Type Selection */}
              <div className="space-y-4">
                <Label htmlFor="refundType">
                  {t("admin.orderManagement.refundType")}
                </Label>
                <Select
                  value={refundFormData.refundType}
                  onValueChange={handleRefundTypeChange}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">
                      {t("admin.orderManagement.fullRefund")}
                    </SelectItem>
                    <SelectItem value="PARTIAL">
                      {t("admin.orderManagement.partialRefund")}
                    </SelectItem>
                    <SelectItem value="ITEM_SPECIFIC">
                      {t("admin.orderManagement.itemSpecificRefund")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Partial Refund Amount */}
              {refundFormData.refundType === "PARTIAL" && (
                <div className="space-y-2">
                  <Label htmlFor="refundAmount">
                    {t("admin.orderManagement.refundAmount")}
                  </Label>
                  <Input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={parseFloat(selectedOrder.totalAmount.toString())}
                    value={refundFormData.amount || ""}
                    onChange={(e) =>
                      setRefundFormData({
                        ...refundFormData,
                        amount: parseFloat(e.target.value) || undefined,
                      })
                    }
                    placeholder={t(
                      "admin.orderManagement.refundAmountPlaceholder"
                    )}
                  />
                </div>
              )}

              {/* Item-Specific Refund */}
              {refundFormData.refundType === "ITEM_SPECIFIC" && (
                <div className="space-y-4">
                  <Label>
                    {t("admin.orderManagement.selectItemsToRefund")}
                  </Label>
                  <div className="space-y-3">
                    {selectedOrder.orderItems.map((item) => {
                      const isSelected = refundFormData.items.some(
                        (refundItem) => refundItem.orderItemId === item.id
                      );
                      const refundItem = refundFormData.items.find(
                        (refundItem) => refundItem.orderItemId === item.id
                      );

                      return (
                        <Card
                          key={item.id}
                          className={isSelected ? "border-pink-500" : ""}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) =>
                                    handleItemRefundToggle(
                                      item.id,
                                      e.target.checked
                                    )
                                  }
                                  className="h-4 w-4 text-pink-600"
                                />
                                <div>
                                  <h4 className="font-medium">
                                    {item.meal.name}
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {t("admin.orderManagement.quantity")}:{" "}
                                    {item.quantity} ×{" "}
                                    {formatPrice(
                                      parseFloat(item.unitPrice.toString()),
                                      currency
                                    )}
                                  </p>
                                  <p className="text-sm font-medium">
                                    {t("admin.orderManagement.total")}:{" "}
                                    {formatPrice(
                                      parseFloat(item.totalPrice.toString()),
                                      currency
                                    )}
                                  </p>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex items-center space-x-2">
                                  <Label htmlFor={`amount-${item.id}`}>
                                    {t("admin.orderManagement.amount")}:
                                  </Label>
                                  <Input
                                    id={`amount-${item.id}`}
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={parseFloat(item.totalPrice.toString())}
                                    value={refundItem?.refundAmount || ""}
                                    onChange={(e) =>
                                      handleItemRefundAmountChange(
                                        item.id,
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="w-24"
                                  />
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Refund Reason */}
              <div className="space-y-2">
                <Label htmlFor="refundReason">
                  {t("admin.orderManagement.reasonForRefund").split(" (")[0]}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="refundReason"
                  value={refundFormData.reason || ""}
                  onChange={(e) =>
                    setRefundFormData({
                      ...refundFormData,
                      reason: e.target.value,
                    })
                  }
                  placeholder={t(
                    "admin.orderManagement.refundReasonPlaceholder"
                  )}
                  rows={3}
                  className="bg-transparent"
                />
              </div>

              {/* Refund Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("admin.orderManagement.refundSummary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>{t("admin.orderManagement.refundType")}:</span>
                      <span className="font-medium">
                        {refundFormData.refundType === "FULL" &&
                          t("admin.orderManagement.fullRefund")}
                        {refundFormData.refundType === "PARTIAL" &&
                          t("admin.orderManagement.partialRefund").split(
                            " ("
                          )[0]}
                        {refundFormData.refundType === "ITEM_SPECIFIC" &&
                          t("admin.orderManagement.itemSpecificRefund")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("admin.orderManagement.refundAmount")}:</span>
                      <span className="font-medium">
                        {refundFormData.refundType === "FULL" &&
                          formatPrice(
                            parseFloat(selectedOrder.totalAmount.toString()),
                            displayCurrency
                          )}
                        {refundFormData.refundType === "PARTIAL" &&
                          refundFormData.amount &&
                          formatPrice(refundFormData.amount, displayCurrency)}
                        {refundFormData.refundType === "ITEM_SPECIFIC" &&
                          formatPrice(
                            refundFormData.items.reduce(
                              (sum, item) =>
                                sum + parseFloat(item.refundAmount.toString()),
                              0
                            ),
                            displayCurrency
                          )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4">
                <Button
                  variant="outline"
                  onClick={() => setIsRefundDialogOpen(false)}
                  className="bg-transparent hover:bg-transparent"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleProcessRefund}
                  disabled={isActionLoading === selectedOrder.id || isClosedOrder(selectedOrder)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isActionLoading === selectedOrder.id ? (
                    <>
                      <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.orderManagement.processing")}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiCurrencyUsd} size={0.67} className="mr-2" />
                      {t("admin.orderManagement.processRefund")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default OrderManagement;
