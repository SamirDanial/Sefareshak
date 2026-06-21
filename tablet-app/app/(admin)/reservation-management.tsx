import React, { useState, useEffect, useRef, type ComponentProps, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, useFocusEffect } from "expo-router";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
  type ReservationType,
  type Table,
} from "@/src/services/reservationService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatAmount = (amount: any): string => {
  if (amount === null || amount === undefined) {
    return "0.00";
  }
  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numAmount)) {
    return "0.00";
  }
  return numAmount.toFixed(2);
};

const formatMoney = (amount: any, currency: string | null | undefined): string => {
  const cur = typeof currency === "string" && currency.trim() ? currency.trim() : "USD";
  const num = typeof amount === "number" ? amount : parseFloat(String(amount ?? 0));
  const safeNum = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(safeNum);
  } catch {
    return `${formatAmount(safeNum)} ${cur}`;
  }
};

const getStatusColor = (status: ReservationStatus): string => {
  switch (status) {
    case "PENDING":
      return "#fbbf24"; // yellow
    case "CONFIRMED":
      return "#3b82f6"; // blue
    case "SEATED":
      return "#22c55e"; // green
    case "COMPLETED":
      return "#10b981"; // emerald
    case "CANCELLED":
      return "#ef4444"; // red
    case "NO_SHOW":
      return "#6b7280"; // gray
    default:
      return "#6b7280";
  }
};

const getStatusIcon = (status: ReservationStatus): ComponentProps<typeof MaterialCommunityIcons>["name"] => {
  switch (status) {
    case "PENDING":
      return "clock";
    case "CONFIRMED":
      return "check-circle";
    case "SEATED":
      return "account";
    case "COMPLETED":
      return "check-circle";
    case "CANCELLED":
      return "close-circle";
    case "NO_SHOW":
      return "alert-circle";
    default:
      return "help-circle";
  }
};

