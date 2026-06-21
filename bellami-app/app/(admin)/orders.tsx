import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import DatePicker from "react-native-date-picker";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import {
  orderService,
  type Order,
  type OrderUpdateData,
} from "@/src/services/orderService";
import PickupLocationDisplay from "@/components/PickupLocationDisplay";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { notificationApiService } from "@/src/services/notificationApiService";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { useOrganization } from "@/src/contexts/OrganizationContext";

type QueueTab = "asap" | "scheduled";

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

const formatOrderNumber = (orderNumber: string): string => {
  return `#${orderNumber}`;
};

const getStatusColor = (status: Order["status"]): string => {
  switch (status) {
    case "PENDING":
      return "#fbbf24"; // yellow
    case "CONFIRMED":
      return "#3b82f6"; // blue
    case "PREPARING":
      return "#f97316"; // orange
    case "READY_FOR_DELIVERY":
    case "READY_FOR_PICKUP":
      return "#a855f7"; // purple
    case "OUT_FOR_DELIVERY":
      return "#6366f1"; // indigo
    case "DELIVERED":
    case "PICKED_UP":
      return "#22c55e"; // green
    case "CANCELLED":
      return "#ef4444"; // red
    default:
      return "#6b7280"; // gray
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

// These functions will be moved inside the component to use translations

export default function OrdersManagementScreen() {
  const { t } = useTranslation();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const {
    assignedBranchIds,
    can,
    canAny,
    isLoading: permissionsLoading,
  } = usePermissions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

  const isBranchAdmin = userType === "BRANCH_ADMIN";
  const isEmployee = userType === "EMPLOYEE";
  const isWaiter = userType === "WAITER";
  const isBranchScoped = isBranchAdmin || isEmployee || isWaiter;

  const canViewBranches =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW }]);

  const canEditOrders =
    !permissionsLoading &&
    (can(RESOURCES.ORDERS, ACTIONS.UPDATE) ||
      can(RESOURCES.ORDERS, ACTIONS.UPDATE_STATUS));

  const canCancelOrders =
    !permissionsLoading && can(RESOURCES.ORDERS, ACTIONS.CANCEL);

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

  const getPaymentMethodLabel = (method: Order["paymentMethod"]): string => {
    const methodKey = `admin.orderManagement.paymentMethods.${method
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(methodKey, { defaultValue: method });
    return translated !== methodKey ? translated : method;
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
  const getOrderTypeLabel = (type: "" | "DELIVERY" | "PICKUP"): string => {
    if (type === "DELIVERY") {
      return t("admin.orderManagement.orderTypes.delivery");
    }
    if (type === "PICKUP") {
      return t("admin.orderManagement.orderTypes.pickup");
    }
    return t("admin.orderManagement.orderType");
  };
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPaymentStatus, setSelectedPaymentStatus] =
    useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [selectedOrderType, setSelectedOrderType] = useState<
    "" | "DELIVERY" | "PICKUP"
  >("");
  const [asapBusinessDayStatus, setAsapBusinessDayStatus] = useState<
    "" | "OPEN" | "CLOSED"
  >("OPEN");
  const [scheduledBusinessDayStatus, setScheduledBusinessDayStatus] = useState<
    "" | "OPEN" | "CLOSED"
  >("");
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("asap");
  const [asapOrdersCount, setAsapOrdersCount] = useState<number>(0);
  const [scheduledOrdersCount, setScheduledOrdersCount] = useState<number>(0);
  const [showUpcomingScheduledOrders, setShowUpcomingScheduledOrders] = useState(false);
  const [upcomingScheduledCount, setUpcomingScheduledCount] = useState<number>(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<"range-start" | "range-end">("range-start");
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [sortBy, setSortBy] = useState<
    "createdAt" | "totalAmount" | "orderNumber"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsOrder, setActionsOrder] = useState<any | null>(null);
  const [unseenOrderIds, setUnseenOrderIds] = useState<Set<string>>(new Set());
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [showPaymentStatusFilterModal, setShowPaymentStatusFilterModal] =
    useState(false);
  const [showOrderTypeFilterModal, setShowOrderTypeFilterModal] =
    useState(false);
  const [showPaymentMethodFilterModal, setShowPaymentMethodFilterModal] =
    useState(false);
  const [showBusinessDayStatusFilterModal, setShowBusinessDayStatusFilterModal] =
    useState(false);
  const [businessDayFilterTarget, setBusinessDayFilterTarget] = useState<QueueTab>("asap");
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filtersTouched, setFiltersTouched] = useState(false);

  // Cancellation reason modal state
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Branch filtering
  interface Branch {
    id: string;
    name?: string | null;
  }
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);

  const [settings, setSettings] = useState<any | null>(null);

  const [selectedBranchDetails, setSelectedBranchDetails] = useState<any | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((b: any) => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );

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

  const resolveDisplayCurrency = useCallback(
    (order?: any) => {
      const branchCurrency = String((selectedBranchDetails as any)?.currency || (selectedBranch as any)?.currency || "").trim();
      const settingsCurrency = String(
        (settings as any)?.currency ||
          (settings as any)?.settings?.currency ||
          (settings as any)?.data?.currency ||
          (settings as any)?.data?.settings?.currency ||
          ""
      ).trim();
      const orderCurrency = String((order as any)?.currency || "").trim();
      return branchCurrency || settingsCurrency || orderCurrency || "USD";
    },
    [selectedBranch, selectedBranchDetails, settings]
  );

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);
  const didInitBranchScopedRef = useRef(false);

  const isClosedOrder = (order: Order) => (order as any)?.businessDaySession?.status === "CLOSED";

  useEffect(() => {
    if (!selectedBranchId || selectedBranchId === "all") {
      setSelectedBranchDetails(null);
      return;
    }

    setSelectedBranchDetails(null);

    // If we cannot view admin branches, we also shouldn't call the admin single-branch endpoint.
    // The branch list we already loaded (via /api/user/branches) includes the future order fields.
    if (!canViewBranches) {
      return;
    }

    let cancelled = false;

    const loadSelectedBranchDetails = async () => {
      try {
        const token = (await getToken()) || undefined;
        const apiService = ApiService.getInstance();
        const result = await apiService.get(`/api/admin/branches/${selectedBranchId}`, token);
        if (cancelled) return;
        setSelectedBranchDetails((result as any)?.data ?? null);
      } catch {
        if (cancelled) return;
        setSelectedBranchDetails(null);
      }
    };

    loadSelectedBranchDetails();

    return () => {
      cancelled = true;
    };
  }, [canViewBranches, getToken, selectedBranchId]);

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

  const branchConfigForFutureOrders = selectedBranchDetails ?? selectedBranch;

  const futureOrdersEnabledEffective = getEffectiveBoolean(
    (branchConfigForFutureOrders as any)?.futureOrdersEnabled,
    (settings as any)?.futureOrdersEnabled
  );
  const futurePickupEnabledEffective =
    futureOrdersEnabledEffective &&
    getEffectiveBoolean(
      (branchConfigForFutureOrders as any)?.enableFuturePickupOrders,
      (settings as any)?.enableFuturePickupOrders
    );
  const futureDeliveryEnabledEffective =
    futureOrdersEnabledEffective &&
    getEffectiveBoolean(
      (branchConfigForFutureOrders as any)?.enableFutureDeliveryOrders,
      (settings as any)?.enableFutureDeliveryOrders
    );

  const shouldShowFutureTabs =
    Boolean(selectedBranchId) &&
    (futurePickupEnabledEffective || futureDeliveryEnabledEffective);

  const futurePickupDaysEffective = getEffectiveNumber(
    (branchConfigForFutureOrders as any)?.futurePickupOrderDays,
    (settings as any)?.futurePickupOrderDays,
    0
  );
  const futureDeliveryDaysEffective = getEffectiveNumber(
    (branchConfigForFutureOrders as any)?.futureDeliveryOrderDays,
    (settings as any)?.futureDeliveryOrderDays,
    0
  );

  const scheduledWindowDays = useMemo(() => {
    if (selectedOrderType === "PICKUP") return futurePickupDaysEffective;
    if (selectedOrderType === "DELIVERY") return futureDeliveryDaysEffective;
    return Math.max(futurePickupDaysEffective, futureDeliveryDaysEffective);
  }, [futureDeliveryDaysEffective, futurePickupDaysEffective, selectedOrderType]);

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

  const activeBusinessDayStatus: "" | "OPEN" | "CLOSED" =
    activeQueueTab === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus;

  const asapVisibleOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.isScheduledOrder) return false;
      if (activeQueueTab !== "asap") return true;
      if (asapBusinessDayStatus === "OPEN" && isClosedOrder(o)) return false;
      if (asapBusinessDayStatus === "CLOSED" && !isClosedOrder(o)) return false;
      return true;
    });
  }, [activeQueueTab, asapBusinessDayStatus, orders]);

  const scheduledVisibleOrders = useMemo(() => {
    return orders;
  }, [orders]);

  const displayedOrders = useMemo(() => {
    if (!shouldShowFutureTabs) return orders;
    return activeQueueTab === "scheduled" ? scheduledVisibleOrders : asapVisibleOrders;
  }, [activeQueueTab, asapVisibleOrders, orders, scheduledVisibleOrders, shouldShowFutureTabs]);

  const loadBranches = useCallback(async () => {
    try {
      setLoadingBranches(true);
      // If the user cannot view admin branches, don't hit /api/admin/branches (it will 403).
      // Instead, use the user branches endpoint to resolve names, then restrict to assignedBranchIds.
      if (!canViewBranches) {
        const token = (await getToken()) || undefined;
        const apiService = ApiService.getInstance();

        let userBranches: Branch[] = [];
        try {
          const userResult = await apiService.get("/api/user/branches", token);
          userBranches = Array.isArray(userResult?.data)
            ? (userResult.data as Branch[])
            : [];
        } catch (e) {
          // ignore; will fall back to id-only branches
        }

        const fallbackBranches = (assignedBranchIds || []).map((id) => {
          const match = userBranches.find((b: any) => b.id === id);
          return match ? (match as any) : ({ id } as any);
        });

        const sorted = [...fallbackBranches].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        );
        setBranches(sorted);

        // Determine if we'll auto-select a branch
        const willAutoSelect = sorted.length === 1 && sorted[0]?.id;

        setSelectedBranchId((prev) => {
          // Keep existing selection if valid
          if (prev && prev !== "all" && sorted.some((b) => b.id === prev)) return prev;
          // Auto-select only if there's exactly 1 branch
          if (willAutoSelect) return sorted[0].id;
          // Otherwise require explicit selection
          return "";
        });

        // If no branch will be auto-selected, clear loading state
        if (!willAutoSelect) {
          setLoading(false);
        }
        return;
      }

      const token = (await getToken()) || undefined;
      const apiService = ApiService.getInstance();
      const result = await apiService.get("/api/admin/branches", token);
      if (result.success && result.data) {
        const nextBranches = Array.isArray(result.data)
          ? (result.data as Branch[])
          : [];
        const filtered =
          isBranchScoped && assignedBranchIds.length
            ? nextBranches.filter((b) => assignedBranchIds.includes(b.id))
            : nextBranches;
        const sorted = [...filtered].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        );
        setBranches(sorted);

        // Determine if we'll auto-select a branch
        const willAutoSelect = sorted.length === 1 && sorted[0]?.id;

        setSelectedBranchId((prev) => {
          // Keep existing selection if valid
          if (prev && prev !== "all" && sorted.some((b) => b.id === prev)) return prev;
          // Auto-select only if there's exactly 1 branch
          if (willAutoSelect) return sorted[0].id;
          // Otherwise require explicit selection (no "all" default)
          return "";
        });

        // If no branch will be auto-selected, clear loading state
        if (!willAutoSelect) {
          setLoading(false);
        }
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  }, [assignedBranchIds, canViewBranches, getToken, isBranchScoped]);

  // Load branches on mount
  useEffect(() => {
    if (!isInitialMount.current) return;

    loadBranches()
      .catch(() => {
        // errors are handled inside loadBranches
      })
      .finally(() => {
        // Only allow branch-dependent effects after we've finished initializing branches
        isInitialMount.current = false;
      });
  }, [loadBranches]);

  // Reload branches when permissions are ready and when SUPER_ADMIN changes organization.
  // Without this, the first load can run while permissions are still loading, resulting in an
  // empty branches list and the branch dropdown disappearing.
  useEffect(() => {
    if (permissionsLoading) return;

    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
      setBranches([]);
      setSelectedBranchId("");
      setLoading(false);
      return;
    }

    loadBranches().catch(() => {
      // errors handled in loadBranches
    });
  }, [permissionsLoading, loadBranches, selectedOrganizationId, userType]);

  // Load global settings (for future orders config)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const token = (await getToken()) || undefined;
        const apiService = ApiService.getInstance();
        const result = await apiService.get("/api/user/settings", token);
        const resolved =
          (result as any)?.data?.data ??
          (result as any)?.data ??
          (result as any);
        setSettings(resolved);
      } catch {
        setSettings(null);
      }
    };
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (startDate || endDate) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today);
    setEndDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For branch-scoped users (employee/waiter/branch admin), assignedBranchIds can arrive after the
  // initial mount (permissions load). Ensure we set a default branch and reload branches list then.
  useEffect(() => {
    if (permissionsLoading) return;
    if (!isBranchScoped) return;
    if (didInitBranchScopedRef.current) return;
    if (!Array.isArray(assignedBranchIds) || assignedBranchIds.length === 0) return;

    didInitBranchScopedRef.current = true;

    // Ensure a branch is selected so orders load automatically.
    setSelectedBranchId((prev) => prev || assignedBranchIds[0] || "");

    // Ensure branches list is populated for the branch selector.
    if (!loadingBranches && branches.length === 0) {
      loadBranches().catch(() => {
        // errors handled in loadBranches
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isBranchScoped, assignedBranchIds, loadBranches]);

  // Load data when branch is selected
  useEffect(() => {
    if (selectedBranchId) {
      loadData();
    } else {
      // Clear orders if no branch is selected
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
    }
  }, [selectedBranchId]);

  // Debounced search
  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadData();
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Load data when filters change (only if branch is selected)
  useEffect(() => {
    if (isInitialMount.current) return;
    if (!selectedBranchId) return; // Don't load if no branch selected
    if (!isSearchingRef.current) {

      loadData();
    }
  }, [
    currentPage,
    selectedStatus,
    selectedPaymentStatus,
    selectedPaymentMethod,
    selectedOrderType,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    shouldShowFutureTabs,
    activeQueueTab,
    showUpcomingScheduledOrders,
    // Use timestamp strings for Date objects so React detects changes
    startDate?.getTime(),
    endDate?.getTime(),
    sortBy,
    sortOrder,
    selectedBranchId,
  ]);

  // Initialize notification service on mount
  useEffect(() => {
    notificationService.init();
  }, []);

  // Load unseen notifications to identify unseen orders
  useEffect(() => {
    const loadUnseenNotifications = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const unseenNotifications =
          await notificationApiService.getUnseenNotifications(token);
        // Filter out notifications with null orders and map to order IDs
        const orderIds = new Set(
          unseenNotifications
            .filter((n) => n.order != null)
            .map((n) => n.order!.id)
        );
        setUnseenOrderIds(orderIds);
      } catch (error) {
        console.error("Error loading unseen notifications:", error);
      }
    };

    loadUnseenNotifications();
    // Refresh unseen notifications periodically
    const interval = setInterval(loadUnseenNotifications, 30000);
    return () => clearInterval(interval);
  }, [getToken]);

  // WebSocket connection for real-time order updates (using singleton pattern)
  // This effect runs once on mount and stays active for the component lifetime
  useEffect(() => {
    const socketService = SocketService.getInstance(); // Singleton pattern
    let isMounted = true;

    // Handle new order event (real-time)
    const handleNewOrder = (data: { notification: any; order: Order }) => {
      if (!isMounted) return;

      if (!data.order) {
        console.error("📦 Orders Page: Invalid order data received", data);
        return;
      }

      // Play new order sound and long vibration
      notificationService.notifyNewOrder().catch((error) => {
        console.error("Failed to play new order sound:", error);
      });

      // Show toast notification
      setToast({
        visible: true,
        message: t("admin.notifications.newOrderReceivedToast", {
          orderNumber: formatOrderNumber(data.order.orderNumber),
        }),
        type: "success",
      });

      // Add new order to the beginning of the list (always, regardless of filters)
      // This ensures real-time updates are visible even if filters are active
      setOrders((prev) => {
        // Check if order already exists
        if (prev.some((o) => o.id === data.order.id)) {
          return prev;
        }
        // Always add to the beginning, even if filters are active
        // The user should see new orders in real-time
        return [data.order, ...prev];
      });

      // Add to unseen notifications (since new orders have unseen notifications)
      setUnseenOrderIds((prev) => new Set([...prev, data.order.id]));

      // Update total count
      setTotalCount((prev) => prev + 1);
    };

    // Handle order updated event (real-time)
    const handleOrderUpdated = (data: {
      notification: any;
      order: Order;
      newItems?: any[];
      isMergeRequest?: boolean;
    }) => {
      if (!isMounted) return;

      if (!data.order) {
        console.error("📦 Orders Page: Invalid order data received", data);
        return;
      }

      // Update order in the list if it exists
      setOrders((prev) => {
        const existingIndex = prev.findIndex((o) => o.id === data.order.id);

        if (existingIndex !== -1) {
          // Update existing order
          const updated = [...prev];
          updated[existingIndex] = data.order;
          // Move to beginning if it was updated
          return [
            updated[existingIndex],
            ...updated.filter((_, i) => i !== existingIndex),
          ];
        } else {
          // Add new order if it doesn't exist
          return [data.order, ...prev];
        }
      });

      // Add to unseen notifications if notification is unseen
      if (data.notification && !data.notification.isSeen) {
        setUnseenOrderIds((prev) => new Set([...prev, data.order.id]));
      }
    };

    // Handle notification seen event (real-time)
    const handleNotificationSeen = (data: {
      orderId: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted) return;

      // Remove from unseen set in real-time
      setUnseenOrderIds((prev) => {
        const updated = new Set(prev);
        updated.delete(data.orderId);
        return updated;
      });
    };

    // Handle all notifications seen event (real-time)
    const handleAllNotificationsSeen = () => {
      if (!isMounted) return;

      // Clear all unseen order IDs
      setUnseenOrderIds(new Set());
    };

    // Handle order status change event (real-time)
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
                status: data.status as Order["status"],
                paymentStatus: data.paymentStatus as Order["paymentStatus"],
                updatedAt: data.updatedAt,
              }
            : order
        )
      );
    };

    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) {
          console.warn(
            "📦 Orders Page: No token available for WebSocket connection"
          );
          return;
        }
        await socketService.connect(token || undefined);

        // Wait for connection to be fully established and admin room to be joined
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Register WebSocket listeners AFTER connection is established
        // These listeners will be queued if socket isn't ready yet (handled by SocketService)
        socketService.on("new-order", handleNewOrder);
        socketService.on("order-updated", handleOrderUpdated);
        socketService.on("notification-seen", handleNotificationSeen);
        socketService.on("all-notifications-seen", handleAllNotificationsSeen);
        socketService.on("order-status-changed", handleOrderStatusChange);

      } catch (error) {
        console.error("📦 Orders Page: Error setting up WebSocket:", error);
      }
    };

    // Setup WebSocket connection and listeners
    setupWebSocket();

    // Cleanup: Remove specific listeners when component unmounts
    // Note: We don't disconnect the socket here as it's a singleton
    // Other components (like NotificationBell) might be using it
    return () => {
      isMounted = false;
      socketService.off("new-order", handleNewOrder);
      socketService.off("order-updated", handleOrderUpdated);
      socketService.off("notification-seen", handleNotificationSeen);
      socketService.off("all-notifications-seen", handleAllNotificationsSeen);
      socketService.off("order-status-changed", handleOrderStatusChange);
    };
  }, [getToken]);

  const loadData = async () => {
    // Don't load orders if no branch is selected
    if (!selectedBranchId) {
      setOrders([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
      return;
    }

    try {
      // Only show full loading on initial load
      if (orders.length === 0) {
        setLoading(true);
      } else {
        // Show pagination loading when changing pages
        setPaginationLoading(true);
      }

      const token = await getToken();
      
      // Format dates for API (YYYY-MM-DD format)
      // The backend will handle setting the proper time ranges (00:00:00 for start, 23:59:59 for end)
      let startDateStr: string | undefined;
      let endDateStr: string | undefined;
      
      // If only start date is selected, treat it as single date (same date for start and end)
      // If both dates are selected, treat it as date range
      if (startDate && !endDate) {
        // Single date filter - use start date for both start and end
        const localDate = new Date(startDate);
        localDate.setHours(0, 0, 0, 0); // Set to local midnight
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, "0");
        const day = String(localDate.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        startDateStr = dateStr;
        endDateStr = dateStr;
      } else if (startDate && endDate) {
        // Date range filter - use both dates
        const formatDate = (date: Date): string => {
          const localDate = new Date(date);
          localDate.setHours(0, 0, 0, 0); // Set to local midnight
          const year = localDate.getFullYear();
          const month = String(localDate.getMonth() + 1).padStart(2, "0");
          const day = String(localDate.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };
        startDateStr = formatDate(startDate);
        endDateStr = formatDate(endDate);
      } else {
      }

      // Scheduled/Future queue should not depend on the createdAt date filter.
      // When future tabs are enabled, we fetch counts for both queues, so keep ASAP using
      // createdAt filters but always fetch Scheduled with no createdAt filter.

      const safeSelectedBranchId = isBranchScoped && selectedBranchId === "all" ? "" : selectedBranchId;
      const branchIdForApi = safeSelectedBranchId === "all" || !safeSelectedBranchId ? undefined : safeSelectedBranchId;

      // Upcoming scheduled count (badge) should be independent of filters/search.
      // Still respects the branch.
      const upcomingCountPromise = orderService
        .getOrders(
          1,
          1,
          "",
          "createdAt",
          "desc",
          "",
          "",
          "",
          undefined,
          undefined,
          branchIdForApi,
          "",
          "scheduled",
          "",
          "upcoming",
          token || undefined
        )
        .then((r) => {
          setUpcomingScheduledCount(Number(r?.pagination?.totalCount || 0));
        })
        .catch(() => {
          // ignore count errors
        });

      if (shouldShowFutureTabs) {
        const activeFilter = activeQueueTab === "scheduled" ? "scheduled" : "asap";
        const inactiveFilter = activeQueueTab === "scheduled" ? "asap" : "scheduled";

        const scheduledScope: "all" | "upcoming" =
          activeFilter === "scheduled" && showUpcomingScheduledOrders ? "upcoming" : "all";

        const resolveStartEndParams = (queue: "asap" | "scheduled") => {
          if (queue === "scheduled" && showUpcomingScheduledOrders) {
            return { start: undefined, end: undefined };
          }
          return { start: startDateStr, end: endDateStr };
        };

        const activeStartDateParam = resolveStartEndParams(activeFilter as any).start;
        const activeEndDateParam = resolveStartEndParams(activeFilter as any).end;

        const inactiveStartDateParam = resolveStartEndParams(inactiveFilter as any).start;
        const inactiveEndDateParam = resolveStartEndParams(inactiveFilter as any).end;

        const [activeResp, inactiveResp] = await Promise.all([
        orderService.getOrders(
          currentPage,
          10,
          searchTerm.trim(),
            sortBy,
            sortOrder,
            selectedStatus,
            selectedPaymentStatus,
            selectedPaymentMethod,
            activeStartDateParam,
            activeEndDateParam,
            branchIdForApi,
          selectedOrderType,
          activeFilter as any,
          activeFilter === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus,
          activeFilter === "scheduled" ? scheduledScope : "all",
          token || undefined
        ),
          // Fetch only counts + a small sample for the inactive tab.
          // Counts come from pagination.totalCount.
          orderService.getOrders(
            1,
            1,
            searchTerm.trim(),
            sortBy,
            sortOrder,
            selectedStatus,
            selectedPaymentStatus,
            selectedPaymentMethod,
            inactiveStartDateParam,
            inactiveEndDateParam,
            branchIdForApi,
          selectedOrderType,
          inactiveFilter as any,
          inactiveFilter === "scheduled" ? scheduledBusinessDayStatus : asapBusinessDayStatus,
          "all",
          token || undefined
        ),
        upcomingCountPromise,
      ]);

        // Update tab badges (use server totals so they update immediately)
        if (activeFilter === "asap") {
          setAsapOrdersCount(activeResp.pagination.totalCount);
          setScheduledOrdersCount(inactiveResp.pagination.totalCount);
        } else {
          setScheduledOrdersCount(activeResp.pagination.totalCount);
          setAsapOrdersCount(inactiveResp.pagination.totalCount);
        }

        // Use the active tab orders for main list/pagination.
        setOrders(activeResp.orders);
        setTotalPages(activeResp.pagination.totalPages);
        setTotalCount(activeResp.pagination.totalCount);
      } else {
        const response = await orderService.getOrders(
          currentPage,
          10,
          searchTerm.trim(),
          sortBy,
          sortOrder,
          selectedStatus,
          selectedPaymentStatus,
          selectedPaymentMethod,
          startDateStr,
          endDateStr,
          branchIdForApi,
          selectedOrderType,
          "all",
          activeBusinessDayStatus,
          "all",
          token || undefined
        );

        setOrders(response.orders);
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
        // Keep badges in sync when tabs aren't shown.
        setAsapOrdersCount(0);
        setScheduledOrdersCount(0);

        await upcomingCountPromise;
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      Alert.alert("Error", t("admin.orderManagement.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleStatusFilter = (status: string) => {
    // Handle special case for "REFUNDED" - this filters by payment status
    if (status === "REFUNDED_PAYMENT") {
      setSelectedStatus("");
      setSelectedPaymentStatus("REFUNDED");
    } else {
      setSelectedStatus(status === "all" ? "" : status);
      setSelectedPaymentStatus(""); // Clear payment status when selecting delivery status
    }
    setFiltersTouched(true);
    setCurrentPage(1);
  };

  const handlePaymentStatusFilter = (status: string) => {
    setSelectedPaymentStatus(status === "all" ? "" : status);
    // If selecting a payment status other than refunded, clear delivery status
    if (status !== "all" && status !== "REFUNDED") {
      setSelectedStatus("");
    }
    setFiltersTouched(true);
    setCurrentPage(1);
  };

  const handlePaymentMethodFilter = (method: string) => {
    setSelectedPaymentMethod(method === "all" ? "" : method);
    setFiltersTouched(true);
    setCurrentPage(1);
  };

  const handleBusinessDayStatusFilter = (
    target: QueueTab,
    value: "all" | "OPEN" | "CLOSED"
  ) => {
    const normalized = value === "all" ? "" : value;
    if (target === "scheduled") {
      setScheduledBusinessDayStatus(normalized);
    } else {
      setAsapBusinessDayStatus(normalized);
    }
    setFiltersTouched(true);
    setCurrentPage(1);
  };

  const setQueueTab = (tab: QueueTab) => {
    setActiveQueueTab(tab);
    if (tab !== "scheduled") {
      setShowUpcomingScheduledOrders(false);
    }
    setCurrentPage(1);
  };

  const handleOrderTypeFilter = (type: string) => {
    setSelectedOrderType(type === "all" ? "" : (type as "DELIVERY" | "PICKUP"));
    setFiltersTouched(true);
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field as any);
      setSortOrder("asc");
    }
  };

  const handleViewOrder = async (order: Order) => {
    setShowActionsMenu(null);
    // Note: Backend automatically marks notifications as seen when fetching order details
    // So we don't need to manually mark them here
    router.push(`/(admin)/order-details?id=${order.id}` as any);
  };

  const handleEditOrder = async (order: Order) => {
    if (isClosedOrder(order) && !order.isScheduledOrder) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.businessDayClosed", {
          defaultValue: "This order belongs to a closed day and cannot be edited.",
        }),
        type: "error",
      });
      return;
    }
    if (order.status === "CANCELLED") {
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.orderCancelledReadOnly", {
          defaultValue: "This order has been cancelled and cannot be edited.",
        }),
        type: "error",
      });
      return;
    }
    setShowActionsMenu(null);
    // Note: Backend automatically marks notifications as seen when fetching order details
    // So we don't need to manually mark them here
    // Navigate to order details page with edit mode
    router.push(`/(admin)/order-details?id=${order.id}&edit=true` as any);
  };

  const handleCancelOrder = (order: Order) => {
    if (isClosedOrder(order) && !order.isScheduledOrder) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.errors.businessDayClosed", {
          defaultValue: "This order belongs to a closed day and cannot be edited.",
        }),
        type: "error",
      });
      return;
    }
    if (order.status === "CANCELLED") return;
    setOrderToCancel(order);
    setCancelReason("");
    setCancelDialogVisible(true);
    setActionsModalVisible(false);
    setShowActionsMenu(null);
  };

  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancelOrderDialog.reasonRequired", {
          defaultValue: "Please provide a reason for cancellation.",
        }),
        type: "error",
      });
      return;
    }
    try {
      setIsActionLoading(orderToCancel.id);
      const token = await getToken();
      await orderService.cancelOrder(orderToCancel.id, reason, token || undefined);
      await loadData();
      setCancelDialogVisible(false);
      setOrderToCancel(null);
      setCancelReason("");
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancelOrderSuccess"),
        type: "success",
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancelOrderError"),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <View style={styles.container}>
        {/* Removed on-page header title/description */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.orderManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.ordersListContainer}>
        {paginationLoading && (
          <View style={styles.paginationLoadingOverlay}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ec4899"
              colors={["#ec4899"]}
              progressBackgroundColor="#1f1f1f"
            />
          }
        >
          {/* Filters toggle */}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: showFilters ? 4 : 16 }}>
            <TouchableOpacity
              onPress={() => setShowFilters((prev) => !prev)}
              style={styles.filterTextButtonContainer}
            >
              <Text style={styles.filterTextButton}>
                {showFilters
                  ? t("admin.userManagement.hideFilters")
                  : t("admin.userManagement.showFilters")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search and Filters */}
          {showFilters && (
            <View style={styles.filtersContainer}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.orderManagement.searchPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={searchTerm}
                  onChangeText={handleSearch}
                />
              </View>

              {/* Branch Filter - Always show so user can see/select branch even if list is empty while loading */}
              <>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    filtersTouched && selectedBranchId !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowBranchFilterModal(true)}
                >
                  <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedBranchId
                      ? branches.find((b) => b.id === selectedBranchId)?.name ||
                        t("admin.orderManagement.branch", {
                          defaultValue: "Branch",
                        })
                      : t("admin.orderManagement.branch", {
                          defaultValue: "Branch",
                        })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    filtersTouched && asapBusinessDayStatus !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => {
                    setBusinessDayFilterTarget("asap");
                    setShowBusinessDayStatusFilterModal(true);
                  }}
                >
                    <MaterialCommunityIcons name="calendar" size={14} color="#9CA3AF" />
                    <Text style={styles.filterDropdownText}>
                      {asapBusinessDayStatus === "OPEN"
                        ? t("admin.orderManagement.businessDayStatusOpen", {
                            defaultValue: "Open",
                          })
                        : asapBusinessDayStatus === "CLOSED"
                          ? t("admin.orderManagement.businessDayStatusClosed", {
                              defaultValue: "Closed",
                            })
                          : t("admin.orderManagement.businessDayStatusAllAsap", {
                              defaultValue: "All ASAP Business Days",
                            })}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                  </TouchableOpacity>

                  {shouldShowFutureTabs && (
                    <TouchableOpacity
                      style={[
                        styles.filterDropdown,
                        filtersTouched &&
                          scheduledBusinessDayStatus !== "" &&
                          styles.filterDropdownActive,
                      ]}
                      onPress={() => {
                        setBusinessDayFilterTarget("scheduled");
                        setShowBusinessDayStatusFilterModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="calendar" size={14} color="#9CA3AF" />
                      <Text style={styles.filterDropdownText}>
                        {scheduledBusinessDayStatus === "OPEN"
                          ? t("admin.orderManagement.businessDayStatusOpen", {
                              defaultValue: "Open",
                            })
                          : scheduledBusinessDayStatus === "CLOSED"
                            ? t("admin.orderManagement.businessDayStatusClosed", {
                                defaultValue: "Closed",
                              })
                            : t("admin.orderManagement.businessDayStatusAllScheduled", {
                                defaultValue: "All Scheduled Business Days",
                              })}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </>


              {/* Filter Dropdowns */}
              <View style={styles.filterDropdownsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    (selectedStatus !== "" ||
                      selectedPaymentStatus === "REFUNDED") &&
                      filtersTouched && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowStatusFilterModal(true)}
                >
                  <MaterialCommunityIcons name="truck" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedPaymentStatus === "REFUNDED"
                      ? t("admin.orderManagement.refundedOrders")
                      : selectedStatus
                      ? getStatusLabel(selectedStatus as Order["status"])
                      : t("admin.orderManagement.allDeliveryStatus", {
                          defaultValue: "All Delivery Status",
                        })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    filtersTouched && selectedPaymentStatus !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowPaymentStatusFilterModal(true)}
                >
                  <MaterialCommunityIcons name="credit-card" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedPaymentStatus
                      ? getPaymentStatusLabel(
                          selectedPaymentStatus as Order["paymentStatus"]
                        )
                      : t("admin.orderManagement.allPaymentStatus", {
                          defaultValue: "All Payment Status",
                        })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    filtersTouched && selectedPaymentMethod !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowPaymentMethodFilterModal(true)}
                >
                  <MaterialCommunityIcons name="cash" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedPaymentMethod
                      ? getPaymentMethodLabel(selectedPaymentMethod as any)
                      : t("admin.orderManagement.paymentMethod", {
                          defaultValue: "Payment Method",
                        })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    filtersTouched && selectedOrderType !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowOrderTypeFilterModal(true)}
                >
                  <MaterialCommunityIcons name="package-variant" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedOrderType
                      ? selectedOrderType === "DELIVERY"
                        ? t("admin.orderManagement.orderTypes.delivery")
                        : t("admin.orderManagement.orderTypes.pickup")
                      : t("admin.orderManagement.orderType", {
                          defaultValue: "Order Type",
                        })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

              </View>

              {/* Date Filter Inputs */}
              <View style={styles.dateFilterRow}>
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    startDate && styles.dateInputActive,
                  ]}
                  onPress={() => {
                    setDatePickerMode("range-start");
                    setDatePickerValue(startDate || new Date());
                    setDatePickerVisible(true);
                  }}
                >
                  <MaterialCommunityIcons name="calendar" size={14} color={startDate ? "#ec4899" : "#9CA3AF"} />
                  <Text
                    style={[
                      styles.dateInputText,
                      startDate && styles.dateInputTextActive,
                    ]}
                  >
                    {startDate
                      ? startDate.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : t("admin.orderManagement.startDate", {
                          defaultValue: "Start Date",
                        })}
                  </Text>
                  {startDate && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setStartDate(null);
                        setEndDate(null);
                      }}
                      style={styles.dateInputClear}
                    >
                      <MaterialCommunityIcons name="close-circle" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    endDate && styles.dateInputActive,
                  ]}
                  onPress={() => {
                    if (!startDate) {
                      // If no start date, set it first
                      setDatePickerMode("range-start");
                      setDatePickerValue(new Date());
                    } else {
                      setDatePickerMode("range-end");
                      setDatePickerValue(endDate || startDate || new Date());
                    }
                    setDatePickerVisible(true);
                  }}
                >
                  <MaterialCommunityIcons name="calendar" size={14} color={endDate ? "#ec4899" : "#9CA3AF"} />
                  <Text
                    style={[
                      styles.dateInputText,
                      endDate && styles.dateInputTextActive,
                    ]}
                  >
                    {endDate
                      ? endDate.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : t("admin.orderManagement.endDate", {
                          defaultValue: "End Date",
                        })}
                  </Text>
                  {endDate && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setEndDate(null);
                      }}
                      style={styles.dateInputClear}
                    >
                      <MaterialCommunityIcons name="close-circle" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {/* Sort */}
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.userManagement.sortByLabel")}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "createdAt" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("createdAt")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "createdAt" && styles.sortButtonTextActive,
                    ]}
                  >
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.orderManagement.newestFirst")
                        : t("admin.orderManagement.oldestFirst")
                      : t("admin.orderManagement.newestFirst")}
                  </Text>
                  {sortBy === "createdAt" && (
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={12}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "totalAmount" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("totalAmount")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "totalAmount" && styles.sortButtonTextActive,
                    ]}
                  >
                    {sortBy === "totalAmount"
                      ? sortOrder === "desc"
                        ? t("admin.orderManagement.highestAmount")
                        : t("admin.orderManagement.lowestAmount")
                      : t("admin.orderManagement.highestAmount")}
                  </Text>
                  {sortBy === "totalAmount" && (
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={12}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "orderNumber" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("orderNumber")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "orderNumber" && styles.sortButtonTextActive,
                    ]}
                  >
                    {t("admin.orderManagement.sortOrderNumber")}
                  </Text>
                  {sortBy === "orderNumber" && (
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={12}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {shouldShowFutureTabs ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: showFilters ? 12 : 16 }}>
              <View style={styles.queueTabsRow}>
                <TouchableOpacity
                  style={[styles.queueTab, activeQueueTab === "asap" && styles.queueTabActive]}
                  onPress={() => setQueueTab("asap")}
                >
                  <View style={styles.queueTabLabelRow}>
                    <Text
                      style={[
                        styles.queueTabText,
                        activeQueueTab === "asap" && styles.queueTabTextActive,
                      ]}
                    >
                      {t("orders.asap", { defaultValue: "ASAP" })}
                    </Text>
                    <View
                      style={[
                        styles.queueTabBadge,
                        activeQueueTab === "asap" && styles.queueTabBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.queueTabBadgeText,
                          activeQueueTab === "asap" && styles.queueTabBadgeTextActive,
                        ]}
                      >
                        {asapOrdersCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.queueTab,
                    activeQueueTab === "scheduled" && styles.queueTabActive,
                  ]}
                  onPress={() => setQueueTab("scheduled")}
                >
                  <View style={styles.queueTabLabelRow}>
                    <Text
                      style={[
                        styles.queueTabText,
                        activeQueueTab === "scheduled" && styles.queueTabTextActive,
                      ]}
                    >
                      {t("admin.orderManagement.scheduled.label", {
                        defaultValue: "Scheduled",
                      })}
                    </Text>
                    <View
                      style={[
                        styles.queueTabBadge,
                        activeQueueTab === "scheduled" && styles.queueTabBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.queueTabBadgeText,
                          activeQueueTab === "scheduled" && styles.queueTabBadgeTextActive,
                        ]}
                      >
                        {scheduledOrdersCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {activeQueueTab === "scheduled" ? (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.upcomingToggle,
                      showUpcomingScheduledOrders && styles.upcomingToggleActive,
                    ]}
                    onPress={() => {
                      setShowUpcomingScheduledOrders((prev) => !prev);
                      setCurrentPage(1);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.upcomingToggleText,
                        showUpcomingScheduledOrders && styles.upcomingToggleTextActive,
                      ]}
                    >
                      {t("admin.orderManagement.upcomingScheduledOrders", {
                        defaultValue: "Upcoming Scheduled Orders",
                      })}
                    </Text>
                    <View style={styles.upcomingToggleBadge}>
                      <Text style={styles.upcomingToggleBadgeText}>{upcomingScheduledCount}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
          {!selectedBranchId ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="office-building" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.orderManagement.selectBranchToView")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("admin.orderManagement.selectBranchToViewSubtext")}
              </Text>
            </View>
          ) : displayedOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="package-variant" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.orderManagement.noOrdersFound")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("admin.userManagement.noUsersFoundSubtext")}
              </Text>
            </View>
          ) : (
            displayedOrders.map((order) => {
              const isUnseen = unseenOrderIds.has(order.id);

              const terminalStatuses = new Set(["DELIVERED", "PICKED_UP", "CANCELLED", "COMPLETED"]);
              const isTerminalStatus = terminalStatuses.has(String(order.status));

              const scheduled = order.scheduledDate ? new Date(order.scheduledDate) : null;
              const hasValidScheduledDate = Boolean(
                scheduled && !isNaN(scheduled.getTime())
              );
              const isScheduled = Boolean(order.isScheduledOrder || hasValidScheduledDate);
              const isOverdue = Boolean(
                !isTerminalStatus && hasValidScheduledDate && scheduled && scheduled < new Date()
              );
              const isClosedAsap = isClosedOrder(order) && !isScheduled;
              const isClosedScheduled = isClosedOrder(order) && isScheduled;

              return (
                <View
                  key={order.id}
                  style={[
                    styles.orderCard,
                    isScheduled && styles.orderCardScheduled,
                    isOverdue && styles.orderCardScheduledOverdue,
                    isUnseen && styles.orderCardUnseen,
                    isClosedAsap && styles.orderCardClosed,
                  ]}
                >
                  <View style={styles.orderCardHeader}>
                    <View style={styles.orderInfo}>
                      {/* First Row: Order Number, Status, Amount */}
                      <View style={styles.orderHeaderRow}>
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
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                getStatusColor(order.status) + "20",
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={getStatusIcon(order.status)}
                            size={9}
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
                        <Text style={styles.orderAmount}>
                          {formatCurrency(order.totalAmount, resolveDisplayCurrency(order))}
                        </Text>
                      </View>

                      {isScheduled && (
                        <View style={styles.orderHeaderRow}>
                          <View
                            style={[
                              styles.scheduledBadge,
                              isOverdue
                                ? styles.scheduledBadgeOverdue
                                : styles.scheduledBadgeScheduled,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={isOverdue ? "alert-circle-outline" : "calendar-clock"}
                              size={10}
                              color={isOverdue ? "#ef4444" : "#a855f7"}
                            />
                            <Text
                              style={[
                                styles.scheduledBadgeText,
                                isOverdue
                                  ? styles.scheduledBadgeTextOverdue
                                  : styles.scheduledBadgeTextScheduled,
                              ]}
                            >
                              {isOverdue
                                ? t("admin.orderManagement.scheduled.overdue", {
                                    defaultValue: "Overdue",
                                  })
                                : t("admin.orderManagement.scheduled.label", {
                                    defaultValue: "Scheduled",
                                  })}
                            </Text>
                          </View>

                          {isClosedScheduled && (
                            <View style={styles.closedBadge}>
                              <Text style={styles.closedBadgeText}>
                                {t("admin.orderManagement.closed", {
                                  defaultValue: "Closed",
                                })}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {!isScheduled && isClosedAsap && (
                        <View style={styles.orderHeaderRow}>
                          <View style={styles.closedBadge}>
                            <Text style={styles.closedBadgeText}>
                              {t("admin.orderManagement.closed", {
                                defaultValue: "Closed",
                              })}
                            </Text>
                          </View>
                        </View>
                      )}

                      {hasValidScheduledDate && scheduled && isScheduled && (
                        <View
                          style={[
                            styles.scheduledBox,
                            isOverdue
                              ? styles.scheduledBoxOverdue
                              : styles.scheduledBoxScheduled,
                          ]}
                        >
                          <View style={styles.scheduledBoxRow}>
                            <MaterialCommunityIcons
                              name={
                                isOverdue
                                  ? "alert-circle-outline"
                                  : "calendar-clock"
                              }
                              size={14}
                              color={isOverdue ? "#ef4444" : "#a855f7"}
                            />
                            <View style={styles.scheduledBoxTextContainer}>
                              <Text
                                style={[
                                  styles.scheduledBoxLabel,
                                  isOverdue
                                    ? styles.scheduledBoxLabelOverdue
                                    : styles.scheduledBoxLabelScheduled,
                                ]}
                              >
                                {isOverdue
                                  ? t(
                                      "admin.orderManagement.scheduled.overdueLabel",
                                      {
                                        defaultValue:
                                          "OVERDUE - Was Scheduled For",
                                      }
                                    )
                                  : order.orderType === "PICKUP"
                                    ? t(
                                        "admin.orderManagement.scheduled.pickupFor",
                                        {
                                          defaultValue:
                                            "Pickup Scheduled For",
                                        }
                                      )
                                    : t(
                                        "admin.orderManagement.scheduled.deliveryFor",
                                        {
                                          defaultValue:
                                            "Delivery Scheduled For",
                                        }
                                      )}
                              </Text>
                              <Text
                                style={[
                                  styles.scheduledBoxValue,
                                  isOverdue
                                    ? styles.scheduledBoxValueOverdue
                                    : styles.scheduledBoxValueScheduled,
                                ]}
                              >
                                {scheduled.toLocaleDateString(undefined, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}{" "}
                                {t("admin.orderManagement.scheduled.at", {
                                  defaultValue: "at",
                                })}{" "}
                                {scheduled.toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}

                      {/* Second Row: Payment Status, Payment Method, Items */}
                      <View style={styles.orderMetaRowCompact}>
                        <View
                          style={[
                            styles.paymentStatusBadge,
                            {
                              backgroundColor:
                                getPaymentStatusColor(order.paymentStatus) +
                                "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.paymentStatusBadgeText,
                              {
                                color: getPaymentStatusColor(
                                  order.paymentStatus
                                ),
                              },
                            ]}
                          >
                            {getPaymentStatusLabel(order.paymentStatus)}
                          </Text>
                        </View>
                        <View style={styles.orderMetaItemCompact}>
                          <MaterialCommunityIcons
                            name="credit-card"
                            size={10}
                            color="#9CA3AF"
                          />
                          <Text style={styles.orderMetaTextCompact}>
                            {getPaymentMethodLabel(order.paymentMethod)}
                          </Text>
                        </View>
                        <View style={styles.orderMetaItemCompact}>
                          <MaterialCommunityIcons
                            name="shopping"
                            size={10}
                            color="#9CA3AF"
                          />
                          <Text style={styles.orderMetaTextCompact}>
                            {order._count?.orderItems ||
                              order.orderItems?.length ||
                              0}{" "}
                            {t("admin.orderManagement.items")}
                          </Text>
                        </View>
                        {order.orderType === "PICKUP" && order.pickupPhone && (
                          <View style={styles.orderMetaItemCompact}>
                            <MaterialCommunityIcons
                              name="phone"
                              size={10}
                              color="#9CA3AF"
                            />
                            <Text style={styles.orderMetaTextCompact}>
                              {order.pickupPhone}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Third Row: Date and Customer */}
                      <View style={styles.orderMetaRowCompact}>
                        <View style={styles.orderMetaItemCompact}>
                          <MaterialCommunityIcons
                            name="calendar"
                            size={10}
                            color="#9CA3AF"
                          />
                          <Text style={styles.orderMetaTextCompact}>
                            {formatDate(order.createdAt)}
                          </Text>
                        </View>
                        {order.user ? (
                          <View style={styles.orderMetaItemCompact}>
                            <MaterialCommunityIcons
                              name="account"
                              size={10}
                              color="#9CA3AF"
                            />
                            <Text style={styles.orderMetaTextCompact}>
                              {order.user.firstName} {order.user.lastName}
                            </Text>
                          </View>
                        ) : order.guestName || order.guestEmail ? (
                          <View style={styles.orderMetaItemCompact}>
                            <MaterialCommunityIcons
                              name="account"
                              size={10}
                              color="#9CA3AF"
                            />
                            <Text style={styles.orderMetaTextCompact}>
                              {order.guestName || order.guestEmail}
                            </Text>
                          </View>
                        ) : null}
                        {order.orderType === "PICKUP" && order.branch && (
                          <View style={styles.orderMetaItemCompact}>
                            <MaterialCommunityIcons
                              name="map-marker"
                              size={10}
                              color="#9CA3AF"
                            />
                            <Text
                              style={styles.orderMetaTextCompact}
                              numberOfLines={1}
                            >
                              {order.branch.name ||
                                t("orders.pickupLocation", {
                                  defaultValue: "Pickup Location",
                                })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => {
                        setActionsOrder(order);
                        setShowActionsMenu(order.id);
                        setActionsModalVisible(true);
                      }}
                      disabled={isActionLoading === order.id}
                    >
                      {isActionLoading === order.id ? (
                        <ActivityIndicator size="small" color="#9CA3AF" />
                      ) : (
                        <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Actions Menu now handled by bottom sheet */}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setShowActionsMenu(null);
          setActionsOrder(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setShowActionsMenu(null);
            setActionsOrder(null);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsOrder && (
              <View style={styles.sheetContent}>
                {(() => {
                  const scheduled = actionsOrder.scheduledDate ? new Date(actionsOrder.scheduledDate) : null;
                  const hasValidScheduledDate = Boolean(scheduled && !isNaN(scheduled.getTime()));
                  const isScheduled = Boolean(actionsOrder.isScheduledOrder || hasValidScheduledDate);
                  const isClosedAsap = isClosedOrder(actionsOrder) && !isScheduled;
                  const disableEditCancel = Boolean(isClosedAsap);

                  return (
                    <>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setActionsModalVisible(false);
                    handleViewOrder(actionsOrder);
                  }}
                >
                  <MaterialCommunityIcons name="eye" size={16} color="#ec4899" />
                  <Text style={styles.sheetItemText}>
                    {t("admin.orderManagement.viewDetails")}
                  </Text>
                </TouchableOpacity>

                {canEditOrders && (
                  <TouchableOpacity
                    style={[styles.sheetItem, disableEditCancel && styles.sheetItemDisabled]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleEditOrder(actionsOrder);
                    }}
                    disabled={disableEditCancel}
                  >
                    <EditIcon size={16} color={disableEditCancel ? "#6B7280" : "#ec4899"} />
                    <Text style={[styles.sheetItemText, disableEditCancel && styles.sheetItemTextDisabled]}>
                      {t("admin.orderManagement.editOrder")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canCancelOrders && actionsOrder.status !== "CANCELLED" && (
                  <TouchableOpacity
                    style={[styles.sheetItem, disableEditCancel && styles.sheetItemDisabled]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleCancelOrder(actionsOrder);
                    }}
                    disabled={disableEditCancel}
                  >
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={16}
                      color={disableEditCancel ? "#6B7280" : "#ef4444"}
                    />
                    <Text
                      style={[
                        styles.sheetItemText,
                        styles.actionTextDanger,
                        disableEditCancel && styles.sheetItemTextDisabled,
                      ]}
                    >
                      {t("admin.orderManagement.cancelOrder")}
                    </Text>
                  </TouchableOpacity>
                )}

                    </>
                  );
                })()}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setShowActionsMenu(null);
                    setActionsOrder(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.userManagement.deleteUserCancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Business Day Status Filter Bottom Sheet */}
      <Modal
        visible={showBusinessDayStatusFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBusinessDayStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBusinessDayStatusFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.businessDayStatus", {
                  defaultValue: "Business Day",
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowBusinessDayStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {(
                [
                  {
                    value: "all" as const,
                    label:
                      businessDayFilterTarget === "scheduled"
                        ? t("admin.orderManagement.businessDayStatusAllScheduled", {
                            defaultValue: "All Scheduled Business Days",
                          })
                        : t("admin.orderManagement.businessDayStatusAllAsap", {
                            defaultValue: "All ASAP Business Days",
                          }),
                  },
                  {
                    value: "OPEN" as const,
                    label: t("admin.orderManagement.businessDayStatusOpen", {
                      defaultValue: "Open",
                    }),
                  },
                  {
                    value: "CLOSED" as const,
                    label: t("admin.orderManagement.businessDayStatusClosed", {
                      defaultValue: "Closed",
                    }),
                  },
                ]
              ).map((opt) => {
                const selectedValue =
                  businessDayFilterTarget === "scheduled"
                    ? scheduledBusinessDayStatus
                    : asapBusinessDayStatus;

                const isActive =
                  opt.value === "all"
                    ? selectedValue === ""
                    : selectedValue === opt.value;

                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleBusinessDayStatusFilter(businessDayFilterTarget, opt.value);
                      setShowBusinessDayStatusFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isActive && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment Method Filter Bottom Sheet */}
      <Modal
        visible={showPaymentMethodFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentMethodFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentMethodFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.paymentMethod", {
                  defaultValue: "Payment Method",
                })}
              </Text>
              <TouchableOpacity
                onPress={() => setShowPaymentMethodFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedPaymentMethod === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handlePaymentMethodFilter("all");
                  setShowPaymentMethodFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPaymentMethod === "" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.orderManagement.allPaymentMethods", {
                    defaultValue: "All Payment Methods",
                  })}
                </Text>
                {selectedPaymentMethod === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {[
                "ONLINE_PAYMENT",
                "CASH_ON_DELIVERY",
                "CARD_ON_DELIVERY",
              ].map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.bottomSheetOption,
                    selectedPaymentMethod === method &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handlePaymentMethodFilter(method);
                    setShowPaymentMethodFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedPaymentMethod === method &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getPaymentMethodLabel(method as any)}
                  </Text>
                  {selectedPaymentMethod === method && (
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

      {/* Order Type Filter Bottom Sheet */}
      <Modal
        visible={showOrderTypeFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderTypeFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderTypeFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.orderType")}
              </Text>
              <TouchableOpacity onPress={() => setShowOrderTypeFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {[
                { value: "all", label: t("admin.orderManagement.allOrders") },
                {
                  value: "DELIVERY",
                  label: t("admin.orderManagement.orderTypes.delivery"),
                },
                {
                  value: "PICKUP",
                  label: t("admin.orderManagement.orderTypes.pickup"),
                },
              ].map((option) => {
                const isActive =
                  option.value === "all"
                    ? selectedOrderType === ""
                    : selectedOrderType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleOrderTypeFilter(option.value);
                      setShowOrderTypeFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isActive && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <Text style={styles.paginationText}>
            {t("admin.orderManagement.showingOrders", {
              count: orders.length,
              total: totalCount,
            })}
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === 1 && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.paginationPageText}>
              {t("admin.orderManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </Text>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === totalPages && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Status Filter Bottom Sheet */}
      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowStatusFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectOrderStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedStatus === "" &&
                    selectedPaymentStatus === "" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("all");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "" &&
                      selectedPaymentStatus === "" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.orderManagement.allDeliveryStatus", {
                    defaultValue: "All Delivery Status",
                  })}
                </Text>
                {selectedStatus === "" && selectedPaymentStatus === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {[
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY_FOR_DELIVERY",
                "READY_FOR_PICKUP",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
                "PICKED_UP",
                "CANCELLED",
              ].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.bottomSheetOption,
                    selectedStatus === status && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handleStatusFilter(status);
                    setShowStatusFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedStatus === status &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getStatusLabel(status as Order["status"])}
                  </Text>
                  {selectedStatus === status && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
              <View style={styles.bottomSheetDivider} />
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedPaymentStatus === "REFUNDED" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("REFUNDED_PAYMENT");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPaymentStatus === "REFUNDED" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.orderManagement.refundedOrders")}
                </Text>
                {selectedPaymentStatus === "REFUNDED" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment Status Filter Bottom Sheet */}
      <Modal
        visible={showPaymentStatusFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentStatusFilterModal(false)}
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
                onPress={() => setShowPaymentStatusFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedPaymentStatus === "" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handlePaymentStatusFilter("all");
                  setShowPaymentStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPaymentStatus === "" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.orderManagement.allPaymentStatus", {
                    defaultValue: "All Payment Status",
                  })}
                </Text>
                {selectedPaymentStatus === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
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
                    selectedPaymentStatus === status &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handlePaymentStatusFilter(status);
                    setShowPaymentStatusFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedPaymentStatus === status &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getPaymentStatusLabel(status as Order["paymentStatus"])}
                  </Text>
                  {selectedPaymentStatus === status && (
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

      {/* Order Type Filter Bottom Sheet */}
      <Modal
        visible={showOrderTypeFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderTypeFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderTypeFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.orderType")}
              </Text>
              <TouchableOpacity onPress={() => setShowOrderTypeFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {[
                { value: "all", label: t("admin.orderManagement.allOrders") },
                {
                  value: "DELIVERY",
                  label: t("admin.orderManagement.orderTypes.delivery"),
                },
                {
                  value: "PICKUP",
                  label: t("admin.orderManagement.orderTypes.pickup"),
                },
              ].map((option) => {
                const isActive =
                  option.value === "all"
                    ? selectedOrderType === ""
                    : selectedOrderType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleOrderTypeFilter(option.value);
                      setShowOrderTypeFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isActive && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Branch Filter Bottom Sheet */}
      <Modal
        visible={showBranchFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectBranch")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowBranchFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingBranches ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                <>
                  {branches.length === 0 ? (
                    <View style={{ padding: 20, alignItems: "center" }}>
                      <Text style={{ color: "#9CA3AF" }}>
                        {t("common.noResults", { defaultValue: "No results" })}
                      </Text>
                    </View>
                  ) : null}
                  {branches.map((branch) => (
                    <TouchableOpacity
                      key={branch.id}
                      style={[
                        styles.bottomSheetOption,
                        selectedBranchId === branch.id &&
                          styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedBranchId(branch.id);
                        setFiltersTouched(true);
                        setCurrentPage(1);
                        setShowBranchFilterModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          selectedBranchId === branch.id &&
                            styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {branch.name || branch.id}
                      </Text>
                      {selectedBranchId === branch.id && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color="#ec4899"
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date Picker Modal */}
      <DatePicker
        modal
        mode="date"
        open={datePickerVisible}
        date={datePickerValue}
        minimumDate={undefined}
        maximumDate={datePickerMode === "range-end" && startDate ? undefined : new Date()}
        onConfirm={(date) => {
          if (datePickerMode === "range-start") {
            setStartDate(date);
            setCurrentPage(1);
            // Clear end date if it exists and is before the new start date
            if (endDate && date > endDate) {
              setEndDate(null);
            }
            setDatePickerVisible(false);
          } else if (datePickerMode === "range-end") {
            if (startDate && date < startDate) {
              Alert.alert(
                t("admin.orderManagement.invalidDateRange"),
                t("admin.orderManagement.endDateBeforeStartDate")
              );
              return;
            }
            setEndDate(date);
            setCurrentPage(1);
            setDatePickerVisible(false);
          }
        }}
        onCancel={() => {
          setDatePickerVisible(false);
        }}
        title={
          datePickerMode === "range-start"
            ? t("admin.orderManagement.startDate", {
                defaultValue: "Start Date",
              })
            : t("admin.orderManagement.endDate", {
                defaultValue: "End Date",
              })
        }
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        theme="dark"
      />

      {/* Cancellation Reason Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={cancelDialogVisible}
        onRequestClose={() => {
          if (!isActionLoading) {
            setCancelDialogVisible(false);
            setOrderToCancel(null);
            setCancelReason("");
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t("admin.orderManagement.cancelOrderDialog.title", {
                    defaultValue: "Cancel Order",
                  })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!isActionLoading) {
                      setCancelDialogVisible(false);
                      setOrderToCancel(null);
                      setCancelReason("");
                    }
                  }}
                  disabled={isActionLoading === orderToCancel?.id}
                >
                  <MaterialCommunityIcons name="close" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalBodyContent}>
                  <Text style={styles.modalDescription}>
                    {t("admin.orderManagement.cancelOrderDialog.confirm", {
                      orderId: orderToCancel ? formatOrderNumber(orderToCancel.orderNumber) : "",
                      defaultValue: `Are you sure you want to cancel order ${orderToCancel ? formatOrderNumber(orderToCancel.orderNumber) : ""}?`,
                    })}
                  </Text>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>
                      {t("admin.orderManagement.cancelOrderDialog.reasonLabel", {
                        defaultValue: "Reason for cancellation",
                      })}
                      <Text style={{ color: "#ef4444" }}> *</Text>
                    </Text>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      numberOfLines={4}
                      value={cancelReason}
                      onChangeText={setCancelReason}
                      placeholder={t("admin.orderManagement.cancelOrderDialog.reasonPlaceholder", {
                        defaultValue: "Please tell us why you are cancelling...",
                      })}
                      placeholderTextColor="#6B7280"
                      editable={isActionLoading !== orderToCancel?.id}
                    />
                    <Text style={styles.inputHint}>
                      {t("admin.orderManagement.cancelOrderDialog.reasonRequiredHint", {
                        defaultValue: "This field is required.",
                      })}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setCancelDialogVisible(false);
                    setOrderToCancel(null);
                    setCancelReason("");
                  }}
                  disabled={isActionLoading === orderToCancel?.id}
                >
                  <Text style={styles.modalButtonCancelText}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonDelete]}
                  onPress={handleConfirmCancel}
                  disabled={isActionLoading === orderToCancel?.id || !cancelReason.trim()}
                >
                  {isActionLoading === orderToCancel?.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonDeleteText}>
                      {t("admin.orderManagement.cancelOrder", {
                        defaultValue: "Cancel Order",
                      })}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
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
        topOffset={headerHeight + 16}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
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
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  filterDropdownsRow: {
    flexDirection: "column",
    gap: 12,
  },
  dateFilterRow: {
    flexDirection: "column",
    gap: 12,
  },
  dateInput: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  dateInputActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  dateInputText: {
    flex: 1,
    fontSize: 14,
    color: "#9CA3AF",
  },
  dateInputTextActive: {
    color: "#fff",
  },
  dateInputClear: {
    padding: 4,
  },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#171717",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  queueTabsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  queueTab: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#171717",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  queueTabActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  queueTabText: {
    color: "#D1D5DB",
    fontWeight: "800",
    fontSize: 13,
  },
  queueTabTextActive: {
    color: "#fff",
  },
  queueTabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  queueTabBadge: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  queueTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  queueTabBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#D1D5DB",
  },
  queueTabBadgeTextActive: {
    color: "#fff",
  },
  upcomingToggle: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#171717",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  upcomingToggleActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  upcomingToggleText: {
    color: "#D1D5DB",
    fontWeight: "800",
    fontSize: 13,
  },
  upcomingToggleTextActive: {
    color: "#fff",
  },
  upcomingToggleBadge: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingToggleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ec4899",
  },
  ordersListContainer: {
    flex: 1,
    position: "relative",
  },
  ordersList: {
    flex: 1,
    padding: 16,
  },
  paginationLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  orderCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  orderCardScheduled: {
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "rgba(168, 85, 247, 0.10)",
  },
  orderCardScheduledOverdue: {
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "rgba(239, 68, 68, 0.10)",
  },
  orderCardUnseen: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
    borderLeftWidth: 3,
  },
  orderCardClosed: {
    opacity: 0.6,
    borderStyle: "dashed",
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderInfo: {
    flex: 1,
    gap: 6,
  },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  mergedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(168, 85, 247, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.35)",
  },
  mergedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#a855f7",
  },
  scheduledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  scheduledBadgeScheduled: {
    borderColor: "rgba(168, 85, 247, 0.6)",
    backgroundColor: "rgba(168, 85, 247, 0.12)",
  },
  scheduledBadgeOverdue: {
    borderColor: "rgba(239, 68, 68, 0.6)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  scheduledBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  scheduledBadgeTextScheduled: {
    color: "#a855f7",
  },
  scheduledBadgeTextOverdue: {
    color: "#ef4444",
  },
  closedBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D1D5DB",
  },
  scheduledBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  scheduledBoxScheduled: {
    borderColor: "rgba(168, 85, 247, 0.45)",
    backgroundColor: "rgba(168, 85, 247, 0.08)",
  },
  scheduledBoxOverdue: {
    borderColor: "rgba(239, 68, 68, 0.45)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  scheduledBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scheduledBoxTextContainer: {
    flex: 1,
  },
  scheduledBoxLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  scheduledBoxLabelScheduled: {
    color: "#a855f7",
  },
  scheduledBoxLabelOverdue: {
    color: "#ef4444",
  },
  scheduledBoxValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  scheduledBoxValueScheduled: {
    color: "#c084fc",
  },
  scheduledBoxValueOverdue: {
    color: "#fca5a5",
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  orderMetaRowCompact: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 4,
  },
  orderMetaItemCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  orderMetaText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  orderMetaTextCompact: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    marginLeft: "auto",
  },
  paymentStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paymentStatusBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  orderTypeBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
    borderWidth: 1,
  },
  orderTypeBadgeText: {
    fontSize: 11,
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
  actionsMenu: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    gap: 8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#262626",
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
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  sheetItemDisabled: {
    opacity: 0.6,
  },
  sheetItemTextDisabled: {
    color: "#9CA3AF",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#D1D5DB",
    fontWeight: "700",
    fontSize: 14,
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    backgroundColor: "#0f0f0f",
  },
  paginationText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    backgroundColor: "#262626",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#171717",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  modalBody: {
    flexGrow: 1,
    minHeight: 200,
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  orderItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  orderItemInfo: {
    flex: 1,
    gap: 4,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  orderItemDetails: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  addOnsList: {
    marginTop: 4,
    gap: 2,
  },
  addOnText: {
    fontSize: 11,
    color: "#6B7280",
    fontStyle: "italic",
  },
  specialInstructions: {
    fontSize: 11,
    color: "#fbbf24",
    marginTop: 4,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
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
  },
  summaryValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
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
  deliveryNotes: {
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#262626",
  },
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  modalButtonSave: {
    backgroundColor: "#ec4899",
  },
  modalButtonSaveText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonDelete: {
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 20,
    marginBottom: 24,
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
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  optionButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  optionButtonText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  optionButtonTextActive: {
    color: "#fff",
  },
  textArea: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
    minHeight: 100,
    textAlignVertical: "top",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
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
    padding: 20,
    maxHeight: 500,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionSubtext: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  clearDateButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#262626",
    borderRadius: 8,
    alignItems: "center",
  },
  clearDateButtonText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  bottomSheetDivider: {
    height: 1,
    backgroundColor: "#262626",
    marginVertical: 8,
    marginHorizontal: 16,
  },
  viewOrderBottomSheet: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
    flexDirection: "column",
    width: "100%",
    alignSelf: "flex-end",
    overflow: "hidden",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#404040",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  orderSummaryCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  orderSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderSummaryLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  orderSummaryValue: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  orderSummaryTotal: {
    fontSize: 16,
    color: "#ec4899",
    fontWeight: "700",
  },
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeTextSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  paymentStatusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentStatusBadgeTextSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  orderItemCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  orderItemHeader: {
    flexDirection: "row",
    gap: 12,
  },
  mealImageContainer: {
    width: 64,
    height: 64,
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
  orderItemContent: {
    flex: 1,
    gap: 6,
  },
  orderItemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderItemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  sizeBadgeText: {
    fontSize: 11,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  orderItemQuantity: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  orderItemUnitPrice: {
    fontSize: 11,
    color: "#6B7280",
  },
  orderItemTax: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },
  addOnsSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  addOnsSectionTitle: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  addOnsGrid: {
    gap: 8,
  },
  addOnCard: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#404040",
  },
  addOnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  addOnName: {
    fontSize: 13,
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
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  addOnTax: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  specialInstructionsCard: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    marginTop: 8,
  },
  specialInstructionsLabel: {
    fontSize: 11,
    color: "#fbbf24",
    fontWeight: "600",
    marginBottom: 4,
  },
  specialInstructionsText: {
    fontSize: 12,
    color: "#fbbf24",
    lineHeight: 16,
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
  orderActionsContainer: {
    padding: 20,
    gap: 12,
    paddingTop: 8,
  },
  processRefundButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  processRefundButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    backgroundColor: "#262626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
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
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
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
});
