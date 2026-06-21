import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useFocusEffect } from "expo-router";
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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import LocalDbService, { type LocalOrder } from "@/src/services/localDbService";
import NetInfo from '@react-native-community/netinfo';

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

// Helper function to map LocalOrder to Order type for display in order list
const mapLocalOrderToOrder = (localOrder: LocalOrder): Order => {
  const cartData = JSON.parse(localOrder.cartData);
  return {
    id: localOrder.id,
    orderNumber: `OFFLINE-${localOrder.offlineSequenceNumber}`,
    orderType: "PICKUP",
    status: localOrder.paymentStatus === "PAID" ? "PICKED_UP" : "PENDING",
    totalAmount: localOrder.amount,
    currency: "USD",
    deliveryFee: 0,
    taxAmount: 0,
    paymentMethod: localOrder.paymentMethod === "CASH" ? "CASH_ON_DELIVERY" : "CARD_ON_DELIVERY",
    paymentStatus: localOrder.paymentStatus,
    isPosOrder: true,
    isNotSynced: localOrder.isSynced === 0,
    branch: null,
    orderItems: cartData.items || [],
    createdAt: localOrder.createdAt,
    updatedAt: localOrder.createdAt,
  };
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
  const params = useLocalSearchParams<{
    search?: string | string[];
    paymentStatus?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const bottomInset = insets.bottom;
  const { width: windowWidth } = useWindowDimensions();
  const isTwoColumnFilters = windowWidth >= 760;

  // Dynamic column calculation for order grid
  const orderGridConfig = useMemo(() => {
    const minCardWidth = 280;
    const gap = 12; // gap between cards
    const padding = 32; // horizontal padding (16px on each side)
    const availableWidth = windowWidth - padding;
    
    // Calculate how many columns can fit
    let columns = Math.floor((availableWidth + gap) / (minCardWidth + gap));
    
    // Clamp to min 2 and max 5 columns
    columns = Math.max(2, Math.min(5, columns));
    
    return { columns, minCardWidth };
  }, [windowWidth]);

  const truncateDisplayId = useCallback((value: string, max: number) => {
    const v = String(value || "");
    if (v.length <= max) return v;
    return `${v.slice(0, max)}…`;
  }, []);

  const formatOrderNumberDisplay = useCallback((value: string) => {
    const v = String(value || "");
    if (v.length <= 8) return v; // Don't truncate if short enough
    return `${v.slice(0, 3)}...${v.slice(-5)}`;
  }, []);

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
  const [selectedOrderSource, setSelectedOrderSource] = useState<
    "all" | "pos" | "online"
  >("all");
  const [asapBusinessDayStatus, setAsapBusinessDayStatus] = useState<
    "" | "OPEN" | "CLOSED"
  >("OPEN");
  const [scheduledBusinessDayStatus, setScheduledBusinessDayStatus] = useState<
    "" | "OPEN" | "CLOSED"
  >("");
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("asap");
  const [asapOrdersCount, setAsapOrdersCount] = useState<number>(0);
  const [scheduledOrdersCount, setScheduledOrdersCount] = useState<number>(0);
  const [badgeCountsLoaded, setBadgeCountsLoaded] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [endDate, setEndDate] = useState<Date | null>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
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
  const [showOrderSourceFilterModal, setShowOrderSourceFilterModal] = useState(false);
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
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [showBranchOfflineDialog, setShowBranchOfflineDialog] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const [settings, setSettings] = useState<any | null>(null);

  const [selectedBranchDetails, setSelectedBranchDetails] = useState<any | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((b: any) => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );

  // Offline detection
  useEffect(() => {
    const checkConnection = async () => {
      const netInfo = await NetInfo.fetch();
      const offline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      setIsOffline(offline);
    };

    checkConnection();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
  }, []);

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
  const didApplyRouteFiltersRef = useRef(false);

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
    if (!o.isScheduledOrder) {
      return false;
    }
    if (o.orderType === "PICKUP" && !futurePickupEnabledEffective) {
      return false;
    }
    if (o.orderType === "DELIVERY" && !futureDeliveryEnabledEffective) {
      return false;
    }
    if (!o.scheduledDate) {
      return true;
    }

    const d = new Date(o.scheduledDate);
    if (Number.isNaN(d.getTime())) {
      return true;
    }

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
    const filtered = orders.filter((o) => withinScheduledWindow(o));
    // Sort by scheduledDate ascending (earlier pickups first)
    return filtered.sort((a, b) => {
      const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
      const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
      return dateA - dateB;
    });
  }, [orders, futureDeliveryEnabledEffective, futurePickupEnabledEffective, scheduledWindowDays]);

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

        if (selectedBranchId && selectedBranchId !== "all" && sorted.some((b) => b.id === selectedBranchId)) {
          // keep current valid selection
        } else if (willAutoSelect) {
          setSelectedBranchId(sorted[0].id);
        } else {
          setSelectedBranchId("");
        }

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

        if (selectedBranchId && selectedBranchId !== "all" && sorted.some((b) => b.id === selectedBranchId)) {
          // keep current valid selection
        } else if (willAutoSelect) {
          setSelectedBranchId(sorted[0].id);
        } else {
          setSelectedBranchId("");
        }

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
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch

    loadBranches()
      .catch(() => {
        // errors are handled inside loadBranches
      })
      .finally(() => {
        // Only allow branch-dependent effects after we've finished initializing branches
        isInitialMount.current = false;
        // If a branch was already selected (e.g. from BranchContext persistence), load data now
        if (selectedBranchId) {
          loadData();
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBranches, branchLoading]);

  // Reload branches when permissions are ready and when SUPER_ADMIN changes organization.
  // Without this, the first load can run while permissions are still loading, resulting in an
  // empty branches list and the branch dropdown disappearing.
  useEffect(() => {
    if (didApplyRouteFiltersRef.current) return;
    didApplyRouteFiltersRef.current = true;

    const searchParam = Array.isArray(params.search) ? params.search[0] : params.search;
    const paymentStatusParam = Array.isArray(params.paymentStatus)
      ? params.paymentStatus[0]
      : params.paymentStatus;

    if (searchParam && String(searchParam).trim()) {
      setSearchTerm(String(searchParam).trim());
    }

    if (paymentStatusParam) {
      const normalized = String(paymentStatusParam).trim().toUpperCase();
      if (["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(normalized)) {
        setSelectedPaymentStatus(normalized);
      }
    }
  }, [params.paymentStatus, params.search]);

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


  // For branch-scoped users (employee/waiter/branch admin), assignedBranchIds can arrive after the
  // initial mount (permissions load). Ensure we set a default branch and reload branches list then.
  useEffect(() => {
    if (permissionsLoading) return;
    if (!isBranchScoped) return;
    if (didInitBranchScopedRef.current) return;
    if (!Array.isArray(assignedBranchIds) || assignedBranchIds.length === 0) return;

    didInitBranchScopedRef.current = true;

    // Ensure a branch is selected so orders load automatically.
    if (!selectedBranchId) setSelectedBranchId(assignedBranchIds[0] || "");

    // Ensure branches list is populated for the branch selector.
    if (!loadingBranches && branches.length === 0) {
      loadBranches().catch(() => {
        // errors handled in loadBranches
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isBranchScoped, assignedBranchIds, loadBranches]);

  // When branch becomes deselected, clear orders
  useEffect(() => {
    if (!selectedBranchId) {
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
    selectedOrderSource,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    shouldShowFutureTabs,
    activeQueueTab,
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
        // Prevent notification fetch for super admin without organization
        if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
          return;
        }
        
        const token = await getToken();
        if (!token) {
          return;
        }
        const unseenNotifications =
          await notificationApiService.getUnseenNotifications(
            token,
            selectedOrganizationId ?? undefined
          );
        // Filter out notifications with null orders and map to order IDs
        const orderIds = new Set(
          unseenNotifications
            .filter((n) => n.order != null)
            .map((n) => n.order!.id)
        );
        setUnseenOrderIds(orderIds);
      } catch (error) {
        // Handle authentication errors gracefully
        if ((error as any)?.status === 401 || (error as any)?.isAuthError) {
          console.warn("Authentication error loading notifications in orders - this may be expected for super admins without organization");
        } else {
          console.error("Error loading unseen notifications:", error);
        }
      }
    };

    // Only set up interval if notifications are available
    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
      return;
    }
    
    loadUnseenNotifications();
    // Refresh unseen notifications periodically with logout protection
    const interval = setInterval(() => {
      // Check logout state before making API call
      if (ApiService.shouldPreventRequest()) {
        return;
      }
      loadUnseenNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [getToken, userType, selectedOrganizationId]);

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

  const loadData = useCallback(async () => {
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

      // Fetch local offline orders from SQLite
      const localDb = LocalDbService.getInstance();
      let localOrders: Order[] = [];
      try {
        const allLocalOrders = await localDb.getAllLocalOrders();
        // Filter local orders by branch
        const branchLocalOrders = allLocalOrders.filter(
          (lo) => lo.branchId === selectedBranchId
        );
        // Deduplicate local orders by ID in case of existing duplicates
        const deduplicatedLocalOrders = branchLocalOrders.filter((order, index, self) =>
          index === self.findIndex((o) => o.id === order.id)
        );
        // Map to Order type
        localOrders = deduplicatedLocalOrders.map(mapLocalOrderToOrder);
      } catch (error) {
        console.error("Error loading local orders:", error);
      }

      let onlineOrders: Order[] = [];
      let isOffline = false;

      try {
        if (shouldShowFutureTabs) {
          const activeFilter = activeQueueTab === "scheduled" ? "scheduled" : "asap";
          const inactiveFilter = activeQueueTab === "scheduled" ? "asap" : "scheduled";

          const resolveStartEndParams = (queue: "asap" | "scheduled", isActive: boolean = true) => {
            // For scheduled tab, use a wider date range to include all future orders within the configured window
            if (queue === "scheduled") {
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const end = new Date(todayStart);
              end.setDate(end.getDate() + Math.max(0, Number(scheduledWindowDays || 0)));
              end.setHours(23, 59, 59, 999);
              return {
                start: todayStart.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
              };
            }
            return { start: startDateStr, end: endDateStr };
          };

          const activeStartDateParam = resolveStartEndParams(activeFilter as any, true).start;
          const activeEndDateParam = resolveStartEndParams(activeFilter as any, true).end;

          const inactiveStartDateParam = resolveStartEndParams(inactiveFilter as any, false).start;
          const inactiveEndDateParam = resolveStartEndParams(inactiveFilter as any, false).end;

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
            "all",
            selectedOrderSource,
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
            selectedOrderSource,
            token || undefined
          )
        ]);

          // Update tab badges (use server totals so they update immediately)
          if (activeFilter === "asap") {
            setAsapOrdersCount(activeResp.pagination.totalCount);
            setScheduledOrdersCount(inactiveResp.pagination.totalCount);
          } else {
            setScheduledOrdersCount(activeResp.pagination.totalCount);
            setAsapOrdersCount(inactiveResp.pagination.totalCount);
          }
          setBadgeCountsLoaded(true);

          // Use the active tab orders for main list/pagination.
          onlineOrders = activeResp.orders;
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
            selectedOrderSource,
            token || undefined
          );

          onlineOrders = response.orders;
          setTotalPages(response.pagination.totalPages);
          setTotalCount(response.pagination.totalCount);
          // Keep badges in sync when tabs aren't shown.
          setAsapOrdersCount(0);
          setScheduledOrdersCount(0);
        }
      } catch (error) {
        console.error("Error loading online orders:", error);
        isOffline = true;
        // Show toast notification for offline mode
        setToast({
          visible: true,
          message: t("admin.orderManagement.offlineMode"),
          type: "info",
        });
        // Fall back to local orders only
        onlineOrders = [];
      }

      // Merge local and online orders chronologically
      const mergedOrders = [...onlineOrders, ...localOrders];
      
      // Deduplicate orders by ID (prefer online version if duplicate exists)
      const deduplicatedOrders = mergedOrders.filter((order, index, self) =>
        index === self.findIndex((o) => o.id === order.id)
      );
      
      // Sort merged orders by createdAt
      deduplicatedOrders.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

      // Apply client-side filters for local orders (since they're not filtered by API)
      const filteredMergedOrders = deduplicatedOrders.filter((order) => {
        // Filter by status
        if (selectedStatus && order.status !== selectedStatus) return false;
        
        // Filter by payment status
        if (selectedPaymentStatus && order.paymentStatus !== selectedPaymentStatus) return false;
        
        // Filter by payment method
        if (selectedPaymentMethod && order.paymentMethod !== selectedPaymentMethod) return false;
        
        // Filter by order type
        if (selectedOrderType && order.orderType !== selectedOrderType) return false;
        
        // Filter by order source (POS vs online)
        if (selectedOrderSource === "pos" && !order.isPosOrder) return false;
        if (selectedOrderSource === "online" && order.isPosOrder) return false;
        
        // Filter by date range for local orders
        // Skip date range filtering for scheduled orders since API already handles it with wider date range
        if (startDateStr || endDateStr) {
          if (!order.isScheduledOrder) {
            // Use scheduledDate for scheduled orders, createdAt for ASAP orders
            const orderDateStr = order.scheduledDate || order.createdAt;
            if (!orderDateStr) return false;
            const orderDate = new Date(orderDateStr);
            const start = startDateStr ? new Date(startDateStr).getTime() : 0;
            const end = endDateStr ? new Date(endDateStr).getTime() + 86400000 : Infinity; // Add 1 day for end date
            const orderTime = orderDate.getTime();
            if (orderTime < start || orderTime > end) return false;
          }
        }
        
        // Filter by search term
        if (searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase();
          const orderNumber = order.orderNumber.toLowerCase();
          const guestName = (order.guestName || "").toLowerCase();
          const guestPhone = (order.guestPhone || "").toLowerCase();
          if (
            !orderNumber.includes(searchLower) &&
            !guestName.includes(searchLower) &&
            !guestPhone.includes(searchLower)
          ) {
            return false;
          }
        }
        
        return true;
      });

      setOrders(filteredMergedOrders);
      
      // If offline, adjust total count to include local orders
      if (isOffline) {
        setTotalCount(filteredMergedOrders.length);
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      Alert.alert("Error", t("admin.orderManagement.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
    }
  }, [
    selectedBranchId,
    getToken,
    startDate,
    endDate,
    isBranchScoped,
    shouldShowFutureTabs,
    activeQueueTab,
    currentPage,
    searchTerm,
    sortBy,
    sortOrder,
    selectedStatus,
    selectedPaymentStatus,
    selectedPaymentMethod,
    selectedOrderType,
    selectedOrderSource,
    asapBusinessDayStatus,
    scheduledBusinessDayStatus,
    activeBusinessDayStatus,
    t,
  ]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  // Refresh data when screen comes into focus (e.g., after navigating back from order-details)
  useFocusEffect(
    useCallback(() => {
      handleRefresh();
    }, [handleRefresh])
  );

  const handleDateConfirm = (date: Date, mode: "range-start" | "range-end") => {
    if (mode === "range-start") {
      setStartDate(date);
      setCurrentPage(1);
      if (endDate && date > endDate) {
        setEndDate(null);
      }
      setDatePickerVisible(false);
    } else if (mode === "range-end") {
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
  };

  const openDatePicker = (mode: "range-start" | "range-end", initialValue: Date) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialValue,
        mode: "date",
        display: "default",
        maximumDate: mode === "range-end" && startDate ? undefined : new Date(),
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if ((event as any)?.type === "dismissed") return;
          if (selectedDate) {
            handleDateConfirm(selectedDate, mode);
          }
        },
      });
      return;
    }

    setDatePickerMode(mode);
    setDatePickerValue(initialValue);
    setDatePickerVisible(true);
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
        message: t("admin.orderManagement.errors.businessDayClosed"),
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
        message: t("admin.orderManagement.errors.businessDayClosed"),
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
        message: t("admin.orderManagement.cancelOrderDialog.reasonRequired"),
        type: "error",
      });
      return;
    }
    try {
      setIsActionLoading(orderToCancel.id);
      const token = await getToken();
      const cancelledOrder = await orderService.cancelOrder(orderToCancel.id, reason, token || undefined);

      // Update local state immediately to show cancelled badge without waiting for loadData
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderToCancel.id
            ? { ...o, status: "CANCELLED", cancellationReason: reason }
            : o
        )
      );

      setCancelDialogVisible(false);
      setOrderToCancel(null);
      setCancelReason("");
      setToast({
        visible: true,
        message: t("admin.orderManagement.cancelOrderSuccess"),
        type: "success",
      });

      // Refresh full data in background to ensure consistency
      loadData().catch(() => {
        // Silently ignore background refresh errors
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
    <View style={styles.container}>
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
              progressBackgroundColor="#f3f4f6"
            />
          }
        >
          {/* Filters toggle */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: showFilters ? 10 : 14,
              marginTop: 4,
            }}
          >
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
                  onChangeText={setSearchTerm}
                />
              </View>

              {/* Branch Filter - Always show so user can see/select branch even if list is empty while loading */}
              <View style={styles.filterGrid}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
                    filtersTouched && selectedBranchId !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => {
                    if (isOffline) {
                      setShowBranchOfflineDialog(true);
                      return;
                    }
                    setShowBranchFilterModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedBranchId
                      ? branches.find((b) => b.id === selectedBranchId)?.name ||
                        t("admin.orderManagement.branch")
                      : t("admin.orderManagement.branch")
                    }
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
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
                        isTwoColumnFilters && styles.filterGridItemTwoCol,
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
                          ? t("admin.orderManagement.businessDayStatusOpen")
                          : scheduledBusinessDayStatus === "CLOSED"
                            ? t("admin.orderManagement.businessDayStatusClosed")
                            : t("admin.orderManagement.businessDayStatusAllScheduled", {
                              })}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
              </View>


              {/* Filter Dropdowns */}
              <View style={styles.filterDropdownsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
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
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
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
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
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
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
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

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    isTwoColumnFilters && styles.filterGridItemTwoCol,
                    filtersTouched && selectedOrderSource !== "all" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowOrderSourceFilterModal(true)}
                >
                  <MaterialCommunityIcons name="tablet" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedOrderSource === "pos"
                      ? t("admin.orderManagement.posOrders", { defaultValue: "POS Orders" })
                      : selectedOrderSource === "online"
                        ? t("admin.orderManagement.onlineOrders", { defaultValue: "Online Orders" })
                        : t("admin.orderManagement.allSources", { defaultValue: "All Sources" })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

              </View>

              {/* Date Filter Inputs */}
              <View
                style={[
                  styles.dateFilterRow,
                  isTwoColumnFilters && styles.dateFilterRowTwoCol,
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    isTwoColumnFilters && styles.dateInputTwoCol,
                    startDate && styles.dateInputActive,
                  ]}
                  onPress={() => {
                    openDatePicker("range-start", startDate || new Date());
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
                    isTwoColumnFilters && styles.dateInputTwoCol,
                    endDate && styles.dateInputActive,
                  ]}
                  onPress={() => {
                    if (!startDate) {
                      // If no start date, set it first
                      openDatePicker("range-start", new Date());
                    } else {
                      openDatePicker("range-end", endDate || startDate || new Date());
                    }
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
                      {badgeCountsLoaded ? (
                        <Text
                          style={[
                            styles.queueTabBadgeText,
                            activeQueueTab === "asap" && styles.queueTabBadgeTextActive,
                          ]}
                        >
                          {asapOrdersCount}
                        </Text>
                      ) : (
                        <ActivityIndicator
                          size="small"
                          color={activeQueueTab === "asap" ? "#000" : "#fff"}
                          style={styles.badgeSpinner}
                        />
                      )}
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
                      {badgeCountsLoaded ? (
                        <Text
                          style={[
                            styles.queueTabBadgeText,
                            activeQueueTab === "scheduled" && styles.queueTabBadgeTextActive,
                          ]}
                        >
                          {scheduledOrdersCount}
                        </Text>
                      ) : (
                        <ActivityIndicator
                          size="small"
                          color={activeQueueTab === "scheduled" ? "#000" : "#fff"}
                          style={styles.badgeSpinner}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
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
            <View style={[styles.orderGrid, styles.orderGridDynamic]}>
              {displayedOrders.map((order) => {
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
                const hideScheduledBoxForDeliveredDelivery =
                  order.orderType === "DELIVERY" && String(order.status) === "DELIVERED";

                return (
                  <View
                    key={order.id}
                    style={[
                      styles.orderCard,
                      { flexGrow: 1, flexShrink: 1, minWidth: orderGridConfig.minCardWidth, marginBottom: 0 },
                      isScheduled && styles.orderCardScheduled,
                      isOverdue && styles.orderCardScheduledOverdue,
                      isUnseen && styles.orderCardUnseen,
                      isClosedAsap && styles.orderCardClosed,
                    ]}
                  >
                    <View style={styles.orderCardHeader}>
                      <View style={styles.orderInfo}>
                        <View style={styles.orderHeaderRow}>
                          <Text style={styles.orderNumber}>
                            {formatOrderNumber(
                              formatOrderNumberDisplay(order.orderNumber)
                            )}
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
                          {(() => {
                            if (order.paymentStatus === "PARTIALLY_REFUNDED" && (order as any).refunds?.length) {
                              const totalRefunded = (order as any).refunds
                                .filter((r: any) => r.status === "SUCCEEDED")
                                .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
                              if (totalRefunded > 0) {
                                return formatCurrency(Math.max(0, Number(order.totalAmount) - totalRefunded), resolveDisplayCurrency(order));
                              }
                            }
                            return formatCurrency(Number(order.totalAmount), resolveDisplayCurrency(order));
                          })()}
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

                      {hasValidScheduledDate &&
                        scheduled &&
                        isScheduled &&
                        !hideScheduledBoxForDeliveredDelivery && (
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
                            {getPaymentMethodLabel(order.paymentMethod, order.orderType)}
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
              })}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
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
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(12, insets.bottom + 12) },
            ]}
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
                  const isFullyRefundedAndCancelled =
                    actionsOrder.status === "CANCELLED" && actionsOrder.paymentStatus === "REFUNDED";
                  const disableEditCancel = Boolean(isClosedAsap || isFullyRefundedAndCancelled);

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
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowBusinessDayStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBusinessDayStatusFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.businessDayStatus", {
                  defaultValue: "Business Day",
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowBusinessDayStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowPaymentMethodFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentMethodFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
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
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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
                  <Text style={styles.bottomSheetOptionText}>
                    {getPaymentMethodLabel(method as any, undefined)}
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
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowOrderTypeFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderTypeFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.orderType")}
              </Text>
              <TouchableOpacity onPress={() => setShowOrderTypeFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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

      {/* Order Source Filter Bottom Sheet */}
      <Modal
        visible={showOrderSourceFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowOrderSourceFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowOrderSourceFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.orderSource", { defaultValue: "Order Source" })}
              </Text>
              <TouchableOpacity onPress={() => setShowOrderSourceFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {[
                {
                  value: "all" as const,
                  label: t("admin.orderManagement.allSources", { defaultValue: "All Sources" }),
                },
                {
                  value: "pos" as const,
                  label: t("admin.orderManagement.posOrders", { defaultValue: "POS Orders" }),
                },
                {
                  value: "online" as const,
                  label: t("admin.orderManagement.onlineOrders", { defaultValue: "Online Orders" }),
                },
              ].map((option) => {
                const isActive = selectedOrderSource === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedOrderSource(option.value);
                      setFiltersTouched(true);
                      setCurrentPage(1);
                      setShowOrderSourceFilterModal(false);
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

      {/* Status Filter Bottom Sheet */}
      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowStatusFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectOrderStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowPaymentStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPaymentStatusFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectPaymentStatus")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowPaymentStatusFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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

      {/* Branch Filter Bottom Sheet */}
      <Modal
        visible={showBranchFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchFilterModal(false)}
        >
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, bottomInset + 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.orderManagement.selectBranch")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowBranchFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
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

      {/* BRANCH OFFLINE DIALOG */}
      <Modal
        visible={showBranchOfflineDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchOfflineDialog(false)}
      >
        <Pressable
          style={styles.offlineDialogOverlay}
          onPress={() => setShowBranchOfflineDialog(false)}
        >
          <Pressable style={styles.offlineDialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.offlineDialogHandle} />
            <View style={styles.offlineDialogContent}>
              <MaterialCommunityIcons name="wifi-off" size={48} color="#ec4899" />
              <Text style={styles.offlineDialogTitle}>
                {t('admin.pos.branchSwitchOfflineTitle', { defaultValue: 'Branch Switch Not Available Offline' })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t('admin.pos.branchSwitchOfflineMessage', { defaultValue: 'Switching branches requires an internet connection. Please connect to the internet to change branches.' })}
              </Text>
              <TouchableOpacity
                style={styles.offlineDialogButton}
                onPress={() => setShowBranchOfflineDialog(false)}
              >
                <Text style={styles.offlineDialogButtonText}>
                  {t('common.ok', { defaultValue: 'OK' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date Picker Modal (iOS only) */}
      {Platform.OS === "ios" && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={datePickerVisible}
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setDatePickerVisible(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {datePickerMode === "range-start"
                    ? t("admin.orderManagement.startDate", {
                        defaultValue: "Start Date",
                      })
                    : t("admin.orderManagement.endDate", {
                        defaultValue: "End Date",
                      })}
                </Text>
                <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <DateTimePicker
                  value={datePickerValue}
                  mode="date"
                  display="spinner"
                  maximumDate={
                    datePickerMode === "range-end" && startDate ? undefined : new Date()
                  }
                  onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                    if ((event as any)?.type === "dismissed") {
                      setDatePickerVisible(false);
                      return;
                    }
                    if (selectedDate) {
                      setDatePickerValue(selectedDate);
                    }
                  }}
                />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: "#f3f4f6", borderColor: "#e5e7eb", borderWidth: 1 }]}
                  onPress={() => setDatePickerVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: "#111827" }]}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: "#ec4899" }]}
                  onPress={() => handleDateConfirm(datePickerValue, datePickerMode)}
                >
                  <Text style={[styles.modalButtonText, { color: "#fff" }]}>
                    {t("common.confirm")}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
        topOffset={16}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
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
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateInputTwoCol: {
    flex: 1,
    width: "auto",
    minWidth: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  filterDropdownsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterGridItemTwoCol: {
    flexBasis: "48%",
  },
  dateFilterRow: {
    flexDirection: "column",
    gap: 12,
  },
  dateFilterRowTwoCol: {
    flexDirection: "row",
    flexWrap: "nowrap",
  },
  dateInput: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateInputActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  dateInputText: {
    flex: 1,
    fontSize: 14,
    color: "#6b7280",
  },
  dateInputTextActive: {
    color: "#111827",
  },
  dateInputClear: {
    padding: 4,
  },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#f9fafb",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#ffffff",
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
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  queueTabActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  queueTabText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  queueTabTextActive: {
    color: "#111827",
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
    backgroundColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  queueTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  queueTabBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  queueTabBadgeTextActive: {
    color: "#ffffff",
  },
  badgeSpinner: {
    width: 16,
    height: 16,
  },
  upcomingToggle: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  upcomingToggleActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  upcomingToggleText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  upcomingToggleTextActive: {
    color: "#ffffff",
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
  orderGrid: {
    flexDirection: "column",
  },
  orderGridTwoCol: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  orderGridThreeCol: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  orderGridDynamic: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
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
    color: "#111827",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  orderCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  orderCardTwoCol: {
    flexBasis: "48%",
    marginBottom: 0,
  },
  orderCardThreeCol: {
    flexBasis: "31%",
    marginBottom: 0,
  },
  orderCardScheduled: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "rgba(168, 85, 247, 0.10)",
  },
  orderCardScheduledOverdue: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
  posBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(236, 72, 153, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.35)",
  },
  posBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ec4899",
  },
  offlineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#f59e0b",
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
    borderColor: "#e5e7eb",
    backgroundColor: "#f3f4f6",
  },
  closedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7280",
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
    color: "#111827",
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
    color: "#6b7280",
  },
  orderMetaTextCompact: {
    fontSize: 11,
    color: "#6b7280",
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
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
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#f9fafb",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  sheetItemDisabled: {
    opacity: 0.6,
  },
  sheetItemTextDisabled: {
    color: "#9ca3af",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#111827",
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
    borderTopColor: "#e5e7eb",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  paginationText: {
    fontSize: 13,
    color: "#6b7280",
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
    backgroundColor: "#d1d5db",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#111827",
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
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
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
    color: "#111827",
    marginBottom: 12,
  },
  orderItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  orderItemInfo: {
    flex: 1,
    gap: 4,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  orderItemDetails: {
    fontSize: 12,
    color: "#6b7280",
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
    color: "#111827",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
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
  },
  summaryValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
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
  deliveryNotes: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
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
    color: "#111827",
  },
  modalButtonDelete: {
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 24,
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
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  optionButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  optionButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
  },
  optionButtonTextActive: {
    color: "#111827",
  },
  textArea: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    backgroundColor: "#f9fafb",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  bottomSheetOptionSubtext: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  clearDateButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    alignItems: "center",
  },
  clearDateButtonText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  bottomSheetDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 8,
    marginHorizontal: 16,
  },
  viewOrderBottomSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
    flexDirection: "column",
    width: "100%",
    alignSelf: "flex-end",
    overflow: "hidden",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  orderSummaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    color: "#111827",
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
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    backgroundColor: "#e5e7eb",
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
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  sizeBadgeText: {
    fontSize: 11,
    color: "#111827",
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
    borderTopColor: "#e5e7eb",
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
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  addOnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  addOnName: {
    fontSize: 13,
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
    fontSize: 13,
    color: "#111827",
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
    backgroundColor: "#e5e7eb",
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
    color: "#111827",
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
    backgroundColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d1d5db",
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
    color: "#111827",
  },
  closeButton: {
    backgroundColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
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
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#d1d5db",
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
    color: "#111827",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#d1d5db",
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
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
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
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
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
    color: "#111827",
  },
  // Offline dialog styles
  offlineDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  offlineDialogContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    maxWidth: 400,
  },
  offlineDialogHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  offlineDialogContent: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  offlineDialogTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  offlineDialogMessage: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  offlineDialogButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    width: '100%',
  },
  offlineDialogButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
