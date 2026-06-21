import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import branchService from "../services/branchService";
import CustomDropdown from "../components/CustomDropdown";
import { audioService } from "../services/audioService";
import { notificationService } from "../services/notificationService";
import { formatPrice } from "../utils/currency";
import PageHeader from "../components/PageHeader";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
  type ReservationType,
  type Zone,
} from "../services/reservationService";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import {
  Calendar,
  CheckCircle2,
  ChefHat,
  Clock,
  DollarSign,
  MapPin,
  MoreVertical,
  XCircle,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

type BranchOption = { value: string; label: string };
type ZoneOption = { value: string; label: string };

type Branch = {
  id: string;
  name: string;
  taxInclusive?: boolean | null;
  currency?: string | null;
};

type ReservationDateMode = "TODAY" | "UPCOMING";

const ReservationsManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { assignedBranchIds, canAny } = usePermissions();
  const { subscribe } = useAdminWebSocket();
  const [searchParams, setSearchParams] = useSearchParams();

  const fromDateInputRef = useRef<HTMLInputElement | null>(null);
  const toDateInputRef = useRef<HTMLInputElement | null>(null);

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

  const markNotificationSeenOnceRef = useRef<Set<string>>(new Set());

  const tryMarkNotificationSeen = async (notificationId: string | null | undefined) => {
    const nid = String(notificationId || "").trim();
    if (!nid) return;
    if (markNotificationSeenOnceRef.current.has(nid)) return;
    markNotificationSeenOnceRef.current.add(nid);
    try {
      const token = await getToken();
      if (!token) return;
      await notificationService.markAsSeen(nid, token || undefined);
    } catch {
      // ignore
    }
  };

  const canConfirmReservation = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.CONFIRM },
  ]);
  const canSeatReservation = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.SEAT },
  ]);
  const canCompleteReservation = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.COMPLETE },
  ]);
  const canCancelReservation = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.CANCEL },
  ]);
  const canViewReservationHistory = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW_HISTORY },
  ]);
  const canUpdateReservation = canAny([
    { resource: RESOURCES.RESERVATIONS, action: ACTIONS.UPDATE },
  ]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [orgVersion, setOrgVersion] = useState(0);
  const [settings, setSettings] = useState<any>(null);

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

  const [zones, setZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [dateMode, setDateMode] = useState<ReservationDateMode>("TODAY");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reservationHistory, setReservationHistory] = useState<
    Array<{ type: string; action: string; timestamp: string; details?: any }>
  >([]);

  const getSelectedOrganizationId = (): string | null => {
    try {
      const raw = window.localStorage.getItem("bellami:selectedOrganizationId");
      const val = (raw || "").trim();
      return val ? val : null;
    } catch {
      return null;
    }
  };

  const runCompletePayment = async () => {
    if (!selectedReservation) return;
    if (!canUpdateReservation) return;
    if (selectedReservation.status === "CANCELLED") return;
    try {
      setIsActionLoading(selectedReservation.id);
      const token = (await getToken()) || undefined;
      const updated = await reservationService.completeReservationPayment(
        selectedReservation.id,
        token
      );
      setSelectedReservation(updated);
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      console.error("Error completing reservation payment:", error);
      alert(
        t("admin.reservationManagement.messages.paymentCompleteFailed", {
          defaultValue: "Failed to complete payment.",
        })
      );
    } finally {
      setIsActionLoading(null);
    }
  };

  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const formatDateDDMMMYYYY = (value: string | Date): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const day = String(date.getDate());
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
    const month = monthNames[date.getMonth()];
    const year = String(date.getFullYear());
    return `${day}-${month}-${year}`;
  };

  const formatDateYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getMealImageUrl = (imagePath: string | null | undefined): string => {
    if (!imagePath) return "";
    if (isExternalImage(imagePath)) return imagePath;
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  };

  const eventMatchesScope = (reservation: any, organizationIdFromEvent?: string): boolean => {
    // Do not accept real-time events if the page is not currently scoped to a branch.
    // This prevents showing stale reservations when switching organizations (selectedBranchId resets).
    if (!selectedBranchId) return false;

    // Organization scoping (desktop adds org header for API calls; we mirror it for sockets too)
    const selectedOrgId = getSelectedOrganizationId();
    if (organizationIdFromEvent && selectedOrgId && String(organizationIdFromEvent) !== String(selectedOrgId)) {
      return false;
    }

    // Branch scoping (page is filtered by branch)
    const branchId = reservation?.branch?.id || reservation?.branchId;
    if (branchId && String(branchId) !== String(selectedBranchId)) {
      return false;
    }

    return true;
  };

  const upsertReservationIntoList = (incoming: Reservation) => {
    setReservations((prev) => {
      const idx = prev.findIndex((r) => r.id === incoming.id);
      if (idx === -1) {
        return [incoming, ...prev];
      }
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });

    setSelectedReservation((prev) => {
      if (!prev) return prev;
      if (prev.id !== incoming.id) return prev;
      return incoming;
    });
  };

  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = await getToken();
        if (!token) return;
        const fetchedBranches = await branchService.getBranches(token);
        const normalized = Array.isArray(fetchedBranches)
          ? fetchedBranches.map((b: any) => ({
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
          if (nextPrev && normalized.some((b) => b.id === nextPrev)) return nextPrev;
          return normalized[0]?.id || "";
        });
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    };

    loadBranches();
  }, [getToken, orgVersion]);

  // Default to today's range when selecting a branch (unless a range is already set)
  useEffect(() => {
    if (!selectedBranchId) return;
    if (fromDate || toDate) return;
    const today = new Date();
    const todayStr = formatDateYYYYMMDD(today);
    setFromDate(todayStr);
    setToDate(todayStr);
  }, [selectedBranchId, fromDate, toDate]);

  // Default: show today's reservations
  useEffect(() => {
    if (selectedDate) return;
    const today = new Date();
    setSelectedDate(formatDateYYYYMMDD(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const today = new Date();

      // Reset branch-scoped filters
      setSelectedBranchId("");
      setSelectedZoneId("");
      setBranches([]);
      setZones([]);
      setSelectedDate(formatDateYYYYMMDD(today));
      setFromDate("");
      setToDate("");
      setDateMode("TODAY");
      setSelectedStatus("all");
      setSelectedType("all");
      setCurrentPage(1);
      setReservations([]);
      setTotalPages(1);
      setTotalCount(0);
      setSelectedReservation(null);
      setIsViewDialogOpen(false);
      setIsCancelDialogOpen(false);
      setIsHistoryDialogOpen(false);

      // Force reload of branches/zones/reservations
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

  // Exact parity: handle deep link from notifications
  // - /admin/reservations?highlightReservation=<reservationId>
  // - /admin/reservations?branchId=<branchId>&highlightReservation=<reservationId>
  useEffect(() => {
    const branchIdFromUrl = searchParams.get("branchId");
    if (!branchIdFromUrl) return;
    if (selectedBranchId) return;

    setSelectedBranchId(branchIdFromUrl);

    // Clear branchId param after applying it (keep highlightReservation if present)
    setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("branchId");
        return next;
      });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, selectedBranchId]);

  // If highlightReservation exists but branchId not provided, try to infer branch by fetching reservation
  useEffect(() => {
    const extractBranchFromHighlightedReservation = async () => {
      const highlightReservationId = searchParams.get("highlightReservation");
      if (!highlightReservationId) return;
      if (selectedBranchId) return;
      if (branches.length === 0) return;

      try {
        const token = await getToken();
        if (!token) return;
        const reservation = await reservationService.getReservationById(
          highlightReservationId,
          token
        );
        const reservationBranchId = reservation.branch?.id || (reservation as any).branchId;
        if (reservationBranchId) {
          setSelectedBranchId(reservationBranchId);
        }
      } catch (error) {
        console.error(
          "[ReservationsManagement] Error fetching highlighted reservation to extract branch:",
          error
        );
      }
    };

    extractBranchFromHighlightedReservation();
  }, [searchParams, selectedBranchId, branches.length, getToken]);

  // Open the details modal for highlighted reservation
  useEffect(() => {
    const openHighlightedReservation = async () => {
      const highlightReservationId = searchParams.get("highlightReservation");
      const notificationId = searchParams.get("notificationId");
      if (!highlightReservationId) return;
      if (!selectedBranchId) return;
      if (loadingReservations) return;

      const inList = reservations.find((r) => r.id === highlightReservationId);
      if (inList) {
        setSelectedReservation(inList);
        setIsViewDialogOpen(true);
        await tryMarkNotificationSeen(notificationId);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("highlightReservation");
          next.delete("notificationId");
          return next;
        });
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;
        const reservation = await reservationService.getReservationById(
          highlightReservationId,
          token
        );
        setSelectedReservation(reservation);
        setIsViewDialogOpen(true);
        await tryMarkNotificationSeen(notificationId);
      } catch (error) {
        console.error(
          "[ReservationsManagement] Error fetching highlighted reservation:",
          error
        );
      } finally {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("highlightReservation");
          next.delete("notificationId");
          return next;
        });
      }
    };

    openHighlightedReservation();
  }, [searchParams, selectedBranchId, loadingReservations, reservations, getToken, setSearchParams]);

  // WebSocket: real-time reservation updates (mirror web frontend)
  useEffect(() => {
    const handleNewReservation = (data: {
      notification?: any;
      reservation: Reservation;
      organizationId?: string;
    }) => {
      if (!data?.reservation) return;
      if (!eventMatchesScope(data.reservation, data.organizationId)) return;

      audioService.playNotificationSound("newOrder").catch((error) => {
        console.error(
          "ReservationsManagement: Error playing notification sound for new reservation:",
          error
        );
      });

      // Avoid duplicates
      setReservations((prev) => {
        if (prev.some((r) => r.id === data.reservation.id)) return prev;
        return [data.reservation, ...prev];
      });
      setTotalCount((prev) => prev + 1);
    };

    const handleReservationUpdated = (data: { reservation: Reservation; organizationId?: string }) => {
      const reservation = (data as any)?.reservation;
      if (!reservation) return;
      if (!eventMatchesScope(reservation, (data as any)?.organizationId)) return;
      upsertReservationIntoList(reservation);
    };

    const handleReservationModified = (data: {
      notification?: any;
      reservation: Reservation;
      organizationId?: string;
    }) => {
      const reservation = (data as any)?.reservation;
      if (!reservation) return;
      if (!eventMatchesScope(reservation, (data as any)?.organizationId)) return;
      upsertReservationIntoList(reservation);
    };

    const handleNotificationSeen = (data: {
      orderId?: string;
      reservationId?: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      // If reservation notifications are used for highlighting, we'd update local state here.
      // Desktop list currently does not render unread state, so we can safely ignore.
      if (!data?.reservationId) return;
      // Still, if details modal is open, refresh selected reservation's notifications if present.
      setSelectedReservation((prev) => {
        if (!prev) return prev;
        if (prev.id !== data.reservationId) return prev;
        if (!Array.isArray(prev.notifications)) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n) =>
            n.id === data.notificationId ? { ...n, isSeen: data.isSeen } : n
          ),
        };
      });
    };

    const u1 = subscribe("new-reservation", handleNewReservation);
    const u2 = subscribe("reservation-updated", handleReservationUpdated);
    const u3 = subscribe("reservation-modified", handleReservationModified);
    const u4 = subscribe("notification-seen", handleNotificationSeen);

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, selectedBranchId]);

  useEffect(() => {
    if (!showDropdownMenu) return;

    const button = buttonRefs.current[showDropdownMenu];
    const dropdown = dropdownRefs.current[showDropdownMenu];

    if (button && dropdown) {
      const rect = button.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.right = `${window.innerWidth - rect.right}px`;
    }
  }, [showDropdownMenu]);

  useEffect(() => {
    if (!showDropdownMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const id = showDropdownMenu;
      const dropdown = id ? dropdownRefs.current[id] : null;
      const button = id ? buttonRefs.current[id] : null;
      const target = event.target as Node;

      if (dropdown && dropdown.contains(target)) return;
      if (button && button.contains(target)) return;
      setShowDropdownMenu(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdownMenu]);

  useEffect(() => {
    // Safety: if a completed reservation somehow had its dropdown opened, close it.
    if (!showDropdownMenu) return;
    const res = reservations.find((r) => r.id === showDropdownMenu);
    if (res?.status === "COMPLETED") {
      setShowDropdownMenu(null);
    }
  }, [reservations, showDropdownMenu]);

  const runStatusUpdateById = async (reservationId: string, nextStatus: ReservationStatus) => {
    try {
      setIsActionLoading(reservationId);
      const token = (await getToken()) || undefined;
      const updated = await reservationService.updateReservationStatus(
        reservationId,
        nextStatus,
        token
      );
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelectedReservation((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (error) {
      console.error("Error updating reservation status:", error);
      alert(
        t("admin.reservationManagement.actions.updateStatusFailed", {
          defaultValue: "Failed to update reservation status.",
        })
      );
    } finally {
      setIsActionLoading(null);
    }
  };

  const openHistoryDialog = async () => {
    if (!selectedReservation) return;
    if (!canViewReservationHistory) return;

    try {
      setIsHistoryDialogOpen(true);
      setLoadingHistory(true);
      const token = (await getToken()) || undefined;
      const history = await reservationService.getReservationHistory(
        selectedReservation.id,
        token
      );
      setReservationHistory(Array.isArray(history) ? history : []);
    } catch (error) {
      console.error("Error loading reservation history:", error);
      setReservationHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) return;

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
  }, [assignedBranchIds, branches, selectedBranchId]);

  useEffect(() => {
    const loadZones = async () => {
      if (!selectedBranchId) {
        setZones([]);
        setSelectedZoneId("");
        return;
      }

      try {
        setLoadingZones(true);
        const token = (await getToken()) || undefined;
        const response = await reservationService.getZones(selectedBranchId, token);
        setZones(response.zones || []);
      } catch (error) {
        console.error("Error loading zones:", error);
        setZones([]);
      } finally {
        setLoadingZones(false);
      }
    };

    loadZones();
  }, [getToken, selectedBranchId]);

  useEffect(() => {
    const loadReservations = async () => {
      if (!selectedBranchId) {
        setReservations([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }

      try {
        setLoadingReservations(true);
        const token = (await getToken()) || undefined;

        const response = await reservationService.getReservations(
          currentPage,
          10,
          {
            branchId: selectedBranchId,
            zoneId: selectedZoneId || undefined,
            date:
              dateMode === "TODAY" && !fromDate && !toDate
                ? selectedDate || undefined
                : undefined,
            fromDate:
              fromDate || toDate
                ? fromDate || undefined
                : dateMode === "UPCOMING"
                  ? selectedDate || undefined
                  : undefined,
            toDate: fromDate || toDate ? toDate || undefined : undefined,
            status:
              selectedStatus !== "all"
                ? (selectedStatus as ReservationStatus)
                : undefined,
            type:
              selectedType !== "all" ? (selectedType as ReservationType) : undefined,
          },
          token
        );

        const list = response?.data?.reservations || [];
        const pages = response?.data?.pagination?.pages || 1;
        const total = response?.data?.pagination?.total || 0;
        setReservations(list);
        setTotalPages(pages);
        setTotalCount(total);
      } catch (error) {
        console.error("Error loading reservations:", error);
        setReservations([]);
        setTotalPages(1);
        setTotalCount(0);
      } finally {
        setLoadingReservations(false);
      }
    };

    loadReservations();
  }, [
    currentPage,
    getToken,
    selectedBranchId,
    selectedDate,
    fromDate,
    toDate,
    dateMode,
    selectedStatus,
    selectedType,
    selectedZoneId,
  ]);

  const branchOptions: BranchOption[] = useMemo(() => {
    return (branches || []).map((b) => ({ value: b.id, label: b.name }));
  }, [branches]);

  const zoneOptions: ZoneOption[] = useMemo(() => {
    return (zones || []).map((z) => ({ value: z.id, label: z.name }));
  }, [zones]);

  const statusOptions: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: "all", label: t("admin.orderManagement.allStatus", { defaultValue: "All Status" }) },
      { value: "PENDING", label: "PENDING" },
      { value: "CONFIRMED", label: "CONFIRMED" },
      { value: "SEATED", label: "SEATED" },
      { value: "COMPLETED", label: "COMPLETED" },
      { value: "CANCELLED", label: "CANCELLED" },
      { value: "NO_SHOW", label: "NO_SHOW" },
    ],
    [t]
  );

  const handleViewReservation = async (reservation: Reservation) => {
    try {
      const token = (await getToken()) || undefined;
      if (token) {
        const fresh = await reservationService.getReservationById(reservation.id, token);
        setSelectedReservation(fresh);
      } else {
        setSelectedReservation(reservation);
      }
    } catch (error) {
      console.error("Error fetching reservation details:", error);
      setSelectedReservation(reservation);
    }
    setIsViewDialogOpen(true);
  };

  const runStatusUpdate = async (nextStatus: ReservationStatus) => {
    if (!selectedReservation) return;
    try {
      setIsActionLoading(selectedReservation.id);
      const token = (await getToken()) || undefined;
      const updated = await reservationService.updateReservationStatus(
        selectedReservation.id,
        nextStatus,
        token
      );
      setSelectedReservation(updated);
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      console.error("Error updating reservation status:", error);
      alert(
        t("admin.reservationManagement.actions.updateStatusFailed", {
          defaultValue: "Failed to update reservation status.",
        })
      );
    } finally {
      setIsActionLoading(null);
    }
  };

  const runCancelReservation = async () => {
    if (!selectedReservation) return;
    const reason = String(cancelReason || "").trim();
    if (!reason) {
      alert(
        t("admin.reservationManagement.cancel.reasonRequired", {
          defaultValue: "Please provide a reason for cancellation.",
        })
      );
      return;
    }

    try {
      setIsActionLoading(selectedReservation.id);
      const token = (await getToken()) || undefined;
      const updated = await reservationService.cancelReservation(
        selectedReservation.id,
        reason,
        token
      );
      setSelectedReservation(updated);
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setIsCancelDialogOpen(false);
      setCancelReason("");
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      alert(
        t("admin.reservationManagement.cancel.failed", {
          defaultValue: "Failed to cancel reservation.",
        })
      );
    } finally {
      setIsActionLoading(null);
    }
  };

  const typeOptions: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: "all", label: t("admin.orderManagement.filterAllTypes", { defaultValue: "All Types" }) },
      { value: "SIMPLE", label: "SIMPLE" },
      { value: "PRE_ORDER", label: "PRE_ORDER" },
    ],
    [t]
  );

  return (
    <div
      style={{
        minHeight: "calc(100vh - 72px)",
        padding: "24px",
        backgroundColor: "#f9fafb",
      }}
    >
      <style>{`
        .date-input-native-hidden {
          caret-color: transparent;
          -webkit-appearance: auto;
          appearance: auto;
        }
        .date-input-native-hidden::-webkit-datetime-edit,
        .date-input-native-hidden::-webkit-datetime-edit-fields-wrapper,
        .date-input-native-hidden::-webkit-datetime-edit-text,
        .date-input-native-hidden::-webkit-datetime-edit-month-field,
        .date-input-native-hidden::-webkit-datetime-edit-day-field,
        .date-input-native-hidden::-webkit-datetime-edit-year-field {
          color: transparent;
          -webkit-text-fill-color: transparent;
        }
        .date-input-native-hidden::-webkit-calendar-picker-indicator {
          opacity: 0;
          pointer-events: none;
        }
      `}</style>

      <div style={{ marginBottom: "16px" }}>
        <PageHeader
          title={t("admin.reservationManagement.title", { defaultValue: "Reservation Management" })}
          description={t("admin.reservationManagement.description", {
            defaultValue: "Manage reservations, update statuses, and assign tables.",
          })}
        />
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          maxWidth: "1100px",
        }}
      >
        <div
          className="reservation-filters-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#374151", marginBottom: "6px" }}>
              {t("admin.orderManagement.selectBranch", { defaultValue: "Select Branch" })}
            </label>
            <CustomDropdown
              value={selectedBranchId}
              onChange={(val) => {
                setSelectedBranchId(val);
                setCurrentPage(1);
              }}
              options={branchOptions}
              placeholder={
                loadingBranches
                  ? t("admin.orderManagement.loading", { defaultValue: "Loading..." })
                  : t("admin.orderManagement.selectBranch", { defaultValue: "Select Branch" })
              }
              disabled={loadingBranches}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#374151", marginBottom: "6px" }}>
              {t("admin.reservationManagement.filters.zone", { defaultValue: "Zone" })}
            </label>
            <CustomDropdown
              value={selectedZoneId}
              onChange={(val) => {
                setSelectedZoneId(val);
                setCurrentPage(1);
              }}
              options={[{ value: "", label: t("admin.orderManagement.filterAllTypes", { defaultValue: "All Types" }) }, ...zoneOptions]}
              placeholder={
                loadingZones
                  ? t("admin.orderManagement.loading", { defaultValue: "Loading..." })
                  : t("admin.reservationManagement.filters.zone", { defaultValue: "Zone" })
              }
              disabled={!selectedBranchId || loadingZones}
            />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label style={{ display: "block", fontSize: "13px", color: "#374151", marginBottom: "6px" }}>
              {t("admin.reservationManagement.filters.dateRange", { defaultValue: "Date Range" })}
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="date"
                  className="date-input-native-hidden"
                  ref={fromDateInputRef}
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDateMode("TODAY");
                    setCurrentPage(1);
                  }}
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
                    color: fromDate ? "#111827" : "#6b7280",
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
                    color: fromDate ? "#111827" : "#6b7280",
                    pointerEvents: "none",
                    backgroundColor: "#ffffff",
                    paddingRight: "8px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fromDate ? formatDateDDMMMYYYY(fromDate) : t("admin.reservationManagement.filters.startDate", { defaultValue: "Start Date" })}
                </div>
                <button
                  type="button"
                  onClick={() => openDatePicker(fromDateInputRef.current)}
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

              <span style={{ color: "#6b7280", fontSize: "14px", paddingBottom: "10px" }}>→</span>

              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="date"
                  className="date-input-native-hidden"
                  ref={toDateInputRef}
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setDateMode("TODAY");
                    setCurrentPage(1);
                  }}
                  onKeyDown={(e) => {
                    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                      e.stopPropagation();
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    paddingRight: "34px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    cursor: "pointer",
                    backgroundColor: "#ffffff",
                    color: toDate ? "#111827" : "#6b7280",
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
                    color: toDate ? "#111827" : "#6b7280",
                    pointerEvents: "none",
                    backgroundColor: "#ffffff",
                    paddingRight: "8px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {toDate ? formatDateDDMMMYYYY(toDate) : t("admin.reservationManagement.filters.endDate", { defaultValue: "End Date" })}
                </div>
                <button
                  type="button"
                  onClick={() => openDatePicker(toDateInputRef.current)}
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

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#374151", marginBottom: "6px" }}>
              {t("admin.orderManagement.status", { defaultValue: "Status" })}
            </label>
            <CustomDropdown
              value={selectedStatus}
              onChange={(val) => {
                setSelectedStatus(val);
                setCurrentPage(1);
              }}
              options={statusOptions}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#374151", marginBottom: "6px" }}>
              {t("admin.reservationManagement.filters.type", { defaultValue: "Type" })}
            </label>
            <CustomDropdown
              value={selectedType}
              onChange={(val) => {
                setSelectedType(val);
                setCurrentPage(1);
              }}
              options={typeOptions}
            />
          </div>
        </div>

        <style>{`
          @media (max-width: 1024px) {
            .reservation-filters-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }
        `}</style>

        <div style={{ marginTop: "20px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
          {!selectedBranchId ? (
            <div style={{ color: "#6b7280", fontSize: "14px" }}>
              {t("admin.reservationManagement.selectBranchToContinue", {
                defaultValue: "Select a branch to continue.",
              })}
            </div>
          ) : loadingReservations ? (
            <div style={{ color: "#6b7280", fontSize: "14px" }}>
              {t("admin.orderManagement.loading", { defaultValue: "Loading..." })}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#6b7280" }}>
                  {t("admin.reservationManagement.resultsCount", {
                    defaultValue: "Total",
                  })}: {totalCount}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setDateMode("TODAY");
                      setFromDate("");
                      setToDate("");
                      setSelectedDate(formatDateYYYYMMDD(today));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: dateMode === "TODAY" && !fromDate && !toDate ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                      backgroundColor: dateMode === "TODAY" && !fromDate && !toDate ? "#eff6ff" : "#ffffff",
                      color: "#111827",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {t("admin.reservationManagement.filters.today", { defaultValue: "Today" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setDateMode("UPCOMING");
                      setFromDate("");
                      setToDate("");
                      setSelectedDate(formatDateYYYYMMDD(today));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: dateMode === "UPCOMING" && !fromDate && !toDate ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
                      backgroundColor: dateMode === "UPCOMING" && !fromDate && !toDate ? "#f5f3ff" : "#ffffff",
                      color: "#111827",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {t("admin.reservationManagement.filters.upcoming", { defaultValue: "Upcoming" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: currentPage <= 1 ? "#f3f4f6" : "#ffffff",
                      cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("admin.orderManagement.previous", { defaultValue: "Previous" })}
                  </button>
                  <div style={{ fontSize: "13px", color: "#374151" }}>
                    {currentPage} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: currentPage >= totalPages ? "#f3f4f6" : "#ffffff",
                      cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("admin.orderManagement.next", { defaultValue: "Next" })}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                {reservations.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", color: "#6b7280", fontSize: "14px" }}>
                    {t("admin.reservationManagement.empty", {
                      defaultValue: "No reservations found for the selected filters.",
                    })}
                  </div>
                ) : (
                  reservations.map((res) => (
                    <div
                      key={res.id}
                      onClick={() => handleViewReservation(res)}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "12px",
                        backgroundColor: res.type === "PRE_ORDER" ? "#faf5ff" : "#ffffff",
                        borderColor: res.type === "PRE_ORDER" ? "#d8b4fe" : "#e5e7eb",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ fontWeight: 700, color: "#111827" }}>{res.reservationNumber}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ fontSize: "12px", color: "#6b7280" }}>{res.status}</div>

                          {res.type === "PRE_ORDER" ? (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "999px",
                                border: "1px solid #d8b4fe",
                                backgroundColor: "#f3e8ff",
                                color: "#7e22ce",
                              }}
                            >
                              Pre-Order
                            </span>
                          ) : null}

                          {res.status !== "COMPLETED" ? (
                            <button
                              ref={(el) => {
                                buttonRefs.current[res.id] = el;
                              }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isActionLoading) return;
                                setShowDropdownMenu((prev) => (prev === res.id ? null : res.id));
                              }}
                              style={{
                                padding: "6px",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                                backgroundColor: "#ffffff",
                                cursor: isActionLoading ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <MoreVertical style={{ width: "16px", height: "16px", color: "#6b7280" }} />
                            </button>
                          ) : null}

                          {showDropdownMenu === res.id && res.status !== "COMPLETED" && (
                            <div
                              ref={(el) => {
                                dropdownRefs.current[res.id] = el;
                              }}
                              style={{
                                position: "fixed",
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "10px",
                                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                                zIndex: 1000,
                                minWidth: "200px",
                                padding: "6px",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDropdownMenu(null);
                                  handleViewReservation(res);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 10px",
                                  textAlign: "left",
                                  border: "none",
                                  backgroundColor: "transparent",
                                  cursor: "pointer",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget.style.backgroundColor = "#f9fafb");
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget.style.backgroundColor = "transparent");
                                }}
                              >
                                {t("admin.orderManagement.viewDetails", { defaultValue: "View" })}
                              </button>

                              {res.status === "PENDING" && canConfirmReservation && (
                                <button
                                  type="button"
                                  disabled={isActionLoading !== null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdownMenu(null);
                                    runStatusUpdateById(res.id, "CONFIRMED");
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "10px 10px",
                                    textAlign: "left",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: isActionLoading ? "not-allowed" : "pointer",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isActionLoading) e.currentTarget.style.backgroundColor = "#f9fafb";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  {t("admin.reservationManagement.actions.confirm", { defaultValue: "Confirm" })}
                                </button>
                              )}

                              {res.status === "CONFIRMED" && canSeatReservation && (
                                <button
                                  type="button"
                                  disabled={isActionLoading !== null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdownMenu(null);
                                    runStatusUpdateById(res.id, "SEATED");
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "10px 10px",
                                    textAlign: "left",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: isActionLoading ? "not-allowed" : "pointer",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isActionLoading) e.currentTarget.style.backgroundColor = "#f9fafb";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  {t("admin.reservationManagement.actions.markAsSeated", {
                                    defaultValue: "Mark as Seated",
                                  })}
                                </button>
                              )}

                              {res.status === "SEATED" && canCompleteReservation && (
                                <button
                                  type="button"
                                  disabled={isActionLoading !== null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdownMenu(null);
                                    runStatusUpdateById(res.id, "COMPLETED");
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "10px 10px",
                                    textAlign: "left",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: isActionLoading ? "not-allowed" : "pointer",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isActionLoading) e.currentTarget.style.backgroundColor = "#f9fafb";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  {t("admin.reservationManagement.actions.markAsCompleted", {
                                    defaultValue: "Mark as Completed",
                                  })}
                                </button>
                              )}

                              {res.status !== "CANCELLED" &&
                                res.status !== "NO_SHOW" &&
                                ["PENDING", "CONFIRMED"].includes(res.status) &&
                                canCancelReservation && (
                                  <button
                                    type="button"
                                    disabled={isActionLoading !== null}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDropdownMenu(null);
                                      setSelectedReservation(res);
                                      setIsCancelDialogOpen(true);
                                      setCancelReason("");
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 10px",
                                      textAlign: "left",
                                      border: "none",
                                      backgroundColor: "transparent",
                                      cursor: isActionLoading ? "not-allowed" : "pointer",
                                      borderRadius: "8px",
                                      fontSize: "13px",
                                      color: "#b91c1c",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActionLoading) e.currentTarget.style.backgroundColor = "#fff1f2";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    {t("admin.reservationManagement.actions.cancel", { defaultValue: "Cancel" })}
                                  </button>
                                )}

                              {res.status !== "CANCELLED" &&
                                res.status !== "NO_SHOW" &&
                                canUpdateReservation && (
                                  <button
                                    type="button"
                                    disabled={isActionLoading !== null}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDropdownMenu(null);
                                      runStatusUpdateById(res.id, "NO_SHOW");
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 10px",
                                      textAlign: "left",
                                      border: "none",
                                      backgroundColor: "transparent",
                                      cursor: isActionLoading ? "not-allowed" : "pointer",
                                      borderRadius: "8px",
                                      fontSize: "13px",
                                      color: "#b91c1c",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActionLoading) e.currentTarget.style.backgroundColor = "#fff1f2";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    {t("admin.reservationManagement.actions.noShow", { defaultValue: "No-Show" })}
                                  </button>
                                )}

                              <button
                                type="button"
                                disabled={!canViewReservationHistory || isActionLoading !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDropdownMenu(null);
                                  setSelectedReservation(res);
                                  openHistoryDialog();
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 10px",
                                  textAlign: "left",
                                  border: "none",
                                  backgroundColor: "transparent",
                                  cursor: !canViewReservationHistory || isActionLoading ? "not-allowed" : "pointer",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                  opacity: !canViewReservationHistory ? 0.6 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (canViewReservationHistory && !isActionLoading) e.currentTarget.style.backgroundColor = "#f9fafb";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              >
                                {t("admin.reservationManagement.actions.viewHistory", { defaultValue: "View History" })}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: "8px", fontSize: "13px", color: "#111827" }}>
                        {res.customerName}
                      </div>
                      {(() => {
                        const d = new Date(res.reservationDate);
                        const today = new Date();
                        const isToday =
                          d.getFullYear() === today.getFullYear() &&
                          d.getMonth() === today.getMonth() &&
                          d.getDate() === today.getDate();
                        const timeText = Number.isNaN(d.getTime())
                          ? ""
                          : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        return (
                          <div
                            style={{
                              marginTop: "6px",
                              fontSize: "12px",
                              color: isToday ? "#2563eb" : "#6b7280",
                              fontWeight: isToday ? 700 : 500,
                            }}
                          >
                            {formatDateDDMMMYYYY(d)}{timeText ? `, ${timeText}` : ""}
                          </div>
                        );
                      })()}
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#6b7280" }}>
                        {t("admin.reservationManagement.guests", { defaultValue: "Guests" })}: {res.numberOfGuests}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isViewDialogOpen && selectedReservation && (
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
          onClick={() => {
            setIsViewDialogOpen(false);
            setIsCancelDialogOpen(false);
            setIsHistoryDialogOpen(false);
            setReservationHistory([]);
            setCancelReason("");
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "820px",
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                  {t("admin.reservationManagement.detailsTitle", {
                    defaultValue: "Reservation Details",
                  })}
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                  {selectedReservation.reservationNumber}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid #93c5fd",
                    color: "#1e3a8a",
                    backgroundColor: "#eff6ff",
                  }}
                >
                  {selectedReservation.status}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    color: "#111827",
                    backgroundColor: "#f9fafb",
                  }}
                >
                  {selectedReservation.type === "PRE_ORDER" ? "Pre-Order" : selectedReservation.type}
                </span>

                <button
                  type="button"
                  onClick={openHistoryDialog}
                  disabled={!canViewReservationHistory || isActionLoading !== null}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: !canViewReservationHistory ? "#f3f4f6" : "#ffffff",
                    cursor: !canViewReservationHistory ? "not-allowed" : "pointer",
                    color: "#111827",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {t("admin.reservationManagement.actions.viewHistory", {
                    defaultValue: "View History",
                  })}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    setIsCancelDialogOpen(false);
                    setIsHistoryDialogOpen(false);
                    setReservationHistory([]);
                    setCancelReason("");
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontSize: "18px",
                    cursor: "pointer",
                    color: "#6b7280",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: "18px" }}>
              {(() => {
                const reservationDate = new Date(selectedReservation.reservationDate);
                const dateText = formatDateDDMMMYYYY(reservationDate);
                const timeText = reservationDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                const tableFromLegacy = selectedReservation.table
                  ? `${selectedReservation.table.tableNumber} (${selectedReservation.table.capacity})`
                  : null;
                const tablesFromJoin = Array.isArray(selectedReservation.tables) && selectedReservation.tables.length > 0
                  ? selectedReservation.tables
                      .map((t) => `${t.table.tableNumber} (${t.table.capacity})`)
                      .join(", ")
                  : null;
                const tableText = tableFromLegacy || tablesFromJoin || "-";

                const zoneText =
                  selectedReservation.zone?.name ||
                  selectedReservation.table?.zoneRelation?.name ||
                  (Array.isArray(selectedReservation.tables) && selectedReservation.tables[0]?.table?.zoneRelation?.name) ||
                  "-";

                const branchText = selectedReservation.branch?.name || "-";

                const rowStyle: React.CSSProperties = {
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 100px 1fr 100px 1fr",
                  gap: "10px",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                };

                const row2Style: React.CSSProperties = {
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 100px 1fr 100px 1fr",
                  gap: "10px",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  marginTop: "10px",
                };

                const labelStyle: React.CSSProperties = { fontSize: "12px", color: "#6b7280" };
                const valueStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 600, color: "#111827" };

                const order = selectedReservation.reservationOrder;
                const totalAmount = Number(order?.totalAmount || 0);
                const taxAmount = Number(order?.taxAmount || 0);
                const itemTaxAmount = Number(order?.itemTaxAmount || 0);
                const addonTaxAmount = Number(order?.addonTaxAmount || 0);
                const paidAmount = Number(order?.paidAmount || 0);
                const depositPct = order?.depositPercentage !== undefined && order?.depositPercentage !== null
                  ? Number(order.depositPercentage)
                  : null;
                const remaining = Math.max(0, totalAmount - paidAmount);

                const selectedBranchTaxInclusive = (() => {
                  const b = branches.find((x) => x.id === selectedReservation.branch?.id);
                  return b?.taxInclusive;
                })();

                const isTaxInclusive = Boolean(selectedBranchTaxInclusive);

                const items = order?.items || [];

                return (
                  <>
                    <div style={rowStyle}>
                      <div style={labelStyle}>Date:</div>
                      <div style={valueStyle}>{dateText} / {timeText}</div>
                      <div style={labelStyle}>Time:</div>
                      <div style={valueStyle}>{timeText}</div>
                      <div style={labelStyle}>Guests:</div>
                      <div style={valueStyle}>{selectedReservation.numberOfGuests}</div>

                      <div style={labelStyle}>Table:</div>
                      <div style={valueStyle}>{tableText}</div>
                      <div style={labelStyle}>Zone:</div>
                      <div style={valueStyle}>{zoneText}</div>
                      <div style={labelStyle}>Branch:</div>
                      <div style={valueStyle}>{branchText}</div>
                    </div>

                    <div style={row2Style}>
                      <div style={labelStyle}>Name:</div>
                      <div style={valueStyle}>{selectedReservation.customerName}</div>
                      <div style={labelStyle}>Email:</div>
                      <div style={valueStyle}>{selectedReservation.customerEmail}</div>
                      <div style={labelStyle}>Phone:</div>
                      <div style={valueStyle}>{selectedReservation.customerPhone}</div>
                    </div>

                    {selectedReservation.type === "PRE_ORDER" && order && (
                      <>
                        <div style={{ marginTop: "18px", fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                          Order Items
                        </div>

                        <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                          {items.map((item, idx) => {
                            const imageUrl = getMealImageUrl(item.meal?.image);
                            const mealName = item.meal?.name || t("admin.reservationManagement.details.meal", { defaultValue: "Meal" });
                            const lineTotal = Number(item.totalPrice || 0);
                            const addons = Array.isArray(item.addons) ? item.addons : [];
                            const optionalIngredients = Array.isArray(item.optionalIngredients)
                              ? item.optionalIngredients
                              : [];
                            const includedIngredients = optionalIngredients.filter((ing) => ing?.isIncluded);
                            return (
                              <div
                                key={item.id || idx}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "12px",
                                  padding: "12px",
                                  backgroundColor: "#ffffff",
                                  display: "grid",
                                  gap: "10px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                                    <div
                                      style={{
                                        width: "54px",
                                        height: "54px",
                                        borderRadius: "10px",
                                        overflow: "hidden",
                                        backgroundColor: "#f3f4f6",
                                        border: "1px solid #e5e7eb",
                                        flexShrink: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: 700,
                                        color: "#111827",
                                      }}
                                    >
                                      {imageUrl ? (
                                        <img
                                          src={imageUrl}
                                          alt={mealName}
                                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                          onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <span>{mealName.charAt(0).toUpperCase()}</span>
                                      )}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {mealName}
                                      </div>
                                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                                        {item.selectedSize || ""}{item.selectedSize ? " × " : ""}{item.quantity}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#db2777", flexShrink: 0 }}>
                                    {formatPrice(lineTotal, displayCurrency)}
                                  </div>
                                </div>

                                {addons.length > 0 && (
                                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px", display: "grid", gap: "6px" }}>
                                    {addons.map((addOn: any) => {
                                      const addonUnitPrice = Number(addOn?.addOnPrice || 0);
                                      const addonQty = Number(addOn?.quantity || 1);
                                      const addonTotal = addonUnitPrice * addonQty;
                                      const addonName =
                                        addOn?.addOnName ||
                                        addOn?.addon?.name ||
                                        t("admin.reservationManagement.details.addon", { defaultValue: "Addon" });
                                      return (
                                        <div
                                          key={addOn?.id || `${addonName}-${addonTotal}`}
                                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}
                                        >
                                          <span style={{ color: "#111827" }}>
                                            {addonName}
                                            {addonQty > 1 ? (
                                              <span style={{ color: "#6b7280" }}> ×{addonQty}</span>
                                            ) : null}
                                          </span>
                                          <span style={{ color: "#111827", fontWeight: 600 }}>
                                            {formatPrice(addonTotal, displayCurrency)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {includedIngredients.length > 0 && (
                                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {includedIngredients.map((ing: any) => (
                                      <span
                                        key={ing.id}
                                        style={{
                                          fontSize: "11px",
                                          padding: "4px 8px",
                                          borderRadius: "999px",
                                          backgroundColor: "#dcfce7",
                                          color: "#166534",
                                          border: "1px solid #86efac",
                                        }}
                                      >
                                        {ing.ingredientName}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {item.specialInstructions ? (
                                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
                                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                      {t("admin.reservationManagement.details.specialInstructions", {
                                        defaultValue: "Special Instructions",
                                      })}
                                    </div>
                                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#111827" }}>
                                      {item.specialInstructions}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            marginTop: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "14px",
                            backgroundColor: "#f9fafb",
                            padding: "14px",
                          }}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827", marginBottom: "12px" }}>
                            Order Summary
                          </div>

                          <div style={{ display: "grid", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>
                                {isTaxInclusive
                                  ? t("admin.reservationManagement.details.subtotalInclTax", {
                                      defaultValue: "Subtotal (incl. tax)",
                                    })
                                  : t("admin.reservationManagement.details.subtotal", {
                                      defaultValue: "Subtotal",
                                    })}
                              </span>
                              <span style={{ color: "#111827", fontSize: "13px", fontWeight: 600 }}>
                                {formatPrice(isTaxInclusive ? totalAmount : totalAmount - taxAmount, displayCurrency)}
                              </span>
                            </div>

                            {isTaxInclusive && taxAmount > 0 && (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ color: "#6b7280", fontSize: "13px" }}>
                                  {t("admin.reservationManagement.details.subtotalExclTax", {
                                    defaultValue: "Subtotal (excl. tax)",
                                  })}
                                </span>
                                <span style={{ color: "#111827", fontSize: "13px", fontWeight: 600 }}>
                                  {formatPrice(totalAmount - taxAmount, displayCurrency)}
                                </span>
                              </div>
                            )}

                            {taxAmount > 0 && (
                              <>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <span style={{ color: "#6b7280", fontSize: "13px" }}>
                                    {isTaxInclusive
                                      ? t("admin.reservationManagement.details.includedTax", {
                                          defaultValue: "Included Tax",
                                        })
                                      : t("admin.reservationManagement.details.tax", {
                                          defaultValue: "Tax",
                                        })}
                                  </span>
                                  <span style={{ color: "#111827", fontSize: "13px", fontWeight: 600 }}>
                                    {formatPrice(taxAmount, displayCurrency)}
                                  </span>
                                </div>

                                {(itemTaxAmount > 0 || addonTaxAmount > 0) && (
                                  <div style={{ marginLeft: "12px", display: "grid", gap: "6px" }}>
                                    {itemTaxAmount > 0 && (
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                                        <span style={{ color: "#6b7280" }}>
                                          {isTaxInclusive
                                            ? t("admin.reservationManagement.details.includedItemTax", {
                                                defaultValue: "Included item tax",
                                              })
                                            : t("admin.reservationManagement.details.itemTax", {
                                                defaultValue: "Item tax",
                                              })}
                                        </span>
                                        <span style={{ color: "#111827" }}>{formatPrice(itemTaxAmount, displayCurrency)}</span>
                                      </div>
                                    )}
                                    {addonTaxAmount > 0 && (
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                                        <span style={{ color: "#6b7280" }}>
                                          {isTaxInclusive
                                            ? t("admin.reservationManagement.details.includedAddonTax", {
                                                defaultValue: "Included addon tax",
                                              })
                                            : t("admin.reservationManagement.details.addonTax", {
                                                defaultValue: "Addon tax",
                                              })}
                                        </span>
                                        <span style={{ color: "#111827" }}>{formatPrice(addonTaxAmount, displayCurrency)}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>Total:</span>
                              <span style={{ color: "#db2777", fontSize: "16px", fontWeight: 800 }}>
                                {formatPrice(totalAmount, displayCurrency)}
                              </span>
                            </div>

                            <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "6px 0" }} />

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>Paid Amount:</span>
                              <span style={{ color: "#16a34a", fontSize: "14px", fontWeight: 800 }}>
                                {formatPrice(paidAmount, displayCurrency)}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>Deposit:</span>
                              <span style={{ color: "#6b7280", fontSize: "13px", fontWeight: 600 }}>
                                {depositPct !== null && !Number.isNaN(depositPct) ? `${depositPct}%` : "-"}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>Remaining Balance:</span>
                              <span style={{ color: "#f59e0b", fontSize: "14px", fontWeight: 800 }}>
                                {formatPrice(remaining, displayCurrency)}
                              </span>
                            </div>

                            {selectedReservation.status !== "COMPLETED" ? (
                              <button
                                type="button"
                                onClick={runCompletePayment}
                                disabled={
                                  !canUpdateReservation ||
                                  isActionLoading !== null ||
                                  remaining <= 0 ||
                                  selectedReservation.status === "CANCELLED"
                                }
                                style={{
                                  marginTop: "10px",
                                  width: "100%",
                                  padding: "12px",
                                  borderRadius: "10px",
                                  border: "1px solid #16a34a",
                                  backgroundColor:
                                    !canUpdateReservation || remaining <= 0 || selectedReservation.status === "CANCELLED"
                                      ? "#86efac"
                                      : "#16a34a",
                                  color: "#ffffff",
                                  fontWeight: 800,
                                  cursor:
                                    !canUpdateReservation || remaining <= 0 || selectedReservation.status === "CANCELLED"
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                              >
                                Payment completed
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}

              {selectedReservation.status !== "CANCELLED" &&
                selectedReservation.status !== "COMPLETED" && (
                <div
                  style={{
                    marginTop: "18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => runStatusUpdate("CONFIRMED")}
                      disabled={
                        !canConfirmReservation ||
                        isActionLoading !== null ||
                        selectedReservation.status === "CONFIRMED"
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: selectedReservation.status === "CONFIRMED" ? "1px solid #1d4ed8" : "1px solid #e5e7eb",
                        backgroundColor: selectedReservation.status === "CONFIRMED" ? "#eff6ff" : !canConfirmReservation ? "#f3f4f6" : "#ffffff",
                        color: selectedReservation.status === "CONFIRMED" ? "#1d4ed8" : "#111827",
                        fontWeight: selectedReservation.status === "CONFIRMED" ? 800 : 600,
                        cursor: !canConfirmReservation ? "not-allowed" : "pointer",
                      }}
                    >
                      {t("admin.reservationManagement.actions.confirm", {
                        defaultValue: "Confirm",
                      })}
                    </button>

                    <button
                      type="button"
                      onClick={() => runStatusUpdate("SEATED")}
                      disabled={
                        !canSeatReservation ||
                        isActionLoading !== null ||
                        selectedReservation.status === "SEATED"
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: selectedReservation.status === "SEATED" ? "1px solid #0f766e" : "1px solid #e5e7eb",
                        backgroundColor: selectedReservation.status === "SEATED" ? "#ecfeff" : !canSeatReservation ? "#f3f4f6" : "#ffffff",
                        color: selectedReservation.status === "SEATED" ? "#0f766e" : "#111827",
                        fontWeight: selectedReservation.status === "SEATED" ? 800 : 600,
                        cursor: !canSeatReservation ? "not-allowed" : "pointer",
                      }}
                    >
                      {t("admin.reservationManagement.actions.seat", {
                        defaultValue: "Seat",
                      })}
                    </button>

                    <button
                      type="button"
                      onClick={() => runStatusUpdate("COMPLETED")}
                      disabled={
                        !canCompleteReservation ||
                        isActionLoading !== null
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        backgroundColor: !canCompleteReservation ? "#f3f4f6" : "#ffffff",
                        color: "#111827",
                        fontWeight: 600,
                        cursor: !canCompleteReservation ? "not-allowed" : "pointer",
                      }}
                    >
                      {t("admin.reservationManagement.actions.complete", {
                        defaultValue: "Complete",
                      })}
                    </button>

                    <button
                      type="button"
                      onClick={() => runStatusUpdate("NO_SHOW")}
                      disabled={
                        !canUpdateReservation ||
                        isActionLoading !== null ||
                        selectedReservation.status === "NO_SHOW"
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: selectedReservation.status === "NO_SHOW" ? "1px solid #ef4444" : "1px solid #e5e7eb",
                        backgroundColor: selectedReservation.status === "NO_SHOW" ? "#fef2f2" : !canUpdateReservation ? "#f3f4f6" : "#ffffff",
                        color: selectedReservation.status === "NO_SHOW" ? "#b91c1c" : "#111827",
                        fontWeight: selectedReservation.status === "NO_SHOW" ? 800 : 600,
                        cursor: !canUpdateReservation ? "not-allowed" : "pointer",
                      }}
                    >
                      {t("admin.reservationManagement.actions.noShow", {
                        defaultValue: "No-Show",
                      })}
                    </button>
                  </div>

                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setIsCancelDialogOpen(true)}
                      disabled={!canCancelReservation || isActionLoading !== null}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ef4444",
                        backgroundColor: !canCancelReservation ? "#f3f4f6" : "#fff1f2",
                        color: "#b91c1c",
                        cursor: !canCancelReservation ? "not-allowed" : "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {t("admin.reservationManagement.actions.cancel", {
                        defaultValue: "Cancel",
                      })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedReservation && isHistoryDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "24px",
          }}
          onClick={() => {
            setIsHistoryDialogOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "720px",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
              padding: "18px",
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                {t("admin.reservationManagement.history.title", {
                  defaultValue: "Reservation History",
                })}
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryDialogOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: "6px", fontSize: "12px", color: "#6b7280" }}>
              {t("admin.reservationManagement.history.description", {
                reservationNumber: selectedReservation.reservationNumber,
                defaultValue: `Reservation: ${selectedReservation.reservationNumber}`,
              })}
            </div>

            <div style={{ marginTop: "12px" }}>
              {loadingHistory ? (
                <div style={{ color: "#6b7280", fontSize: "14px" }}>
                  {t("admin.orderManagement.loading", { defaultValue: "Loading..." })}
                </div>
              ) : reservationHistory.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: "14px" }}>
                  {t("admin.reservationManagement.history.empty", {
                    defaultValue: "No history available.",
                  })}
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: "18px" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "7px",
                      top: 0,
                      bottom: 0,
                      width: "2px",
                      background:
                        "linear-gradient(to bottom, rgba(236,72,153,0.35), rgba(139,92,246,0.35), rgba(59,130,246,0.35))",
                    }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
                    {reservationHistory.map((entry, idx) => {
                      const date = new Date(entry.timestamp);
                      const formattedDate = formatDateDDMMMYYYY(date);
                      const formattedTime = date.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      const getEventConfig = () => {
                        switch (entry.type) {
                          case "RESERVATION_CREATED":
                            return { icon: <Calendar size={16} color="#ffffff" />, bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" };
                          case "RESERVATION_CONFIRMED":
                            return { icon: <CheckCircle2 size={16} color="#ffffff" />, bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" };
                          case "CUSTOMER_SEATED":
                            return { icon: <ChefHat size={16} color="#ffffff" />, bg: "#fff7ed", border: "#fed7aa", dot: "#f97316" };
                          case "RESERVATION_COMPLETED":
                            return { icon: <CheckCircle2 size={16} color="#ffffff" />, bg: "#ecfdf5", border: "#a7f3d0", dot: "#059669" };
                          case "RESERVATION_CANCELLED":
                          case "NO_SHOW":
                            return { icon: <XCircle size={16} color="#ffffff" />, bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" };
                          case "TABLE_ASSIGNED":
                          case "TABLES_ASSIGNED":
                            return { icon: <MapPin size={16} color="#ffffff" />, bg: "#faf5ff", border: "#e9d5ff", dot: "#a855f7" };
                          case "PAYMENT_PROCESSED":
                          case "PAYMENT_ADDED":
                            return { icon: <DollarSign size={16} color="#ffffff" />, bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" };
                          default:
                            return { icon: <Clock size={16} color="#ffffff" />, bg: "#f9fafb", border: "#e5e7eb", dot: "#6b7280" };
                        }
                      };

                      const cfg = getEventConfig();
                      const details = entry.details || {};

                      const detailRow = (label: string, value: React.ReactNode) => {
                        if (value === null || value === undefined || value === "") return null;
                        return (
                          <div style={{ display: "flex", gap: "10px", fontSize: "12px", lineHeight: 1.3 }}>
                            <div style={{ width: "110px", color: "#111827", fontWeight: 600 }}>{label}</div>
                            <div style={{ color: "#6b7280", flex: 1, overflowWrap: "anywhere" }}>{value}</div>
                          </div>
                        );
                      };

                      return (
                        <div key={`${entry.timestamp}-${idx}`} style={{ position: "relative", paddingLeft: "18px" }}>
                          <div
                            style={{
                              position: "absolute",
                              left: "-11px",
                              top: "14px",
                              width: "22px",
                              height: "22px",
                              borderRadius: "999px",
                              backgroundColor: cfg.dot,
                              border: "2px solid #ffffff",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                            }}
                          />

                          <div
                            style={{
                              border: `2px solid ${cfg.border}`,
                              backgroundColor: cfg.bg,
                              borderRadius: "12px",
                              padding: "12px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div
                                  style={{
                                    width: "30px",
                                    height: "30px",
                                    borderRadius: "10px",
                                    backgroundColor: cfg.dot,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {cfg.icon}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                                    {entry.action}
                                  </div>
                                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Clock size={14} />
                                    <span>
                                      {formattedDate} {t("admin.reservationManagement.at", { defaultValue: "at" })} {formattedTime}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  border: `1px solid ${cfg.border}`,
                                  color: "#111827",
                                  backgroundColor: "rgba(255,255,255,0.65)",
                                  flexShrink: 0,
                                }}
                              >
                                {t(
                                  `admin.reservationManagement.history.eventTypes.${entry.type}`,
                                  (entry.type || "").replace(/_/g, " ")
                                )}
                              </span>
                            </div>

                            {entry.details ? (
                              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: "6px" }}>
                                {detailRow(
                                  t("admin.reservationManagement.history.reservation", { defaultValue: "Reservation" }),
                                  details.reservationNumber
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.table", { defaultValue: "Table" }),
                                  details.tableNumber
                                    ? `${details.tableNumber}${details.capacity ? ` (${details.capacity} ${t("admin.reservationManagement.history.seats", { defaultValue: "seats" })})` : ""}${details.zone ? ` - ${details.zone}` : ""}`
                                    : null
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.tables", { defaultValue: "Tables" }),
                                  Array.isArray(details.tables)
                                    ? details.tables
                                        .map((t: any) => `${t.tableNumber} (${t.capacity}${t.zone ? `, ${t.zone}` : ""})`)
                                        .join(", ")
                                    : null
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.guests", { defaultValue: "Guests" }),
                                  details.numberOfGuests
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.reason", { defaultValue: "Reason" }),
                                  details.reason
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.type", { defaultValue: "Type" }),
                                  details.type
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.amount", { defaultValue: "Amount" }),
                                  details.amount !== undefined || details.refundAmount !== undefined
                                    ? `${(details.refundAmount !== undefined ? details.refundAmount : details.amount)} ${details.currency || ""}`.trim()
                                    : null
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.paymentId", { defaultValue: "Payment ID" }),
                                  details.paymentIntentId
                                )}

                                {detailRow(
                                  t("admin.reservationManagement.history.incrementalPaymentId", { defaultValue: "Incremental Payment ID" }),
                                  details.incrementalPaymentIntentId
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedReservation && isCancelDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "24px",
          }}
          onClick={() => {
            setIsCancelDialogOpen(false);
            setCancelReason("");
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
              {t("admin.reservationManagement.cancel.title", {
                defaultValue: "Cancel Reservation",
              })}
            </div>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.reservationManagement.cancel.description", {
                defaultValue: "Please provide a reason for cancellation.",
              })}
            </div>

            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "14px",
                resize: "vertical",
              }}
            />

            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsCancelDialogOpen(false);
                  setCancelReason("");
                }}
                disabled={isActionLoading !== null}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: isActionLoading !== null ? "not-allowed" : "pointer",
                }}
              >
                {t("admin.orderManagement.deleteOrderCancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                onClick={runCancelReservation}
                disabled={isActionLoading !== null}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ef4444",
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  cursor: isActionLoading !== null ? "not-allowed" : "pointer",
                }}
              >
                {t("admin.reservationManagement.actions.confirmCancel", {
                  defaultValue: "Confirm Cancellation",
                })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationsManagement;