export default function ReservationManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const {
    assignedBranchIds,
    canAny,
    canOnBranch,
    isOrgAdmin,
    isLoading: permissionsLoading,
    refreshPermissions,
  } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition, isScrollingDown, isAtTop } = useScroll();
  const lastScrollY = useRef(0);
  const headerHeight = insets.top + getAdminHeaderHeight();
  const bottomInset = insets.bottom;
  const { width: windowWidth } = useWindowDimensions();
  const isTwoColumnFilters = windowWidth >= 760;

  const refreshPermissionsRef = useRef(refreshPermissions);
  const canAnyRef = useRef(canAny);
  const canOnBranchRef = useRef(canOnBranch);
  const permissionsLoadingRef = useRef(permissionsLoading);
  const assignedBranchIdsRef = useRef<string[]>(assignedBranchIds);
  const userTypeRef = useRef(userType);
  const selectedBranchIdRef = useRef<string>("");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; currency?: string | null }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [settings, setSettings] = useState<any | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [allZonesForFilter, setAllZonesForFilter] = useState<Array<{ id: string; name: string }>>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [assignTableModalOpen, setAssignTableModalOpen] = useState(false);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [assignedTables, setAssignedTables] = useState<Table[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [reservationHistory, setReservationHistory] = useState<Array<{
    type: string;
    action: string;
    timestamp: string;
    details?: any;
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showBranchFilter, setShowBranchFilter] = useState(false);
  const [showZoneFilter, setShowZoneFilter] = useState(false);
  const [dateRangePickerVisible, setDateRangePickerVisible] = useState(false);
  const [dateRangePickerTarget, setDateRangePickerTarget] = useState<"start" | "end">("start");
  const [dateRangePickerValue, setDateRangePickerValue] = useState<Date>(new Date());
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [refundInfo, setRefundInfo] = useState<{
    refundAmount: number;
    refundPercentage: number;
    refundType: string;
    hoursUntilReservation: number;
  } | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const [permissionsRefreshing, setPermissionsRefreshing] = useState(false);

  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);
  const selectedReservationRef = useRef<Reservation | null>(null);

  useEffect(() => {
    refreshPermissionsRef.current = refreshPermissions;
  }, [refreshPermissions]);

  useEffect(() => {
    canAnyRef.current = canAny;
  }, [canAny]);

  useEffect(() => {
    canOnBranchRef.current = canOnBranch;
  }, [canOnBranch]);

  useEffect(() => {
    permissionsLoadingRef.current = permissionsLoading;
  }, [permissionsLoading]);

  useEffect(() => {
    assignedBranchIdsRef.current = assignedBranchIds;
  }, [assignedBranchIds]);

  useEffect(() => {
    userTypeRef.current = userType;
  }, [userType]);

  useEffect(() => {
    selectedBranchIdRef.current = selectedBranchId;
  }, [selectedBranchId]);

  const isBranchAdmin = userType === "BRANCH_ADMIN";
  const isEmployee = userType === "EMPLOYEE";
  const isWaiter = userType === "WAITER";
  const isBranchScoped = isBranchAdmin || isEmployee || isWaiter;

  const effectiveBranchId = isBranchScoped
    ? assignedBranchIds[0] || ""
    : selectedBranchId;

  // Default to today's range when selecting a branch (if no range picked yet)
  useEffect(() => {
    if (!effectiveBranchId) return;
    if (startDate || endDate) return;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    setStartDate(start);
    setEndDate(end);
  }, [effectiveBranchId, startDate, endDate]);

  const selectedBranch = useMemo(
    () => branches.find((b) => String(b.id) === String(effectiveBranchId)),
    [branches, effectiveBranchId]
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
    (reservationOrOrder?: any) => {
      const orderCurrency = String(
        (reservationOrOrder as any)?.reservationOrder?.currency ||
          (reservationOrOrder as any)?.currency ||
          ""
      ).trim();
      const branchCurrency = String((selectedBranch as any)?.currency || "").trim();
      const settingsCurrency = String((settings as any)?.currency || "").trim();
      return branchCurrency || settingsCurrency || orderCurrency || "USD";
    },
    [selectedBranch, settings]
  );

  useEffect(() => {
    // Keep UI state consistent for branch-scoped users.
    if (!isBranchScoped) return;
    if (!effectiveBranchId) return;
    if (selectedBranchId === effectiveBranchId) return;
    setSelectedBranchId(effectiveBranchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranchScoped, effectiveBranchId]);

  const canViewReservations = !permissionsLoading
    ? isOrgAdmin
      ? true // ORG_OWNER and ORG_ADMIN have full access to their organization
      : isBranchScoped
      ? (() => {
          const branchId = effectiveBranchId;
          return branchId
            ? canOnBranch(RESOURCES.RESERVATIONS, ACTIONS.VIEW, branchId)
            : false;
        })()
      : canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW }])
    : false;

  const canViewReservationsRef = useRef(canViewReservations);

  useEffect(() => {
    canViewReservationsRef.current = canViewReservations;
  }, [canViewReservations]);

  const canConfirmReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.CONFIRM }]);

  const canSeatReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.SEAT }]);

  const canCompleteReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.COMPLETE }]);

  const canCancelReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.CANCEL }]);

  const canViewReservationHistory =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW_HISTORY }]);

  const canUpdateReservation =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.RESERVATIONS, action: ACTIONS.UPDATE }]);

  const canViewTables =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.VIEW }]);

  const canViewZones =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.ZONES, action: ACTIONS.VIEW }]);

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

  const loadBranches = useCallback(async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const authToken = token || undefined;
      const apiService = ApiService.getInstance();

      const isBranchAdmin = userType === "BRANCH_ADMIN";
      const isEmployee = userType === "EMPLOYEE";
      const isWaiter = userType === "WAITER";
      const isBranchScoped = isBranchAdmin || isEmployee || isWaiter;

      const applyBranchScope = (list: Array<{ id: string; name: string }>) => {
        const filtered =
          isBranchScoped && Array.isArray(assignedBranchIds) && assignedBranchIds.length
            ? list.filter((b) => assignedBranchIds.includes(b.id))
            : list;
        return filtered;
      };

      const autoSelectIfNeeded = (list: Array<{ id: string; name: string }>) => {
        // For branch-scoped users, default to their branch immediately to avoid empty-state clearing.
        if (!selectedBranchId && isBranchScoped) {
          if (list.length === 1 && list[0]?.id) {
            setSelectedBranchId(list[0].id);
          } else if (assignedBranchIds.length === 1) {
            setSelectedBranchId(assignedBranchIds[0] || "");
          } else if (assignedBranchIds.length > 1) {
            // If multiple assigned branches, pick the first as default.
            setSelectedBranchId(assignedBranchIds[0] || "");
          }
          return;
        }

        // For non-branch-scoped users, auto-select only when there's exactly one branch.
        if (!selectedBranchId) {
          if (list.length === 1 && list[0]?.id) {
            setSelectedBranchId(list[0].id);
            return;
          }

          // Org admins should default to the first branch to avoid a blank screen.
          if (isOrgAdmin && list.length > 0 && list[0]?.id) {
            setSelectedBranchId(list[0].id);
          }
        }
      };

      try {
        const result = await apiService.get("/api/admin/branches", authToken);
        if (result.success && result.data) {
          const scoped = applyBranchScope(result.data);
          setBranches(scoped);
          autoSelectIfNeeded(scoped);
          return;
        }
      } catch (err: any) {
        const status = Number(err?.status || err?.data?.status || 0);
        const msg = String(err?.message || "");
        const isForbidden = status === 403 || msg.toLowerCase().includes("forbidden");
        if (!isForbidden) throw err;
      }

      const fallbackResult = await apiService.get("/api/user/branches/my", authToken);
      if (fallbackResult.success && fallbackResult.data) {
        const scoped = applyBranchScope(fallbackResult.data);
        setBranches(scoped);
        autoSelectIfNeeded(scoped);
        if (isOrgAdmin && scoped.length === 0) {
          setToast({
            visible: true,
            message: t("admin.reservationManagement.noBranches", {
              defaultValue: "No branches available.",
            }) as any,
            type: "info",
          });
        }
      }
    } catch (error) {
      console.error("Error loading branches:", error);
      setToast({
        visible: true,
        message: (error as any)?.message || t("admin.reservationManagement.errorLoading"),
        type: "error",
      });
    } finally {
      setLoadingBranches(false);
    }
  }, [assignedBranchIds, getToken, isOrgAdmin, selectedBranchId, userType]);

  // Reload branches when permissions are ready and when SUPER_ADMIN changes organization.
  // This keeps branch filter options scoped to the selected organization (via x-organization-id).
  useEffect(() => {
    if (permissionsLoading) return;

    if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
      setBranches([]);
      setSelectedBranchId("");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    loadBranches().catch(() => {
      // errors handled in loadBranches
    });
  }, [permissionsLoading, loadBranches, selectedOrganizationId, userType]);

  const loadReservations = async (branchIdOverride?: string, zoneIdOverride?: string) => {
    const branchIdToUse = branchIdOverride !== undefined ? branchIdOverride : effectiveBranchId;
    const zoneIdToUse = zoneIdOverride !== undefined ? zoneIdOverride : selectedZoneId;
    
    if (permissionsLoading) return;
    if (!canViewReservations) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Don't load reservations if no branch is selected
    if (!branchIdToUse) {
      // For branch-scoped users, branch id can be temporarily unavailable during initial permission load.
      // Avoid wiping the list in that case.
      if (!isBranchScoped) {
        setReservations([]);
        setTotalPages(1);
        setTotalCount(0);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (!refreshing) {
      setLoading(true);
      }

      const token = await getToken();
      if (!token) return;

      const filters: {
        status?: ReservationStatus;
        type?: ReservationType;
        fromDate?: string;
        toDate?: string;
        search?: string;
        branchId?: string;
        zoneId?: string;
      } = {};

      if (selectedStatus !== "all") {
        filters.status = selectedStatus as ReservationStatus;
      }
      if (selectedType !== "all") {
        filters.type = selectedType as ReservationType;
      }
      const formatYmd = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      if (startDate) {
        filters.fromDate = formatYmd(startDate);
      }
      if (endDate) {
        filters.toDate = formatYmd(endDate);
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }
      if (branchIdToUse) {
        filters.branchId = branchIdToUse;
      }
      if (zoneIdToUse && zoneIdToUse !== "") {
        filters.zoneId = zoneIdToUse;
      }

      const response = await reservationService.getReservations(
        currentPage,
        12,
        filters,
        token
      );

      if (response && response.success && response.data) {
        // API returns { success: true, data: { reservations: [...], pagination: {...} } }
        // or { success: true, data: [...] }
        const data = response.data as any;
        const reservationsData = Array.isArray(data)
          ? data
          : Array.isArray(data?.reservations)
          ? data.reservations
          : [];
        
        // Always replace reservations (no infinite scroll)
        setReservations(reservationsData);
        
        // Handle pagination - it might be in response.data.pagination or response.pagination
        const pagination = (Array.isArray(data) ? {} : data?.pagination) || response.pagination || {};
        setTotalPages(pagination.pages || pagination.totalPages || 1);
        setTotalCount(pagination.total || (Array.isArray(data) ? 0 : data?.total) || 0);
      } else if (response && Array.isArray(response)) {
        // Handle case where API returns array directly (fallback)
        const reservationsData = response;
        setReservations(reservationsData);
      } else {
        // If response doesn't have expected structure, ensure reservations is still an array
        console.warn("Unexpected API response structure:", response);
        setReservations([]);
      }
    } catch (error: any) {
      console.error("Error loading reservations:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoading"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentPage(1);
    loadReservations();
  };

  useEffect(() => {
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadBranches();
      loadReservationSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLoading]);

  const fetchAllZonesForFilter = async (branchId?: string) => {
    try {
      if (permissionsLoading) return;
      if (!canViewZones) {
        setAllZonesForFilter([]);
        return;
      }
      if (!branchId) {
        setAllZonesForFilter([]);
        return;
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAllZonesForFilter(response.zones);
    } catch (error) {
      console.error("Error fetching zones for filter:", error);
      setAllZonesForFilter([]);
    }
  };

  useEffect(() => {
    if (effectiveBranchId) {
      fetchAllZonesForFilter(effectiveBranchId);
      setSelectedZoneId(""); // Reset zone filter when branch changes
    } else {
      setAllZonesForFilter([]);
      setSelectedZoneId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId]); // Only re-run when branch changes, not on permission changes

  useEffect(() => {
    if (!effectiveBranchId) return;
    if (!selectedZoneId) return;
    if (!Array.isArray(allZonesForFilter) || allZonesForFilter.length === 0) return;

    const isValid = allZonesForFilter.some((z) => z.id === selectedZoneId);
    if (!isValid) {
      setSelectedZoneId("");
    }
  }, [effectiveBranchId, selectedZoneId, allZonesForFilter]);

  // Load reservations when branch or zone changes
  useEffect(() => {
    if (isInitialMount.current) return;
    if (!effectiveBranchId) {
      // For branch-scoped users, branch id can temporarily disappear during permission refresh.
      // Do NOT wipe the list in that case; just stop loading.
      if (!isBranchScoped) {
        setReservations([]);
        setTotalPages(1);
        setTotalCount(0);
      }
      setLoading(false);
      return;
    }
    
    setCurrentPage(1);
    // Pass current values explicitly to avoid closure issues
    loadReservations(effectiveBranchId, selectedZoneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, selectedZoneId]);

  // Intentionally avoid loading reservations here; focus refresh is handled below after permissions refresh.

  // Keep ref in sync with state for WebSocket handlers
  useEffect(() => {
    selectedReservationRef.current = selectedReservation;
  }, [selectedReservation]);

  // Real-time WebSocket updates for reservations
  useEffect(() => {
    const socketService = SocketService.getInstance();
    let isMounted = true;

    // Handle new reservation event (real-time)
    const handleNewReservation = (data: {
      notification: any;
      reservation: Reservation;
    }) => {
      if (!isMounted || !data.reservation) return;
      if (!canViewReservationsRef.current) return;

      // Play notification sound
      notificationService.notifyNewOrder().catch((error) => {
        console.error("Failed to play notification sound:", error);
      });

      // Show toast notification
      setToast({
        visible: true,
        message: t("admin.reservationManagement.messages.newReservationReceived", {
          number: data.reservation.reservationNumber,
        }) || `New reservation #${data.reservation.reservationNumber}`,
        type: "success",
      });

      // Add new reservation to the beginning of the list
      setReservations((prev) => {
        // Check if reservation already exists (avoid duplicates)
        const exists = prev.some((res) => res.id === data.reservation.id);
        if (exists) {
          // Update existing reservation instead
          return prev.map((res) =>
            res.id === data.reservation.id
              ? {
                  ...data.reservation,
                  notifications: res.notifications
                    ? [...res.notifications, data.notification].filter(Boolean)
                    : data.notification
                    ? [data.notification]
                    : [],
                }
              : res
          );
        }
        // Add new reservation at the beginning
        return [
          {
            ...data.reservation,
            notifications: data.notification ? [data.notification] : [],
          },
          ...prev,
        ];
      });

      // Update total count
      setTotalCount((prev) => prev + 1);
    };

    // Handle reservation updated event (real-time) - status changes, table assignments, etc.
    const handleReservationUpdate = (data: { reservation: Reservation }) => {
      if (!isMounted || !data.reservation) return;
      if (!canViewReservationsRef.current) return;

      // Update reservation in the list if it exists
      setReservations((prev) => {
        const exists = prev.some((res) => res.id === data.reservation.id);
        if (exists) {
          // Update existing reservation, preserve notifications
          const updated = prev.map((res) =>
            res.id === data.reservation.id
              ? {
                  ...data.reservation,
                  notifications: res.notifications || [],
                }
              : res
          );
          
          // If status changed to CANCELLED and we have filters, check if it should still be visible
          // For now, we'll keep it visible so users can see what happened
          return updated;
        }
        // If it doesn't exist, don't add it (might not match current filters)
        return prev;
      });

      // Update selected reservation if it's the one being viewed
      const currentSelected = selectedReservationRef.current;
      if (currentSelected && currentSelected.id === data.reservation.id) {
        setSelectedReservation({
          ...data.reservation,
          notifications: currentSelected.notifications || [],
        });
      }
    };

    // Handle reservation modified event (real-time) - items added/removed, date changes, etc.
    const handleReservationModified = (data: {
      notification: any;
      reservation: Reservation;
    }) => {
      if (!isMounted || !data.reservation) return;
      if (!canViewReservationsRef.current) return;

      // Update reservation in the list if it exists
      setReservations((prev) =>
        prev.map((res) =>
          res.id === data.reservation.id
            ? {
                ...data.reservation,
                notifications: res.notifications
                  ? [...res.notifications, data.notification].filter(Boolean)
                  : data.notification
                  ? [data.notification]
                  : [],
              }
            : res
        )
      );

      // Update selected reservation if it's the one being viewed
      const currentSelected = selectedReservationRef.current;
      if (currentSelected && currentSelected.id === data.reservation.id) {
        setSelectedReservation({
          ...data.reservation,
          notifications: currentSelected.notifications
            ? [...currentSelected.notifications, data.notification].filter(Boolean)
            : data.notification
            ? [data.notification]
            : [],
        });
      }
    };

    // Handle notification seen event (real-time)
    const handleNotificationSeen = (data: {
      reservationId?: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted || !data.reservationId) return;

      // Update reservation notifications in the list
      setReservations((prev) =>
        prev.map((res) => {
          if (res.id === data.reservationId) {
            return {
              ...res,
              notifications: res.notifications?.map((n) =>
                n.id === data.notificationId ? { ...n, isSeen: true } : n
              ) || [],
            };
          }
          return res;
        })
      );

      // Update selected reservation if it's the one being viewed
      const currentSelected = selectedReservationRef.current;
      if (currentSelected && currentSelected.id === data.reservationId) {
        setSelectedReservation({
          ...currentSelected,
          notifications: currentSelected.notifications?.map((n) =>
            n.id === data.notificationId ? { ...n, isSeen: true } : n
          ) || [],
        });
      }
    };

    // Connect to WebSocket
    const connectSocket = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        
        // Register event listeners
        socketService.on("new-reservation", handleNewReservation);
        socketService.on("reservation-updated", handleReservationUpdate);
        socketService.on("reservation-modified", handleReservationModified);
        socketService.on("notification-seen", handleNotificationSeen);
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      }
    };

    connectSocket();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      socketService.off("new-reservation", handleNewReservation);
      socketService.off("reservation-updated", handleReservationUpdate);
      socketService.off("reservation-modified", handleReservationModified);
      socketService.off("notification-seen", handleNotificationSeen);
    };
  }, [getToken, t]);

  // Calculate refund info when cancel modal opens
  useEffect(() => {
    if (isCancelModalOpen && reservationToCancel && reservationSettings) {
      const reservation = reservations.find((r) => r.id === reservationToCancel) || selectedReservation;
      if (reservation && reservation.type === "PRE_ORDER" && reservation.reservationOrder) {
        const now = new Date();
        const reservationDate = new Date(reservation.reservationDate);
        const hoursUntilReservation = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        const fullRefundHours = reservationSettings.fullRefundHoursBefore ?? 24;
        const partialRefundHours = reservationSettings.partialRefundHoursBefore ?? 4;
        const noRefundHours = reservationSettings.noRefundHoursBefore ?? 1;

        let refundPercentage = 0;
        let refundType = "NO_REFUND";

        if (hoursUntilReservation >= fullRefundHours) {
          refundPercentage = 1.0;
          refundType = "FULL";
        } else if (hoursUntilReservation >= partialRefundHours) {
          refundPercentage = 0.5;
          refundType = "PARTIAL_50";
        } else if (hoursUntilReservation >= noRefundHours) {
          refundPercentage = 0.25;
          refundType = "PARTIAL_25";
        } else {
          refundPercentage = 0;
          refundType = "NO_REFUND";
        }

        const totalAmount = Number(reservation.reservationOrder.totalAmount || 0);
        const refundAmount = totalAmount * refundPercentage;

        setRefundInfo({
          refundAmount,
          refundPercentage,
          refundType,
          hoursUntilReservation,
        });
      } else {
        setRefundInfo(null);
      }
    } else if (!isCancelModalOpen) {
      setRefundInfo(null);
    }
  }, [isCancelModalOpen, reservationToCancel, reservationSettings, reservations, selectedReservation]);

  const loadReservationSettings = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const settings = await reservationService.getSettings(token);
      setReservationSettings(settings);
    } catch (error) {
      console.error("Error loading reservation settings:", error);
    }
  };

  const calculateRefundInfo = async (reservation: Reservation) => {
    if (!reservation || reservation.type !== "PRE_ORDER") {
      return null;
    }

    // If reservationOrder is not loaded, fetch it
    let reservationWithOrder = reservation;
    if (!reservation.reservationOrder && reservation.reservationOrderId) {
      try {
        const token = await getToken();
        if (token) {
          const fullReservation = await reservationService.getReservationById(reservation.id, token);
          reservationWithOrder = fullReservation;
        }
      } catch (error) {
        console.error("Error fetching reservation order:", error);
      }
    }

    if (!reservationWithOrder.reservationOrder) {
      return null;
    }

    if (!reservationSettings) {
      // Try to load settings if not loaded
      await loadReservationSettings();
      if (!reservationSettings) {
        return null;
      }
    }

    const now = new Date();
    const reservationDate = new Date(reservationWithOrder.reservationDate);
    const hoursUntilReservation = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const fullRefundHours = reservationSettings.fullRefundHoursBefore ?? 24;
    const partialRefundHours = reservationSettings.partialRefundHoursBefore ?? 4;
    const noRefundHours = reservationSettings.noRefundHoursBefore ?? 1;

    let refundPercentage = 0;
    let refundType = "NO_REFUND";

    if (hoursUntilReservation >= fullRefundHours) {
      refundPercentage = 1.0;
      refundType = "FULL";
    } else if (hoursUntilReservation >= partialRefundHours) {
      refundPercentage = 0.5;
      refundType = "PARTIAL_50";
    } else if (hoursUntilReservation >= noRefundHours) {
      refundPercentage = 0.25;
      refundType = "PARTIAL_25";
    } else {
      refundPercentage = 0;
      refundType = "NO_REFUND";
    }

    const totalAmount = Number(reservationWithOrder.reservationOrder.totalAmount || 0);
    const refundAmount = totalAmount * refundPercentage;

    return {
      refundAmount,
      refundPercentage,
      refundType,
      hoursUntilReservation,
    };
  };

  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;

    setCurrentPage(1);
    loadReservations();
  }, [selectedStatus, selectedType, startDate, endDate]);

  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadReservations();
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    if (isInitialMount.current) return;
    loadReservations();
  }, [currentPage]);

  const handleStatusChange = async (id: string, status: ReservationStatus) => {
    try {
      if (permissionsLoading) return;
      if (status === "CONFIRMED" && !canConfirmReservation) return;
      if (status === "SEATED" && !canSeatReservation) return;
      if (status === "COMPLETED" && !canCompleteReservation) return;

      setIsActionLoading(id);
      const token = await getToken();
      if (!token) return;

      await reservationService.updateReservationStatus(id, status, token);
      setToast({
        visible: true,
        message: t("admin.reservationManagement.statusUpdated"),
        type: "success",
      });
      await loadReservations();
      if (selectedReservation?.id === id) {
        const updated = await reservationService.getReservationById(id, token);
        setSelectedReservation(updated);
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorUpdating"),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      if (permissionsLoading) return;
      if (!canCancelReservation) return;

      setIsActionLoading(id);
      const token = await getToken();
      if (!token) return;

      const result = await reservationService.cancelReservation(id, undefined, token);
      
      // Show success message with refund info if applicable
      const reservation = reservations.find((r) => r.id === id);
      if (reservation && reservation.type === "PRE_ORDER" && refundInfo && refundInfo.refundAmount > 0) {
        setToast({
          visible: true,
          message: t("admin.reservationManagement.cancelDialog.cancelSuccessWithRefund", {
            amount: formatAmount(refundInfo.refundAmount),
          }),
          type: "success",
        });
      } else {
        setToast({
          visible: true,
          message: t("admin.reservationManagement.cancelled"),
          type: "success",
        });
      }

      setIsCancelModalOpen(false);
      setReservationToCancel(null);
      setRefundInfo(null);
      await loadReservations();
      if (selectedReservation?.id === id) {
        setIsViewModalOpen(false);
        setSelectedReservation(null);
      }
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorCancelling"),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const loadAvailableTables = async () => {
    if (!selectedReservation) return;

    try {
      if (permissionsLoading) return;
      if (!canViewTables) return;

      setLoadingTables(true);
      const token = await getToken();
      if (!token) return;

      const response = await reservationService.getTables(1, 100, "tableNumber", "asc", undefined, undefined, undefined, undefined, token);
      
      if (response.success && response.data) {
        const allTables = response.data;
        const available = allTables.filter(
          (table) => table.status === "AVAILABLE" && table.isActive
        );
        const assigned = allTables.filter(
          (table) => table.status === "RESERVED" || table.status === "OCCUPIED"
        );

        setAvailableTables(available);
        setAssignedTables(assigned);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoadingTables"),
        type: "error",
      });
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    if (assignTableModalOpen && selectedReservation) {
      loadAvailableTables();
    }
  }, [assignTableModalOpen, selectedReservation?.id]);

  const handleAssignTable = async () => {
    if (!selectedReservation || selectedTableIds.length === 0) return;

    try {
      if (permissionsLoading) return;
      if (!canUpdateReservation) return;
      if (!canViewTables) return;

      setIsActionLoading(selectedReservation.id);
      const token = await getToken();
      if (!token) return;

      const selectedTables = [...availableTables, ...assignedTables].filter(
        (t) => selectedTableIds.includes(t.id)
      );
      const totalCapacity = selectedTables.reduce((sum, table) => sum + table.capacity, 0);
      const requiredGuests = selectedReservation.numberOfGuests;

      let requestBody: { tableIds: string[]; overrideCapacity?: boolean; overrideNote?: string };
      
      if (totalCapacity < requiredGuests) {
        // Show warning but allow override
        requestBody = {
          tableIds: selectedTableIds,
          overrideCapacity: true,
          overrideNote: `Capacity override: ${totalCapacity} seats for ${requiredGuests} guests`,
        };
      } else {
        requestBody = { tableIds: selectedTableIds };
      }

      await reservationService.assignTable(selectedReservation.id, requestBody, token);
      setToast({
        visible: true,
        message: t("admin.reservationManagement.tableAssigned"),
        type: "success",
      });
      setAssignTableModalOpen(false);
      setSelectedTableIds([]);
      await loadReservations();
      const updated = await reservationService.getReservationById(selectedReservation.id, token);
      setSelectedReservation(updated);
    } catch (error: any) {
      console.error("Error assigning table:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorAssigningTable"),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const loadReservationHistory = async (reservationId?: string) => {
    const id = reservationId || selectedReservation?.id;
    if (!id) {
      console.warn("No reservation ID provided for loading history");
      return;
    }

    try {
      if (permissionsLoading) return;
      if (!canViewReservationHistory) return;

      setLoadingHistory(true);
      const token = await getToken();
      if (!token) {
        console.warn("No token available for loading history");
        return;
      }

      const history = await reservationService.getReservationHistory(id, token);
      setReservationHistory(Array.isArray(history) ? history : []);
    } catch (error: any) {
      console.error("Error loading history:", error);
      setToast({
        visible: true,
        message: error.message || t("admin.reservationManagement.errorLoadingHistory"),
        type: "error",
      });
      setReservationHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openViewModal = async (reservation: Reservation) => {
    router.push(`/(admin)/reservation-details?id=${reservation.id}` as any);
  };

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      // Synchronously block rendering to avoid one-frame stale-permission flashes
      setPermissionsRefreshing(true);

      (async () => {
        try {
          await refreshPermissionsRef.current();
          if (!isActive) return;

          // Wait until PermissionContext loading settles; during refresh it can temporarily flip
          // and make permission checks return false.
          for (let i = 0; i < 20; i++) {
            if (!isActive) return;
            if (!permissionsLoadingRef.current) break;
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
          }
          if (!isActive) return;

          const isBranchScopedAfterRefresh =
            userTypeRef.current === "BRANCH_ADMIN" ||
            userTypeRef.current === "EMPLOYEE" ||
            userTypeRef.current === "WAITER";

          const assignedIds = assignedBranchIdsRef.current;
          const branchIdForPermission = isBranchScopedAfterRefresh
            ? (Array.isArray(assignedIds) ? assignedIds[0] : "") || ""
            : selectedBranchIdRef.current;

          const canViewAfterRefresh = isBranchScopedAfterRefresh
            ? (branchIdForPermission
                ? canOnBranchRef.current(
                    RESOURCES.RESERVATIONS,
                    ACTIONS.VIEW,
                    branchIdForPermission
                  )
                : false)
            : canAnyRef.current([
                { resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW },
              ]);

          // If user cannot view reservations, ensure we don't keep stale data around.
          if (!canViewAfterRefresh) {
            setLoading(false);
            setRefreshing(false);
            return;
          }

          // Only load when a branch is available.
          if (branchIdForPermission) {
            await loadReservations(branchIdForPermission, selectedZoneId);
          }
        } finally {
          if (isActive) setPermissionsRefreshing(false);
        }
      })();

      return () => {
        isActive = false;
      };
    }, [])
  );

  if (permissionsLoading || permissionsRefreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.reservationManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!permissionsLoading && !canViewReservations) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
          <TouchableOpacity
            style={[styles.filterTextButtonContainer, { marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.filterTextButton}>
              {t("common.back", { defaultValue: "Back" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getStatusLabel = (status: ReservationStatus): string => {
    // Convert status to translation key format (e.g., "NO_SHOW" -> "noShow", "PENDING" -> "pending")
    const statusKeyMap: Record<string, string> = {
      "PENDING": "pending",
      "CONFIRMED": "confirmed",
      "SEATED": "seated",
      "COMPLETED": "completed",
      "CANCELLED": "cancelled",
      "NO_SHOW": "noShow",
    };
    const key = statusKeyMap[status] || status.toLowerCase();
    const statusKey = `admin.reservationManagement.statuses.${key}`;
    const translated = t(statusKey, { defaultValue: status });
    return translated !== statusKey ? translated : status;
  };

  const getTypeLabel = (type: ReservationType): string => {
    // Convert type to translation key format (e.g., "PRE_ORDER" -> "preOrder", "SIMPLE" -> "simple")
    const typeKeyMap: Record<string, string> = {
      "SIMPLE": "simple",
      "PRE_ORDER": "preOrder",
    };
    const key = typeKeyMap[type] || type.toLowerCase();
    const typeKey = `admin.reservationManagement.types.${key}`;
    const translated = t(typeKey, { defaultValue: type });
    return translated !== typeKey ? translated : type;
  };

  const handleBranchFilter = (branchId: string) => {
    setSelectedBranchId(branchId || "");
    setSelectedZoneId(""); // Reset zone filter when branch changes
    setCurrentPage(1);
  };

  const handleZoneFilter = (zoneId: string) => {
    if (zoneId === "all") {
      setSelectedZoneId("");
    } else {
      setSelectedZoneId(zoneId);
    }
    setCurrentPage(1);
  };

  const filteredReservations = (reservations || []).filter((reservation) => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        reservation.reservationNumber?.toLowerCase().includes(searchLower) ||
        reservation.customerName?.toLowerCase().includes(searchLower) ||
        reservation.customerEmail?.toLowerCase().includes(searchLower) ||
        reservation.customerPhone?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const openDateRangePicker = (target: "start" | "end") => {
    const today = new Date();
    const currentValue =
      target === "start"
        ? startDate || today
        : endDate || today;

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentValue,
        mode: "date",
        display: "default",
        onChange: (event: any, selected?: Date) => {
          if ((event as any)?.type === "dismissed") return;
          if (!selected) return;

          if (target === "start") {
            setStartDate(selected);
            setCurrentPage(1);
            return;
          }

          setEndDate(selected);
          setCurrentPage(1);
        },
      });
      return;
    }

    setDateRangePickerTarget(target);
    setDateRangePickerValue(currentValue);
    setDateRangePickerVisible(true);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
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
                ? t("admin.reservationManagement.filters.hideFilters")
                : t("admin.reservationManagement.filters.showFilters")}
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
                placeholder={t("admin.reservationManagement.filters.searchPlaceholder")}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {/* Branch + Zone */}
            <View style={styles.filterGrid}>
              <TouchableOpacity
                onPress={() => setShowBranchFilter(true)}
                style={[
                  styles.filterDropdown,
                  styles.filterGridItemTwoCol,
                  isTwoColumnFilters && styles.filterGridItemTwoCol,
                  selectedBranchId && styles.filterDropdownActive,
                ]}
              >
                <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.reservationManagement.filters.selectBranch")
                    : t("admin.reservationManagement.filters.selectBranch")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => selectedBranchId && setShowZoneFilter(true)}
                disabled={!selectedBranchId}
                style={[
                  styles.filterDropdown,
                  styles.filterGridItemTwoCol,
                  isTwoColumnFilters && styles.filterGridItemTwoCol,
                  selectedZoneId && styles.filterDropdownActive,
                  !selectedBranchId && styles.filterDropdownDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="map-marker"
                  size={14}
                  color={!selectedBranchId ? "#6B7280" : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.filterDropdownText,
                    !selectedBranchId && styles.filterDropdownTextDisabled,
                  ]}
                >
                  {!selectedBranchId
                    ? t("admin.tableManagement.selectBranchFirst") ||
                      "Select Branch First"
                    : selectedZoneId
                      ? allZonesForFilter.find((z) => z.id === selectedZoneId)?.name ||
                        t("admin.tableManagement.allZones")
                      : t("admin.tableManagement.allZones")}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={14}
                  color={!selectedBranchId ? "#6B7280" : "#9CA3AF"}
                />
              </TouchableOpacity>
            </View>

            {/* Filter Dropdowns */}
            <View style={styles.filterDropdownsRow}>
              {/* Status Filter */}
              <TouchableOpacity
                onPress={() => setShowStatusFilter(true)}
                style={[
                  styles.filterDropdown,
                  styles.filterDropdownFlex,
                  selectedStatus !== "all" && styles.filterDropdownActive,
                ]}
              >
                <MaterialCommunityIcons name="check-circle" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedStatus === "all"
                    ? t("admin.reservationManagement.filters.allStatuses")
                    : getStatusLabel(selectedStatus as ReservationStatus)}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Type Filter */}
              <TouchableOpacity
                onPress={() => setShowTypeFilter(true)}
                style={[
                  styles.filterDropdown,
                  styles.filterDropdownFlex,
                  selectedType !== "all" && styles.filterDropdownActive,
                ]}
              >
                <MaterialCommunityIcons name="tag" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedType === "all"
                    ? t("admin.reservationManagement.filters.allTypes")
                    : getTypeLabel(selectedType as ReservationType)}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Date Range Filters */}
            <View style={styles.filterDropdownsRow}>
              <TouchableOpacity
                onPress={() => openDateRangePicker("start")}
                style={[
                  styles.filterDropdown,
                  styles.filterDropdownFlex,
                  startDate && styles.filterDropdownActive,
                ]}
              >
                <MaterialCommunityIcons name="calendar-start" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {startDate
                    ? formatDate(startDate.toISOString())
                    : t("admin.reservationManagement.filters.startDate")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => openDateRangePicker("end")}
                style={[
                  styles.filterDropdown,
                  styles.filterDropdownFlex,
                  endDate && styles.filterDropdownActive,
                ]}
              >
                <MaterialCommunityIcons name="calendar-end" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {endDate
                    ? formatDate(endDate.toISOString())
                    : t("admin.reservationManagement.filters.endDate")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={() => {
                setSearchTerm("");
                setSelectedStatus("all");
                setSelectedType("all");
                setStartDate(undefined);
                setEndDate(undefined);
                setSelectedZoneId("");
                setCurrentPage(1);
              }}
            >
              <Text style={styles.clearFiltersText}>
                {t("admin.reservationManagement.filters.clearFilters")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reservations List */}
        {!effectiveBranchId ? (
          <View style={[styles.emptyContainer, { paddingHorizontal: 16 }]}>
            <MaterialCommunityIcons name="office-building" size={48} color="#6b7280" />
            <Text style={styles.emptyText}>
              {t("admin.reservationManagement.selectBranchToView")}
            </Text>
            <Text style={[styles.emptyText, { fontSize: 14, marginTop: 8, opacity: 0.7 }]}>
              {t("admin.reservationManagement.selectBranchToViewSubtext")}
            </Text>
          </View>
        ) : loading && reservations.length === 0 ? (
          <View style={[styles.loadingContainer, { paddingHorizontal: 16 }]}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("admin.reservationManagement.loading")}
            </Text>
          </View>
        ) : filteredReservations.length === 0 ? (
          <View style={[styles.emptyContainer, { paddingHorizontal: 16 }]}>
            <MaterialCommunityIcons name="calendar-alert" size={48} color="#6b7280" />
            <Text style={styles.emptyText}>
              {t("admin.reservationManagement.noReservations")}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {filteredReservations.map((reservation) => {
              const statusColor = getStatusColor(reservation.status);
              const hasUnseenNotification = reservation.notifications?.some((n) => !n.isSeen);
              
              return (
                <TouchableOpacity
                  key={reservation.id}
                  onPress={() => openViewModal(reservation)}
                  style={[
                    styles.reservationCard,
                    hasUnseenNotification && styles.reservationCardUnseen,
                  ]}
                >
                  <View style={styles.reservationHeader}>
                    <View style={styles.reservationHeaderLeft}>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                        <MaterialCommunityIcons
                          name={getStatusIcon(reservation.status)}
                          size={12}
                          color={statusColor}
                        />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {getStatusLabel(reservation.status)}
                        </Text>
                      </View>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeText}>
                          {getTypeLabel(reservation.type)}
                        </Text>
                      </View>
                    </View>
                    {hasUnseenNotification && (
                      <View style={styles.unseenIndicator} />
                    )}
                  </View>

                  <Text style={styles.reservationNumber}>
                    {reservation.reservationNumber}
                  </Text>

                  <View style={styles.reservationInfo}>
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="calendar" size={16} color="#9CA3AF" />
                      <Text style={styles.infoText}>
                        {formatDate(reservation.reservationDate)} {formatTime(reservation.reservationDate)}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="account-group" size={16} color="#9CA3AF" />
                      <Text style={styles.infoText}>
                        {reservation.numberOfGuests} {t("admin.reservationManagement.guests")}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="account" size={16} color="#9CA3AF" />
                      <Text style={styles.infoText} numberOfLines={1}>
                        {reservation.customerName}
                      </Text>
                    </View>
                    {(reservation.tables && reservation.tables.length > 0) || reservation.table ? (
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          {reservation.tables && reservation.tables.length > 0
                            ? `Tables: ${reservation.tables.map((rt: any) => rt.table?.tableNumber).filter(Boolean).join(", ")}`
                            : reservation.table
                            ? `Table ${reservation.table.tableNumber}`
                            : ""}
                        </Text>
                      </View>
                    ) : null}
                    {reservation.zone && (
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="map-marker-radius" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          {reservation.zone.name}
                        </Text>
                      </View>
                    )}
                    {reservation.branch && (
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="office-building" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          {reservation.branch.name}
                        </Text>
                      </View>
                    )}
                    {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="credit-card" size={16} color="#9CA3AF" />
                        <Text style={styles.infoText}>
                          {reservation.reservationOrder.orderNumber} - {formatMoney(reservation.reservationOrder.totalAmount, resolveDisplayCurrency(reservation))}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

          </View>
        )}
      </ScrollView>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <Text style={styles.paginationText}>
            {t("admin.reservationManagement.pagination.showing", {
              current: filteredReservations.length,
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
              disabled={currentPage === 1 || loading}
            >
              <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.paginationPageText}>
              {t("admin.reservationManagement.pagination.page", {
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
              disabled={currentPage === totalPages || loading}
            >
              <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* View Details Modal */}
      <Modal
        visible={isViewModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsViewModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t("admin.reservationManagement.details.title")}
            </Text>
            <TouchableOpacity
              onPress={() => setIsViewModalOpen(false)}
              style={styles.modalCloseButton}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {selectedReservation && (
            <ScrollView style={styles.modalContent}>
              {/* Reservation Info */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>
                  {t("admin.reservationManagement.details.reservationInfo")}
                </Text>
                <DetailRow
                  label={t("admin.reservationManagement.details.number")}
                  value={selectedReservation.reservationNumber}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.date")}
                  value={formatDate(selectedReservation.reservationDate)}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.time")}
                  value={formatTime(selectedReservation.reservationDate)}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.guests")}
                  value={selectedReservation.numberOfGuests.toString()}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.status")}
                  value={getStatusLabel(selectedReservation.status)}
                  valueColor={getStatusColor(selectedReservation.status)}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.type")}
                  value={getTypeLabel(selectedReservation.type)}
                />
              </View>

              {/* Customer Info */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>
                  {t("admin.reservationManagement.details.customerInfo")}
                </Text>
                <DetailRow
                  label={t("admin.reservationManagement.details.name")}
                  value={selectedReservation.customerName}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.email")}
                  value={selectedReservation.customerEmail}
                />
                <DetailRow
                  label={t("admin.reservationManagement.details.phone")}
                  value={selectedReservation.customerPhone}
                />
                {selectedReservation.specialRequests && (
                  <DetailRow
                    label={t("admin.reservationManagement.details.specialRequests")}
                    value={selectedReservation.specialRequests}
                  />
                )}
              </View>

              {/* Table Info */}
              {(selectedReservation.tables && selectedReservation.tables.length > 0) ||
              selectedReservation.table ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {t("admin.reservationManagement.details.tableInfo")}
                  </Text>
                  {selectedReservation.tables && selectedReservation.tables.length > 0 ? (
                    selectedReservation.tables.map((rt: any, index: number) => (
                      <DetailRow
                        key={index}
                        label={`${t("admin.reservationManagement.details.table")} ${index + 1}`}
                        value={`${rt.table?.tableNumber} (${rt.table?.capacity} ${t("admin.reservationManagement.seats")})${rt.table?.zoneRelation?.name ? ` - ${rt.table.zoneRelation.name}` : rt.table?.zone ? ` - ${rt.table.zone}` : ""}`}
                      />
                    ))
                  ) : selectedReservation.table ? (
                    <DetailRow
                      label={t("admin.reservationManagement.details.table")}
                      value={`${selectedReservation.table.tableNumber} (${selectedReservation.table.capacity} ${t("admin.reservationManagement.seats")})${selectedReservation.table.zoneRelation?.name ? ` - ${selectedReservation.table.zoneRelation.name}` : selectedReservation.table.zone ? ` - ${selectedReservation.table.zone}` : ""}`}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* Zone Info */}
              {selectedReservation.zone && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {t("admin.reservationManagement.details.zone")}
                  </Text>
                  <DetailRow
                    label={t("admin.reservationManagement.details.zone")}
                    value={selectedReservation.zone.name}
                  />
                </View>
              )}

              {/* Preferred Zone (if no zone assigned) */}
              {selectedReservation.preferredZone && !selectedReservation.zone && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {t("admin.reservationManagement.details.zone")}
                  </Text>
                  <DetailRow
                    label={t("admin.reservationManagement.details.zone")}
                    value={selectedReservation.preferredZone}
                  />
                </View>
              )}

              {/* Branch Info */}
              {selectedReservation.branch && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {t("admin.reservationManagement.details.branch")}
                  </Text>
                  <DetailRow
                    label={t("admin.reservationManagement.details.branch")}
                    value={selectedReservation.branch.name}
                  />
                </View>
              )}

              {/* Pre-Order Details */}
              {selectedReservation.type === "PRE_ORDER" && selectedReservation.reservationOrder && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {t("admin.reservationManagement.details.orderSummary")}
                  </Text>
                  
                  {/* Order Items */}
                  {selectedReservation.reservationOrder.items && selectedReservation.reservationOrder.items.length > 0 ? (
                    <View style={styles.orderItemsContainer}>
                      <Text style={styles.orderItemsTitle}>
                        {selectedReservation.reservationOrder.items.length === 1
                          ? `${selectedReservation.reservationOrder.items.length} ${t("admin.reservationManagement.details.item")}`
                          : `${selectedReservation.reservationOrder.items.length} ${t("admin.reservationManagement.details.items")}`}
                      </Text>
                      
                      {selectedReservation.reservationOrder.items.map((item: any, index: number) => (
                        <View key={index} style={styles.orderItemCard}>
                          {/* Main Item Info */}
                          <View style={styles.orderItemHeader}>
                            {item.meal?.image && (
                              <Image
                                source={{ uri: item.meal.image }}
                                style={styles.orderItemImage}
                                contentFit="cover"
                                transition={200}
                              />
                            )}
                            <View style={styles.orderItemInfo}>
                              <View style={styles.orderItemNameRow}>
                                <Text style={styles.orderItemName} numberOfLines={2}>
                                  {item.meal?.name || t("admin.reservationManagement.details.meal")}
                                </Text>
                                <Text style={styles.orderItemPrice}>
                                  {formatMoney(item.totalPrice, resolveDisplayCurrency(selectedReservation))}
                                </Text>
                              </View>
                              <View style={styles.orderItemMeta}>
                                {item.selectedSize && (
                                  <Text style={styles.orderItemMetaText}>
                                    {item.selectedSize}
                                  </Text>
                                )}
                                {item.selectedSize && item.quantity && (
                                  <Text style={styles.orderItemMetaText}> × </Text>
                                )}
                                {item.quantity && (
                                  <Text style={styles.orderItemMetaText}>
                                    {item.quantity}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>

                          {/* Add-ons */}
                          {item.addons && item.addons.length > 0 && (
                            <View style={styles.orderItemAddons}>
                              {item.addons.map((addOn: any) => {
                                const addonUnitPrice = Number(addOn.addOnPrice || 0);
                                const addonQuantity = addOn.quantity || 1;
                                const addonTotalPrice = addonUnitPrice * addonQuantity;
                                const addonName = addOn.addOnName || addOn.addon?.name || t("admin.reservationManagement.details.addon");
                                return (
                                  <View key={addOn.id} style={styles.addonRow}>
                                    <Text style={styles.addonName}>
                                      {addonName}
                                      {addonQuantity > 1 && (
                                        <Text style={styles.addonQuantity}> ×{addonQuantity}</Text>
                                      )}
                                    </Text>
                                    <Text style={styles.addonPrice}>
                                      {formatMoney(addonTotalPrice, resolveDisplayCurrency(selectedReservation))}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          {/* Optional Ingredients */}
                          {item.optionalIngredients && item.optionalIngredients.length > 0 && (
                            <View style={styles.orderItemIngredients}>
                              {(() => {
                                const included = item.optionalIngredients.filter(
                                  (ing: any) => ing.isIncluded
                                );
                                return included.length > 0 ? (
                                  <View style={styles.ingredientsContainer}>
                                    {included.map((ing: any) => (
                                      <View key={ing.id} style={styles.ingredientBadge}>
                                        <Text style={styles.ingredientText}>
                                          {ing.ingredientName}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                ) : null;
                              })()}
                            </View>
                          )}

                          {/* Special Instructions */}
                          {item.specialInstructions && (
                            <View style={styles.orderItemInstructions}>
                              <Text style={styles.instructionsText}>
                                {item.specialInstructions}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}

                      {/* Order Summary */}
                      <View style={styles.orderSummary}>
                        <Text style={styles.orderSummaryTitle}>
                          {t("admin.reservationManagement.details.orderSummary")}
                        </Text>
                        
                        <View style={styles.orderSummaryRow}>
                          <Text style={styles.orderSummaryLabel}>
                            {t("admin.reservationManagement.details.subtotal")}
                          </Text>
                          <Text style={styles.orderSummaryValue}>
                            {formatMoney(
                              Number(selectedReservation.reservationOrder.totalAmount || 0) -
                                Number(selectedReservation.reservationOrder.taxAmount || 0),
                              resolveDisplayCurrency(selectedReservation)
                            )}
                          </Text>
                        </View>

                        {selectedReservation.reservationOrder.taxAmount && 
                         Number(selectedReservation.reservationOrder.taxAmount) > 0 && (
                          <>
                            <View style={styles.orderSummaryRow}>
                              <Text style={styles.orderSummaryLabel}>
                                {t("admin.reservationManagement.details.tax")}
                              </Text>
                              <Text style={styles.orderSummaryValue}>
                                {formatMoney(selectedReservation.reservationOrder.taxAmount, resolveDisplayCurrency(selectedReservation))}
                              </Text>
                            </View>
                          </>
                        )}

                        <View style={styles.orderSummaryTotal}>
                          <Text style={styles.orderSummaryTotalLabel}>
                            {t("admin.reservationManagement.details.total")}
                          </Text>
                          <Text style={styles.orderSummaryTotalValue}>
                            {formatMoney(selectedReservation.reservationOrder.totalAmount, resolveDisplayCurrency(selectedReservation))}
                          </Text>
                        </View>
                        
                        {/* Show paid amount vs total if deposit was used */}
                        {selectedReservation.reservationOrder.paidAmount !== undefined && 
                         Number(selectedReservation.reservationOrder.paidAmount) !== Number(selectedReservation.reservationOrder.totalAmount) && (
                          <>
                            <View style={[styles.orderSummaryRow, styles.paymentInfoRow]}>
                              <Text style={styles.paymentInfoLabel}>
                                {t("admin.reservationManagement.details.paidAmount", "Paid Amount")}
                              </Text>
                              <Text style={styles.paidAmountValue}>
                                {formatMoney(Number(selectedReservation.reservationOrder.paidAmount || 0), resolveDisplayCurrency(selectedReservation))}
                              </Text>
                            </View>
                            {selectedReservation.reservationOrder.depositPercentage && (
                              <View style={styles.orderSummaryRow}>
                                <Text style={styles.depositPercentageLabel}>
                                  {t("admin.reservationManagement.details.depositPercentage", "Deposit")}
                                </Text>
                                <Text style={styles.depositPercentageValue}>
                                  {Number(selectedReservation.reservationOrder.depositPercentage)}%
                                </Text>
                              </View>
                            )}
                            <View style={[styles.orderSummaryRow, styles.paymentInfoRow]}>
                              <Text style={styles.paymentInfoLabel}>
                                {t("admin.reservationManagement.details.remainingBalance", "Remaining Balance")}
                              </Text>
                              <Text style={styles.remainingBalanceValue}>
                                {formatMoney(
                                  Number(selectedReservation.reservationOrder.totalAmount) -
                                    Number(selectedReservation.reservationOrder.paidAmount || 0),
                                  resolveDisplayCurrency(selectedReservation)
                                )}
                              </Text>
                            </View>
                          </>
                        )}
                        
                        {/* Complete Payment Button */}
                        {canUpdateReservation &&
                         selectedReservation.reservationOrder.paidAmount !== undefined && 
                         Number(selectedReservation.reservationOrder.paidAmount) !== Number(selectedReservation.reservationOrder.totalAmount) && (
                          <View style={styles.completePaymentButtonContainer}>
                            <TouchableOpacity
                              onPress={async () => {
                                if (!selectedReservation) return;
                                if (permissionsLoading) return;
                                if (!canUpdateReservation) return;
                                try {
                                  setIsActionLoading(selectedReservation.id);
                                  const token = (await getToken()) || undefined;
                                  const updated = await reservationService.completeReservationPayment(
                                    selectedReservation.id,
                                    token
                                  );
                                  setToast({
                                    visible: true,
                                    message: t("admin.reservationManagement.messages.paymentCompleted"),
                                    type: "success",
                                  });
                                  
                                  // Update local state
                                  setReservations((prev) =>
                                    prev.map((res) =>
                                      res.id === selectedReservation.id ? updated : res
                                    )
                                  );
                                  
                                  setSelectedReservation(updated);
                                } catch (error: any) {
                                  console.error("Error completing payment:", error);
                                  setToast({
                                    visible: true,
                                    message: error.response?.data?.error || t("admin.reservationManagement.messages.completePaymentError"),
                                    type: "error",
                                  });
                                } finally {
                                  setIsActionLoading(null);
                                }
                              }}
                              disabled={isActionLoading === selectedReservation.id}
                              style={[styles.completePaymentButton, isActionLoading === selectedReservation.id && styles.completePaymentButtonDisabled]}
                            >
                              {isActionLoading === selectedReservation.id ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.completePaymentButtonText}>
                                  {t("admin.reservationManagement.actions.completePayment") || "Complete Payment"}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noItemsContainer}>
                      <Text style={styles.noItemsText}>
                        {t("admin.reservationManagement.details.noPreOrderItems")}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionsContainer}>
                {selectedReservation.status === "PENDING" && canConfirmReservation && (
                  <TouchableOpacity
                    onPress={() => handleStatusChange(selectedReservation.id, "CONFIRMED")}
                    disabled={isActionLoading === selectedReservation.id}
                    style={[styles.actionButton, styles.confirmButton]}
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>
                          {t("admin.reservationManagement.actions.confirm")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {selectedReservation.status === "CONFIRMED" && canSeatReservation && (
                  <>
                    <TouchableOpacity
                      onPress={() => handleStatusChange(selectedReservation.id, "SEATED")}
                      disabled={isActionLoading === selectedReservation.id}
                      style={[styles.actionButton, styles.seatedButton]}
                    >
                      {isActionLoading === selectedReservation.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="account" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>
                            {t("admin.reservationManagement.actions.markAsSeated")}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {!selectedReservation.tableId && canUpdateReservation && canViewTables && (
                      <TouchableOpacity
                        onPress={() => {
                          setAssignTableModalOpen(true);
                        }}
                        style={[styles.actionButton, styles.assignButton]}
                      >
                        <MaterialCommunityIcons name="map-marker" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>
                          {t("admin.reservationManagement.actions.assignTable")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {selectedReservation.status === "SEATED" && canCompleteReservation && (
                  <TouchableOpacity
                    onPress={() => handleStatusChange(selectedReservation.id, "COMPLETED")}
                    disabled={isActionLoading === selectedReservation.id}
                    style={[styles.actionButton, styles.completeButton]}
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>
                          {t("admin.reservationManagement.actions.markAsCompleted")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {["PENDING", "CONFIRMED"].includes(selectedReservation.status) &&
                  canCancelReservation && (
                  <TouchableOpacity
                    onPress={async () => {
                      setReservationToCancel(selectedReservation.id);
                      setIsCancelModalOpen(true);
                      // Calculate refund info asynchronously
                      const refund = await calculateRefundInfo(selectedReservation);
                      setRefundInfo(refund);
                    }}
                    disabled={isActionLoading === selectedReservation.id}
                    style={[styles.actionButton, styles.cancelButton]}
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>
                          {t("admin.reservationManagement.actions.cancel")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {canViewReservationHistory && (
                  <TouchableOpacity
                    onPress={async () => {
                      if (!selectedReservation) {
                        console.warn("No reservation selected for viewing history");
                        return;
                      }
                      if (permissionsLoading) return;
                      if (!canViewReservationHistory) return;
                      // Close details modal first, then open history modal
                      setIsViewModalOpen(false);
                      // Small delay to ensure modal closes before opening new one
                      setTimeout(async () => {
                        setIsHistoryModalOpen(true);
                        await loadReservationHistory(selectedReservation.id);
                      }, 300);
                    }}
                    style={[styles.actionButton, styles.historyButton]}
                  >
                    <MaterialCommunityIcons name="clock" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>
                      {t("admin.reservationManagement.actions.viewHistory")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Assign Table Modal */}
      <Modal
        visible={assignTableModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setAssignTableModalOpen(false);
          setSelectedTableIds([]);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t("admin.reservationManagement.assignTable.title")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setAssignTableModalOpen(false);
                setSelectedTableIds([]);
              }}
              style={styles.modalCloseButton}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {loadingTables ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ec4899" />
                <Text style={styles.loadingText}>
                  {t("admin.reservationManagement.assignTable.loadingTables")}
                </Text>
              </View>
            ) : (
              <>
                {availableTables.length > 0 && (
                  <View style={styles.tableSection}>
                    <Text style={styles.tableSectionTitle}>
                      {t("admin.reservationManagement.assignTable.availableTables")}
                    </Text>
                    {availableTables.map((table) => {
                      const isSelected = selectedTableIds.includes(table.id);
                      return (
                        <TouchableOpacity
                          key={table.id}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedTableIds((prev) =>
                                prev.filter((id) => id !== table.id)
                              );
                            } else {
                              setSelectedTableIds((prev) => [...prev, table.id]);
                            }
                          }}
                          style={[
                            styles.tableItem,
                            isSelected && styles.tableItemSelected,
                          ]}
                        >
                          <View style={styles.tableItemContent}>
                            <View style={styles.tableItemHeader}>
                              <MaterialCommunityIcons name="map-marker" size={16} color="#9CA3AF" />
                              <Text style={styles.tableNumber}>{table.tableNumber}</Text>
                              {table.zone && (
                                <View style={styles.zoneBadge}>
                                  <Text style={styles.zoneText}>{table.zone}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.tableCapacity}>
                              {table.capacity} {t("admin.reservationManagement.seats")}
                            </Text>
                          </View>
                          {isSelected && (
                            <MaterialCommunityIcons name="check-circle" size={20} color="#ec4899" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {selectedTableIds.length > 0 && (
                  <View style={styles.assignActions}>
                    <TouchableOpacity
                      onPress={handleAssignTable}
                      disabled={isActionLoading === selectedReservation?.id}
                      style={styles.assignButton}
                    >
                      {isActionLoading === selectedReservation?.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                          <Text style={styles.assignButtonText}>
                            {t("admin.reservationManagement.assignTable.assign", {
                              count: selectedTableIds.length,
                            })}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        visible={isCancelModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsCancelModalOpen(false);
          setReservationToCancel(null);
          setRefundInfo(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setIsCancelModalOpen(false);
            setReservationToCancel(null);
            setRefundInfo(null);
          }}
        >
          <Pressable style={styles.confirmModal} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={styles.confirmModalScroll}
              contentContainerStyle={styles.confirmModalContent}
              showsVerticalScrollIndicator={true}
            >
            <Text style={styles.confirmModalTitle}>
              {t("admin.reservationManagement.cancelDialog.title")}
            </Text>
            <Text style={styles.confirmModalText}>
              {t("admin.reservationManagement.cancelDialog.description", {
                reservationNumber: reservations.find((r) => r.id === reservationToCancel)
                  ?.reservationNumber,
              })}
            </Text>

            {(() => {
              const reservation = reservations.find((r) => r.id === reservationToCancel) || selectedReservation;
              if (!reservation || reservation.type !== "PRE_ORDER") {
                return null;
              }

              if (!refundInfo) {
                return (
                  <View style={styles.refundInfoContainer}>
                    <ActivityIndicator size="small" color="#ec4899" />
                    <Text style={styles.refundInfoText}>
                      {t("admin.reservationManagement.cancelDialog.calculatingRefund")}
                    </Text>
                  </View>
                );
              }

              return (
                <View style={styles.refundInfoContainer}>
                  <View style={styles.refundInfoHeader}>
                    <MaterialCommunityIcons name="alert" size={20} color="#fbbf24" />
                    <Text style={styles.refundInfoTitle}>
                      {t("admin.reservationManagement.cancelDialog.refundConsequences")}
                    </Text>
                  </View>

                  {refundInfo.refundType === "NO_REFUND" ? (
                    <View style={[styles.refundWarningBox, styles.noRefundBox]}>
                      <Text style={styles.refundWarningText}>
                        {t("admin.reservationManagement.cancelDialog.noRefundWarning", {
                          hours: Math.ceil(refundInfo.hoursUntilReservation),
                        })}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.refundAmountBox}>
                        <Text style={styles.refundAmountLabel}>
                          {t("admin.reservationManagement.cancelDialog.estimatedRefund")}
                        </Text>
                        <Text style={styles.refundAmountValue}>
                          {formatMoney(refundInfo.refundAmount, resolveDisplayCurrency(selectedReservation))}
                        </Text>
                        <Text style={styles.refundPercentage}>
                          ({Math.round(refundInfo.refundPercentage * 100)}% {t("admin.reservationManagement.cancelDialog.ofTotal")})
                        </Text>
                      </View>

                      <View style={styles.refundDetailsBox}>
                        <Text style={styles.refundDetailsTitle}>
                          {t("admin.reservationManagement.cancelDialog.refundPolicy")}
                        </Text>
                        <Text style={styles.refundDetailsText}>
                          {refundInfo.refundType === "FULL"
                            ? t("admin.reservationManagement.cancelDialog.fullRefundPolicy", {
                                hours: reservationSettings?.fullRefundHoursBefore || 24,
                              })
                            : refundInfo.refundType === "PARTIAL_50"
                            ? t("admin.reservationManagement.cancelDialog.partialRefundPolicy", {
                                hours: reservationSettings?.partialRefundHoursBefore || 4,
                                percentage: 50,
                              })
                            : t("admin.reservationManagement.cancelDialog.reducedRefundPolicy", {
                                hours: reservationSettings?.noRefundHoursBefore || 1,
                                percentage: 25,
                              })}
                        </Text>
                        <Text style={styles.refundDetailsNote}>
                          {t("admin.reservationManagement.cancelDialog.refundNote")}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })()}

            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                onPress={() => {
                  setIsCancelModalOpen(false);
                  setReservationToCancel(null);
                  setRefundInfo(null);
                }}
                style={[styles.confirmModalButton, styles.cancelModalButton]}
              >
                <Text style={styles.cancelModalButtonText}>
                  {t("admin.reservationManagement.cancelDialog.keepReservation")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (reservationToCancel) {
                    handleCancel(reservationToCancel);
                  }
                }}
                disabled={isActionLoading === reservationToCancel}
                style={[styles.confirmModalButton, styles.confirmDeleteButton]}
              >
                {isActionLoading === reservationToCancel ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>
                    {t("admin.reservationManagement.cancelDialog.cancelReservation")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Status Filter Modal */}
      <Modal
        visible={showStatusFilter}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowStatusFilter(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowStatusFilter(false)}>
          <Pressable
            style={[
              styles.bottomSheetContent,
              { paddingBottom: Math.max(12, bottomInset + 12) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.reservationManagement.filters.selectStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowStatusFilter(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {["all", "PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"].map(
                (status) => {
                  const isActive = selectedStatus === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.bottomSheetOption,
                        isActive && styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedStatus(status);
                        setShowStatusFilter(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          isActive && styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {status === "all"
                          ? t("admin.reservationManagement.filters.allStatuses")
                          : getStatusLabel(status as ReservationStatus)}
                      </Text>
                      {isActive ? (
                        <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                      ) : null}
                    </TouchableOpacity>
                  );
                }
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Type Filter Modal */}
      <Modal
        visible={showTypeFilter}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowTypeFilter(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowTypeFilter(false)}>
          <Pressable
            style={[
              styles.bottomSheetContent,
              { paddingBottom: Math.max(12, bottomInset + 12) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.reservationManagement.filters.selectType")}
              </Text>
              <TouchableOpacity onPress={() => setShowTypeFilter(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {["all", "SIMPLE", "PRE_ORDER"].map((type) => {
                const isActive = selectedType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedType(type);
                      setShowTypeFilter(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {type === "all"
                        ? t("admin.reservationManagement.filters.allTypes")
                        : getTypeLabel(type as ReservationType)}
                    </Text>
                    {isActive ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Branch Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showBranchFilter}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowBranchFilter(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchFilter(false)}
        >
          <Pressable
            style={[
              styles.bottomSheetContent,
              { paddingBottom: Math.max(12, bottomInset + 12) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.reservationManagement.filters.selectBranch")}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchFilter(false)}>
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
                  {branches.map((branch) => (
                    <TouchableOpacity
                      key={branch.id}
                      style={[
                        styles.bottomSheetOption,
                        selectedBranchId === branch.id && styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => {
                        handleBranchFilter(branch.id);
                        setShowBranchFilter(false);
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

      {/* Zone Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showZoneFilter}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowZoneFilter(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowZoneFilter(false)}
        >
          <Pressable
            style={[
              styles.bottomSheetContent,
              { paddingBottom: Math.max(12, bottomInset + 12) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.selectZone")}
              </Text>
              <TouchableOpacity onPress={() => setShowZoneFilter(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  !selectedZoneId && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleZoneFilter("all");
                  setShowZoneFilter(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    !selectedZoneId && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.tableManagement.allZones")}
                </Text>
                {!selectedZoneId && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {allZonesForFilter.map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.bottomSheetOption,
                    selectedZoneId === zone.id && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handleZoneFilter(zone.id);
                    setShowZoneFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedZoneId === zone.id &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {zone.name || zone.id}
                  </Text>
                  {selectedZoneId === zone.id && (
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

      <Modal
        animationType="fade"
        transparent
        visible={dateRangePickerVisible}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDateRangePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDateRangePickerVisible(false)}>
          <Pressable style={styles.datePickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.datePickerModalHeader}>
              <Text style={styles.datePickerModalTitle}>
                {dateRangePickerTarget === "start"
                  ? t("admin.reservationManagement.filters.startDate")
                  : t("admin.reservationManagement.filters.endDate")}
              </Text>
              <TouchableOpacity onPress={() => setDateRangePickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <DateTimePicker
                value={dateRangePickerValue}
                mode="date"
                display="spinner"
                textColor="#ffffff"
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                  if ((event as any)?.type === "dismissed") {
                    setDateRangePickerVisible(false);
                    return;
                  }
                  if (selected) setDateRangePickerValue(selected);
                }}
              />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <TouchableOpacity
                style={[styles.datePickerModalButton, { backgroundColor: "#f3f4f6" }]}
                onPress={() => setDateRangePickerVisible(false)}
              >
                <Text style={styles.datePickerModalButtonText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.datePickerModalButton, { backgroundColor: "#ec4899" }]}
                onPress={() => {
                  if (dateRangePickerTarget === "start") {
                    setStartDate(dateRangePickerValue);
                  } else {
                    setEndDate(dateRangePickerValue);
                  }
                  setCurrentPage(1);
                  setDateRangePickerVisible(false);
                }}
              >
                <Text style={styles.datePickerModalButtonText}>
                  {t("common.apply", { defaultValue: "Apply" })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* History Modal */}
      <Modal
        visible={isHistoryModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsHistoryModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderContent}>
              <View style={styles.modalHeaderTitleRow}>
                <MaterialCommunityIcons name="clock" size={20} color="#ec4899" />
                <Text style={styles.modalTitle}>
                  {t("admin.reservationManagement.history.title")}
                </Text>
              </View>
              {selectedReservation && (
                <Text style={styles.modalDescription}>
                  {t("admin.reservationManagement.history.description", {
                    reservationNumber: selectedReservation.reservationNumber,
                  })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setIsHistoryModalOpen(false)}
              style={styles.modalCloseButton}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {loadingHistory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ec4899" />
              </View>
            ) : reservationHistory.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="clock" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>
                  {t("admin.reservationManagement.history.noHistory")}
                </Text>
                <Text style={styles.emptySubtext}>
                  {t("admin.reservationManagement.history.noHistoryDescription")}
                </Text>
              </View>
            ) : (
              <View style={styles.timelineContainer}>
                {/* Timeline line */}
                <View style={styles.timelineLine} />
                
                {reservationHistory.map((entry, index) => {
                  const date = new Date(entry.timestamp);
                  const formattedDate = date.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                  const formattedTime = date.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  // Get icon and color based on event type
                  const getEventConfig = () => {
                    switch (entry.type) {
                      case "RESERVATION_CREATED":
                        return {
                          icon: "calendar",
                          bgColor: "rgba(59, 130, 246, 0.1)",
                          borderColor: "#3b82f6",
                          dotColor: "#3b82f6",
                        };
                      case "RESERVATION_CONFIRMED":
                        return {
                          icon: "check-circle",
                          bgColor: "rgba(34, 197, 94, 0.1)",
                          borderColor: "#22c55e",
                          dotColor: "#22c55e",
                        };
                      case "TABLE_ASSIGNED":
                      case "TABLES_ASSIGNED":
                        return {
                          icon: "map-marker",
                          bgColor: "rgba(168, 85, 247, 0.1)",
                          borderColor: "#a855f7",
                          dotColor: "#a855f7",
                        };
                      case "CUSTOMER_SEATED":
                        return {
                          icon: "account",
                          bgColor: "rgba(249, 115, 22, 0.1)",
                          borderColor: "#f97316",
                          dotColor: "#f97316",
                        };
                      case "RESERVATION_COMPLETED":
                        return {
                          icon: "check-circle",
                          bgColor: "rgba(16, 185, 129, 0.1)",
                          borderColor: "#10b981",
                          dotColor: "#10b981",
                        };
                      case "RESERVATION_CANCELLED":
                        return {
                          icon: "close-circle",
                          bgColor: "rgba(239, 68, 68, 0.1)",
                          borderColor: "#ef4444",
                          dotColor: "#ef4444",
                        };
                      case "NO_SHOW":
                        return {
                          icon: "alert-circle",
                          bgColor: "rgba(239, 68, 68, 0.1)",
                          borderColor: "#ef4444",
                          dotColor: "#ef4444",
                        };
                      case "PAYMENT_PROCESSED":
                      case "PAYMENT_ADDED":
                        return {
                          icon: "currency-usd",
                          bgColor: "rgba(16, 185, 129, 0.1)",
                          borderColor: "#10b981",
                          dotColor: "#10b981",
                        };
                      default:
                        return {
                          icon: "clock",
                          bgColor: "rgba(107, 114, 128, 0.1)",
                          borderColor: "#6b7280",
                          dotColor: "#6b7280",
                        };
                    }
                  };

                  const eventConfig = getEventConfig();

                  return (
                    <View key={index} style={styles.timelineItem}>
                      {/* Timeline dot */}
                      <View style={[styles.timelineDot, { backgroundColor: eventConfig.dotColor }]}>
                        <View style={styles.timelineDotInner} />
                      </View>

                      {/* Event card */}
                      <View
                        style={[
                          styles.historyCard,
                          {
                            backgroundColor: eventConfig.bgColor,
                            borderColor: eventConfig.borderColor,
                          },
                        ]}
                      >
                        <View style={styles.historyCardHeader}>
                          <View
                            style={[
                              styles.historyIconContainer,
                              {
                                backgroundColor: eventConfig.borderColor,
                                borderWidth: 2,
                                borderColor: "rgba(255, 255, 255, 0.3)",
                              },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={eventConfig.icon as any}
                              size={20}
                              color="#ffffff"
                            />
                          </View>
                          <View style={styles.historyCardContent}>
                            <Text style={styles.historyAction}>{entry.action}</Text>
                            <View style={styles.historyTimeRow}>
                              <MaterialCommunityIcons name="clock" size={12} color="#9CA3AF" />
                              <Text style={styles.historyTimestamp}>
                                {formattedDate} at {formattedTime}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.historyTypeBadge,
                              { borderColor: eventConfig.borderColor },
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyTypeText,
                                { color: eventConfig.borderColor },
                              ]}
                            >
                              {entry.type.replace(/_/g, " ")}
                            </Text>
                          </View>
                        </View>

                        {/* Details */}
                        {entry.details && (
                          <View style={styles.historyDetails}>
                            {entry.details.reservationNumber && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.reservation")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.reservationNumber}
                                </Text>
                              </View>
                            )}
                            {entry.details.tableNumber && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.table")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.tableNumber}
                                </Text>
                              </View>
                            )}
                            {entry.details.tables && Array.isArray(entry.details.tables) && entry.details.tables.length > 0 && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.tables")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.tables.map((t: any) => t.tableNumber || t).join(", ")}
                                </Text>
                              </View>
                            )}
                            {entry.details.numberOfGuests && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.guests")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.numberOfGuests}
                                </Text>
                              </View>
                            )}
                            {entry.details.reason && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.reason")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.reason}
                                </Text>
                              </View>
                            )}
                            {entry.details.amount && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.amount")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {formatMoney(entry.details.amount, resolveDisplayCurrency(selectedReservation))}
                                </Text>
                              </View>
                            )}
                            {entry.details.paymentId && (
                              <View style={styles.historyDetailRow}>
                                <Text style={styles.historyDetailLabel}>
                                  {t("admin.reservationManagement.history.paymentId")}
                                </Text>
                                <Text style={styles.historyDetailValue}>
                                  {entry.details.paymentId}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 0,
    height: 0,
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterGridItemTwoCol: {
    flex: 1,
    minWidth: 0,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  filterDropdownsRow: {
    flexDirection: "row",
    gap: 12,
  },
  filterDropdownFlex: {
    flex: 1,
    minWidth: 0,
  },
  filterDropdown: {
    flex: 1,
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
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  filterDropdownDisabled: {
    opacity: 0.5,
  },
  filterDropdownTextDisabled: {
    color: "#6B7280",
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
  clearFiltersButton: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  clearFiltersText: {
    color: "#ec4899",
    fontSize: 13,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: "#6b7280",
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
  },
  emptySubtext: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  reservationCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  reservationCardUnseen: {
    borderLeftWidth: 4,
    borderLeftColor: "#ec4899",
  },
  reservationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reservationHeaderLeft: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typeBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  unseenIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ec4899",
  },
  reservationNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  reservationInfo: {
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    color: "#6b7280",
    fontSize: 14,
    flex: 1,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  paginationText: {
    color: "#6b7280",
    fontSize: 13,
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationPageText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalHeaderContent: {
    flex: 1,
    marginRight: 12,
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  modalDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  detailSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  detailLabel: {
    color: "#6b7280",
    fontSize: 14,
    flex: 1,
  },
  detailValue: {
    color: "#111827",
    fontSize: 14,
    flex: 1,
    textAlign: "right",
  },
  actionsContainer: {
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  confirmButton: {
    backgroundColor: "#3b82f6",
  },
  seatedButton: {
    backgroundColor: "#22c55e",
  },
  completeButton: {
    backgroundColor: "#10b981",
  },
  cancelButton: {
    backgroundColor: "#ef4444",
  },
  historyButton: {
    backgroundColor: "#6b7280",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  tableSection: {
    marginBottom: 16,
  },
  tableSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 12,
  },
  tableItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableItemSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  tableItemContent: {
    flex: 1,
  },
  tableItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  tableNumber: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  zoneBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zoneText: {
    color: "#6b7280",
    fontSize: 12,
  },
  tableCapacity: {
    color: "#6b7280",
    fontSize: 14,
  },
  assignActions: {
    marginTop: 16,
  },
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingVertical: 14,
    borderRadius: 8,
  },
  assignButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  datePickerModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  datePickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  datePickerModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  datePickerModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 96,
    alignItems: "center",
  },
  datePickerModalButtonText: {
    color: "#111827",
    fontWeight: "700",
  },
  confirmModal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    maxHeight: "90%",
    width: "100%",
  },
  confirmModalScroll: {
    maxHeight: "80%",
  },
  confirmModalContent: {
    padding: 20,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  confirmModalText: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  refundInfoContainer: {
    marginBottom: 20,
    gap: 12,
  },
  refundInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  refundInfoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  refundInfoText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  refundWarningBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 12,
    padding: 16,
  },
  noRefundBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
  },
  refundWarningText: {
    fontSize: 14,
    color: "#fbbf24",
    lineHeight: 20,
  },
  refundAmountBox: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  refundAmountLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  refundAmountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#22c55e",
    marginBottom: 4,
  },
  refundPercentage: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  refundDetailsBox: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
  },
  refundDetailsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  refundDetailsText: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
    marginBottom: 8,
  },
  refundDetailsNote: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  confirmModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelModalButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelModalButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmDeleteButton: {
    backgroundColor: "#ef4444",
  },
  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  filterModal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  filterOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  filterOptionSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  filterOptionText: {
    color: "#111827",
    fontSize: 16,
  },
  filterOptionTextSelected: {
    color: "#ec4899",
    fontWeight: "600",
  },
  timelineContainer: {
    position: "relative",
    paddingLeft: 32,
    paddingTop: 8,
  },
  timelineLine: {
    position: "absolute",
    left: 15,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#ec4899",
  },
  timelineItem: {
    position: "relative",
    marginBottom: 24,
  },
  timelineDot: {
    position: "absolute",
    left: -32,
    top: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    marginLeft: 8,
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  historyCardContent: {
    flex: 1,
    minWidth: 0,
  },
  historyAction: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  historyTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyTimestamp: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  historyTypeBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  historyTypeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  historyDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    gap: 8,
  },
  historyDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  historyDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    minWidth: 80,
    flexShrink: 0,
  },
  historyDetailValue: {
    fontSize: 12,
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  historyItem: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  guests: {
    color: "#9CA3AF",
  },
  seats: {
    color: "#9CA3AF",
  },
  orderItemsContainer: {
    marginTop: 8,
  },
  orderItemsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  orderItemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  orderItemHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  orderItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  orderItemMetaText: {
    fontSize: 12,
    color: "#6b7280",
  },
  orderItemAddons: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  addonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  addonName: {
    fontSize: 12,
    color: "#111827",
    flex: 1,
  },
  addonQuantity: {
    color: "#6b7280",
  },
  addonPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  orderItemIngredients: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  ingredientsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  ingredientBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ingredientText: {
    fontSize: 10,
    color: "#22c55e",
  },
  orderItemInstructions: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  instructionsText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  orderSummary: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  orderSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  orderSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderSummaryLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  orderSummaryValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  taxBreakdown: {
    marginLeft: 12,
    marginTop: 4,
  },
  taxBreakdownLabel: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  taxBreakdownValue: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  orderSummaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  orderSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  orderSummaryTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  paymentInfoRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  paymentInfoLabel: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  paidAmountValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#22c55e", // Green color for paid amount
  },
  depositPercentageLabel: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  depositPercentageValue: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  remainingBalanceValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f59e0b", // Amber color for remaining balance
  },
  completePaymentButtonContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  completePaymentButton: {
    backgroundColor: "#22c55e", // Green color
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  completePaymentButtonDisabled: {
    opacity: 0.6,
  },
  completePaymentButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  noItemsContainer: {
    padding: 32,
    alignItems: "center",
  },
  noItemsText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    backgroundColor: "#ffffff",
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
  bottomSheetOptionTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
});

