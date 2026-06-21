import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  MoreVertical,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  XCircle,
  User,
  RefreshCw,
  ArrowLeftRight,
  Calendar,
  Receipt,
  Printer,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import {
  orderService,
  type Order,
  type OrderUpdateData,
} from "../services/orderService";
import { kitchenTicketService, type KitchenTicket } from "../services/kitchenTicketService";
import CustomDropdown from "../components/CustomDropdown";
import branchService from "../services/branchService";
import {
  refundService,
  type RefundType,
  type RefundItem,
  type CreateRefundRequest,
  type RefundResponse,
} from "../services/refundService";
import { formatPrice } from "../utils/currency";
import { notificationService } from "../services/notificationService";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/PageHeader";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const getTodayKey = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseTicketPayload = (raw: any): any => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
};

const orderHasDrinkItems = (order: any): boolean => {
  const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
  return items.some((it: any) => Boolean(it?.meal?.isDrink));
};

const OrdersManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [activeQueueTab, setActiveQueueTab] = useState<"asap" | "scheduled">("asap");
  const [branches, setBranches] = useState<
    Array<{ id: string; name: string; taxInclusive?: boolean | null; currency?: string | null }>
  >([]);
  const [orgVersion, setOrgVersion] = useState(0);
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [selectedOrderType, setSelectedOrderType] = useState<"" | "DELIVERY" | "PICKUP">("");
  const [asapBusinessDayStatus, setAsapBusinessDayStatus] = useState<"" | "OPEN" | "CLOSED">("");
  const [scheduledBusinessDayStatus, setScheduledBusinessDayStatus] = useState<"" | "OPEN" | "CLOSED">("");
  const [sortBy, setSortBy] = useState<"createdAt" | "totalAmount" | "orderNumber">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [queueCounts, setQueueCounts] = useState<{ asap: number; scheduled: number } | null>(null);
  const [showUpcomingScheduledOrders, setShowUpcomingScheduledOrders] = useState(false);
  const [upcomingScheduledCount, setUpcomingScheduledCount] = useState<number>(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<OrderUpdateData>({});

  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const endDateInputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    const anyInput = input as any;
    if (typeof anyInput.showPicker === "function") {
      anyInput.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const findExistingBarTicketForOrder = async (params: {
    branchId: string;
    orderId: string;
    token: string;
  }): Promise<KitchenTicket | null> => {
    const list = await kitchenTicketService.listKitchenTickets({ branchId: params.branchId, date: getTodayKey() }, params.token);
    const tickets = Array.isArray(list) ? list : [];
    for (const t of tickets) {
      const payload = parseTicketPayload((t as any)?.items);
      const oid = String(payload?.orderId || "").trim();
      const src = String(payload?.source || "").trim().toLowerCase();
      if (!oid || oid !== params.orderId) continue;
      if (!src.startsWith("bar_")) continue;
      return t;
    }
    return null;
  };

  const markDrinksReadyForOrder = async (order: Order) => {
    try {
      const branchId = String((order as any)?.branchId || (order as any)?.branch?.id || "").trim();
      if (!branchId) {
        alert("Branch is missing for this order.");
        return;
      }

      if (!orderHasDrinkItems(order)) {
        alert("This order has no drink items.");
        return;
      }

      const token = await getToken();
      if (!token) return;
      setIsActionLoading(order.id);

      const existing = await findExistingBarTicketForOrder({ branchId, orderId: order.id, token });
      const source = String((order as any)?.orderType || "").trim().toUpperCase() === "DELIVERY" ? "bar_delivery" : "bar_pickup";

      const mappedItems = Array.isArray((order as any)?.orderItems)
        ? ((order as any).orderItems as any[])
            .filter((it: any) => Boolean(it?.meal?.isDrink))
            .map((it: any) => ({
              id: it?.id,
              name: it?.meal?.name,
              qty: it?.quantity,
              selectedSize: it?.selectedSize,
              notes: it?.specialInstructions || undefined,
              addons: Array.isArray(it?.orderItemAddOns)
                ? it.orderItemAddOns.map((a: any) => ({
                    name: a?.addOnName,
                    qty: a?.quantity,
                  }))
                : [],
              optionalIngredients: Array.isArray(it?.orderItemOptionalIngredients)
                ? it.orderItemOptionalIngredients.map((o: any) => ({
                    name: o?.ingredientName,
                    isIncluded: o?.isIncluded,
                  }))
                : [],
            }))
        : [];

      if (mappedItems.length === 0) {
        alert("This order has no drink items.");
        return;
      }

      const payload = {
        source,
        orderId: order.id,
        orderNumber: (order as any)?.orderNumber,
        branchId,
        items: mappedItems,
      };

      const ticket =
        existing ||
        (await kitchenTicketService.createKitchenTicket({ branchId, reservationId: null, items: payload }, token));

      await kitchenTicketService.updateKitchenTicketStatus({ id: ticket.id, status: "READY" }, token);
      await loadData();
      alert("Drinks marked as READY.");
    } catch (e) {
      console.error("Failed to mark drinks ready:", e);
      alert("Failed to mark drinks ready");
    } finally {
      setIsActionLoading(null);
    }
  };
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const [refundFormData, setRefundFormData] = useState<{
    refundType: RefundType;
    amount?: number;
    items: RefundItem[];
    reason?: string;
  }>({
    refundType: "FULL",
    items: [],
  });
  const [orderRefunds, setOrderRefunds] = useState<RefundResponse[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [unseenNotificationOrderIds, setUnseenNotificationOrderIds] = useState<Set<string>>(new Set());
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isBillPreviewOpen, setIsBillPreviewOpen] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const receiptPrintRef = useRef<HTMLDivElement>(null);
  const branchLoadRetryRef = useRef(0);

  const selectedBranchForCurrency = branches.find((b) => b.id === selectedBranchId);
  const displayCurrency = (() => {
    const branchCurrency = (selectedBranchForCurrency as any)?.currency;
    return (
      (typeof branchCurrency === "string" && branchCurrency.trim()) ||
      (typeof (settings as any)?.currency === "string" && String((settings as any).currency).trim()) ||
      "USD"
    );
  })();

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch(`${API_BASE_URL}/api/user/settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-organization-id": localStorage.getItem(ORG_STORAGE_KEY) || "",
          },
        });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          setSettings(data?.data ?? data);
        }
      } catch {
        if (cancelled) return;
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
        if (!isBillPreviewOpen || !selectedOrder) return;
        const bid = (selectedOrder as any)?.branch?.id;
        if (!bid) return;
        const token = await getToken();
        if (!token) return;

        const qs = new URLSearchParams({ branchId: String(bid) }).toString();
        const response = await fetch(`${API_BASE_URL}/api/user/settings?${qs}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-organization-id": localStorage.getItem(ORG_STORAGE_KEY) || "",
          },
        });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          setSettings((data as any)?.data ?? data);
        }
      } catch {
        if (cancelled) return;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, isBillPreviewOpen, selectedOrder]);

  const orderMatchesScope = (order: any): boolean => {
    // Don't accept real-time events if the page is not currently scoped to a branch.
    if (!selectedBranchId) return false;
    const branchId = order?.branch?.id || order?.branchId;
    if (branchId && String(branchId) !== String(selectedBranchId)) return false;
    return true;
  };

  // Helper function to check if image is external
  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  // Helper function to get optimized image URL
  const getOptimizedImageUrl = (imagePath: string | null | undefined): string => {
    if (!imagePath) return "";
    
    // If it's an external URL, return as-is
    if (isExternalImage(imagePath)) {
      return imagePath;
    }

    let url = "";
    // If it already starts with /uploads/images/, handle accordingly
    if (imagePath.startsWith("/uploads/images/")) {
      const filename = imagePath.replace("/uploads/images/", "");
      url = `${API_BASE_URL}/uploads/images/${filename}`;
    } else {
      // Simple filename - append to base URL
      url = `${API_BASE_URL}/uploads/images/${imagePath}`;
    }

    return url;
  };

  // Load branches for filter
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setBranches([]);
          setSelectedBranchId("");
          const attempt = branchLoadRetryRef.current + 1;
          branchLoadRetryRef.current = attempt;
          if (attempt <= 10) {
            window.setTimeout(() => {
              void loadBranches();
            }, 400);
          }
          return;
        }
        const list = await branchService.getBranches(token);
        const normalized = Array.isArray(list)
          ? list.map((b: any) => ({
              id: String(b.id),
              name: String(b.name || "Branch"),
              taxInclusive:
                b.taxInclusive !== null && b.taxInclusive !== undefined
                  ? Boolean(b.taxInclusive)
                  : undefined,
              currency:
                typeof b.currency === "string" && b.currency.trim().length > 0
                  ? String(b.currency).trim()
                  : null,
            }))
          : [];
        setBranches(normalized);

        setSelectedBranchId((prev) => {
          const nextPrev = String(prev || "").trim();
          if (nextPrev && normalized.some((b) => String(b.id) === nextPrev)) return nextPrev;
          return normalized[0]?.id || "";
        });
      } catch {
        setBranches([]);
      }
    };
    loadBranches();
  }, [getToken, orgVersion]);

  // React to organization switch changes
  useEffect(() => {
    const getSelectedOrganizationId = (): string => {
      try {
        const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
        return (raw || "").trim();
      } catch {
        return "";
      }
    };

    let currentOrgId = getSelectedOrganizationId();

    const applyOrgChange = (nextOrgId: string) => {
      const normalized = String(nextOrgId || "").trim();
      if (normalized === currentOrgId) return;
      currentOrgId = normalized;

      // Reset branch + filters
      setSelectedBranchId("");
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      setUnseenNotificationOrderIds(new Set());
      setSelectedOrder(null);
      setIsViewDialogOpen(false);
      setIsEditDialogOpen(false);
      setIsRefundDialogOpen(false);
      setShowDeleteDialog(null);
      setShowDropdownMenu(null);
      setOrderToCancel(null);
      setCancelReason("");
      setIsBillPreviewOpen(false);

      // Force reload branches and data under new org header
      setOrgVersion((v) => v + 1);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgChange(detail?.organizationId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ORG_STORAGE_KEY) return;
      applyOrgChange(event.newValue || "");
    };

    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Initialize unseen order IDs from notifications
  useEffect(() => {
    const initializeUnseenOrders = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const { notificationService } = await import("../services/notificationService");
        const unseenNotifications = await notificationService.getUnseenNotifications(token);
        
        // Extract unique order IDs from unseen notifications
        const orderIds = new Set<string>();
        unseenNotifications.forEach((notification) => {
          if (notification.orderId) {
            orderIds.add(notification.orderId);
          }
        });
        
        setUnseenNotificationOrderIds(orderIds);
      } catch (error) {
        console.error("Error initializing unseen orders:", error);
      }
    };

    initializeUnseenOrders();
  }, [getToken]);

  // Load orders when branch/search/filters change.
  // When searching, we debounce to avoid spamming requests while typing.
  useEffect(() => {
    if (!selectedBranchId) return;

    if (!searchTerm) {
      loadData();
      return;
    }

    const timeoutId = setTimeout(() => {
      loadSearchResults();
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedBranchId,
    currentPage,
    searchTerm,
    selectedStatus,
    selectedPaymentStatus,
    selectedPaymentMethod,
    activeQueueTab,
    showUpcomingScheduledOrders,
    selectedOrderType,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    sortBy,
    sortOrder,
    startDate,
    endDate,
  ]);

  // Position dropdown menus when they open
  useEffect(() => {
    if (showDropdownMenu) {
      const button = buttonRefs.current[showDropdownMenu];
      const dropdown = dropdownRefs.current[showDropdownMenu];
      
      if (button && dropdown) {
        const rect = button.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
      }
    }
  }, [showDropdownMenu]);

  // WebSocket connection for real-time orders
  useEffect(() => {
    // Listen for new order events
    const handleNewOrder = (data: {
      notification?: any;
      order: Order;
    }) => {
      if (!data?.order) return;
      if (!orderMatchesScope(data.order)) return;
      // Add new order to the beginning of the list
      setOrders((prev) => {
        // Check if order already exists
        if (prev.some((o) => o.id === data.order.id)) {
          return prev;
        }
        return [data.order, ...prev];
      });

      // Update total count
      setTotalCount((prev) => prev + 1);

      // Mark as unseen (new orders have unseen notifications)
      setUnseenNotificationOrderIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(data.order.id);
        return newSet;
      });
    };

    // Handle order updated event (when order is merged/updated)
    const handleOrderUpdated = (data: {
      notification?: any;
      order: Order;
      newItems?: any[];
      isMergeRequest?: boolean;
    }) => {
      if (!data?.order) return;
      if (!orderMatchesScope(data.order)) return;
      // Update existing order in the list
      setOrders((prev) => {
        const index = prev.findIndex((o) => o.id === data.order.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = data.order;
          return updated;
        }
        // If order not found, add it to the beginning
        return [data.order, ...prev];
      });
    };

    // Handle notification seen event (when another admin marks notification as seen)
    const handleNotificationSeen = (data: {
      orderId: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      // Remove from unseen orders when notification is marked as seen
      if (data.isSeen) {
        setUnseenNotificationOrderIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.orderId);
          return newSet;
        });
      }
    };

    // Handle all notifications seen event
    const handleAllNotificationsSeen = (data: {
      orderId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      // Remove from unseen orders when all notifications are marked as seen
      if (data.isSeen) {
        setUnseenNotificationOrderIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.orderId);
          return newSet;
        });
      }
    };

    // Subscribe to all events with automatic cleanup
    const unsubscribe1 = subscribe("new-order", handleNewOrder);
    const unsubscribe2 = subscribe("order-updated", handleOrderUpdated);
    const unsubscribe3 = subscribe("notification-seen", handleNotificationSeen);
    const unsubscribe4 = subscribe("all-notifications-seen", handleAllNotificationsSeen);

    // Cleanup on unmount
    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, selectedBranchId]);


  const loadData = async () => {
    // Don't load if no branch is selected (backend requires branchId for non-superadmin)
    if (!selectedBranchId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      
      // Format dates as YYYY-MM-DD if provided
      const formatDate = (dateStr: string): string | undefined => {
        if (!dateStr) return undefined;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return undefined;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // Desktop uses tabs like frontend: ASAP vs Scheduled
      const activeIsScheduled: "asap" | "scheduled" | "all" = activeQueueTab;
      const activeBusinessDayStatus: "OPEN" | "CLOSED" | "" =
        activeQueueTab === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus;

      // Backend will apply date range against createdAt (ASAP) or scheduledDate (Scheduled).
      // We pass the same start/end inputs for both tabs.
      const effectiveStartDateStr =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? undefined : startDateStr;
      const effectiveEndDateStr =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? undefined : endDateStr;

      const scheduledScope =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? "upcoming" : "all";
      
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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        activeIsScheduled,
        scheduledScope,
        activeBusinessDayStatus || undefined,
        token || undefined
      );

      const asapCountPromise = orderService.getOrders(
        1,
        1,
        searchTerm,
        sortBy,
        sortOrder,
        selectedStatus,
        selectedPaymentStatus,
        selectedPaymentMethod,
        // ASAP uses createdAt date filtering in backend
        startDateStr,
        endDateStr,
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        "asap",
        "all",
        asapBusinessDayStatus || undefined,
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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        "scheduled",
        scheduledScope,
        scheduledBusinessDayStatus || undefined,
        token || undefined
      );

      const upcomingCountResp = await orderService.getOrders(
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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        "scheduled",
        "upcoming",
        scheduledBusinessDayStatus || undefined,
        token || undefined
      );
      const [asapCountResp, scheduledCountResp] = await Promise.all([
        asapCountPromise,
        scheduledCountPromise,
      ]);

      setQueueCounts({
        asap: asapCountResp?.pagination?.totalCount ?? 0,
        scheduled: scheduledCountResp?.pagination?.totalCount ?? 0,
      });
      setUpcomingScheduledCount(upcomingCountResp?.pagination?.totalCount ?? 0);

      setOrders(response.orders);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSearchResults = async () => {
    // Don't load if no branch is selected (backend requires branchId for non-superadmin)
    if (!selectedBranchId) {
      return;
    }
    
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      
      // Format dates as YYYY-MM-DD if provided
      const formatDate = (dateStr: string): string | undefined => {
        if (!dateStr) return undefined;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return undefined;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      const activeIsScheduled: "asap" | "scheduled" | "all" = activeQueueTab;
      const activeBusinessDayStatus: "OPEN" | "CLOSED" | "" =
        activeQueueTab === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus;

      const effectiveStartDateStr =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? undefined : startDateStr;
      const effectiveEndDateStr =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? undefined : endDateStr;

      const scheduledScope =
        activeQueueTab === "scheduled" && showUpcomingScheduledOrders ? "upcoming" : "all";
      
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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        activeIsScheduled,
        scheduledScope,
        activeBusinessDayStatus || undefined,
        token || undefined
      );

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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        "asap",
        "all",
        asapBusinessDayStatus || undefined,
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
        selectedBranchId,
        undefined,
        selectedOrderType || undefined,
        "scheduled",
        scheduledScope,
        scheduledBusinessDayStatus || undefined,
        token || undefined
      );

      const [asapCountResp, scheduledCountResp] = await Promise.all([
        asapCountPromise,
        scheduledCountPromise,
      ]);

      setQueueCounts({
        asap: asapCountResp?.pagination?.totalCount ?? 0,
        scheduled: scheduledCountResp?.pagination?.totalCount ?? 0,
      });

      setOrders(response.orders);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading search results:", error);
    } finally {
      setMenuItemsLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
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

  const handleAsapBusinessDayStatusFilter = (status: string) => {
    const next = status === "all" ? "" : (status as "OPEN" | "CLOSED");
    setAsapBusinessDayStatus(next);
    setCurrentPage(1);
  };

  const handleScheduledBusinessDayStatusFilter = (status: string) => {
    const next = status === "all" ? "" : (status as "OPEN" | "CLOSED");
    setScheduledBusinessDayStatus(next);
    setCurrentPage(1);
  };

  const handleQueueTabChange = (queue: "asap" | "scheduled") => {
    setActiveQueueTab(queue);
    if (queue !== "scheduled") setShowUpcomingScheduledOrders(false);
    setCurrentPage(1);
  };

  // Filter options
  const statusOptions = [
    { value: "all", label: t("admin.orderManagement.deliveryStatusAll", { defaultValue: "All Delivery Status" }) },
    { value: "PENDING", label: t("admin.orderManagement.statuses.pending") },
    { value: "CONFIRMED", label: t("admin.orderManagement.statuses.confirmed") },
    { value: "PREPARING", label: t("admin.orderManagement.statuses.preparing") },
    { value: "READY_FOR_DELIVERY", label: t("admin.orderManagement.statuses.readyForDelivery") },
    { value: "OUT_FOR_DELIVERY", label: t("admin.orderManagement.statuses.outForDelivery") },
    { value: "DELIVERED", label: t("admin.orderManagement.statuses.delivered") },
    { value: "CANCELLED", label: t("admin.orderManagement.statuses.cancelled") },
  ];

  const getEditableStatusOptions = (order: Order) => {
    if (order.orderType === "PICKUP") {
      return [
        { value: "PENDING", label: t("admin.orderManagement.statuses.pending") },
        { value: "CONFIRMED", label: t("admin.orderManagement.statuses.confirmed") },
        { value: "PREPARING", label: t("admin.orderManagement.statuses.preparing") },
        { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
        { value: "PICKED_UP", label: "Picked up" },
        { value: "CANCELLED", label: t("admin.orderManagement.statuses.cancelled") },
      ];
    }

    return [
      { value: "PENDING", label: t("admin.orderManagement.statuses.pending") },
      { value: "CONFIRMED", label: t("admin.orderManagement.statuses.confirmed") },
      { value: "PREPARING", label: t("admin.orderManagement.statuses.preparing") },
      { value: "READY_FOR_DELIVERY", label: t("admin.orderManagement.statuses.readyForDelivery") },
      { value: "OUT_FOR_DELIVERY", label: t("admin.orderManagement.statuses.outForDelivery") },
      { value: "DELIVERED", label: t("admin.orderManagement.statuses.delivered") },
      { value: "CANCELLED", label: t("admin.orderManagement.statuses.cancelled") },
    ];
  };

  const paymentStatusOptions = [
    { value: "all", label: t("admin.orderManagement.paymentStatusAll", { defaultValue: "All Payment Status" }) },
    { value: "PENDING", label: t("admin.orderManagement.paymentStatuses.pending") },
    { value: "PAID", label: t("admin.orderManagement.paymentStatuses.paid") },
    { value: "FAILED", label: t("admin.orderManagement.paymentStatuses.failed") },
    { value: "REFUNDED", label: t("admin.orderManagement.paymentStatuses.refunded") },
    { value: "PARTIALLY_REFUNDED", label: t("admin.orderManagement.paymentStatuses.partiallyRefunded") },
  ];

  const paymentMethodOptions = [
    { value: "all", label: t("admin.orderManagement.paymentMethodLabel", { defaultValue: "Payment Method" }) },
    { value: "CASH_ON_DELIVERY", label: t("admin.orderManagement.paymentMethods.cashOnDelivery") },
    { value: "CARD_ON_DELIVERY", label: t("admin.orderManagement.paymentMethods.cardOnDelivery") },
    { value: "ONLINE_PAYMENT", label: t("admin.orderManagement.paymentMethods.onlinePayment") },
  ];

  const orderTypeOptions = [
    { value: "all", label: t("admin.orderManagement.filterAllTypes", { defaultValue: "All Types" }) },
    { value: "DELIVERY", label: t("admin.orderManagement.delivery", { defaultValue: "Delivery" }) },
    { value: "PICKUP", label: t("admin.orderManagement.pickup", { defaultValue: "Pickup" }) },
  ];

  const asapBusinessDayStatusOptions = [
    {
      value: "all",
      label: t("admin.orderManagement.businessDayStatusAllAsap", {
        defaultValue: "All ASAP Business Days",
      }),
    },
    { value: "OPEN", label: t("admin.orderManagement.businessDayStatuses.open") },
    { value: "CLOSED", label: t("admin.orderManagement.businessDayStatuses.closed") },
  ];

  const scheduledBusinessDayStatusOptions = [
    {
      value: "all",
      label: t("admin.orderManagement.businessDayStatusAllScheduled", {
        defaultValue: "All Scheduled Business Days",
      }),
    },
    { value: "OPEN", label: t("admin.orderManagement.businessDayStatuses.open") },
    { value: "CLOSED", label: t("admin.orderManagement.businessDayStatuses.closed") },
  ];

  const sortOptions = [
    { value: "createdAt-desc", label: t("admin.orderManagement.newestFirst") },
    { value: "createdAt-asc", label: t("admin.orderManagement.oldestFirst") },
    { value: "totalAmount-desc", label: t("admin.orderManagement.highestAmount") },
    { value: "totalAmount-asc", label: t("admin.orderManagement.lowestAmount") },
    { value: "orderNumber-asc", label: t("admin.orderManagement.orderNumberAZ") },
  ];

  const branchOptions = [
    { value: "", label: t("admin.orderManagement.selectBranch", { defaultValue: "Select Branch" }) },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];

  const selectedBranchTaxInclusive = (() => {
    const b = branches.find((x) => x.id === selectedBranchId);
    return b?.taxInclusive;
  })();

  const handleBranchFilter = (branchId: string) => {
    setSelectedBranchId(branchId === "" ? "" : branchId);
    setCurrentPage(1);
  };

  const handleOrderTypeFilter = (orderType: string) => {
    setSelectedOrderType(orderType === "all" ? "" : (orderType as "DELIVERY" | "PICKUP"));
    setCurrentPage(1);
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    setCurrentPage(1);
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    setCurrentPage(1);
  };

  const handleViewOrder = async (order: Order) => {
    try {
      const token = await getToken();
      const fullOrderDetails = await orderService.getOrderById(
        order.id,
        token || undefined
      );
      setSelectedOrder(fullOrderDetails);
      
      // Load refunds if order has been refunded
      if (
        fullOrderDetails.paymentStatus === "PARTIALLY_REFUNDED" ||
        fullOrderDetails.paymentStatus === "REFUNDED"
      ) {
        await loadOrderRefunds(fullOrderDetails.id);
      }

      // Mark order as seen when viewing
      setUnseenNotificationOrderIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(order.id);
        return newSet;
      });
    } catch (error) {
      console.error("Error fetching order details:", error);
      setSelectedOrder(order);
    }
    setIsViewDialogOpen(true);
  };

  const markNotificationSeenOnceRef = useRef<Set<string>>(new Set());
  const lastHandledHighlightOrderRef = useRef<string | null>(null);

  const tryMarkNotificationSeen = async (notificationId: string | null | undefined) => {
    const nid = String(notificationId || "").trim();
    if (!nid) return;
    if (markNotificationSeenOnceRef.current.has(nid)) return;
    markNotificationSeenOnceRef.current.add(nid);
    try {
      const token = await getToken();
      if (!token) return;
      await notificationService.markAsSeen(nid, token || undefined);
    } catch (e) {
      // ignore
    }
  };

  // Handle highlightOrder query parameter to open order details
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const highlightOrderId = searchParams.get("highlightOrder");
    const notificationId = searchParams.get("notificationId");

    if (!highlightOrderId) return;
    if (isViewDialogOpen) return;
    if (lastHandledHighlightOrderRef.current === highlightOrderId) return;

    lastHandledHighlightOrderRef.current = highlightOrderId;

    const openHighlightedOrder = async () => {
      try {
        // Try from current list first
        const inList = orders.find((o) => o.id === highlightOrderId);
        if (inList) {
          await handleViewOrder(inList);
          await tryMarkNotificationSeen(notificationId);
          return;
        }

        // Otherwise fetch by id (works even if list is not loaded yet)
        const token = await getToken();
        if (!token) return;
        const orderDetails = await orderService.getOrderById(
          highlightOrderId,
          token || undefined
        );
        await handleViewOrder(orderDetails);
        await tryMarkNotificationSeen(notificationId);
      } catch (error) {
        console.error("Error fetching order for highlight:", error);
      } finally {
        // Remove the query parameter from URL
        searchParams.delete("highlightOrder");
        searchParams.delete("notificationId");
        const newSearch = searchParams.toString();
        navigate(
          `${location.pathname}${newSearch ? `?${newSearch}` : ""}`,
          { replace: true }
        );
      }
    };

    void openHighlightedOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, orders, navigate, location.pathname, isViewDialogOpen]);

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

  // Helper function to format date as DD-MMM-YY (e.g., 03-Mar-26)
  const formatDateDDMMMYY = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  const formatOrderDetailsDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  // Helper function to check if order belongs to a closed business day
  const isClosedOrder = (order: Order) => order.businessDaySession?.status === "CLOSED";

  const handleEditOrder = (order: Order) => {
    // Don't allow editing cancelled or closed orders
    if (order.status === "CANCELLED") {
      alert(t("admin.orderManagement.cannotEditCancelled", { defaultValue: "Cancelled orders cannot be edited." }));
      return;
    }
    if (isClosedOrder(order)) {
      alert(t("admin.orderManagement.errors.businessDayClosed", { defaultValue: "This order belongs to a closed day and cannot be edited." }));
      return;
    }
    setSelectedOrder(order);
    setEditFormData({
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryNotes: order.deliveryNotes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handlePreviewBill = (order: Order) => {
    setSelectedOrder(order);
    setIsBillPreviewOpen(true);
    setShowDropdownMenu(null);
  };

  const handleUpdateOrder = async () => {
    if (!selectedOrder) return;

    try {
      setIsActionLoading(selectedOrder.id);
      const token = await getToken();
      await orderService.updateOrder(
        selectedOrder.id,
        editFormData,
        token || undefined
      );
      await loadData();
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating order:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCancelOrder = (order: Order) => {
    if (order.status === "CANCELLED") return;
    setOrderToCancel(order);
    setCancelReason("");
    setShowDropdownMenu(null);
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    const reason = String(cancelReason || "").trim();
    if (!reason) {
      alert(t("admin.orderManagement.cancelOrderDialog.reasonRequired", { defaultValue: "Please provide a reason for cancellation." }));
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
      console.error("Error cancelling order:", error);
    } finally {
      setIsCancelling(false);
      setIsActionLoading(null);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    try {
      setIsActionLoading(order.id);
      const token = await getToken();
      await orderService.deleteOrder(order.id, token || undefined);
      setShowDeleteDialog(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting order:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleRefundOrder = (order: Order) => {
    setSelectedOrder(order);
    setRefundFormData({
      refundType: "FULL",
      items: [],
      amount: undefined,
      reason: "",
    });
    setIsRefundDialogOpen(true);
  };

  const handleProcessRefund = async () => {
    if (!selectedOrder) return;

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
      await loadData();
      
      // Reload refunds for the current order
      if (selectedOrder) {
        await loadOrderRefunds(selectedOrder.id);
        // Reload order details to get updated payment status
        const updatedOrder = await orderService.getOrderById(
          selectedOrder.id,
          token || undefined
        );
        setSelectedOrder(updatedOrder);
      }

      setIsRefundDialogOpen(false);
      setRefundFormData({
        refundType: "FULL",
        items: [],
        amount: undefined,
        reason: "",
      });
    } catch (error) {
      console.error("Error processing refund:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: "#fef3c7", text: "#92400e" },
      CONFIRMED: { bg: "#dbeafe", text: "#1e40af" },
      PREPARING: { bg: "#fce7f3", text: "#9f1239" },
      READY_FOR_DELIVERY: { bg: "#d1fae5", text: "#065f46" },
      OUT_FOR_DELIVERY: { bg: "#e0e7ff", text: "#3730a3" },
      DELIVERED: { bg: "#d1fae5", text: "#065f46" },
      CANCELLED: { bg: "#fee2e2", text: "#991b1b" },
    };
    return colors[status] || { bg: "#f3f4f6", text: "#6b7280" };
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: "#fef3c7", text: "#92400e" },
      PAID: { bg: "#d1fae5", text: "#065f46" },
      FAILED: { bg: "#fee2e2", text: "#991b1b" },
      REFUNDED: { bg: "#f3f4f6", text: "#6b7280" },
      PARTIALLY_REFUNDED: { bg: "#fef3c7", text: "#92400e" },
    };
    return colors[status] || { bg: "#f3f4f6", text: "#6b7280" };
  };

  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: t("admin.orderManagement.statuses.pending"),
      CONFIRMED: t("admin.orderManagement.statuses.confirmed"),
      PREPARING: t("admin.orderManagement.statuses.preparing"),
      READY_FOR_DELIVERY: t("admin.orderManagement.statuses.readyForDelivery"),
      OUT_FOR_DELIVERY: t("admin.orderManagement.statuses.outForDelivery"),
      DELIVERED: t("admin.orderManagement.statuses.delivered"),
      CANCELLED: t("admin.orderManagement.statuses.cancelled"),
      PAID: t("admin.orderManagement.paymentStatuses.paid"),
      FAILED: t("admin.orderManagement.paymentStatuses.failed"),
      REFUNDED: t("admin.orderManagement.paymentStatuses.refunded"),
      PARTIALLY_REFUNDED: t("admin.orderManagement.paymentStatuses.partiallyRefunded"),
    };
    return statusMap[status] || status;
  };

  const formatOrderNumber = (orderNumber: string) => {
    return `#${orderNumber}`;
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

  const formatPaymentMethod = (method: string) => {
    if (method === "ONLINE_PAYMENT") return t("admin.orderManagement.paymentMethods.onlinePayment");
    if (method === "CASH_ON_DELIVERY") return t("admin.orderManagement.paymentMethods.cashOnDelivery");
    if (method === "CARD_ON_DELIVERY") return t("admin.orderManagement.paymentMethods.cardOnDelivery");
    return method.replace(/_/g, " ");
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Less than 1 minute ago
    if (diffSeconds < 60) {
      return t("admin.orderManagement.now");
    }

    // Less than 1 hour ago
    if (diffMinutes < 60) {
      return diffMinutes === 1 
        ? t("admin.orderManagement.minuteAgo", { count: diffMinutes })
        : t("admin.orderManagement.minutesAgo", { count: diffMinutes });
    }

    // Less than 24 hours ago
    if (diffHours < 24) {
      return diffHours === 1
        ? t("admin.orderManagement.hourAgo", { count: diffHours })
        : t("admin.orderManagement.hoursAgo", { count: diffHours });
    }

    // Check if it's today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const orderDate = new Date(date);
    orderDate.setHours(0, 0, 0, 0);
    
    if (orderDate.getTime() === today.getTime()) {
      return t("admin.orderManagement.today");
    }

    // Check if it's yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (orderDate.getTime() === yesterday.getTime()) {
      return t("admin.orderManagement.yesterday");
    }

    // Less than 7 days ago
    if (diffDays < 7) {
      return diffDays === 1
        ? t("admin.orderManagement.dayAgo", { count: diffDays })
        : t("admin.orderManagement.daysAgo", { count: diffDays });
    }

    // More than 7 days ago - show date in DD-MMM-YY format
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  if (loading) {
    return (
      <div style={{ padding: "24px", height: "100%" }}>
        <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <PageHeader
            title={t("admin.orderManagement.title")}
            description={t("admin.orderManagement.description")}
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <RefreshCw
                  style={{
                    height: "16px",
                    width: "16px",
                    color: "#ec4899",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span style={{ fontSize: "14px", color: "#6b7280" }}>
                  {t("admin.orderManagement.loading")}
                </span>
              </div>
            }
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <RefreshCw
              style={{
                height: "48px",
                width: "48px",
                color: "#ec4899",
                margin: "0 auto 16px",
                animation: "spin 1s linear infinite",
              }}
            />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.orderManagement.loadingTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.orderManagement.loadingDescription")}
            </p>
          </div>
        </div>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes pulse {
              0%, 100% {
                opacity: 1;
              }
              50% {
                opacity: 0.5;
              }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          title={t("admin.orderManagement.title")}
          description={t("admin.orderManagement.description")}
        />
      </div>

      {/* Search and Filters */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e5e7eb",
          marginBottom: "24px",
        }}
      >
        {/* Search */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ position: "relative", maxWidth: "600px" }}>
            <Search
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                height: "16px",
                width: "16px",
                color: "#6b7280",
              }}
            />
            <input
              type="text"
              placeholder={t("admin.orderManagement.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
          </div>
        </div>

        {/* Filter Dropdowns - Row 1 */}
        <div
          className="filter-row filter-row-top"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(1, 1fr)",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          {/* Branch Filter */}
          <CustomDropdown
            value={selectedBranchId || ""}
            options={branchOptions}
            onChange={handleBranchFilter}
            placeholder={t("admin.orderManagement.selectBranch", { defaultValue: "Select Branch" })}
          />

          {/* Delivery Status */}
          <CustomDropdown
            value={selectedStatus || "all"}
            options={statusOptions}
            onChange={(value) => handleStatusFilter(value)}
          />

          {/* Payment Status */}
          <CustomDropdown
            value={selectedPaymentStatus || "all"}
            options={paymentStatusOptions}
            onChange={(value) => handlePaymentStatusFilter(value)}
          />

          {/* Payment Method */}
          <CustomDropdown
            value={selectedPaymentMethod || "all"}
            options={paymentMethodOptions}
            onChange={(value) => handlePaymentMethodFilter(value)}
          />

          {/* Order Type */}
          <CustomDropdown
            value={selectedOrderType || "all"}
            options={orderTypeOptions}
            onChange={(value) => handleOrderTypeFilter(value)}
          />
        </div>

        {/* Filter Dropdowns - Row 2 */}
        <div
          className="filter-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(1, 1fr)",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          {/* Business Day Status Filter (ASAP) */}
          <CustomDropdown
            value={asapBusinessDayStatus || "all"}
            options={asapBusinessDayStatusOptions}
            onChange={(value) => handleAsapBusinessDayStatusFilter(value)}
          />

          {/* Business Day Status Filter (Scheduled) */}
          <CustomDropdown
            value={scheduledBusinessDayStatus || "all"}
            options={scheduledBusinessDayStatusOptions}
            onChange={(value) => handleScheduledBusinessDayStatusFilter(value)}
          />
        </div>

        {/* Filter Dropdowns - Row 3: Sort + Date Range */}
        <div
          className="filter-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(1, 1fr)",
            gap: "12px",
          }}
        >
          {/* Sort */}
          <div style={{ maxWidth: "200px" }}>
            <CustomDropdown
              value={`${sortBy}-${sortOrder}`}
              options={sortOptions}
              onChange={(value) => {
                const [field, order] = value.split("-");
                setSortBy(field as any);
                setSortOrder(order as "asc" | "desc");
              }}
            />
          </div>

          {/* Date Range - DD-MMM-YY format inside inputs */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", minWidth: "280px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="date"
                className="date-input-native-hidden"
                ref={startDateInputRef}
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  paddingRight: "44px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  cursor: "pointer",
                  backgroundColor: "#ffffff",
                  color: startDate ? "#111827" : "#6b7280",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "12px",
                  right: "44px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "14px",
                  color: startDate ? "#111827" : "#6b7280",
                  pointerEvents: "none",
                  backgroundColor: "#ffffff",
                  paddingRight: "8px",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {startDate ? formatDateDDMMMYY(startDate) : "DD-MMM-YYYY"}
              </div>
              <button
                type="button"
                onClick={() => openDatePicker(startDateInputRef.current)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "28px",
                  width: "28px",
                  border: "none",
                  background: "transparent",
                  color: "#6b7280",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
                aria-label="Open date picker"
              >
                <Calendar size={16} />
              </button>
            </div>
            <span style={{ color: "#6b7280", fontSize: "14px", flexShrink: 0 }}>→</span>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="date"
                className="date-input-native-hidden"
                ref={endDateInputRef}
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  paddingRight: "44px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  cursor: "pointer",
                  backgroundColor: "#ffffff",
                  color: endDate ? "#111827" : "#6b7280",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "12px",
                  right: "44px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "14px",
                  color: endDate ? "#111827" : "#6b7280",
                  pointerEvents: "none",
                  backgroundColor: "#ffffff",
                  paddingRight: "8px",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {endDate ? formatDateDDMMMYY(endDate) : "DD-MMM-YYYY"}
              </div>
              <button
                type="button"
                onClick={() => openDatePicker(endDateInputRef.current)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "28px",
                  width: "28px",
                  border: "none",
                  background: "transparent",
                  color: "#6b7280",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
                aria-label="Open date picker"
              >
                <Calendar size={16} />
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @media (min-width: 768px) {
            .filter-row {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
          @media (min-width: 1024px) {
            .filter-row {
              grid-template-columns: repeat(4, 1fr) !important;
            }
            .filter-row-top {
              grid-template-columns: repeat(5, 1fr) !important;
            }
          }
          .date-input-native-hidden {
            text-shadow: none !important;
            caret-color: transparent !important;
            -webkit-appearance: auto;
            appearance: auto;
          }
          .date-input-native-hidden::-webkit-datetime-edit,
          .date-input-native-hidden::-webkit-datetime-edit-fields-wrapper,
          .date-input-native-hidden::-webkit-datetime-edit-text,
          .date-input-native-hidden::-webkit-datetime-edit-month-field,
          .date-input-native-hidden::-webkit-datetime-edit-day-field,
          .date-input-native-hidden::-webkit-datetime-edit-year-field {
            color: transparent !important;
            -webkit-text-fill-color: transparent !important;
          }
          .date-input-native-hidden::-webkit-clear-button,
          .date-input-native-hidden::-webkit-inner-spin-button {
            display: none;
          }
          .date-input-native-hidden::-webkit-calendar-picker-indicator {
            opacity: 0;
            pointer-events: none;
          }
          /* Hide scrollbar for Chrome, Safari and Opera */
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          /* Hide scrollbar for IE, Edge and Firefox */
          .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
      </div>

      {/* Orders Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {menuItemsLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(4px)",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#ec4899",
              }}
            >
              <Loader2
                style={{
                  height: "20px",
                  width: "20px",
                  animation: "spin 1s linear infinite",
                }}
              />
              <span style={{ fontSize: "14px", fontWeight: "500" }}>
                {t("admin.orderManagement.searchingOrders")}
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
            overflow: "visible",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "12px 16px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
              }}
            >
              <button
                type="button"
                onClick={() => handleQueueTabChange("asap")}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeQueueTab === "asap" ? "#ec4899" : "transparent",
                  color: activeQueueTab === "asap" ? "#ffffff" : "#111827",
                  fontSize: "14px",
                  fontWeight: 600,
                  minWidth: "120px",
                }}
              >
                {t("admin.orderManagement.asapOrders", { defaultValue: "ASAP Orders" })}
                <span
                  style={{
                    marginLeft: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "9999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: `1px solid ${activeQueueTab === "asap" ? "rgba(255,255,255,0.6)" : "#fbcfe8"}`,
                    backgroundColor: activeQueueTab === "asap" ? "rgba(255,255,255,0.18)" : "#fdf2f8",
                    color: activeQueueTab === "asap" ? "#ffffff" : "#be185d",
                  }}
                >
                  {queueCounts?.asap ?? 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleQueueTabChange("scheduled")}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeQueueTab === "scheduled" ? "#ec4899" : "transparent",
                  color: activeQueueTab === "scheduled" ? "#ffffff" : "#111827",
                  fontSize: "14px",
                  fontWeight: 600,
                  minWidth: "140px",
                }}
              >
                {t("admin.orderManagement.scheduledOrders", { defaultValue: "Scheduled Orders" })}
                <span
                  style={{
                    marginLeft: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "9999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: `1px solid ${activeQueueTab === "scheduled" ? "rgba(255,255,255,0.6)" : "#fbcfe8"}`,
                    backgroundColor: activeQueueTab === "scheduled" ? "rgba(255,255,255,0.18)" : "#fdf2f8",
                    color: activeQueueTab === "scheduled" ? "#ffffff" : "#be185d",
                  }}
                >
                  {queueCounts?.scheduled ?? 0}
                </span>
              </button>
            </div>

            {activeQueueTab === "scheduled" && (
              <button
                type="button"
                onClick={() => {
                  setShowUpcomingScheduledOrders((prev) => !prev);
                  setCurrentPage(1);
                }}
                style={{
                  marginLeft: "12px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: showUpcomingScheduledOrders ? "#ec4899" : "#ffffff",
                  color: showUpcomingScheduledOrders ? "#ffffff" : "#111827",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>
                  {t("admin.orderManagement.upcomingScheduledOrders", {
                    defaultValue: "Upcoming Scheduled Orders",
                  })}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "9999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: `1px solid ${showUpcomingScheduledOrders ? "rgba(255,255,255,0.6)" : "#fbcfe8"}`,
                    backgroundColor: showUpcomingScheduledOrders ? "rgba(255,255,255,0.18)" : "#fdf2f8",
                    color: showUpcomingScheduledOrders ? "#ffffff" : "#be185d",
                  }}
                >
                  {upcomingScheduledCount}
                </span>
              </button>
            )}
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Order #
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.fields.customer").replace(":", "")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.status")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.payment")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.method")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.amount")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("admin.orderManagement.date")}
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {t("common.view")}
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, index) => {
                const statusColor = getStatusColor(order.status);
                const paymentColor = getPaymentStatusColor(order.paymentStatus);
                const customerName = order.user
                  ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() || order.user.email
                  : order.guestName || t("admin.orderManagement.guest");
                const isUnseen = unseenNotificationOrderIds.has(order.id);

                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: index < orders.length - 1 ? "1px solid #e5e7eb" : "none",
                      borderLeft: isUnseen ? "4px solid #f97316" : "none",
                      backgroundColor: isUnseen ? "#fff7ed" : "#ffffff",
                      transition: "background-color 0.2s, border-color 0.2s",
                      boxShadow: isUnseen ? "0 0 0 2px rgba(249, 115, 22, 0.1)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isUnseen ? "#ffedd5" : "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isUnseen ? "#fff7ed" : "#ffffff";
                    }}
                  >
                    <td
                      style={{
                        padding: "16px",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#111827",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {order.orderNumber.slice(-5)}
                      {isUnseen && (
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#f97316",
                            display: "inline-block",
                            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                          }}
                        />
                      )}
                    </td>
                    <td
                      style={{
                        padding: "16px",
                        fontSize: "14px",
                        color: "#111827",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <User style={{ height: "16px", width: "16px", color: "#6b7280" }} />
                        <span>{customerName}</span>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          borderRadius: "12px",
                          fontWeight: "500",
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                        }}
                      >
                        {formatStatus(order.status)}
                      </span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          borderRadius: "12px",
                          fontWeight: "500",
                          backgroundColor: paymentColor.bg,
                          color: paymentColor.text,
                        }}
                      >
                        {formatStatus(order.paymentStatus)}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "16px",
                        fontSize: "14px",
                        color: "#6b7280",
                      }}
                    >
                      {formatPaymentMethod(order.paymentMethod)}
                    </td>
                    <td
                      style={{
                        padding: "16px",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#111827",
                        textAlign: "right",
                      }}
                    >
                      {formatPrice(order.totalAmount, displayCurrency)}
                    </td>
                    <td
                      style={{
                        padding: "16px",
                        fontSize: "14px",
                        color: "#6b7280",
                      }}
                    >
                      {formatRelativeDate(order.createdAt)}
                    </td>
                    <td style={{ padding: "16px", textAlign: "center", position: "relative", overflow: "visible" }}>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          ref={(el) => {
                            buttonRefs.current[order.id] = el;
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (showDropdownMenu === order.id) {
                              setShowDropdownMenu(null);
                            } else {
                              setShowDropdownMenu(order.id);
                            }
                          }}
                          disabled={isActionLoading === order.id}
                          style={{
                            padding: "4px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isActionLoading === order.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f3f4f6";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <MoreVertical
                            style={{ height: "16px", width: "16px", color: "#6b7280" }}
                          />
                        </button>
                        {showDropdownMenu === order.id && (
                          <div
                            ref={(el) => {
                              dropdownRefs.current[order.id] = el;
                            }}
                            style={{
                              position: "fixed",
                              backgroundColor: "#ffffff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "8px",
                              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                              zIndex: 1000,
                              minWidth: "180px",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                handleViewOrder(order);
                              }}
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <Eye style={{ height: "16px", width: "16px" }} />
                              {t("admin.orderManagement.viewDetails")}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                handlePreviewBill(order);
                              }}
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <Receipt style={{ height: "16px", width: "16px" }} />
                              {t("admin.orderManagement.previewBill", { defaultValue: "Preview Bill" })}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                handleEditOrder(order);
                              }}
                              disabled={isActionLoading === order.id}
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <Edit style={{ height: "16px", width: "16px" }} />
                              {t("admin.orderManagement.editOrder")}
                            </button>
                            {(order.paymentStatus === "PAID" ||
                              order.paymentStatus === "PARTIALLY_REFUNDED") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDropdownMenu(null);
                                  handleRefundOrder(order);
                                }}
                                disabled={isActionLoading === order.id}
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  textAlign: "left",
                                  border: "none",
                                  backgroundColor: "transparent",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  color: "#dc2626",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#fef2f2";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              >
                                <ArrowLeftRight style={{ height: "16px", width: "16px" }} />
                                {t("admin.orderManagement.processRefund")}
                              </button>
                            )}
                            {order.status !== "CANCELLED" && order.status !== "DELIVERED" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDropdownMenu(null);
                                  handleCancelOrder(order);
                                }}
                                disabled={isActionLoading === order.id}
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  textAlign: "left",
                                  border: "none",
                                  backgroundColor: "transparent",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  color: "#dc2626",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#fef2f2";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              >
                                <XCircle style={{ height: "16px", width: "16px" }} />
                                {t("admin.orderManagement.cancelOrder")}
                              </button>
                            )}

                            {(order.orderType === "PICKUP" || order.orderType === "DELIVERY") &&
                              orderHasDrinkItems(order) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdownMenu(null);
                                    void markDrinksReadyForOrder(order);
                                  }}
                                  disabled={isActionLoading === order.id}
                                  style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    textAlign: "left",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    color: "#111827",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#f9fafb";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  <Package style={{ height: "16px", width: "16px" }} />
                                  Mark drinks READY
                                </button>
                              )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {orders.length === 0 && (
            <div
              style={{
                padding: "48px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              <Package
                style={{
                  height: "48px",
                  width: "48px",
                  margin: "0 auto 16px",
                  opacity: 0.5,
                }}
              />
              <p style={{ fontSize: "16px", fontWeight: "500", marginBottom: "4px" }}>
                {t("admin.orderManagement.noOrdersFound")}
              </p>
              <p style={{ fontSize: "14px" }}>
                {searchTerm || selectedStatus || selectedPaymentStatus
                  ? t("admin.orderManagement.tryAdjustingFilters")
                  : t("admin.orderManagement.ordersWillAppearHere")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "24px",
          }}
        >
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.orderManagement.showingOrders", { count: orders.length, total: totalCount })}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              <ChevronLeft style={{ height: "16px", width: "16px" }} />
              {t("common.previous")}
            </button>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.orderManagement.pageOf", { current: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              {t("common.next")}
              <ChevronRight style={{ height: "16px", width: "16px" }} />
            </button>
          </div>
        </div>
      )}

      {/* View Order Dialog */}
      {isViewDialogOpen && selectedOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsViewDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                {t("admin.orderManagement.orderDetails", { defaultValue: "Order Details" })} - {formatOrderNumber(selectedOrder.orderNumber)}
              </h3>
              <button
                onClick={() => setIsViewDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginBottom: "10px" }}>
                    {t("admin.orderManagement.orderInformation")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.status")}</span>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontWeight: 500,
                          backgroundColor: getStatusColor(selectedOrder.status).bg,
                          color: getStatusColor(selectedOrder.status).text,
                          fontSize: "12px",
                        }}
                      >
                        {formatStatus(selectedOrder.status)}
                      </span>
                    </div>

                    {selectedOrder.status === "CANCELLED" ? (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <span style={{ color: "#6b7280" }}>
                          {t("admin.orderManagement.cancellationReasonLabel", {
                            defaultValue: "Cancellation reason",
                          })}
                        </span>
                        <span style={{ color: "#111827", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>
                          {getCancellationReason(selectedOrder) ||
                            t("admin.orderManagement.cancellationReasonNotProvided", {
                              defaultValue: "Not provided",
                            })}
                        </span>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.paymentStatus")}</span>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontWeight: 500,
                          backgroundColor: getPaymentStatusColor(selectedOrder.paymentStatus).bg,
                          color: getPaymentStatusColor(selectedOrder.paymentStatus).text,
                          fontSize: "12px",
                        }}
                      >
                        {formatStatus(selectedOrder.paymentStatus)}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.paymentMethod")}</span>
                      <span style={{ color: "#111827" }}>{formatPaymentMethod(selectedOrder.paymentMethod)}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>
                        {t("admin.orderManagement.fields.orderType", { defaultValue: "Order Type" })}
                      </span>
                      <span style={{ color: "#111827", fontWeight: 500 }}>
                        {selectedOrder.orderType === "DELIVERY"
                          ? t("admin.orderManagement.orderTypes.delivery", { defaultValue: "Delivery" })
                          : t("admin.orderManagement.orderTypes.pickup", { defaultValue: "Pickup" })}
                      </span>
                    </div>

                    {(selectedOrder as any)?.scheduledDate ? (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <span style={{ color: "#6b7280" }}>
                          {selectedOrder.orderType === "PICKUP"
                            ? t("admin.orderManagement.scheduled.pickupFor", {
                                defaultValue: "Pickup Scheduled For",
                              })
                            : t("admin.orderManagement.scheduled.deliveryFor", {
                                defaultValue: "Delivery Scheduled For",
                              })}
                        </span>
                        <span style={{ color: "#111827", fontWeight: 500, textAlign: "right" }}>
                          {formatOrderDetailsDateTime(String((selectedOrder as any).scheduledDate))}
                        </span>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.totalAmount")}</span>
                      <span style={{ color: "#111827", fontWeight: 600 }}>
                        {formatPrice(selectedOrder.totalAmount, displayCurrency)}
                      </span>
                    </div>

                    {!selectedOrder.isScheduledOrder &&
                      (() => {
                        const remaining = getRemainingPrepMs(selectedOrder);
                        if (remaining === null) return null;
                        return (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>
                              {t("admin.orderManagement.preparationTimeRemaining", {
                                defaultValue: "Preparation time remaining",
                              })}
                            </span>
                            <span style={{ color: "#7c3aed", fontWeight: 600 }}>{formatRemaining(remaining)}</span>
                          </div>
                        );
                      })()}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.deliveryFee")}</span>
                      <span style={{ color: "#111827" }}>
                        {formatPrice(selectedOrder.deliveryFee || 0, displayCurrency)}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.tax")}</span>
                      <span style={{ color: "#111827" }}>
                        {formatPrice(selectedOrder.taxAmount || 0, displayCurrency)}
                      </span>
                    </div>

                    {(() => {
                      const items = selectedOrder.orderItems || [];
                      const taxInclusiveForOrder =
                        (selectedOrder as any)?.taxInclusive !== null &&
                        (selectedOrder as any)?.taxInclusive !== undefined
                          ? Boolean((selectedOrder as any).taxInclusive)
                          : Boolean(selectedBranchTaxInclusive);

                      const toNum = (v: any) => {
                        if (typeof v === "number") return Number.isFinite(v) ? v : null;
                        if (typeof v === "string") {
                          const n = parseFloat(v);
                          return Number.isFinite(n) ? n : null;
                        }
                        return null;
                      };

                      const map = new Map<number, number>();

                      for (const it of items) {
                        const rate = toNum((it as any).taxPercentage);
                        const amt = toNum((it as any).taxAmount) || 0;
                        if (rate !== null && amt) {
                          map.set(rate, (map.get(rate) || 0) + amt);
                        }

                        for (const a of (it as any).orderItemAddOns || []) {
                          const ar = toNum((a as any).taxPercentage) ?? rate;
                          const aa = toNum((a as any).taxAmount) || 0;
                          if (ar !== null && aa) {
                            map.set(ar, (map.get(ar) || 0) + aa);
                          }
                        }

                        for (const oi of (it as any).orderItemOptionalIngredients || []) {
                          const or = toNum((oi as any).taxPercentage) ?? rate;
                          const oa = toNum((oi as any).taxAmount) || 0;
                          if (or !== null && oa) {
                            map.set(or, (map.get(or) || 0) + oa);
                          }
                        }
                      }

                      let lines = Array.from(map.entries())
                        .map(([rate, amount]) => ({ rate, amount }))
                        .filter((l) => l.amount !== 0)
                        .sort((a, b) => a.rate - b.rate);

                      if (lines.length === 0) {
                        const rates: number[] = [];
                        for (const it of items) {
                          const r = toNum((it as any).taxPercentage);
                          if (typeof r === "number" && !Number.isNaN(r)) rates.push(r);
                          for (const a of (it as any).orderItemAddOns || []) {
                            const ar = toNum((a as any).taxPercentage);
                            if (typeof ar === "number" && !Number.isNaN(ar)) rates.push(ar);
                          }
                        }
                        const unique = Array.from(new Set(rates));
                        if (unique.length === 1 && Number(selectedOrder.taxAmount || 0) !== 0) {
                          lines = [{ rate: unique[0], amount: Number(selectedOrder.taxAmount || 0) }];
                        }
                      }

                      if (lines.length === 0) return null;

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
                          {lines.map((l) => (
                            <div key={String(l.rate)} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px", paddingLeft: "16px" }}>
                              <span style={{ color: "#6b7280" }}>
                                {taxInclusiveForOrder
                                  ? `${t("receipt.includedVat", { defaultValue: "Included VAT" })} ${l.rate}%`
                                  : `${t("receipt.vat", { defaultValue: "VAT" })} ${l.rate}%`}
                              </span>
                              <span style={{ color: "#111827" }}>{formatPrice(l.amount, displayCurrency)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.created")}</span>
                      <span style={{ color: "#111827" }}>{formatOrderDetailsDateTime(selectedOrder.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginBottom: "10px" }}>
                    {t("admin.orderManagement.customerInformation")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                    {selectedOrder.user ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.name")}</span>
                          <span style={{ color: "#111827" }}>
                            {selectedOrder.user.firstName} {selectedOrder.user.lastName}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.email")}</span>
                          <span style={{ color: "#111827" }}>{selectedOrder.user.email}</span>
                        </div>
                        {selectedOrder.orderType !== "PICKUP" ? (
                          (selectedOrder.user.phone || selectedOrder.guestPhone || selectedOrder.deliveryPhone) ? (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                              <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.phone")}</span>
                              <span style={{ color: "#111827" }}>
                                {selectedOrder.user.phone || selectedOrder.guestPhone || selectedOrder.deliveryPhone}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                              <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.phone")}</span>
                              <span style={{ color: "#111827" }}>
                                {t("admin.orderManagement.notAvailable", { defaultValue: "Not available" })}
                              </span>
                            </div>
                          )
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.name")}</span>
                          <span style={{ color: "#111827" }}>{selectedOrder.guestName || t("admin.orderManagement.guest")}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.email")}</span>
                          <span style={{ color: "#111827" }}>
                            {selectedOrder.guestEmail ||
                              t("admin.orderManagement.notAvailable", { defaultValue: "Not available" })}
                          </span>
                        </div>
                        {selectedOrder.orderType !== "PICKUP" ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.phone")}</span>
                            <span style={{ color: "#111827" }}>
                              {selectedOrder.guestPhone ||
                                selectedOrder.deliveryPhone ||
                                t("admin.orderManagement.notAvailable", { defaultValue: "Not available" })}
                            </span>
                          </div>
                        ) : null}
                      </>
                    )}

                    {(selectedOrder.deliveryAddress || (selectedOrder as any).deliveryStreetAddress || (selectedOrder as any).deliveryPostalCode) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.address")}</span>
                          <span style={{ color: "#111827", textAlign: "right" }}>
                            {(() => {
                              const street = (selectedOrder as any).deliveryStreetAddress as string | undefined;
                              const house = (selectedOrder as any).deliveryHouseNumber as string | undefined;
                              if (street && house) return `${street} ${house}`;
                              if (street) return street;
                              return selectedOrder.deliveryAddress;
                            })()}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>
                            {t("admin.orderManagement.fields.postalCode", { defaultValue: "Postal Code" })}
                          </span>
                          <span style={{ color: "#111827", textAlign: "right" }}>
                            {(selectedOrder as any).deliveryPostalCode || ""}
                          </span>
                        </div>

                        {selectedOrder.deliveryBuilding ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.building")}</span>
                            <span style={{ color: "#111827", textAlign: "right" }}>{selectedOrder.deliveryBuilding}</span>
                          </div>
                        ) : null}

                        {selectedOrder.deliveryFloor ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.floor")}</span>
                            <span style={{ color: "#111827", textAlign: "right" }}>{selectedOrder.deliveryFloor}</span>
                          </div>
                        ) : null}

                        {selectedOrder.deliveryApartment ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.apartmentUnit")}</span>
                            <span style={{ color: "#111827", textAlign: "right" }}>{selectedOrder.deliveryApartment}</span>
                          </div>
                        ) : null}

                        {(selectedOrder as any).deliveryExtraDetails ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.extraDetails")}</span>
                            <span style={{ color: "#111827", textAlign: "right" }}>{(selectedOrder as any).deliveryExtraDetails}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedOrder.deliveryNotes ? (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.deliveryNotes")}</span>
                        <span style={{ color: "#111827", textAlign: "right" }}>{selectedOrder.deliveryNotes}</span>
                      </div>
                    ) : null}

                    {selectedOrder.orderType === "PICKUP" ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#6b7280" }}>
                            {t("admin.orderManagement.pickupPhone", { defaultValue: "Pickup Phone" })}
                          </span>
                          <span style={{ color: "#111827", textAlign: "right" }}>
                            {selectedOrder.pickupPhone ||
                              t("admin.orderManagement.notAvailable", { defaultValue: "Not available" })}
                          </span>
                        </div>
                        {selectedOrder.pickupNotes ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#6b7280" }}>
                              {t("admin.orderManagement.pickupNotes", { defaultValue: "Pickup Notes" })}
                            </span>
                            <span style={{ color: "#111827", textAlign: "right" }}>{selectedOrder.pickupNotes}</span>
                          </div>
                        ) : null}

                        {selectedOrder.branch ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "10px",
                              backgroundColor: "#f9fafb",
                              display: "flex",
                              gap: "10px",
                              alignItems: "flex-start",
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "8px",
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                color: "#111827",
                              }}
                            >
                              <Package size={16} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "2px" }}>
                                {selectedOrder.branch.name}
                              </div>
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                {selectedOrder.branch.address ||
                                  t("admin.orderManagement.notAvailable", { defaultValue: "Not available" })}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h4
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#111827",
                    marginBottom: "16px",
                    paddingBottom: "12px",
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  {t("admin.orderManagement.orderItems", { defaultValue: "Order Items" })}
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {(() => {
                    const taxInclusiveForOrder =
                      (selectedOrder as any)?.taxInclusive !== null &&
                      (selectedOrder as any)?.taxInclusive !== undefined
                        ? Boolean((selectedOrder as any).taxInclusive)
                        : Boolean(selectedBranchTaxInclusive);

                    return selectedOrder.orderItems
                      .filter((it: any) => it?.itemType !== "DEAL_COMPONENT")
                      .map((item: any) => {
                        const isDeal = item?.itemType === "DEAL" || Boolean(item?.deal);
                        const itemName = isDeal ? item?.deal?.name : item?.meal?.name;
                        const itemImage = isDeal ? item?.deal?.image : item?.meal?.image;
                        const mealImageUrl = itemImage ? getOptimizedImageUrl(itemImage) : "";

                        const dealChildItems = item?.dealChildItems || [];
                        const dealTaxTotal = isDeal
                          ? (dealChildItems || []).reduce(
                              (sum: number, child: any) => sum + Number(child?.taxAmount || 0),
                              0
                            )
                          : 0;

                        const taxLines: Array<{ key: string; label: string; amount: number }> = [];

                        if (isDeal && dealChildItems.length > 0) {
                          for (const child of dealChildItems) {
                            const taxAmount = Number(child?.taxAmount || 0);
                            const taxPctRaw =
                              child?.taxPercentage ??
                              child?.dealComponent?.effectiveTaxPercentage ??
                              child?.dealComponent?.taxPercentage;
                            const taxPercentage =
                              taxPctRaw !== null && taxPctRaw !== undefined
                                ? Number(taxPctRaw)
                                : null;
                            if (!(taxAmount > 0)) continue;
                            taxLines.push({
                              key: `dealChild:${child.id}`,
                              label: `${child?.dealComponent?.name || t("admin.orderManagement.component", { defaultValue: "Component" })}${child?.quantity ? ` ×${child.quantity}` : ""}${taxInclusiveForOrder ? ` (${t("admin.orderManagement.fields.included", { defaultValue: "included" })})` : ""}${taxPercentage !== null && !Number.isNaN(taxPercentage) ? " (" + String(taxPercentage) + "%)" : ""}`,
                              amount: taxAmount,
                            });
                          }
                        }

                        const selfTaxAmount = Number(item?.taxAmount || 0);
                        const selfTaxPct = item?.taxPercentage;
                        if (!isDeal && selfTaxAmount > 0) {
                          taxLines.push({
                            key: `item:${item.id}`,
                            label: `${taxInclusiveForOrder
                              ? t("admin.orderManagement.fields.includedMealTax", { defaultValue: "Included meal tax" })
                              : (itemName || t("admin.orderManagement.item", { defaultValue: "Item" }))}${selfTaxPct ? " (" + String(selfTaxPct) + "%)" : ""}`,
                            amount: selfTaxAmount,
                          });
                        }

                        for (const addon of item?.orderItemAddOns || []) {
                          const aTax = Number(addon?.taxAmount || 0);
                          if (aTax > 0) {
                            taxLines.push({
                              key: `addon:${addon.id}`,
                              label: `+ ${addon?.addOnName || t("admin.orderManagement.addon", { defaultValue: "Add-on" })}${taxInclusiveForOrder ? ` (${t("admin.orderManagement.fields.included", { defaultValue: "included" })})` : ""}${addon?.taxPercentage ? " (" + String(addon.taxPercentage) + "%)" : ""}`,
                              amount: aTax,
                            });
                          }
                        }

                        for (const oi of item?.orderItemOptionalIngredients || []) {
                          const oTax = Number(oi?.taxAmount || 0);
                          if (oTax > 0) {
                            taxLines.push({
                              key: `opt:${oi.id}`,
                              label: `+ ${oi?.ingredientName || t("admin.orderManagement.ingredient", { defaultValue: "Ingredient" })}${taxInclusiveForOrder ? ` (${t("admin.orderManagement.fields.included", { defaultValue: "included" })})` : ""}${oi?.taxPercentage ? " (" + String(oi.taxPercentage) + "%)" : ""}`,
                              amount: oTax,
                            });
                          }
                        }

                        const displayedItemPrice = (() => {
                          const directTotal = Number(item?.totalPrice);
                          if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;
                          return Number(item?.unitPrice || 0) * Number(item?.quantity || 1);
                        })();

                        return (
                          <div
                            key={item.id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: "12px",
                              overflow: "hidden",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
                              <div
                                style={{
                                  width: "64px",
                                  height: "64px",
                                  borderRadius: "12px",
                                  overflow: "hidden",
                                  backgroundColor: "#f3f4f6",
                                  flexShrink: 0,
                                }}
                              >
                                {mealImageUrl ? (
                                  <img
                                    src={mealImageUrl}
                                    alt={itemName || t("admin.orderManagement.item", { defaultValue: "Item" })}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "#9ca3af",
                                    }}
                                  >
                                    <Package size={24} />
                                  </div>
                                )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: "16px", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                                      {isDeal ? (
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            minWidth: 0,
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: "11px",
                                              fontWeight: 700,
                                              padding: "2px 8px",
                                              borderRadius: "999px",
                                              backgroundColor: "#f3f4f6",
                                              border: "1px solid #e5e7eb",
                                              color: "#111827",
                                              flexShrink: 0,
                                            }}
                                          >
                                            {t("admin.orderManagement.deal", { defaultValue: "Deal" })}
                                          </span>
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {itemName || t("admin.orderManagement.item", { defaultValue: "Item" })}
                                          </span>
                                        </span>
                                      ) : (
                                        itemName || t("admin.orderManagement.item", { defaultValue: "Item" })
                                      )}
                                    </div>

                                    {!isDeal && item.selectedSize ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <span
                                          style={{
                                            fontSize: "12px",
                                            border: "1px solid #e5e7eb",
                                            backgroundColor: "#ffffff",
                                            borderRadius: "999px",
                                            padding: "3px 10px",
                                            color: "#111827",
                                            fontWeight: 600,
                                          }}
                                        >
                                          {item.selectedSize}
                                        </span>
                                        <span style={{ fontSize: "13px", color: "#6b7280" }}>× {item.quantity}</span>
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                                        {t("admin.orderManagement.fields.quantity", { defaultValue: "Quantity" })} {item.quantity}
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                                      {formatPrice(displayedItemPrice, displayCurrency)}
                                    </div>
                                    {((isDeal && dealTaxTotal > 0) || (!isDeal && Number(item.taxAmount || 0) > 0)) ? (
                                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                                        {t("admin.orderManagement.fields.tax", { defaultValue: "Tax" })}: {" "}
                                        {formatPrice(isDeal ? dealTaxTotal : Number(item.taxAmount || 0), displayCurrency)}
                                        {!isDeal && item.taxPercentage ? ` (${item.taxPercentage}%)` : ""}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {item.specialInstructions ? (
                                  <div
                                    style={{
                                      marginTop: "10px",
                                      padding: "10px",
                                      backgroundColor: "#fef3c7",
                                      border: "1px solid #fde68a",
                                      borderRadius: "8px",
                                      color: "#92400e",
                                      fontSize: "12px",
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                                      {t("admin.orderManagement.fields.specialInstructions", { defaultValue: "Special Instructions" })}:
                                    </div>
                                    <div style={{ color: "#92400e" }}>{item.specialInstructions}</div>
                                  </div>
                                ) : null}

                                {isDeal && dealChildItems.length > 0 ? (
                                  <div
                                    style={{
                                      marginTop: "10px",
                                      paddingLeft: "10px",
                                      borderLeft: "2px solid rgba(236, 72, 153, 0.35)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#6b7280",
                                        marginBottom: "6px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                      }}
                                    >
                                      {t("admin.orderManagement.dealComponents", { defaultValue: "Includes" })}:
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                                      {dealChildItems.map((child: any) => (
                                        <div key={child.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                                          <span style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {(child?.dealComponent?.name || t("admin.orderManagement.component", { defaultValue: "Component" }))}
                                            {child?.quantity ? ` ×${child.quantity}` : ""}
                                          </span>
                                          <span style={{ color: "#111827" }}>
                                            {formatPrice(Number(child?.totalPrice || 0), displayCurrency)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {item.orderItemAddOns && item.orderItemAddOns.length > 0 ? (
                              <div style={{ padding: "0 12px 12px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  {t("admin.orderManagement.fields.addons", { defaultValue: "Add-ons" })}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                                  {(item.orderItemAddOns || []).map((addon: any) => (
                                    <div
                                      key={addon.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        backgroundColor: "#f9fafb",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "10px",
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {addon.addOnName}
                                        </div>
                                        {Number(addon.taxAmount || 0) > 0 ? (
                                          <div style={{ fontSize: "11px", color: "#6b7280" }}>
                                            + {formatPrice(Number(addon.taxAmount || 0), displayCurrency)} {t("admin.orderManagement.fields.tax", { defaultValue: "Tax" }).toLowerCase()}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                                          {formatPrice(Number(addon.addOnPrice || 0) * Number(addon.quantity || 1), displayCurrency)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {item.orderItemOptionalIngredients && item.orderItemOptionalIngredients.length > 0 ? (
                              <div style={{ padding: "0 12px 12px" }}>
                                {(() => {
                                  const included = (item.orderItemOptionalIngredients || []).filter((ing: any) => Boolean(ing?.isIncluded));
                                  if (included.length === 0) return null;
                                  return (
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#16a34a", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                        {t("mealCustomization.includedIngredients", { defaultValue: "Included Ingredients" })}
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {included.map((ing: any) => (
                                          <span
                                            key={ing.id}
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              padding: "4px 10px",
                                              borderRadius: "999px",
                                              backgroundColor: "#dcfce7",
                                              border: "1px solid #86efac",
                                              color: "#166534",
                                              fontSize: "12px",
                                              fontWeight: 600,
                                            }}
                                          >
                                            {ing.ingredientName}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : null}

                            {taxLines.length > 0 ? (
                              <div style={{ borderTop: "1px solid #e5e7eb", backgroundColor: "#f9fafb", padding: "12px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 800, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  {taxInclusiveForOrder
                                    ? t("admin.orderManagement.fields.includedTaxBreakdown", { defaultValue: "Included Tax Breakdown" })
                                    : t("admin.orderManagement.fields.taxBreakdown", { defaultValue: "Tax Breakdown" })}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                                  {taxLines.map((l) => (
                                    <div key={l.key} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                                      <div style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</div>
                                      <div style={{ color: "#111827", fontWeight: 700 }}>{formatPrice(l.amount, displayCurrency)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>

              {/* Refund History */}
              {(selectedOrder.paymentStatus === "PARTIALLY_REFUNDED" ||
                selectedOrder.paymentStatus === "REFUNDED") && (
                <div>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#111827",
                      marginBottom: "12px",
                    }}
                  >
                    {t("admin.orderManagement.refundHistory")}
                  </h4>
                  {loadingRefunds ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "24px",
                      }}
                    >
                      <Loader2
                        style={{
                          height: "24px",
                          width: "24px",
                          animation: "spin 1s linear infinite",
                          color: "#ec4899",
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {/* Refund Summary */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "#111827",
                              marginBottom: "4px",
                            }}
                          >
                            {t("admin.orderManagement.totalOrderAmount")}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6b7280",
                            }}
                          >
                            {formatPrice(selectedOrder.totalAmount, displayCurrency)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "#059669",
                              marginBottom: "4px",
                            }}
                          >
                            {t("admin.orderManagement.totalRefunded")}:{" "}
                            {formatPrice(
                              orderRefunds.reduce(
                                (sum, refund) => sum + refund.amount,
                                0
                              ),
                              displayCurrency
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6b7280",
                            }}
                          >
                            {t("admin.orderManagement.fields.paymentStatus")} {formatStatus(selectedOrder.paymentStatus)}
                          </div>
                        </div>
                      </div>

                      {/* Individual Refunds */}
                      {orderRefunds.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "500",
                              color: "#111827",
                            }}
                          >
                            {t("admin.orderManagement.refundDetails")}:
                          </div>
                          {orderRefunds.map((refund, index) => {
                            const refundTypeLabel =
                              refund.refundType === "FULL"
                                ? t("admin.orderManagement.fullRefund")
                                : refund.refundType === "PARTIAL"
                                ? t("admin.orderManagement.partialRefund")
                                : t("admin.orderManagement.itemSpecificRefund");
                            
                            return (
                              <div
                                key={refund.id}
                                style={{
                                  padding: "12px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  backgroundColor: "#ffffff",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    marginBottom: "8px",
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "14px",
                                          fontWeight: "600",
                                          color: "#111827",
                                        }}
                                      >
                                        {t("admin.orderManagement.refundDetails")} #{index + 1}
                                      </div>
                                      <span
                                        style={{
                                          padding: "4px 10px",
                                          fontSize: "11px",
                                          fontWeight: "600",
                                          borderRadius: "12px",
                                          backgroundColor:
                                            refund.refundType === "FULL"
                                              ? "#dbeafe"
                                              : refund.refundType === "PARTIAL"
                                              ? "#fef3c7"
                                              : "#fce7f3",
                                          color:
                                            refund.refundType === "FULL"
                                              ? "#1e40af"
                                              : refund.refundType === "PARTIAL"
                                              ? "#92400e"
                                              : "#9f1239",
                                        }}
                                      >
                                        {refundTypeLabel}
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#6b7280",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      {new Date(refund.createdAt).toLocaleString()}
                                    </div>
                                    {refund.reason && (
                                      <div
                                        style={{
                                          fontSize: "12px",
                                          color: "#6b7280",
                                          fontStyle: "italic",
                                        }}
                                      >
                                        {t("admin.orderManagement.reasonForRefund").replace(" (Optional)", "")}: {refund.reason}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ textAlign: "right", marginLeft: "16px" }}>
                                    <div
                                      style={{
                                        fontSize: "16px",
                                        fontWeight: "600",
                                        color: "#059669",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      {formatPrice(refund.amount, displayCurrency)}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color:
                                          refund.status === "SUCCEEDED"
                                            ? "#059669"
                                            : refund.status === "FAILED"
                                            ? "#dc2626"
                                            : refund.status === "PENDING"
                                            ? "#d97706"
                                            : "#6b7280",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {refund.status === "SUCCEEDED"
                                        ? t("admin.orderManagement.refundStatuses.succeeded")
                                        : refund.status === "FAILED"
                                        ? t("admin.orderManagement.refundStatuses.failed")
                                        : refund.status === "PENDING"
                                        ? t("admin.orderManagement.refundStatuses.pending")
                                        : t("admin.orderManagement.refundStatuses.canceled")}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: "14px",
                            color: "#6b7280",
                            textAlign: "center",
                            padding: "12px",
                          }}
                        >
                          {t("admin.orderManagement.noRefundDetails")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginTop: "24px" }}>
              <button
                onClick={() => handlePreviewBill(selectedOrder)}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  border: "1px solid #ec4899",
                  borderRadius: "8px",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "#ec4899",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minWidth: "200px",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(236, 72, 153, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Receipt style={{ height: "16px", width: "16px" }} />
                {t("admin.orderManagement.previewBill", { defaultValue: "Preview Bill" })}
              </button>

              <button
                onClick={() => {
                  setIsViewDialogOpen(false);
                  handleEditOrder(selectedOrder);
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "10px",
                  backgroundColor: "#ec4899",
                  cursor: "pointer",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minWidth: "200px",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }}
              >
                <Edit style={{ height: "16px", width: "16px" }} />
                {t("admin.orderManagement.editOrder", { defaultValue: "Edit Order" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Dialog */}
      {isEditDialogOpen && selectedOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsEditDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "24px",
              }}
            >
              {t("admin.orderManagement.editOrderTitle")} - {selectedOrder.orderNumber}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <Label>
                  {t("admin.orderManagement.orderStatus")}
                </Label>
                <div className="mt-2">
                  <Select
                    value={(editFormData.status || selectedOrder.status) as string}
                    onValueChange={(val) => {
                      const nextStatus = val as any;
                      const shouldAutoMarkPaid = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
                      const currentPaymentStatus = (editFormData.paymentStatus || selectedOrder.paymentStatus) as any;
                      const isRefundedState =
                        currentPaymentStatus === "REFUNDED" || currentPaymentStatus === "PARTIALLY_REFUNDED";

                      setEditFormData({
                        ...editFormData,
                        status: nextStatus,
                        ...(shouldAutoMarkPaid && !isRefundedState ? { paymentStatus: "PAID" } : {}),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getEditableStatusOptions(selectedOrder).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>
                  {t("admin.orderManagement.paymentStatus")}
                </Label>
                <div className="mt-2">
                  <Select
                    value={(editFormData.paymentStatus || selectedOrder.paymentStatus) as string}
                    onValueChange={(val) =>
                      setEditFormData({ ...editFormData, paymentStatus: val as any })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">{t("admin.orderManagement.paymentStatuses.pending")}</SelectItem>
                      <SelectItem value="PAID">{t("admin.orderManagement.paymentStatuses.paid")}</SelectItem>
                      <SelectItem value="FAILED">{t("admin.orderManagement.paymentStatuses.failed")}</SelectItem>
                      <SelectItem value="REFUNDED">{t("admin.orderManagement.paymentStatuses.refunded")}</SelectItem>
                      <SelectItem value="PARTIALLY_REFUNDED">
                        {t("admin.orderManagement.paymentStatuses.partiallyRefunded")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>
                  {t("admin.orderManagement.preparationTime", { defaultValue: "Preparation Time" })}
                </Label>
                <div className="mt-2">
                  <Select
                    value={String(editFormData.preparationTime ?? selectedOrder.preparationTime ?? "")}
                    onValueChange={(val) =>
                      setEditFormData({
                        ...editFormData,
                        preparationTime: val ? Number(val) : undefined,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("admin.orderManagement.selectPreparationTime", { defaultValue: "Select time" })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                      <SelectItem value="45">45 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                      <SelectItem value="60">60 {t("common.minutes", { defaultValue: "minutes" })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.orderManagement.deliveryNotes")}
                </label>
                <textarea
                  value={editFormData.deliveryNotes || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, deliveryNotes: e.target.value })
                  }
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    resize: "vertical",
                  }}
                  placeholder={t("admin.orderManagement.deliveryNotesPlaceholder")}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => setIsEditDialogOpen(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleUpdateOrder}
                disabled={isActionLoading === selectedOrder.id}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#ec4899",
                  cursor: isActionLoading === selectedOrder.id ? "not-allowed" : "pointer",
                  color: "#ffffff",
                  opacity: isActionLoading === selectedOrder.id ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (isActionLoading !== selectedOrder.id) {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isActionLoading !== selectedOrder.id) {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }
                }}
              >
                {isActionLoading === selectedOrder.id ? t("admin.orderManagement.updating") : t("admin.orderManagement.updateOrder")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && orders.find((o) => o.id === showDeleteDialog) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowDeleteDialog(null)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.orderManagement.deleteOrderTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
              {t("admin.orderManagement.deleteOrderDescription")}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowDeleteDialog(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("admin.orderManagement.deleteOrderCancel")}
              </button>
              <button
                onClick={() => {
                  const order = orders.find((o) => o.id === showDeleteDialog);
                  if (order) {
                    handleDeleteOrder(order);
                  }
                }}
                disabled={
                  isActionLoading === showDeleteDialog ||
                  isActionLoading !== null
                }
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#dc2626",
                  cursor:
                    isActionLoading === showDeleteDialog || isActionLoading !== null
                      ? "not-allowed"
                      : "pointer",
                  color: "#ffffff",
                  opacity:
                    isActionLoading === showDeleteDialog || isActionLoading !== null ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    isActionLoading !== showDeleteDialog &&
                    isActionLoading === null
                  ) {
                    e.currentTarget.style.backgroundColor = "#b91c1c";
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    isActionLoading !== showDeleteDialog &&
                    isActionLoading === null
                  ) {
                    e.currentTarget.style.backgroundColor = "#dc2626";
                  }
                }}
              >
                {t("admin.orderManagement.deleteOrderConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Dialog */}
      {isRefundDialogOpen && selectedOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsRefundDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                {t("admin.orderManagement.processRefundTitle")} - {selectedOrder.orderNumber}
              </h3>
              <button
                onClick={() => setIsRefundDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Order Summary */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h4
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#111827",
                    marginBottom: "12px",
                  }}
                >
                  {t("admin.orderManagement.orderSummary")}
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "12px",
                    fontSize: "14px",
                  }}
                >
                  <div>
                    <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.fields.totalAmount")}</span>
                    <span
                      style={{
                        marginLeft: "8px",
                        fontWeight: "600",
                        color: "#111827",
                      }}
                    >
                      {formatPrice(selectedOrder.totalAmount, displayCurrency)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#6b7280" }}>Payment Status:</span>
                    <span style={{ marginLeft: "8px", color: "#111827" }}>
                      {formatStatus(selectedOrder.paymentStatus)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Refund Type Selection */}
              <div>
                <Label>
                  {t("admin.orderManagement.refundType")}
                </Label>
                <div className="mt-2">
                  <Select
                    value={refundFormData.refundType}
                    onValueChange={(val) =>
                      setRefundFormData({
                        ...refundFormData,
                        refundType: val as RefundType,
                        amount: undefined,
                        items: [],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL">{t("admin.orderManagement.fullRefund")}</SelectItem>
                      <SelectItem value="PARTIAL">{t("admin.orderManagement.partialRefund")}</SelectItem>
                      <SelectItem value="ITEM_SPECIFIC">{t("admin.orderManagement.itemSpecificRefund")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Partial Refund Amount */}
              {refundFormData.refundType === "PARTIAL" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.orderManagement.refundAmount")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedOrder.totalAmount}
                    value={refundFormData.amount || ""}
                    onChange={(e) =>
                      setRefundFormData({
                        ...refundFormData,
                        amount: parseFloat(e.target.value) || undefined,
                      })
                    }
                    placeholder={t("admin.orderManagement.refundAmountPlaceholder")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* Item-Specific Refund */}
              {refundFormData.refundType === "ITEM_SPECIFIC" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "12px",
                    }}
                  >
                    {t("admin.orderManagement.selectItemsToRefund")}
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {selectedOrder.orderItems.map((item) => {
                      const isSelected = refundFormData.items.some(
                        (refundItem) => refundItem.orderItemId === item.id
                      );
                      const refundItem = refundFormData.items.find(
                        (refundItem) => refundItem.orderItemId === item.id
                      );

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: "12px",
                            border: isSelected
                              ? "2px solid #ec4899"
                              : "1px solid #e5e7eb",
                            borderRadius: "8px",
                            backgroundColor: isSelected ? "#fdf2f8" : "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setRefundFormData({
                                      ...refundFormData,
                                      items: [
                                        ...refundFormData.items,
                                        {
                                          orderItemId: item.id,
                                          refundAmount: item.totalPrice,
                                        },
                                      ],
                                    });
                                  } else {
                                    setRefundFormData({
                                      ...refundFormData,
                                      items: refundFormData.items.filter(
                                        (refundItem) =>
                                          refundItem.orderItemId !== item.id
                                      ),
                                    });
                                  }
                                }}
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  cursor: "pointer",
                                }}
                              />
                              <div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    color: "#111827",
                                  }}
                                >
                                  {item.meal.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                >
                                  {t("admin.orderManagement.quantity")}: {item.quantity} ×{" "}
                                  {formatPrice(item.unitPrice, displayCurrency)}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "500",
                                    color: "#111827",
                                  }}
                                >
                                  {t("admin.orderManagement.total")}:{" "}
                                  {formatPrice(item.totalPrice, displayCurrency)}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                >
                                  {t("admin.orderManagement.amount")}:
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={item.totalPrice}
                                  value={refundItem?.refundAmount || item.totalPrice}
                                  onChange={(e) => {
                                    const amount = parseFloat(e.target.value) || 0;
                                    setRefundFormData({
                                      ...refundFormData,
                                      items: refundFormData.items.map((refundItem) =>
                                        refundItem.orderItemId === item.id
                                          ? { ...refundItem, refundAmount: amount }
                                          : refundItem
                                      ),
                                    });
                                  }}
                                  style={{
                                    width: "100px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    outline: "none",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Refund Reason */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.orderManagement.reasonForRefund")}
                </label>
                <textarea
                  value={refundFormData.reason || ""}
                  onChange={(e) =>
                    setRefundFormData({
                      ...refundFormData,
                      reason: e.target.value,
                    })
                  }
                  placeholder={t("admin.orderManagement.refundReasonPlaceholder")}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Refund Summary */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h4
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#111827",
                    marginBottom: "12px",
                  }}
                >
                  {t("admin.orderManagement.refundSummary")}
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    fontSize: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.refundType")}:</span>
                    <span style={{ fontWeight: "500", color: "#111827" }}>
                      {refundFormData.refundType === "FULL"
                        ? t("admin.orderManagement.fullRefund")
                        : refundFormData.refundType === "PARTIAL"
                        ? t("admin.orderManagement.partialRefund")
                        : t("admin.orderManagement.itemSpecificRefund")}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>{t("admin.orderManagement.refundAmount")}:</span>
                    <span
                      style={{
                        fontWeight: "600",
                        color: "#059669",
                        fontSize: "16px",
                      }}
                    >
                      {refundFormData.refundType === "FULL" &&
                        formatPrice(selectedOrder.totalAmount, displayCurrency)}
                      {refundFormData.refundType === "PARTIAL" &&
                        refundFormData.amount &&
                        formatPrice(refundFormData.amount, displayCurrency)}
                      {refundFormData.refundType === "ITEM_SPECIFIC" &&
                        formatPrice(
                          refundFormData.items.reduce(
                            (sum, item) => sum + item.refundAmount,
                            0
                          ),
                          displayCurrency
                        )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => setIsRefundDialogOpen(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={isActionLoading === selectedOrder.id}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#dc2626",
                  cursor:
                    isActionLoading === selectedOrder.id ? "not-allowed" : "pointer",
                  color: "#ffffff",
                  opacity: isActionLoading === selectedOrder.id ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (isActionLoading !== selectedOrder.id) {
                    e.currentTarget.style.backgroundColor = "#b91c1c";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isActionLoading !== selectedOrder.id) {
                    e.currentTarget.style.backgroundColor = "#dc2626";
                  }
                }}
              >
                {isActionLoading === selectedOrder.id
                  ? t("admin.orderManagement.processing")
                  : t("admin.orderManagement.processRefund")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Dialog */}
      {orderToCancel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setOrderToCancel(null)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "450px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.orderManagement.cancelOrderDialog.title", { defaultValue: "Cancel Order" })} - {orderToCancel.orderNumber}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px" }}>
              {t("admin.orderManagement.cancelOrderDialog.description", { defaultValue: "Please provide a reason for cancelling this order. This will be recorded for audit purposes." })}
            </p>
            
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.orderManagement.cancelOrderDialog.reasonLabel", { defaultValue: "Cancellation Reason *" })}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("admin.orderManagement.cancelOrderDialog.reasonPlaceholder", { defaultValue: "Enter reason for cancellation..." })}
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>
            
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setOrderToCancel(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirmCancelOrder}
                disabled={isCancelling || !cancelReason.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#dc2626",
                  cursor: isCancelling || !cancelReason.trim() ? "not-allowed" : "pointer",
                  color: "#ffffff",
                  opacity: isCancelling || !cancelReason.trim() ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isCancelling && cancelReason.trim()) {
                    e.currentTarget.style.backgroundColor = "#b91c1c";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCancelling && cancelReason.trim()) {
                    e.currentTarget.style.backgroundColor = "#dc2626";
                  }
                }}
              >
                {isCancelling 
                  ? t("admin.orderManagement.cancelling", { defaultValue: "Cancelling..." })
                  : t("admin.orderManagement.confirmCancel", { defaultValue: "Cancel Order" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Preview Dialog */}
      {isBillPreviewOpen && selectedOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsBillPreviewOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const isTaxInclusiveReceipt =
                (selectedOrder as any)?.taxInclusive !== null &&
                (selectedOrder as any)?.taxInclusive !== undefined
                  ? Boolean((selectedOrder as any).taxInclusive)
                  : Boolean(selectedBranchTaxInclusive);

              const total = Number(selectedOrder.totalAmount || 0);
              const tax = Number(selectedOrder.taxAmount || 0);
              const net = Math.max(0, total - tax);

              const items = selectedOrder.orderItems || [];
              const toNum = (v: any) => {
                if (typeof v === "number") return Number.isFinite(v) ? v : null;
                if (typeof v === "string") {
                  const n = parseFloat(v);
                  return Number.isFinite(n) ? n : null;
                }
                return null;
              };

              const vatLines = (() => {
                const map = new Map<number, number>();

                for (const it of items) {
                  if ((it as any).itemType !== "DEAL") {
                    const rate = toNum((it as any).taxPercentage);
                    const amt = toNum((it as any).taxAmount) || 0;
                    if (rate !== null && amt) {
                      map.set(rate, (map.get(rate) || 0) + amt);
                    }
                  }

                  for (const a of (it as any).orderItemAddOns || []) {
                    const ar = toNum((a as any).taxPercentage);
                    const aa = toNum((a as any).taxAmount) || 0;
                    if (ar !== null && aa) {
                      map.set(ar, (map.get(ar) || 0) + aa);
                    }
                  }
                }

                const lines = Array.from(map.entries())
                  .map(([rate, amount]) => ({ rate, amount }))
                  .filter((l) => l.amount !== 0)
                  .sort((a, b) => a.rate - b.rate);

                if (lines.length > 0) return lines;

                const rates: number[] = [];
                for (const it of items) {
                  if ((it as any).itemType !== "DEAL") {
                    const r = toNum((it as any).taxPercentage);
                    if (typeof r === "number" && !Number.isNaN(r)) rates.push(r);
                  }
                  for (const a of (it as any).orderItemAddOns || []) {
                    const ar = toNum((a as any).taxPercentage);
                    if (typeof ar === "number" && !Number.isNaN(ar)) rates.push(ar);
                  }
                }
                const unique = Array.from(new Set(rates));
                if (unique.length === 1) {
                  return [{ rate: unique[0], amount: tax }];
                }

                return [] as Array<{ rate: number; amount: number }>;
              })();

              return (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div
                    ref={receiptPrintRef}
                    style={{
                      width: "320px",
                      backgroundColor: "#ffffff",
                      color: "#000000",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      padding: "16px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      lineHeight: "1.35",
                    }}
                  >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  {(() => {
                    const settingsBusinessName = String((settings as any)?.businessName || "").trim();
                    const branchName = String((selectedOrder as any)?.branch?.name || "").trim();
                    const headerName =
                      settingsBusinessName && branchName && settingsBusinessName !== branchName
                        ? `${settingsBusinessName} - ${branchName}`
                        : (branchName || settingsBusinessName || "Bellami");
                    return (
                  <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px" }}>
                    {headerName}
                  </div>
                    );
                  })()}
                  <div style={{ fontSize: "11px", color: "#333" }}>
                    <div>Hubertusstraße 17</div>
                    <div>90559 Burgthann</div>
                    <div>Tel. +4938294800</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", maxWidth: "55%" }}>
                  <div style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "1px" }}>Invoice</div>
                  {selectedOrder.status === "CANCELLED" && (
                    <div style={{ color: "#dc2626", fontWeight: "bold", fontSize: "14px", marginTop: "4px", textTransform: "uppercase" }}>
                      CANCELLED
                    </div>
                  )}
                  {selectedOrder.status === "CANCELLED" && selectedOrder.cancellationReason && (
                    <div style={{ marginTop: "4px", fontSize: "11px", color: "#dc2626" }}>
                      Reason: {selectedOrder.cancellationReason}
                    </div>
                  )}
                  <div style={{ marginTop: "8px", fontSize: "11px", wordBreak: "break-all" }}>
                    Order No: #{selectedOrder.orderNumber}
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "11px" }}>
                    Date: {formatDateDDMMMYY(selectedOrder.createdAt)} | {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>

              <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />

              {/* Order Type */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "12px" }}>
                <span style={{ color: "#999", textTransform: "uppercase", letterSpacing: "1px" }}>Order type</span>
                <span style={{ fontWeight: "bold" }}>
                  {selectedOrder.orderType === "PICKUP" ? "Pickup" : "Delivery"}
                </span>
              </div>

              <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />

              {/* Customer */}
              <div style={{ fontSize: "12px", marginBottom: "12px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Customer</div>
                <div>
                  {selectedOrder.user
                    ? `${selectedOrder.user.firstName || ""} ${selectedOrder.user.lastName || ""}`.trim() || selectedOrder.user.email
                    : selectedOrder.guestName || "Guest"}
                </div>
              </div>

              <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />

              <div style={{ fontSize: "12px", marginBottom: "12px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Order (QR)</div>
                {(() => {
                  const getQrUrl = (value: string, size: number = 140) => {
                    const data = encodeURIComponent(value);
                    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
                  };

                  const token = (selectedOrder as any).deliveryLinkToken as string | undefined;
                  const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
                  const origin = base.replace(/\/+$/, "");
                  const qrPayload = token
                    ? `${origin}/order/${selectedOrder.id}?token=${encodeURIComponent(token)}`
                    : selectedOrder.orderNumber;

                  return (
                    <img
                      src={getQrUrl(qrPayload, 140)}
                      alt="Order QR"
                      style={{ width: "140px", height: "140px", display: "block", margin: "0 auto" }}
                    />
                  );
                })()}
              </div>

              {selectedOrder.orderType === "DELIVERY" ? (
                <div style={{ fontSize: "12px", marginBottom: "12px" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Delivery Address (QR)</div>
                  {(() => {
                    const getQrUrl = (value: string, size: number = 140) => {
                      const data = encodeURIComponent(value);
                      return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
                    };

                    const token = (selectedOrder as any).deliveryLinkToken as string | undefined;
                    if (!token) return null;
                    const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
                    const origin = base.replace(/\/+$/, "");
                    const qrPayload = `${origin}/delivery/${selectedOrder.id}?token=${encodeURIComponent(token)}`;

                    return (
                      <img
                        src={getQrUrl(qrPayload, 140)}
                        alt="Delivery Address QR"
                        style={{ width: "140px", height: "140px", display: "block", margin: "0 auto" }}
                      />
                    );
                  })()}
                </div>
              ) : null}

              <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />

              {(() => {
                const items = selectedOrder.orderItems || [];
                const toNum = (v: any) => {
                  if (typeof v === "number") return Number.isFinite(v) ? v : null;
                  if (typeof v === "string") {
                    const n = parseFloat(v);
                    return Number.isFinite(n) ? n : null;
                  }
                  return null;
                };

                const map = new Map<number, Array<{ key: string; label: string; amount: number }>>();

                for (const it of items) {
                  const baseRateForAddons = toNum((it as any).taxPercentage) ?? 0;

                  if ((it as any).itemType !== "DEAL") {
                    const rate = toNum((it as any).taxPercentage) ?? 0;
                    const lineTotal = Number((it as any).totalPrice ?? (it as any).unitPrice * (it as any).quantity);
                    const baseName =
                      (it as any).itemType === "DEAL_COMPONENT"
                        ? ((it as any).dealComponent?.name || (it as any).dealComponentName)
                        : (it as any).meal?.name;
                    const label = `${it.quantity}x ${baseName || "Item"}${it.selectedSize ? ` (${it.selectedSize})` : ""}`;
                    map.set(rate, [...(map.get(rate) || []), { key: it.id, label, amount: lineTotal }]);
                  }

                  for (const a of (it as any).orderItemAddOns || []) {
                    const addonRate = toNum((a as any).taxPercentage) ?? baseRateForAddons;
                    const addonTotal = Number((a as any).addOnPrice || 0) * Number((a as any).quantity || 1);
                    const addonLabel = `+ ${(a as any).addOnName || "Add-on"}${(a as any).quantity && (a as any).quantity > 1 ? ` x${(a as any).quantity}` : ""}`;
                    map.set(addonRate, [...(map.get(addonRate) || []), { key: `${it.id}:${(a as any).id}`, label: addonLabel, amount: addonTotal }]);
                  }
                }

                const groups = Array.from(map.entries())
                  .map(([rate, lines]) => ({
                    rate,
                    lines,
                    subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
                  }))
                  .filter((g) => g.lines.length > 0)
                  .sort((a, b) => a.rate - b.rate);

                if (groups.length === 0) {
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <span>Subtotal:</span>
                      <span>{formatPrice(selectedOrder.subtotalAmount || selectedOrder.totalAmount - selectedOrder.taxAmount - selectedOrder.deliveryFee, displayCurrency)}</span>
                    </div>
                  );
                }

                return (
                  <>
                    {groups.map((g) => (
                      <div key={String(g.rate)}>
                        <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>
                          {isTaxInclusiveReceipt
                            ? `${t("receipt.includedVat", { defaultValue: "Included VAT" })}: ${g.rate}`
                            : `${t("receipt.vat", { defaultValue: "VAT" })}: ${g.rate}`}
                        </div>
                        {g.lines.map((l) => (
                          <div key={l.key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                            <div>{l.label}</div>
                            <div>{formatPrice(l.amount, displayCurrency)}</div>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", marginBottom: "12px", fontSize: "12px", fontWeight: "bold" }}>
                          <span>Subtotal:</span>
                          <span>{formatPrice(g.subtotal, displayCurrency)}</span>
                        </div>
                        <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Payment & Totals */}
              <div style={{ fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginBottom: "4px" }}>
                  <span>Payment</span>
                  <span>
                    {(() => {
                      const m = selectedOrder.paymentMethod;
                      if (m === "CASH_ON_DELIVERY") return "CASH";
                      if (m === "CARD_ON_DELIVERY") return "CARD";
                      if (m === "ONLINE_PAYMENT") return "ONLINE";
                      return formatPaymentMethod(m).toUpperCase();
                    })()}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontWeight: "bold" }}>
                  <span>Gross total:</span>
                  <span>{formatPrice(selectedOrder.totalAmount, displayCurrency)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Net amount</span>
                  <span>{formatPrice(net, displayCurrency)}</span>
                </div>

                {vatLines.length > 0 ? (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {vatLines.map((l) => (
                      <div key={String(l.rate)} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>
                          {isTaxInclusiveReceipt
                            ? `${t("receipt.includedVat", { defaultValue: "Enth. MwSt" })} ${l.rate.toFixed(1)}%`
                            : `${t("receipt.vat", { defaultValue: "MwSt." })} ${l.rate.toFixed(1)}%`}
                        </span>
                        <span>{formatPrice(l.amount, displayCurrency)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                      <span>{isTaxInclusiveReceipt ? t("receipt.includedVat", { defaultValue: "Enth. MwSt" }) : t("receipt.vat", { defaultValue: "MwSt." })}:</span>
                      <span>{formatPrice(tax, displayCurrency)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <span>{isTaxInclusiveReceipt ? t("receipt.includedVat", { defaultValue: "Enth. MwSt" }) : t("receipt.vat", { defaultValue: "MwSt." })}:</span>
                    <span>{formatPrice(tax, displayCurrency)}</span>
                  </div>
                )}
              </div>

              <div style={{ margin: "12px 0", borderTop: "1px dashed #999" }} />

              {/* Items count */}
              <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "12px" }}>
                Items count: {selectedOrder.orderItems.length}
              </div>

              {/* Technical Security */}
              <div style={{ fontSize: "11px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Technical security</div>
                <div>Start: {new Date(selectedOrder.createdAt).toLocaleDateString()} | {new Date(selectedOrder.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div>Stop: {new Date(selectedOrder.updatedAt || selectedOrder.createdAt).toLocaleDateString()} | {new Date(selectedOrder.updatedAt || selectedOrder.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div style={{ wordBreak: "break-all" }}>Transaction: {selectedOrder.orderNumber} / Signature counter: {selectedOrder.id.slice(-12)}</div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: "center", marginTop: "16px", fontSize: "11px", color: "#666" }}>
                Powered by: GMS pro
              </div>
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
              <button
                onClick={() => setIsBillPreviewOpen(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {t("common.close")}
              </button>
              <button
                onClick={() => {
                  const printWindow = window.open("", "_blank");
                  if (printWindow && receiptPrintRef.current) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Receipt - ${selectedOrder.orderNumber}</title>
                          <style>
                            body { font-family: monospace; font-size: 12px; padding: 20px; line-height: 1.4; }
                            .header { display: flex; justify-content: space-between; margin-bottom: 16px; }
                            .business { flex: 1; }
                            .receipt-info { text-align: right; max-width: 45%; }
                            .title { font-size: 16px; font-weight: bold; letter-spacing: 0.5px; }
                            .cancelled { color: #dc2626; font-weight: bold; font-size: 11px; text-transform: uppercase; }
                            .divider { margin: 12px 0; border-top: 1px dashed #999; }
                            .section { margin-bottom: 12px; }
                            .label { font-weight: bold; }
                            .item { display: flex; justify-content: space-between; margin-bottom: 4px; }
                            .total-row { display: flex; justify-content: space-between; font-weight: bold; }
                            .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #666; }
                          </style>
                        </head>
                        <body>
                          ${receiptPrintRef.current.innerHTML}
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                    printWindow.print();
                  }
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#ec4899",
                  cursor: "pointer",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Printer style={{ height: "16px", width: "16px" }} />
                {t("common.print", { defaultValue: "Print" })}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
    </div>
  );
};

export default OrdersManagement;

