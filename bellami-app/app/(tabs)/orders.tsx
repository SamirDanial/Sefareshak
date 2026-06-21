import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
  PanResponder,
  RefreshControl,
} from "react-native";
import { AuthNavbar } from "@/components/AuthNavbar";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter, useFocusEffect } from "expo-router";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import ApiService from "@/src/services/apiService";
import { useWebSocket } from "@/src/contexts/WebSocketContext";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { notificationService } from "@/src/services/notificationService";
import { useUnseenStatusChanges } from "@/src/contexts/UnseenStatusChangesContext";
import { useTranslation } from "react-i18next";
import { formatPrice, fetchCurrency, fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import branchService, { type Branch } from "@/src/services/branchService";
import { ScheduledOrderPicker } from "@/components/ScheduledOrderPicker";
import { useCartStore } from "@/src/store/cartStore";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/80x80?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

interface OrderItem {
  id: string;
  quantity: number;
  selectedSize: string;
  unitPrice: number | string;
  totalPrice: number | string;
  specialInstructions?: string;
  taxAmount?: number | string;
  taxPercentage?: number | string;
  meal: {
    id: string;
    name: string;
    image?: string;
  };
  orderItemAddOns: {
    id: string;
    addOnName: string;
    addOnPrice: number | string;
    quantity?: number;
    taxAmount?: number | string;
    taxPercentage?: number | string;
  }[];
  orderItemOptionalIngredients?: {
    id: string;
    ingredientName: string;
    isIncluded: boolean;
    optionalIngredient?: {
      id: string;
      name: string;
      description?: string;
    };
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  orderType: "DELIVERY" | "PICKUP";
  status: string;
  isMerged?: boolean;
  mergedAt?: string | null;
  preparationTime?: number | null;
  confirmedAt?: string | null;
  totalAmount: number | string;
  deliveryFee: number | string;
  taxAmount: number | string;
  deliveryTaxAmount?: number | string;
  itemTaxAmount?: number | string;
  addonTaxAmount?: number | string;
  paymentStatus: string;
  paymentMethod?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  pickupPhone?: string;
  pickupNotes?: string;
  createdAt: string;
  scheduledDate?: string | null;
  isScheduledOrder?: boolean;
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  orderItems: OrderItem[];
}

const getRemainingPrepMs = (order: Order | null, nowMs: number): number | null => {
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

export default function OrdersScreen() {
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const { subscribe, isConnected } = useWebSocket();
  const { refreshCount } = useUnseenStatusChanges();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : 0;
  const navbarHeight = 70; // Navbar height
  const headerHeight = statusBarHeight + navbarHeight;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unseenStatusChangeOrderIds, setUnseenStatusChangeOrderIds] = useState<
    Set<string>
  >(new Set());
  const [currency, setCurrency] = useState<string>("USD");
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [mainBranch, setMainBranch] = useState<Branch | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [orderToReschedule, setOrderToReschedule] = useState<Order | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleScheduledDate, setRescheduleScheduledDate] = useState<Date | null>(null);
  const [orderToModify, setOrderToModify] = useState<Order | null>(null);
  const [isModifying, setIsModifying] = useState(false);
  const { clearCart } = useCartStore();
  const panY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const deferredActionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pulsing animation for bell icon
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const isPaidLike = (o: Order | null | undefined) => {
    const s = String(o?.paymentStatus || "").toUpperCase();
    return s === "PAID" || s === "REFUNDED" || s === "PARTIALLY_REFUNDED";
  };

  // Load unseen status changes from AsyncStorage on mount and when screen is focused
  // Also reset scroll state and scroll to top when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      // Reset scroll state to show navbar
      setScrollPosition(0);
      setScrollDirection('up');
      
      // Scroll to top
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }

      const loadUnseenStatusChanges = async () => {
        try {
          const stored = await AsyncStorage.getItem("unseenStatusChanges");
          if (stored) {
            const ids = JSON.parse(stored) as string[];
            setUnseenStatusChangeOrderIds(new Set(ids));
          } else {
            setUnseenStatusChangeOrderIds(new Set());
          }
        } catch (error) {
          console.error("Error loading unseen status changes:", error);
        }
      };

      if (isSignedIn) {
        loadUnseenStatusChanges();
      }
    }, [isSignedIn, setScrollPosition, setScrollDirection])
  );

  // Debug: Log current orders and unseen IDs whenever they change
  useEffect(() => {
    if (orders.length > 0 && unseenStatusChangeOrderIds.size > 0) {
      const matchingOrders = orders.filter((order) =>
        unseenStatusChangeOrderIds.has(order.id)
      );
    }
  }, [orders, unseenStatusChangeOrderIds]);

  useEffect(() => {
    fetchPublicSettings().then((settings) => {
      setCurrency(settings.currency);
      setAppStatus(settings.appStatus);
      setSettingsLoading(false);
    });
  }, []);

  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        if (!isSignedIn) return;
        const token = await getToken();
        if (!token) return;

        const apiService = ApiService.getInstance();
        const settingsResponse = await apiService.getSettings(token);
        if (settingsResponse?.success) {
          setSettings(settingsResponse.data);
        }
      } catch (err) {
        console.warn("Failed to load user settings", err);
      }
    };

    loadUserSettings();
  }, [getToken, isSignedIn]);

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const allBranches = await branchService.getBranches();
        setBranches(allBranches);
        
        // Set first branch as main branch fallback
        if (allBranches.length > 0) {
          setMainBranch(allBranches[0]);
        }
      } catch (error) {
        console.error("Error fetching branches:", error);
      }
    };
    
    fetchBranches();
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      loadOrders();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, currentPage]);

  // Listen for order status changes via WebSocket
  useEffect(() => {
    if (!isSignedIn || !isConnected) return;

    const unsubscribe = subscribe("order-status-changed", (data: any) => {
      // Add to unseen status changes FIRST (for badge on order card)
      // This ensures the badge appears even if the order isn't in the current list yet
      setUnseenStatusChangeOrderIds((prev) => {
        // Check if already in the set to avoid unnecessary updates
        if (prev.has(data.orderId)) {
          return prev;
        }

        const newSet = new Set([...prev, data.orderId]);
        // Store in AsyncStorage
        AsyncStorage.setItem(
          "unseenStatusChanges",
          JSON.stringify(Array.from(newSet))
        )
          .then(() => {
            // Refresh the global count for tab badge
            refreshCount();
          })
          .catch((error) => {
            console.error("Error storing unseen status changes:", error);
          });
        return newSet;
      });

      // Update the order in the list if it exists
      setOrders((prevOrders) => {
        const orderExists = prevOrders.some(
          (order) => order.id === data.orderId
        );

        return prevOrders.map((order) => {
          if (order.id === data.orderId) {
            return {
              ...order,
              status: data.status,
              paymentStatus: data.paymentStatus,
            };
          }
          return order;
        });
      });

      // Update selected order if it's the one being viewed
      setSelectedOrder((prev) => {
        if (prev && prev.id === data.orderId) {
          return {
            ...prev,
            status: data.status,
            paymentStatus: data.paymentStatus,
          };
        }
        return prev;
      });
    });

    return unsubscribe;
  }, [isSignedIn, isConnected, subscribe, refreshCount]); // Added refreshCount to deps

  const loadOrders = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const result = await apiService.getUserOrders(token, currentPage, 10);

      if (result.success && result.data) {
        const loadedOrders = result.data.orders || [];
        setOrders(loadedOrders);

        // Don't reload unseen status changes here - they're loaded once on mount
        // and updated via WebSocket events

        if (result.data.pagination) {
          setTotalPages(result.data.pagination.pages || 1);
          setTotalCount(result.data.pagination.total || 0);
        }
      } else {
        console.error("Failed to load orders:", result.error);
      }
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setCurrentPage(1); // Reset to first page

    try {
      const token = await getToken();
      if (!token) {
        setRefreshing(false);
        return;
      }

      const apiService = ApiService.getInstance();
      const [result, settingsResult] = await Promise.all([
        apiService.getUserOrders(token, 1, 10),
        fetchPublicSettings(),
      ]);

      if (settingsResult) {
        setCurrency(settingsResult.currency);
        setAppStatus(settingsResult.appStatus);
      }

      if (result.success && result.data) {
        const loadedOrders = result.data.orders || [];
        setOrders(loadedOrders);

        if (result.data.pagination) {
          setTotalPages(result.data.pagination.pages || 1);
          setTotalCount(result.data.pagination.total || 0);
        }
      } else {
        console.error("Failed to load orders:", result.error);
      }
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
      // Scroll to top when page changes
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
      // Scroll to top when page changes
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const scrollViewRef = useRef<ScrollView>(null);

  const getDeliveryProgress = (status: string): number => {
    const normalizedStatus = status.toUpperCase().trim();

    switch (normalizedStatus) {
      case "PENDING":
        return 0;
      case "CONFIRMED":
        return 20;
      case "PREPARING":
        return 40;
      case "READY_FOR_DELIVERY":
      case "READY_FOR_PICKUP":
        return 60;
      case "OUT_FOR_DELIVERY":
        return 80;
      case "PICKED_UP":
        return 100;
      case "DELIVERED":
        return 100;
      case "CANCELLED":
        return 0;
      default:
        return 0;
    }
  };

  const getStatusColor = (status: string): string => {
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
    return colors[status] || "#6b7280";
  };

  const getStatusText = (status: string): string => {
    const normalizedStatus = status.toUpperCase().trim();
    const statusKey = normalizedStatus.toLowerCase().replace(/_/g, "");
    return t(`orders.statuses.${statusKey}`, {
      defaultValue: status.replace("_", " "),
    });
  };

  const getPaymentStatusText = (paymentStatus: string): string => {
    const normalizedStatus = paymentStatus.toUpperCase().trim();
    const statusKey = normalizedStatus.toLowerCase();
    return t(`orders.paymentStatuses.${statusKey}`, {
      defaultValue: paymentStatus,
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

  const getBranchForOrder = (order: Order): Branch | null => {
    const orderBranchId = (order as any)?.branchId || order.branch?.id || null;
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

  const canCancelScheduledOrder = (order: Order): boolean => {
    if (!order.isScheduledOrder || !order.scheduledDate) return false;
    const effective = getEffectiveScheduledOrderManagement(order);
    if (!effective.allowCancellation) return false;
    if (order.status === "CANCELLED" || order.status === "DELIVERED") return false;

    const windowHours = Number(effective.cancellationWindowHours || 0);
    if (windowHours <= 0) return true;

    const scheduled = new Date(order.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > windowHours;
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

  const getRefundTimingMessage = (order: Order): string => {
    if (
      order.paymentMethod === "CASH_ON_DELIVERY" ||
      order.paymentMethod === "CARD_ON_DELIVERY"
    ) {
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

    return t("orders.cancelScheduled.stripeRefundTiming", {
      defaultValue:
        "Stripe refunds typically take 5–7 business days (card) or 1–2 business days (bank).",
    });
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
      if (!token) return;

      const isAsap = rescheduleScheduledDate === null;
      if (!isAsap && !rescheduleScheduledDate) {
        return;
      }

      const apiService = ApiService.getInstance();
      await apiService.rescheduleOrder(token, orderToReschedule.id, {
        scheduledDate: isAsap ? null : (rescheduleScheduledDate as Date).toISOString(),
        reason: "user_shallow_reschedule",
      });

      setOrderToReschedule(null);
      setShowDetails(false);
      await loadOrders();
    } catch (e) {
      console.error("Failed to reschedule order", e);
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;
    try {
      setIsCancelling(true);
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      await apiService.cancelOrder(token, orderToCancel.id, {
        cancelType: "USER_CANCEL",
        reason: "user_cancel_scheduled_order",
      });

      setOrderToCancel(null);
      setShowDetails(false);
      await loadOrders();
    } catch (e) {
      console.error("Failed to cancel order", e);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirmModify = async () => {
    if (!orderToModify) return;
    try {
      setIsModifying(true);
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      await apiService.cancelOrder(token, orderToModify.id, {
        cancelType: "MODIFICATION",
        reason: "user_modify_flow",
      });

      clearCart();
      await AsyncStorage.setItem("modifyingOrderId", orderToModify.id);
      const lockedBranchId =
        (orderToModify as any)?.branchId || orderToModify.branch?.id || null;
      if (lockedBranchId) {
        await AsyncStorage.setItem(
          "modifyingOrderBranchId",
          String(lockedBranchId)
        );
      }

      setOrderToModify(null);
      router.replace("/(tabs)");
    } catch (e) {
      console.error("Failed to start modify flow", e);
    } finally {
      setIsModifying(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const panYOffset = useRef(0);
  const isClosingRef = useRef(false);

  // Keep isClosing ref in sync
  useEffect(() => {
    isClosingRef.current = isClosing;
  }, [isClosing]);

  useEffect(() => {
    return () => {
      if (deferredActionTimeoutRef.current) {
        clearTimeout(deferredActionTimeoutRef.current);
        deferredActionTimeoutRef.current = null;
      }
    };
  }, []);

  const runAfterClosingDetails = (action: () => void) => {
    if (Platform.OS !== "ios") {
      action();
      return;
    }

    if (!showDetails) {
      action();
      return;
    }

    handleCloseModal();
    if (deferredActionTimeoutRef.current) {
      clearTimeout(deferredActionTimeoutRef.current);
      deferredActionTimeoutRef.current = null;
    }
    deferredActionTimeoutRef.current = setTimeout(() => {
      deferredActionTimeoutRef.current = null;
      action();
    }, 320);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gestureState) => {
        // Only capture pan in the top area (first 100px for header and swipe indicator)
        return gestureState.y0 < 100 && !isClosingRef.current;
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only if starting in top area and swiping down
        return (
          gestureState.y0 < 100 && gestureState.dy > 0 && !isClosingRef.current
        );
      },
      onPanResponderGrant: () => {
        if (isClosingRef.current) return;
        panYOffset.current = panYOffset.current;
        panY.setOffset(panYOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0 && !isClosingRef.current) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isClosingRef.current) return;

        panY.flattenOffset();
        if (gestureState.dy > 150 || gestureState.vy > 0.5) {
          // Close modal if swiped down enough
          setIsClosing(true);
          Animated.timing(panY, {
            toValue: 1000,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setShowDetails(false);
            setSelectedOrder(null);
            panY.setValue(0);
            panYOffset.current = 0;
            setIsClosing(false);
          });
        } else {
          // Snap back to original position
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const handleViewDetails = (order: Order) => {
    if (isClosing) return;
    setSelectedOrder(order);
    setShowDetails(true);
    panY.setValue(0);
    panYOffset.current = 0;

    // Remove from unseen status changes when viewing
    setUnseenStatusChangeOrderIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(order.id);
      // Update AsyncStorage
      AsyncStorage.setItem(
        "unseenStatusChanges",
        JSON.stringify(Array.from(newSet))
      )
        .then(() => {
          // Refresh the global count for tab badge
          refreshCount();
        })
        .catch((error) => {
          console.error("Error updating unseen status changes:", error);
        });
      return newSet;
    });
  };

  const handleBellIconPress = (orderId: string) => {
    // Remove from unseen status changes when clicking bell icon
    setUnseenStatusChangeOrderIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(orderId);
      // Update AsyncStorage
      AsyncStorage.setItem(
        "unseenStatusChanges",
        JSON.stringify(Array.from(newSet))
      )
        .then(() => {
          // Refresh the global count for tab badge
          refreshCount();
        })
        .catch((error) => {
          console.error("Error updating unseen status changes:", error);
        });
      return newSet;
    });
  };

  const handleCloseModal = () => {
    if (isClosing) return;
    setIsClosing(true);
    Animated.timing(panY, {
      toValue: 1000,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowDetails(false);
      setSelectedOrder(null);
      panY.setValue(0);
      panYOffset.current = 0;
      setIsClosing(false);
    });
  };

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{t("common.pleaseLogin")}</Text>
          <Text style={styles.emptySubtitle}>{t("orders.signInToView")}</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/(auth)/sign-in")}
          >
            <Text style={styles.loginButtonText}>{t("common.login")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (settingsLoading) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  const isAppUnavailable = appStatus !== "LIVE";

  if (isAppUnavailable) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={appStatus as any} />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("orders.loading")}</Text>
        </View>
      </View>
    );
  }

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    // Determine scroll direction
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  return (
    <View style={styles.container}>
      <AuthNavbar />
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { paddingTop: headerHeight }]}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>{t("orders.noOrders")}</Text>
            <Text style={styles.emptySubtitle}>
              {t("orders.noOrdersDescription")}
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push("/(tabs)/menu")}
            >
              <Text style={styles.browseButtonText}>
                {t("orders.browseMenu")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderCard, order.status === "CANCELLED" && styles.orderCardCancelled]}
                onPress={() => handleViewDetails(order)}
                activeOpacity={0.7}
              >
                {/* Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderLeft}>
                    <View style={styles.orderNumberRow}>
                      <Text style={styles.orderNumber}>
                        #{order.orderNumber.substring(0, 10)}
                        {order.orderNumber.length > 10 ? "..." : ""}
                      </Text>
                    </View>
                    <Text style={styles.orderDate}>
                      {formatDate(order.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.orderHeaderRight}>
                    <Text style={styles.orderTotal}>
                      {formatPrice(Number(order.totalAmount), currency)}
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
                    {order.isScheduledOrder && (
                      (() => {
                        const isOverdue = isOverdueScheduledOrder(order);
                        return (
                      <View
                        style={[
                          styles.scheduledBadge,
                          isOverdue ? styles.scheduledBadgeOverdue : styles.scheduledBadgeScheduled,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            isOverdue ? "alert-circle-outline" : "calendar-clock"
                          }
                          size={12}
                          color={
                            isOverdue ? "#ef4444" : "#a855f7"
                          }
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
                        );
                      })()
                    )}
                  </View>
                </View>

                {(() => {
                  const remaining = getRemainingPrepMs(selectedOrder, nowMs);
                  if (remaining === null) return null;
                  return (
                    <View style={styles.statusSection}>
                      <Text style={styles.sectionLabel}>
                        {t("admin.orderManagement.preparationTimeRemaining", {
                          defaultValue: "Preparation time remaining",
                        })}
                      </Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>{formatRemaining(remaining)}</Text>
                      </View>
                    </View>
                  );
                })()}
                {order.isScheduledOrder && order.scheduledDate && (
                  (() => {
                    const isOverdue = isOverdueScheduledOrder(order);
                    return (
                  <View
                    style={[
                      styles.scheduledBox,
                      isOverdue ? styles.scheduledBoxOverdue : styles.scheduledBoxScheduled,
                    ]}
                  >
                    <View style={styles.scheduledBoxRow}>
                      <MaterialCommunityIcons
                        name={
                          isOverdue ? "alert-circle-outline" : "calendar-clock"
                        }
                        size={16}
                        color={
                          isOverdue ? "#ef4444" : "#a855f7"
                        }
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
                            ? t("admin.orderManagement.scheduled.overdueLabel", {
                                defaultValue: "OVERDUE - Was Scheduled For",
                              })
                            : order.orderType === "PICKUP"
                              ? t("admin.orderManagement.scheduled.pickupFor", {
                                  defaultValue: "Pickup Scheduled For",
                                })
                              : t("admin.orderManagement.scheduled.deliveryFor", {
                                  defaultValue: "Delivery Scheduled For",
                                })}
                        </Text>
                        <Text
                          style={[
                            styles.scheduledBoxValue,
                            isOverdue
                              ? styles.scheduledBoxValueOverdue
                              : styles.scheduledBoxValueScheduled,
                          ]}
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
                        </Text>
                      </View>
                    </View>
                  </View>
                    );
                  })()
                )}

                {/* Items Preview */}
                <View style={styles.itemsPreview}>
                  <View style={styles.itemsAvatars}>
                    {order.orderItems
                      .filter((it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId)
                      .slice(0, 3)
                      .map((item, index) => (
                      <View key={item.id}>
                        {(item?.meal?.image || (item as any)?.deal?.image || (item as any)?.image) ? (
                          <Image
                            source={{
                              uri: getImageUrl(
                                item?.meal?.image ||
                                  (item as any)?.deal?.image ||
                                  (item as any)?.image
                              ),
                            }}
                            style={styles.itemAvatar}
                          />
                        ) : (
                          <View
                            style={[
                              styles.itemAvatar,
                              styles.placeholderAvatar,
                            ]}
                          >
                            <Text style={styles.placeholderIcon}>📦</Text>
                          </View>
                        )}
                        {item.quantity > 1 && (
                          <View style={styles.quantityBadge}>
                            <Text style={styles.quantityText}>
                              {item.quantity}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {order.orderItems.filter((it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId).length > 3 && (
                      <View
                        style={[styles.itemAvatar, styles.placeholderAvatar]}
                      >
                        <Text style={styles.quantityText}>
                          +{order.orderItems.filter((it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId).length - 3}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.detailsButtonRow}>
                    {/* Unseen status change badge */}
                    {(() => {
                      const hasUnseen = unseenStatusChangeOrderIds.has(
                        order.id
                      );
                      return hasUnseen;
                    })() && (
                      <Animated.View
                        style={[
                          styles.bellIconContainer,
                          {
                            opacity: pulseAnim,
                          },
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => handleBellIconPress(order.id)}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons
                            name="notifications-active"
                            size={16}
                            color="#f97316"
                          />
                        </TouchableOpacity>
                      </Animated.View>
                    )}
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      {t("orders.deliveryProgress")}
                    </Text>
                    <Text
                      style={[
                        styles.progressPercentage,
                        { color: getStatusColor(order.status) },
                      ]}
                    >
                      {getDeliveryProgress(order.status)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${getDeliveryProgress(order.status)}%`,
                          backgroundColor: getStatusColor(order.status),
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={styles.paginationContainer}>
            <View style={styles.paginationInfo}>
              <Text style={styles.paginationInfoText}>
                {t("orders.page", { current: currentPage, total: totalPages })}
              </Text>
              {totalCount > 0 && (
                <Text style={styles.paginationCountText}>
                  ({totalCount}{" "}
                  {totalCount === 1 ? t("orders.order") : t("orders.orders")})
                </Text>
              )}
            </View>
            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === 1 && styles.paginationButtonDisabled,
                ]}
                onPress={handlePreviousPage}
                disabled={currentPage === 1}
              >
                <Text
                  style={[
                    styles.paginationButtonText,
                    currentPage === 1 && styles.paginationButtonTextDisabled,
                  ]}
                >
                  {t("common.previous")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === totalPages && styles.paginationButtonDisabled,
                ]}
                onPress={handleNextPage}
                disabled={currentPage === totalPages}
              >
                <Text
                  style={[
                    styles.paginationButtonText,
                    currentPage === totalPages &&
                      styles.paginationButtonTextDisabled,
                  ]}
                >
                  {t("common.next")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Order Details Modal */}
      <Modal
        visible={showDetails}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        {selectedOrder && !isClosing && (
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalBackdrop} onPress={handleCloseModal}>
              <View style={{ flex: 1 }} />
            </Pressable>
            <Animated.View
              style={[
                styles.modalContent,
                {
                  transform: [{ translateY: panY }],
                },
              ]}
            >
              {/* Close Button */}
              <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseModal}>
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Swipe Indicator */}
              <View
                style={styles.swipeIndicator}
                {...panResponder.panHandlers}
              />

              {/* Modal Header */}
              <View style={styles.modalHeader} {...panResponder.panHandlers}>
                <Text style={styles.modalTitle}>
                  {t("orders.orderNumber")}
                  {selectedOrder.orderNumber}
                </Text>
                {selectedOrder.isMerged ? (
                  <View style={styles.mergedBadge}>
                    <Text style={styles.mergedBadgeText}>
                      {t("admin.orderManagement.merged", { defaultValue: "Merged" })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <ScrollView scrollEnabled={true}>
                {/* Status */}
                <View style={styles.statusSection}>
                  <Text style={styles.sectionLabel}>{t("orders.status")}</Text>
                  <View style={styles.statusBadge}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: getStatusColor(selectedOrder.status),
                        },
                      ]}
                    />
                    <Text style={styles.statusText}>
                      {getStatusText(selectedOrder.status)}
                    </Text>
                  </View>
                </View>

                {(() => {
                  const remaining = getRemainingPrepMs(selectedOrder, nowMs);
                  if (remaining === null) return null;
                  return (
                    <View style={styles.statusSection}>
                      <Text style={styles.sectionLabel}>
                        {t("admin.orderManagement.preparationTimeRemaining", {
                          defaultValue: "Preparation time remaining",
                        })}
                      </Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>{formatRemaining(remaining)}</Text>
                      </View>
                    </View>
                  );
                })()}

                {selectedOrder && canModifyScheduledOrder(selectedOrder) && (
                  <View style={styles.managementActionRow}>
                    <TouchableOpacity
                      style={styles.managementActionButton}
                      onPress={() => {
                        const order = selectedOrder;
                        runAfterClosingDetails(() => setOrderToModify(order));
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.managementActionButtonText}>
                        {t("orders.modify", { defaultValue: "Modify Order" })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedOrder && canRescheduleScheduledOrder(selectedOrder) && (
                  <View style={styles.managementActionRow}>
                    <TouchableOpacity
                      style={styles.managementActionButton}
                      onPress={() => {
                        const order = selectedOrder;
                        runAfterClosingDetails(() => handleStartReschedule(order));
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.managementActionButtonText}>
                        {t("orders.reschedule.button", {
                          defaultValue: "Reschedule",
                        })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedOrder && canCancelScheduledOrder(selectedOrder) && (
                  <View style={styles.managementActionRow}>
                    <TouchableOpacity
                      style={styles.managementDangerButton}
                      onPress={() => {
                        const order = selectedOrder;
                        runAfterClosingDetails(() => setOrderToCancel(order));
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.managementDangerButtonText}>
                        {t("orders.cancelScheduled.button", {
                          defaultValue: "Cancel order",
                        })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedOrder.isScheduledOrder && selectedOrder.scheduledDate && (
                  (() => {
                    const isOverdue = isOverdueScheduledOrder(selectedOrder);
                    return (
                  <View
                    style={[
                      styles.modalScheduledBox,
                      isOverdue ? styles.modalScheduledBoxOverdue : styles.modalScheduledBoxScheduled,
                    ]}
                  >
                    <View style={styles.modalScheduledRow}>
                      <View
                        style={[
                          styles.modalScheduledIconWrap,
                          isOverdue
                            ? styles.modalScheduledIconWrapOverdue
                            : styles.modalScheduledIconWrapScheduled,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            isOverdue ? "alert-circle-outline" : "calendar-clock"
                          }
                          size={18}
                          color={
                            isOverdue ? "#f87171" : "#c084fc"
                          }
                        />
                      </View>
                      <View style={styles.modalScheduledTextCol}>
                        <Text
                          style={[
                            styles.modalScheduledLabel,
                            isOverdue
                              ? styles.modalScheduledLabelOverdue
                              : styles.modalScheduledLabelScheduled,
                          ]}
                        >
                          {isOverdue
                            ? t("admin.orderManagement.scheduled.overdueLabel", {
                                defaultValue: "OVERDUE - Was Scheduled For",
                              })
                            : selectedOrder.orderType === "PICKUP"
                              ? t("admin.orderManagement.scheduled.pickupFor", {
                                  defaultValue: "Pickup Scheduled For",
                                })
                              : t("admin.orderManagement.scheduled.deliveryFor", {
                                  defaultValue: "Delivery Scheduled For",
                                })}
                        </Text>
                        <Text
                          style={[
                            styles.modalScheduledValue,
                            isOverdue
                              ? styles.modalScheduledValueOverdue
                              : styles.modalScheduledValueScheduled,
                          ]}
                        >
                          {new Date(selectedOrder.scheduledDate).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}{" "}
                          {t("admin.orderManagement.scheduled.at", {
                            defaultValue: "at",
                          })}{" "}
                          {new Date(selectedOrder.scheduledDate).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                  </View>
                    );
                  })()
                )}

                {/* Branch Name */}
                <View style={styles.branchSection}>
                  <View style={styles.branchCard}>
                    <MaterialIcons name="place" size={16} color="#ec4899" style={styles.branchIcon} />
                    <View style={styles.branchInfo}>
                      <Text style={styles.branchLabel}>
                        {t("orders.servingBranch")}
                      </Text>
                      <Text style={styles.branchName}>
                        {getBranchName(selectedOrder)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Delivery/Pickup Details */}
                <Text style={styles.sectionTitle}>
                  {selectedOrder.orderType === "PICKUP"
                    ? t("orders.pickupDetails", {
                        defaultValue: "Pickup details",
                      })
                    : t("orders.deliveryDetails", {
                        defaultValue: "Delivery details",
                      })}
                </Text>

                {isPaidLike(selectedOrder) ? (
                  <View style={styles.billPreviewSection}>
                    <TouchableOpacity
                      style={styles.billPreviewButton}
                      onPress={() => {
                        const id = selectedOrder.id;
                        handleCloseModal();
                        router.push(`/bill-preview?id=${encodeURIComponent(id)}` as any);
                      }}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="receipt" size={18} color="#fff" />
                      <Text style={styles.billPreviewButtonText}>
                        {t("orders.billPreview", { defaultValue: "View Bill" })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.infoCard}>
                  {selectedOrder.orderType === "PICKUP" ? (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          {t("orders.phone", { defaultValue: "Phone" })}:
                        </Text>
                        <Text style={styles.infoValue}>
                          {selectedOrder.pickupPhone || "-"}
                        </Text>
                      </View>
                      {selectedOrder.pickupNotes ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>
                            {t("orders.notes", { defaultValue: "Notes" })}:
                          </Text>
                          <Text style={styles.infoValue}>
                            {selectedOrder.pickupNotes}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          {t("orders.postalCode", { defaultValue: "Postal Code" })}:
                        </Text>
                        <Text style={styles.infoValue}>
                          {(selectedOrder as any).deliveryPostalCode || "-"}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          {t("orders.streetAddress", { defaultValue: "Street address" })}:
                        </Text>
                        <Text style={styles.infoValue}>
                          {(selectedOrder as any).deliveryStreetAddress ||
                            selectedOrder.deliveryAddress ||
                            "-"}
                        </Text>
                      </View>

                      {(() => {
                        const hasBuildingDetails =
                          !!(selectedOrder as any).deliveryBuilding ||
                          !!(selectedOrder as any).deliveryFloor ||
                          !!(selectedOrder as any).deliveryApartment ||
                          !!(selectedOrder as any).deliveryExtraDetails;

                        const houseNumber = (selectedOrder as any)
                          .deliveryHouseNumber as string | undefined;

                        if (!hasBuildingDetails) {
                          return (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>
                                {t("orders.houseNumber", { defaultValue: "House number" })}:
                              </Text>
                              <Text style={styles.infoValue}>{houseNumber || "-"}</Text>
                            </View>
                          );
                        }

                        return (
                          <>
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>
                                {t("orders.houseNumber", { defaultValue: "House number" })}:
                              </Text>
                              <Text style={styles.infoValue}>{houseNumber || "-"}</Text>
                            </View>
                            {(selectedOrder as any).deliveryBuilding ? (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>
                                  {t("orders.building", { defaultValue: "Building" })}:
                                </Text>
                                <Text style={styles.infoValue}>
                                  {(selectedOrder as any).deliveryBuilding}
                                </Text>
                              </View>
                            ) : null}
                            {(selectedOrder as any).deliveryFloor ? (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>
                                  {t("orders.floor", { defaultValue: "Floor" })}:
                                </Text>
                                <Text style={styles.infoValue}>
                                  {(selectedOrder as any).deliveryFloor}
                                </Text>
                              </View>
                            ) : null}
                            {(selectedOrder as any).deliveryApartment ? (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>
                                  {t("orders.apartment", {
                                    defaultValue: "Apartment/Unit",
                                  })}:
                                </Text>
                                <Text style={styles.infoValue}>
                                  {(selectedOrder as any).deliveryApartment}
                                </Text>
                              </View>
                            ) : null}
                            {(selectedOrder as any).deliveryExtraDetails ? (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>
                                  {t("orders.extraDetails", {
                                    defaultValue: "Extra Details",
                                  })}:
                                </Text>
                                <Text style={styles.infoValue}>
                                  {(selectedOrder as any).deliveryExtraDetails}
                                </Text>
                              </View>
                            ) : null}
                          </>
                        );
                      })()}
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>
                          {t("orders.phone", { defaultValue: "Phone" })}:
                        </Text>
                        <Text style={styles.infoValue}>
                          {selectedOrder.deliveryPhone || "-"}
                        </Text>
                      </View>
                      {selectedOrder.deliveryNotes ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>
                            {t("orders.notes", { defaultValue: "Notes" })}:
                          </Text>
                          <Text style={styles.infoValue}>
                            {selectedOrder.deliveryNotes}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Order Items */}
                <Text style={styles.sectionTitle}>
                  {t("orders.orderItems")}
                </Text>
                {selectedOrder.orderItems
                  .filter((it: any) => it?.itemType !== "DEAL_COMPONENT" && !it?.parentDealItemId)
                  .map((item) => (
                  <View key={item.id} style={styles.modalOrderItem}>
                    {(item?.meal?.image || (item as any)?.deal?.image || (item as any)?.image) && (
                      <Image
                        source={{
                          uri: getImageUrl(
                            item?.meal?.image ||
                              (item as any)?.deal?.image ||
                              (item as any)?.image
                          ),
                        }}
                        style={styles.modalItemImage}
                      />
                    )}
                    <View style={styles.modalItemDetails}>
                      <View style={styles.modalItemHeader}>
                        <Text style={styles.modalItemName}>
                          {item?.meal?.name || (item as any)?.deal?.name || (item as any)?.name || "Item"}
                        </Text>
                        <Text style={styles.modalItemPrice}>
                          {formatPrice(Number(item.totalPrice || 0), currency)}
                        </Text>
                      </View>
                      <Text style={styles.modalItemSize}>
                        {t("checkout.step2.sizeQty", {
                          size: item.selectedSize,
                          quantity: item.quantity,
                        })}
                      </Text>
                      <Text style={styles.modalItemUnitPrice}>
                        @ {formatPrice(Number(item.unitPrice || 0), currency)}{" "}
                        {t("orders.perItem")}
                      </Text>

                      {(() => {
                        const isDealParent =
                          (item as any)?.itemType === "DEAL" ||
                          Boolean((item as any)?.dealId) ||
                          Boolean((item as any)?.deal);

                        if (!isDealParent) return null;

                        const childItems = (selectedOrder.orderItems as any[])
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
                            const price =
                              ci?.totalPrice !== undefined && ci?.totalPrice !== null
                                ? Number(ci.totalPrice)
                                : Number(ci?.unitPrice || 0) * qty;
                            return { name: String(name), qty, price };
                          });

                        if (!childItems.length) return null;

                        return (
                          <View style={styles.addOnsContainer}>
                            <Text style={styles.addOnsLabel}>
                              {t("orders.dealComponents", { defaultValue: "INCLUDES" })}:
                            </Text>
                            <View style={styles.addOnsList}>
                              {childItems.map((ci: any, idx: number) => (
                                <View key={`${ci.name}-${idx}`} style={styles.addOnItem}>
                                  <View style={styles.addOnTag}>
                                    <Text style={styles.addOnText}>
                                      {ci.name}
                                      {ci.qty > 1 ? ` ×${ci.qty}` : ""}
                                    </Text>
                                  </View>
                                  <Text style={styles.addOnPrice}>
                                    {formatPrice(Number(ci.price || 0), currency)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })()}

                      {item.orderItemAddOns.length > 0 && (
                        <View style={styles.addOnsContainer}>
                          <Text style={styles.addOnsLabel}>
                            {t("orders.addons")}:
                          </Text>
                          <View style={styles.addOnsList}>
                            {item.orderItemAddOns.map((addOn, index) => (
                              <View key={index} style={styles.addOnItem}>
                                <View style={styles.addOnTag}>
                                  <Text style={styles.addOnText}>
                                    {addOn.addOnName}
                                    {addOn.quantity && addOn.quantity > 1 && (
                                      <Text> ×{addOn.quantity}</Text>
                                    )}
                                  </Text>
                                </View>
                                <Text style={styles.addOnPrice}>
                                  {formatPrice(Number(addOn.addOnPrice || 0), currency)}
                                  {addOn.quantity && addOn.quantity > 1 && (
                                    <Text style={styles.addOnPriceNote}>
                                      {" "}
                                      ×{addOn.quantity}
                                    </Text>
                                  )}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      {item.orderItemOptionalIngredients &&
                        item.orderItemOptionalIngredients.length > 0 && (
                          <View style={styles.optionalIngredientsContainer}>
                            {(() => {
                              const included =
                                item.orderItemOptionalIngredients.filter(
                                  (ing) => ing.isIncluded
                                );
                              const excluded =
                                item.orderItemOptionalIngredients.filter(
                                  (ing) => !ing.isIncluded
                                );

                              return (
                                <>
                                  {included.length > 0 && (
                                    <View
                                      style={styles.optionalIngredientSection}
                                    >
                                      <Text
                                        style={
                                          styles.optionalIngredientSectionLabel
                                        }
                                      >
                                        {t(
                                          "mealCustomization.includedIngredients"
                                        )}
                                      </Text>
                                      <View
                                        style={styles.optionalIngredientTags}
                                      >
                                        {included.map((ing) => (
                                          <View
                                            key={ing.id}
                                            style={
                                              styles.optionalIngredientTagIncluded
                                            }
                                          >
                                            <Text
                                              style={
                                                styles.optionalIngredientTagText
                                              }
                                            >
                                              {ing.ingredientName}
                                            </Text>
                                          </View>
                                        ))}
                                      </View>
                                    </View>
                                  )}
                                </>
                              );
                            })()}
                          </View>
                        )}
                      {item.specialInstructions && (
                        <Text style={styles.modalItemNote}>
                          {t("checkout.step2.note")}: {item.specialInstructions}
                        </Text>
                      )}

                      {/* Tax Breakdown */}
                      {(item.taxAmount !== undefined &&
                        Number(item.taxAmount || 0) > 0) ||
                      (item.orderItemAddOns &&
                        item.orderItemAddOns.some(
                          (a) =>
                            a.taxAmount !== undefined &&
                            Number(a.taxAmount || 0) > 0
                        )) ? (
                        <View style={styles.taxBreakdownContainer}>
                          <Text style={styles.taxBreakdownTitle}>
                            {t("orders.taxBreakdown")}:
                          </Text>
                          <View style={styles.taxBreakdownContent}>
                            {item.taxAmount !== undefined &&
                              Number(item.taxAmount || 0) > 0 && (
                                <View style={styles.taxRow}>
                                  <Text style={styles.taxLabel}>
                                    {t("orders.meal")}
                                    {item.taxPercentage
                                      ? ` (${Number(item.taxPercentage)}%)`
                                      : ""}
                                    :
                                  </Text>
                                  <Text style={styles.taxValue}>
                                    {formatPrice(Number(item.taxAmount || 0), currency)}
                                  </Text>
                                </View>
                              )}
                            {item.orderItemAddOns &&
                              item.orderItemAddOns
                                .filter(
                                  (a) =>
                                    a.taxAmount !== undefined &&
                                    Number(a.taxAmount || 0) > 0
                                )
                                .map((addon, idx, array) => (
                                  <View
                                    key={addon.id}
                                    style={[
                                      styles.taxRow,
                                      idx === array.length - 1 &&
                                        styles.taxRowLast,
                                    ]}
                                  >
                                    <Text style={styles.taxLabel}>
                                      + {addon.addOnName}
                                      {addon.taxPercentage
                                        ? ` (${Number(addon.taxPercentage)}%)`
                                        : ""}
                                      :
                                    </Text>
                                    <Text style={styles.taxValue}>
                                      {formatPrice(Number(addon.taxAmount || 0), currency)}
                                    </Text>
                                  </View>
                                ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}

                {/* Order Summary */}
                <Text style={styles.sectionTitle}>
                  {t("orders.orderSummary")}
                </Text>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      {t("orders.subtotal")}:
                    </Text>
                    <Text style={styles.summaryValue}>
                      {formatPrice(
                        Number(selectedOrder.totalAmount) -
                        Number(selectedOrder.deliveryFee) -
                        Number(selectedOrder.taxAmount),
                        currency
                      )}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      {t("orders.deliveryFee")}:
                    </Text>
                    <Text style={styles.summaryValue}>
                      {formatPrice(Number(selectedOrder.deliveryFee), currency)}
                    </Text>
                  </View>
                  {selectedOrder.deliveryTaxAmount !== undefined &&
                    Number(selectedOrder.deliveryTaxAmount) > 0 && (
                      <View style={styles.summarySubRow}>
                        <Text style={styles.summarySubLabel}>
                          • {t("orders.deliveryTax")}
                        </Text>
                        <Text style={styles.summarySubValue}>
                          {formatPrice(Number(selectedOrder.deliveryTaxAmount), currency)}
                        </Text>
                      </View>
                    )}
                  {selectedOrder.orderType === "PICKUP" &&
                    Number((selectedOrder as any).takeawayServiceFee || 0) > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>
                          {t("checkout.step2.takeawayServiceFee", {
                            defaultValue: "Takeaway service fee",
                          })}
                          :
                        </Text>
                        <Text style={styles.summaryValue}>
                          {formatPrice(
                            Number((selectedOrder as any).takeawayServiceFee || 0),
                            currency
                          )}
                        </Text>
                      </View>
                    )}
                  {selectedOrder.orderType === "PICKUP" &&
                    Number((selectedOrder as any).takeawayServiceTaxAmount || 0) > 0 && (
                      <View style={styles.summarySubRow}>
                        <Text style={styles.summarySubLabel}>
                          •
                          {t("checkout.step2.takeawayServiceTax", {
                            defaultValue: "Takeaway service tax",
                          })}
                        </Text>
                        <Text style={styles.summarySubValue}>
                          {formatPrice(
                            Number((selectedOrder as any).takeawayServiceTaxAmount || 0),
                            currency
                          )}
                        </Text>
                      </View>
                    )}

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t("orders.tax")}:</Text>
                    <Text style={styles.summaryValue}>
                      {formatPrice(Number(selectedOrder.taxAmount), currency)}
                    </Text>
                  </View>
                  {(selectedOrder.itemTaxAmount !== undefined ||
                    selectedOrder.addonTaxAmount !== undefined) && (
                    <>
                      {selectedOrder.itemTaxAmount !== undefined && (
                        <View style={styles.summarySubRow}>
                          <Text style={styles.summarySubLabel}>
                            • {t("orders.itemTax")}
                          </Text>
                          <Text style={styles.summarySubValue}>
                            {formatPrice(Number(selectedOrder.itemTaxAmount || 0), currency)}
                          </Text>
                        </View>
                      )}
                      {selectedOrder.addonTaxAmount !== undefined && (
                        <View style={styles.summarySubRow}>
                          <Text style={styles.summarySubLabel}>
                            • {t("orders.addonTax")}
                          </Text>
                          <Text style={styles.summarySubValue}>
                            {formatPrice(Number(selectedOrder.addonTaxAmount || 0), currency)}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>{t("orders.total")}:</Text>
                    <Text style={styles.totalValue}>
                      {formatPrice(Number(selectedOrder.totalAmount), currency)}
                    </Text>
                  </View>
                </View>

                {/* Payment Info */}
                <Text style={styles.sectionTitle}>
                  {t("orders.paymentInformation")}
                </Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      {t("orders.paymentStatus")}:
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        selectedOrder.paymentStatus === "PAID"
                          ? styles.paidStatus
                          : styles.unpaidStatus,
                      ]}
                    >
                      {getPaymentStatusText(selectedOrder.paymentStatus)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      {t("orders.paymentMethod")}:
                    </Text>
                    <Text style={styles.infoValue}>
                      {selectedOrder.paymentMethod === "CASH_ON_DELIVERY"
                        ? t("orders.cashOnDelivery")
                        : t("orders.onlinePayment")}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        )}
      </Modal>

      <Modal
        visible={Boolean(orderToCancel)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isCancelling) setOrderToCancel(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {t("orders.cancelScheduled.title", {
                defaultValue: "Cancel scheduled order",
              })}
            </Text>
            <Text style={styles.confirmDescription}>
              {t("orders.cancelScheduled.description", {
                defaultValue:
                  "Are you sure you want to cancel this scheduled order?",
              })}
            </Text>
            {orderToCancel && (
              <View style={styles.refundTimingWrap}>
                <Text style={styles.refundTimingLabel}>
                  {t("orders.cancelScheduled.refundTimingLabel", {
                    defaultValue: "Refund timing",
                  })}
                </Text>
                <Text style={styles.confirmDescriptionSecondary}>
                  {getRefundTimingMessage(orderToCancel)}
                </Text>
              </View>
            )}

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmSecondaryButton}
                onPress={() => setOrderToCancel(null)}
                disabled={isCancelling}
              >
                <Text style={styles.confirmSecondaryText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDangerButton}
                onPress={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmDangerText}>
                    {t("orders.cancelScheduled.confirm", {
                      defaultValue: "Confirm cancel",
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(orderToReschedule)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isRescheduling) setOrderToReschedule(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {t("orders.reschedule.title", {
                defaultValue: "Reschedule order",
              })}
            </Text>
            <Text style={styles.confirmDescription}>
              {t("orders.reschedule.description", {
                defaultValue: "Select a new date and time for this order.",
              })}
            </Text>

            {orderToReschedule && (() => {
              const branch = getBranchForOrder(orderToReschedule);
              const masterFutureOrdersEnabled =
                (branch as any)?.futureOrdersEnabled ??
                settings?.futureOrdersEnabled ??
                false;
              const perTypeFutureEnabled =
                orderToReschedule.orderType === "PICKUP"
                  ? ((branch as any)?.enableFuturePickupOrders ??
                      settings?.enableFuturePickupOrders ??
                      false)
                  : ((branch as any)?.enableFutureDeliveryOrders ??
                      settings?.enableFutureDeliveryOrders ??
                      false);
              const isFutureOrderEnabled =
                masterFutureOrdersEnabled && perTypeFutureEnabled;
              const futureOrderMaxDays =
                orderToReschedule.orderType === "PICKUP"
                  ? (branch?.futurePickupOrderDays ??
                      settings?.futurePickupOrderDays ??
                      0)
                  : (branch?.futureDeliveryOrderDays ??
                      settings?.futureDeliveryOrderDays ??
                      0);
              const timeSlotIntervalMinutes =
                branch?.scheduledOrderTimeSlotInterval ??
                settings?.scheduledOrderTimeSlotInterval ??
                30;
              const branchIdForPicker =
                (orderToReschedule as any)?.branchId ||
                orderToReschedule.branch?.id ||
                branch?.id;

              return (
                <View style={styles.reschedulePickerWrap}>
                  <ScheduledOrderPicker
                    orderType={orderToReschedule.orderType}
                    isEnabled={isFutureOrderEnabled}
                    maxDays={futureOrderMaxDays}
                    timeSlotIntervalMinutes={timeSlotIntervalMinutes}
                    scheduledDate={rescheduleScheduledDate}
                    onScheduledDateChange={(date) =>
                      setRescheduleScheduledDate(date)
                    }
                    branchId={branchIdForPicker || undefined}
                  />
                </View>
              );
            })()}

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmSecondaryButton}
                onPress={() => setOrderToReschedule(null)}
                disabled={isRescheduling}
              >
                <Text style={styles.confirmSecondaryText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmPrimaryButton}
                onPress={handleConfirmReschedule}
                disabled={isRescheduling}
              >
                {isRescheduling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>
                    {t("orders.reschedule.confirm", {
                      defaultValue: "Confirm reschedule",
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(orderToModify)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isModifying) setOrderToModify(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {t("orders.modifyTitle", { defaultValue: "Modify scheduled order" })}
            </Text>
            <Text style={styles.confirmDescription}>
              {t("orders.modifyDescription", {
                defaultValue:
                  "To modify this scheduled order, we will cancel the current order. If you paid online, your payment will be refunded automatically (based on the cancellation policy). Then you can place a new order with your changes.",
              })}
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmSecondaryButton}
                onPress={() => setOrderToModify(null)}
                disabled={isModifying}
              >
                <Text style={styles.confirmSecondaryText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmPrimaryButton}
                onPress={handleConfirmModify}
                disabled={isModifying}
              >
                {isModifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>
                    {t("orders.confirmModify", {
                      defaultValue: "Cancel & Continue",
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ec4899",
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#9BA1A6",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#9BA1A6",
    marginBottom: 32,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  loginButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  browseButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  browseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  ordersList: {
    gap: 12,
  },
  orderCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333",
    width: "100%",
    maxWidth: "100%",
  },
  orderCardCancelled: {
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    opacity: 0.75,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    width: "100%",
  },
  orderHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  orderHeaderRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    flexShrink: 1,
  },
  orderTypeBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  orderTypeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
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
  scheduledBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
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
  modalScheduledBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  modalScheduledBoxScheduled: {
    borderColor: "rgba(168, 85, 247, 0.5)",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  modalScheduledBoxOverdue: {
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  modalScheduledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalScheduledIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScheduledIconWrapScheduled: {
    backgroundColor: "rgba(168, 85, 247, 0.18)",
  },
  modalScheduledIconWrapOverdue: {
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
  modalScheduledTextCol: {
    flex: 1,
  },
  modalScheduledLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  modalScheduledLabelScheduled: {
    color: "#c084fc",
  },
  modalScheduledLabelOverdue: {
    color: "#f87171",
  },
  modalScheduledValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalScheduledValueScheduled: {
    color: "#ddd6fe",
  },
  modalScheduledValueOverdue: {
    color: "#fecaca",
  },
  managementActionRow: {
    marginBottom: 12,
  },
  managementActionButton: {
    width: "100%",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  managementActionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  managementDangerButton: {
    width: "100%",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.45)",
    alignItems: "center",
  },
  managementDangerButtonText: {
    color: "#ef4444",
    fontWeight: "800",
    fontSize: 14,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#151718",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    padding: 16,
  },
  confirmTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  confirmDescription: {
    color: "#9ca3af",
    fontSize: 13,
    marginBottom: 8,
  },
  confirmDescriptionSecondary: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 12,
  },
  refundTimingWrap: {
    marginBottom: 12,
  },
  refundTimingLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 4,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmSecondaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#404040",
    backgroundColor: "transparent",
  },
  confirmSecondaryText: {
    color: "#9ca3af",
    fontWeight: "700",
    fontSize: 13,
  },
  confirmPrimaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#ec4899",
  },
  confirmPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  confirmDangerButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#ef4444",
  },
  confirmDangerText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  reschedulePickerWrap: {
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
  bellIconContainer: {
    padding: 4,
    marginRight: 8,
  },
  bellIcon: {
    // Animation will be handled by React Native Animated API if needed
  },
  orderDate: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    flexShrink: 0,
    marginLeft: 8,
  },
  itemsPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemsAvatars: {
    flexDirection: "row",
    gap: -8,
  },
  detailsButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    flexWrap: "wrap",
    gap: 8,
  },
  pickupInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  pickupInfoText: {
    color: "#9CA3AF",
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  itemAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#262626",
    backgroundColor: "#333",
  },
  placeholderAvatar: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 18,
  },
  quantityBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  detailsButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailsButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  progressContainer: {
    marginTop: 12,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: "bold",
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#333",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 5,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    padding: 20,
    paddingTop: 12,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalCloseButton: {
    position: "absolute",
    right: 12,
    top: 10,
    padding: 8,
    zIndex: 2,
  },
  swipeIndicator: {
    width: 40,
    height: 4,
    backgroundColor: "#666",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
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
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  statusSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    color: "#9BA1A6",
    marginBottom: 8,
  },
  branchSection: {
    marginBottom: 24,
  },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  branchIcon: {
    marginRight: 8,
  },
  branchInfo: {
    flex: 1,
  },
  branchLabel: {
    fontSize: 11,
    color: "#9BA1A6",
    marginBottom: 4,
  },
  branchName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 16,
    marginBottom: 12,
  },
  modalOrderItem: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  modalItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#333",
    marginRight: 12,
  },
  modalItemDetails: {
    flex: 1,
  },
  modalItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    marginRight: 8,
  },
  modalItemPrice: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ec4899",
  },
  modalItemSize: {
    fontSize: 13,
    color: "#999",
    marginBottom: 2,
  },
  modalItemUnitPrice: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  addOnsContainer: {
    marginTop: 8,
  },
  addOnsLabel: {
    fontSize: 13,
    color: "#999",
    marginBottom: 6,
  },
  addOnsList: {
    marginTop: 4,
  },
  addOnItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  addOnTag: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flex: 1,
    marginRight: 8,
  },
  addOnText: {
    fontSize: 12,
    color: "#ec4899",
  },
  addOnPrice: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
  },
  addOnPriceNote: {
    fontSize: 11,
    color: "#999",
  },
  modalItemNote: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginTop: 4,
  },
  optionalIngredientsContainer: {
    marginTop: 8,
  },
  optionalIngredientSection: {
    marginBottom: 8,
  },
  optionalIngredientSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionalIngredientTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  optionalIngredientTagIncluded: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  optionalIngredientTagExcluded: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  optionalIngredientTagText: {
    fontSize: 12,
    color: "#fff",
  },
  summaryCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#999",
  },
  summaryValue: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
  },
  summarySubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginLeft: 16,
    marginBottom: 4,
  },
  summarySubLabel: {
    fontSize: 12,
    color: "#999",
  },
  summarySubValue: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  totalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ec4899",
  },
  infoCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
  },
  billPreviewSection: {
    marginBottom: 14,
  },
  billPreviewButton: {
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  billPreviewButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: "#999",
  },
  infoValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  paidStatus: {
    color: "#10b981",
  },
  unpaidStatus: {
    color: "#ef4444",
  },
  taxBreakdownContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  taxBreakdownTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9BA1A6",
    marginBottom: 8,
  },
  taxBreakdownContent: {
    // gap is handled by marginBottom on taxRow
  },
  taxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  taxRowLast: {
    marginBottom: 0,
  },
  taxLabel: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  taxValue: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  paginationContainer: {
    marginTop: 24,
    marginBottom: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#262626",
    borderRadius: 12,
  },
  paginationInfo: {
    alignItems: "center",
    marginBottom: 16,
  },
  paginationInfoText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  paginationCountText: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  paginationButtons: {
    flexDirection: "row",
    justifyContent: "center",
  },
  paginationButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
    marginHorizontal: 6,
  },
  paginationButtonDisabled: {
    backgroundColor: "#333",
    opacity: 0.5,
  },
  paginationButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  paginationButtonTextDisabled: {
    color: "#666",
  },
});
