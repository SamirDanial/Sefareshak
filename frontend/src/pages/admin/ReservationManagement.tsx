import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import { mdiMagnify, mdiDotsVertical, mdiEye, mdiCheckCircle, mdiCloseCircle, mdiAccount, mdiCalendar, mdiClock, mdiAccountGroup, mdiPhone, mdiMapMarker, mdiRefresh, mdiCreditCard, mdiChevronLeft, mdiChevronRight, mdiCurrencyUsd, mdiOfficeBuilding, mdiChefHat, mdiHistory } from "@mdi/js";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
  type ReservationType,
} from "@/services/reservationService";
import { notificationService } from "@/services/notificationService";
import SocketService from "@/services/socketService";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useSettings } from "@/contexts/SettingsContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import branchService, { type Branch } from "@/services/branchService";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const ReservationManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { currency, settings } = useSettings();
  const { assignedBranchIds, canAny } = usePermissions();

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [openReservationMenuId, setOpenReservationMenuId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [allZonesForFilter, setAllZonesForFilter] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [assignTableDialogOpen, setAssignTableDialogOpen] = useState(false);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [assignedTables, setAssignedTables] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<string | null>(null);
  const [isAssignConfirmationOpen, setIsAssignConfirmationOpen] = useState(false);
  const [tableToAssign, setTableToAssign] = useState<{ id: string; reservationNumber: string } | null>(null);
  const [capacityAction, setCapacityAction] = useState<"proceed" | "contact" | "wait" | "override" | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [loadingTables, setLoadingTables] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [reservationHistory, setReservationHistory] = useState<Array<{
    type: string;
    action: string;
    timestamp: string;
    details?: any;
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Determine if tax is inclusive based on selected branch or settings
  // Branch setting takes precedence over global settings
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const displayCurrency = useMemo(() => {
    const branchCurrency = (selectedBranch as any)?.currency;
    return (
      (typeof branchCurrency === "string" && branchCurrency.trim()) ||
      (typeof (settings as any)?.currency === "string" &&
        String((settings as any).currency).trim()) ||
      (typeof currency === "string" && currency.trim()) ||
      "USD"
    );
  }, [currency, selectedBranch, settings]);

  const isTaxInclusive =
    selectedBranch?.taxInclusive !== null && selectedBranch?.taxInclusive !== undefined
      ? selectedBranch.taxInclusive
      : settings?.taxInclusive ?? false;

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
  }, [getToken]);

  // Auto-select the only branch if there is exactly one (and nothing else already selected)
  useEffect(() => {
    const branchIdFromUrl = searchParams.get("branchId");
    const highlightReservationId = searchParams.get("highlightReservation");

    if (selectedBranchId) return;
    if (branchIdFromUrl) return;
    if (highlightReservationId) return;
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
  }, [branches, selectedBranchId, searchParams, assignedBranchIds]);

  // Fetch zones when branch changes
  const fetchAllZonesForFilter = async (branchId?: string) => {
    try {
      if (!branchId) {
        setAllZonesForFilter([]);
        return;
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAllZonesForFilter(response.zones.map((zone) => ({ id: zone.id, name: zone.name })));
    } catch (error) {
      console.error("Error fetching zones for filter:", error);
      setAllZonesForFilter([]);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      fetchAllZonesForFilter(selectedBranchId);
      setSelectedZoneId(""); // Reset zone filter when branch changes
    } else {
      setAllZonesForFilter([]);
      setSelectedZoneId("");
    }
  }, [selectedBranchId, getToken]);

  // Default to today's range when selecting a branch (unless a range or single date is already set)
  useEffect(() => {
    if (!selectedBranchId) return;
    if (startDate || endDate) return;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    setStartDate(start);
    setEndDate(end);
  }, [selectedBranchId, startDate, endDate]);

  useEffect(() => {
    loadReservations();
  }, [currentPage, selectedStatus, selectedType, startDate, endDate, selectedBranchId, selectedZoneId]);

  // Handle branchId from URL - separate effect to watch for URL changes
  useEffect(() => {
    const branchIdFromUrl = searchParams.get("branchId");
    if (branchIdFromUrl && branches.length > 0) {
      const branchExists = branches.some(b => b.id === branchIdFromUrl);
      if (branchExists) {
        setSelectedBranchId(branchIdFromUrl);
        // Remove branchId from URL after setting it (but keep it for a moment to ensure it's processed)
        setTimeout(() => {
          setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("branchId");
            return newParams;
          });
        }, 100);
      } else {
        console.warn("[ReservationManagement] Branch from URL not found:", branchIdFromUrl);
      }
    }
  }, [searchParams, branches, setSearchParams]);

  // Extract branch from highlighted reservation if no branchId is in URL
  useEffect(() => {
    const extractBranchFromHighlightedReservation = async () => {
      const highlightReservationId = searchParams.get("highlightReservation");
      const branchIdFromUrl = searchParams.get("branchId");
      
      // If highlightReservation is present, no branchId in URL, and branches are loaded
      if (highlightReservationId && !branchIdFromUrl && branches.length > 0 && !selectedBranchId) {
        try {
          const token = await getToken();
          if (token) {
            const reservation = await reservationService.getReservationById(highlightReservationId, token);
            const reservationBranchId = reservation.branch?.id || (reservation as any).branchId;
            
            if (reservationBranchId) {
              const branchExists = branches.some(b => b.id === reservationBranchId);
              if (branchExists) {
                setSelectedBranchId(reservationBranchId);
              }
            }
          }
        } catch (error) {
          console.error("[ReservationManagement] Error fetching highlighted reservation to extract branch:", error);
        }
      }
    };

    extractBranchFromHighlightedReservation();
  }, [searchParams, branches, selectedBranchId, getToken]);

  // Handle highlightReservation query parameter (from notification click)
  useEffect(() => {
    const highlightReservationId = searchParams.get("highlightReservation");
    // Only highlight if branch is selected and reservations are loaded
    if (highlightReservationId && selectedBranchId && !loading) {
      // Find the reservation in the current list
      const reservation = reservations.find((r) => r.id === highlightReservationId);
      if (reservation) {
        setSelectedReservation(reservation);
        setIsViewDialogOpen(true);
        // Clear the query parameter
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.delete("highlightReservation");
          return newParams;
        });
      } else if (reservations.length > 0) {
        // If not in current list and we've loaded reservations, fetch it
        const fetchAndOpenReservation = async () => {
          try {
            const token = await getToken();
            if (token) {
              const reservation = await reservationService.getReservationById(
                highlightReservationId,
                token
              );
              if (reservation) {
                setSelectedReservation(reservation);
                setIsViewDialogOpen(true);
                // Clear the query parameter
                setSearchParams((prev) => {
                  const newParams = new URLSearchParams(prev);
                  newParams.delete("highlightReservation");
                  return newParams;
                });
              }
            }
          } catch (error) {
            console.error("Error fetching highlighted reservation:", error);
            // Clear the query parameter even on error
            setSearchParams((prev) => {
              const newParams = new URLSearchParams(prev);
              newParams.delete("highlightReservation");
              return newParams;
            });
          }
        };
        fetchAndOpenReservation();
      }
    }
  }, [searchParams, reservations, loading, selectedBranchId, getToken, setSearchParams]);

  // Load tables when assign dialog opens
  useEffect(() => {
    if (assignTableDialogOpen && selectedReservation) {
      loadAvailableTables();
    }
  }, [assignTableDialogOpen, selectedReservation?.id]);

  // Mark notification as seen when viewing reservation details
  useEffect(() => {
    if (isViewDialogOpen && selectedReservation) {
      const markNotificationAsSeen = async () => {
        // Check if reservation has unseen notifications
        if (selectedReservation.notifications && selectedReservation.notifications.length > 0) {
          const unseenNotification = selectedReservation.notifications.find(n => !n.isSeen);
          if (unseenNotification) {
            try {
              const token = await getToken();
              if (token) {
                await notificationService.markAsSeen(unseenNotification.id, token);
                // Update local state immediately
                setReservations((prev) =>
                  prev.map((res) => {
                    if (res.id === selectedReservation.id) {
                      return {
                        ...res,
                        notifications: res.notifications?.map((n) =>
                          n.id === unseenNotification.id ? { ...n, isSeen: true } : n
                        ) || [],
                      };
                    }
                    return res;
                  })
                );
                // Update selected reservation
                setSelectedReservation((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    notifications: prev.notifications?.map((n) =>
                      n.id === unseenNotification.id ? { ...n, isSeen: true } : n
                    ) || [],
                  };
                });
              }
            } catch (error) {
              console.error("Error marking notification as seen:", error);
            }
          }
        }
      };
      markNotificationAsSeen();
    }
  }, [isViewDialogOpen, selectedReservation?.id, getToken]);

  // Listen for WebSocket notification-seen events
  useEffect(() => {
    const socketService = SocketService.getInstance();
    let isMounted = true;

    const handleNotificationSeen = (data: {
      reservationId?: string;
      notificationId: string;
      isSeen: boolean;
      seenAt: Date | null;
    }) => {
      if (!isMounted || !data.reservationId) return;

      // Update reservation in the list if it exists
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
      setSelectedReservation((prev) => {
        if (!prev || prev.id !== data.reservationId) return prev;
        return {
          ...prev,
          notifications: prev.notifications?.map((n) =>
            n.id === data.notificationId ? { ...n, isSeen: true } : n
          ) || [],
        };
      });
    };

    // Handle reservation updates from WebSocket (status changes, table assignments, etc.)
    const handleReservationUpdate = (data: { reservation: Reservation }) => {
      if (!isMounted || !data.reservation) return;

      // Update reservation in the list if it exists
      setReservations((prev) => {
        const exists = prev.some((res) => res.id === data.reservation.id);
        if (exists) {
          // Update existing reservation
          return prev.map((res) =>
            res.id === data.reservation.id
              ? {
                  ...data.reservation,
                  notifications: res.notifications, // Preserve notifications
                }
              : res
          );
        } else {
          // If it doesn't exist and matches current filters, add it
          // This handles cases where a reservation was created on another page
          // and now matches the current filter criteria
          return prev;
        }
      });

      // Update selected reservation if it's the one being viewed
      setSelectedReservation((prev) => {
        if (prev && prev.id === data.reservation.id) {
          return {
            ...data.reservation,
            notifications: prev.notifications, // Preserve notifications
          };
        }
        return prev;
      });
    };

    // Handle reservation modification notification
    const handleReservationModified = (data: {
      notification: any;
      reservation: any;
    }) => {
      if (!isMounted) return;

      // Update reservation in the list if it exists
      setReservations((prev) =>
        prev.map((res) =>
          res.id === data.reservation.id
            ? {
                ...data.reservation,
                notifications: res.notifications ? [...res.notifications, data.notification] : [data.notification],
              }
            : res
        )
      );

      // Update selected reservation if it's the one being viewed
      setSelectedReservation((prev) => {
        if (prev && prev.id === data.reservation.id) {
          return {
            ...data.reservation,
            notifications: prev.notifications ? [...prev.notifications, data.notification] : [data.notification],
          };
        }
        return prev;
      });
    };

    // Handle new reservation notification
    const handleNewReservation = (data: {
      notification: any;
      reservation: Reservation;
    }) => {
      if (!isMounted || !data.reservation) return;

      // Add new reservation to the list (at the beginning for newest first)
      setReservations((prev) => {
        // Check if reservation already exists (avoid duplicates)
        const exists = prev.some((res) => res.id === data.reservation.id);
        if (exists) {
          // Update existing reservation instead
          return prev.map((res) =>
            res.id === data.reservation.id
              ? {
                  ...data.reservation,
                  notifications: res.notifications ? [...res.notifications, data.notification] : [data.notification],
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

      // Show toast notification
      toast.success(t("admin.reservationManagement.messages.newReservationReceived", { number: data.reservation.reservationNumber }));
    };

    // Connect to WebSocket
    const connectSocket = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        socketService.on("notification-seen", handleNotificationSeen);
        socketService.on("reservation-updated", handleReservationUpdate);
        socketService.on("reservation-modified", handleReservationModified);
        socketService.on("new-reservation", handleNewReservation);
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      }
    };

    connectSocket();

    return () => {
      isMounted = false;
      socketService.off("notification-seen");
      socketService.off("reservation-updated");
      socketService.off("reservation-modified");
      socketService.off("new-reservation");
    };
  }, [getToken]);

  // Mark notification as seen when viewing reservation details
  useEffect(() => {
    if (isViewDialogOpen && selectedReservation) {
      const markNotificationAsSeen = async () => {
        // Check if reservation has unseen notifications
        if (selectedReservation.notifications && selectedReservation.notifications.length > 0) {
          const unseenNotification = selectedReservation.notifications.find(n => !n.isSeen);
          if (unseenNotification) {
            try {
              const token = await getToken();
              if (token) {
                await notificationService.markAsSeen(unseenNotification.id, token);
                // Update local state immediately
                setReservations((prev) =>
                  prev.map((res) => {
                    if (res.id === selectedReservation.id) {
                      return {
                        ...res,
                        notifications: res.notifications?.map((n) =>
                          n.id === unseenNotification.id ? { ...n, isSeen: true } : n
                        ) || [],
                      };
                    }
                    return res;
                  })
                );
                // Update selected reservation
                setSelectedReservation((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    notifications: prev.notifications?.map((n) =>
                      n.id === unseenNotification.id ? { ...n, isSeen: true } : n
                    ) || [],
                  };
                });
              }
            } catch (error) {
              console.error("Error marking notification as seen:", error);
            }
          }
        }
      };
      markNotificationAsSeen();
    }
  }, [isViewDialogOpen, selectedReservation?.id, getToken]);

  const loadReservations = async () => {
    if (!selectedBranchId) {
      // Don't load if no branch is selected
      setLoading(false);
      setReservations([]);
      setTotalPages(1);
      setTotalCount(0);
      return;
    }

    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      
      const formatYmd = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const fromDateString = startDate ? formatYmd(startDate) : undefined;
      const toDateString = endDate ? formatYmd(endDate) : undefined;
      
      const response = await reservationService.getReservations(
        currentPage,
        10,
        {
          status: selectedStatus !== "all" ? (selectedStatus as ReservationStatus) : undefined,
          type: selectedType !== "all" ? (selectedType as ReservationType) : undefined,
          fromDate: fromDateString,
          toDate: toDateString,
          branchId: selectedBranchId,
          zoneId: selectedZoneId || undefined,
        },
        token
      );
      setReservations(response.data.reservations);
      setTotalPages(response.data.pagination.pages);
      setTotalCount(response.data.pagination.total);
    } catch (error: any) {
      console.error("Error loading reservations:", error);
      toast.error(t("admin.reservationManagement.messages.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (
    reservationId: string,
    status: ReservationStatus
  ) => {
    try {
      setIsActionLoading(reservationId);
      const token = (await getToken()) || undefined;
      const updated = await reservationService.updateReservationStatus(
        reservationId,
        status,
        token
      );
      toast.success(t("admin.reservationManagement.messages.statusUpdated", { status: status.toLowerCase() }));
      
      // Update local state immediately (WebSocket will also update it, but this is faster)
      setReservations((prev) =>
        prev.map((res) =>
          res.id === reservationId
            ? {
                ...updated,
                notifications: res.notifications, // Preserve notifications
              }
            : res
        )
      );
      
      if (selectedReservation?.id === reservationId) {
        setSelectedReservation({
          ...updated,
          notifications: selectedReservation.notifications, // Preserve notifications
        });
      }
      
      // Note: WebSocket will also update the list in real-time for other admins
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error(error.response?.data?.error || t("admin.reservationManagement.messages.updateStatusError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCancel = async (reservationId: string, reason?: string) => {
    try {
      setIsActionLoading(reservationId);
      const token = (await getToken()) || undefined;
      await reservationService.cancelReservation(reservationId, reason, token);
      toast.success(t("admin.reservationManagement.messages.cancelledSuccess"));
      await loadReservations();
      setIsViewDialogOpen(false);
      setIsCancelDialogOpen(false);
      setReservationToCancel(null);
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      toast.error(error.response?.data?.error || t("admin.reservationManagement.messages.cancelError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const openCancelDialog = (reservationId: string) => {
    setReservationToCancel(reservationId);
    setIsCancelDialogOpen(true);
  };

  const handleAssignTable = async () => {
    if (!selectedReservation || selectedTableIds.length === 0) return;

    // Calculate total capacity
    const allTables = [...availableTables, ...assignedTables];
    const selectedTables = allTables.filter((t) => selectedTableIds.includes(t.id));
    const totalCapacity = selectedTables.reduce((sum, table) => sum + table.capacity, 0);
    const requiredGuests = selectedReservation.numberOfGuests;
    const capacityShort = requiredGuests - totalCapacity;

    // If capacity is insufficient and no action selected, show options
    if (totalCapacity < requiredGuests && !capacityAction) {
      // Don't proceed - let user choose an action
      return;
    }

    // Handle different actions
    if (capacityAction === "contact") {
      // Open contact dialog or show contact info
      toast.info(t("admin.reservationManagement.messages.contactCustomer"));
      return;
    }

    if (capacityAction === "wait") {
      // Show message about waiting
      toast.info(t("admin.reservationManagement.messages.waitForTable"));
      return;
    }

    try {
      setIsActionLoading(selectedReservation.id);
      const token = (await getToken()) || undefined;
      
      // Prepare assignment data with override info if needed
      const assignmentData: any = {
        tableIds: selectedTableIds,
      };

      if (capacityAction === "override" || capacityAction === "proceed") {
        assignmentData.overrideCapacity = true;
        if (overrideNote) {
          assignmentData.overrideNote = overrideNote;
        } else if (capacityAction === "proceed") {
          assignmentData.overrideNote = `Proceeded with ${capacityShort} seat(s) short`;
        }
      }

      await reservationService.assignTable(
        selectedReservation.id,
        assignmentData,
        token
      );
      
      const actionMessage = capacityAction === "override" 
        ? t("admin.reservationManagement.messages.tablesAssignedOverride")
        : capacityAction === "proceed"
        ? t("admin.reservationManagement.messages.tablesAssigned") + ` (${capacityShort} ${t("admin.reservationManagement.assignTable.short", { count: capacityShort }).replace(/[()]/g, "").trim()})`
        : t("admin.reservationManagement.messages.tablesAssigned");
      
      toast.success(actionMessage);
      await loadReservations();
      setAssignTableDialogOpen(false);
      setSelectedTableIds([]);
      setIsAssignConfirmationOpen(false);
      setTableToAssign(null);
      setCapacityAction(null);
      setOverrideNote("");
      if (selectedReservation) {
        const updated = await reservationService.getReservationById(
          selectedReservation.id,
          token
        );
        setSelectedReservation(updated);
      }
    } catch (error: any) {
      console.error("Error assigning tables:", error);
      toast.error(error.response?.data?.error || t("admin.reservationManagement.messages.assignError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Check for larger tables that might be available soon
  const getLargerTableOptions = () => {
    if (!selectedReservation) return null;
    
    const requiredGuests = selectedReservation.numberOfGuests;
    
    // Find tables that are larger than required but currently assigned
    const largerAssignedTables = assignedTables.filter(
      t => t.capacity >= requiredGuests
    );
    
    if (largerAssignedTables.length > 0) {
      return largerAssignedTables.sort((a, b) => a.capacity - b.capacity)[0];
    }
    
    return null;
  };

  const loadAvailableTables = async () => {
    if (!selectedReservation) return;

    try {
      setLoadingTables(true);
      const token = (await getToken()) || undefined;
      const date = new Date(selectedReservation.reservationDate);
      const time = date.toTimeString().slice(0, 5);
      const dateStr = date.toISOString().split("T")[0];

      const response = await reservationService.getTableAvailability(
        dateStr,
        time,
        selectedReservation.numberOfGuests,
        token
      );
      
      // Sort tables: first by capacity (descending), then by zone
      const sortedAvailable = (response.data.available || []).sort((a, b) => {
        if (b.capacity !== a.capacity) {
          return b.capacity - a.capacity;
        }
        return (a.zone || "").localeCompare(b.zone || "");
      });
      
      const sortedAssigned = (response.data.assigned || []).sort((a, b) => {
        if (b.capacity !== a.capacity) {
          return b.capacity - a.capacity;
        }
        return (a.zone || "").localeCompare(b.zone || "");
      });
      
      setAvailableTables(sortedAvailable);
      setAssignedTables(sortedAssigned);
    } catch (error: any) {
      console.error("Error loading tables:", error);
      toast.error(t("admin.reservationManagement.messages.loadTablesError"));
    } finally {
      setLoadingTables(false);
    }
  };

  // Suggest optimal table combinations
  const getSuggestedTables = () => {
    if (!selectedReservation) return [];
    
    const requiredGuests = selectedReservation.numberOfGuests;
    const allTables = [...availableTables];
    
    // Try to find a single table that fits
    const singleTable = allTables.find(t => t.capacity >= requiredGuests);
    if (singleTable) {
      return [{ tables: [singleTable], totalCapacity: singleTable.capacity, efficiency: 1 }];
    }
    
    // Find best combinations of 2-3 tables
    const suggestions: Array<{ tables: any[]; totalCapacity: number; efficiency: number }> = [];
    
    // Try combinations of 2 tables
    for (let i = 0; i < allTables.length; i++) {
      for (let j = i + 1; j < allTables.length; j++) {
        const combo = [allTables[i], allTables[j]];
        const totalCapacity = combo.reduce((sum, t) => sum + t.capacity, 0);
        if (totalCapacity >= requiredGuests) {
          const efficiency = totalCapacity / requiredGuests; // Lower is better (less waste)
          suggestions.push({ tables: combo, totalCapacity, efficiency });
        }
      }
    }
    
    // Try combinations of 3 tables
    for (let i = 0; i < allTables.length; i++) {
      for (let j = i + 1; j < allTables.length; j++) {
        for (let k = j + 1; k < allTables.length; k++) {
          const combo = [allTables[i], allTables[j], allTables[k]];
          const totalCapacity = combo.reduce((sum, t) => sum + t.capacity, 0);
          if (totalCapacity >= requiredGuests) {
            const efficiency = totalCapacity / requiredGuests;
            suggestions.push({ tables: combo, totalCapacity, efficiency });
          }
        }
      }
    }
    
    // Sort by efficiency (best fit first) and return top 3
    return suggestions.sort((a, b) => a.efficiency - b.efficiency).slice(0, 3);
  };

  const openAssignTableDialog = async (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setSelectedTableIds([]);
    setCapacityAction(null);
    setOverrideNote("");
    setAvailableTables([]);
    setAssignedTables([]);
    setAssignTableDialogOpen(true);
    // Tables will be loaded by useEffect when dialog opens
  };

  const handleTableToggle = (tableId: string) => {
    // Check if this table is already assigned
    const assignedTable = assignedTables.find((t) => t.id === tableId);
    
    if (assignedTable && assignedTable.assignedReservation) {
      // Show confirmation dialog
      setTableToAssign({
        id: tableId,
        reservationNumber: assignedTable.assignedReservation.reservationNumber,
      });
      setIsAssignConfirmationOpen(true);
    } else {
      // Table is available, toggle selection
      setSelectedTableIds((prev) => {
        if (prev.includes(tableId)) {
          return prev.filter((id) => id !== tableId);
        } else {
          return [...prev, tableId];
        }
      });
    }
  };

  const confirmAssignTable = () => {
    if (tableToAssign) {
      setSelectedTableIds((prev) => {
        if (prev.includes(tableToAssign.id)) {
          return prev.filter((id) => id !== tableToAssign.id);
        } else {
          return [...prev, tableToAssign.id];
        }
      });
      setIsAssignConfirmationOpen(false);
      setTableToAssign(null);
    }
  };

  const formatStatus = (status: ReservationStatus) => {
    const baseClasses =
      "px-2 py-0.5 text-xs font-semibold rounded-full border";

    const statusMap: Record<
      ReservationStatus,
      { label: string; variant: any; color?: string }
    > = {
      PENDING: {
        label: t("admin.reservationManagement.statuses.pending"),
        variant: "secondary",
        color: cn(
          baseClasses,
          "bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700"
        ),
      },
      CONFIRMED: {
        label: t("admin.reservationManagement.statuses.confirmed"),
        variant: "secondary",
        color: cn(
          baseClasses,
          "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-700"
        ),
      },
      SEATED: {
        label: t("admin.reservationManagement.statuses.seated"),
        variant: "secondary",
        color: cn(
          baseClasses,
          "bg-green-100 text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-100 dark:border-green-700"
        ),
      },
      COMPLETED: {
        label: t("admin.reservationManagement.statuses.completed"),
        variant: "secondary",
        color: cn(
          baseClasses,
          "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-700"
        ),
      },
      CANCELLED: {
        label: t("admin.reservationManagement.statuses.cancelled"),
        variant: "destructive",
        color: cn(
          baseClasses,
          "bg-red-100 text-red-900 border-red-200 dark:bg-red-900/40 dark:text-red-100 dark:border-red-700"
        ),
      },
      NO_SHOW: {
        label: t("admin.reservationManagement.statuses.noShow"),
        variant: "secondary",
        color: cn(
          baseClasses,
          "bg-gray-100 text-gray-900 border-gray-200 dark:bg-gray-900/30 dark:text-gray-100 dark:border-gray-700"
        ),
      },
    };
    return (
      statusMap[status] || {
        label: status,
        variant: "secondary",
        color: cn(baseClasses, "bg-muted text-foreground border-border"),
      }
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? t("admin.reservationManagement.details.pm") : t("admin.reservationManagement.details.am");
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const reservationDate = new Date(date);
    reservationDate.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Format date as "DD-MMM-YYYY"
    const day = date.getDate().toString().padStart(2, "0");
    const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = t(`admin.reservationManagement.details.months.${monthKeys[date.getMonth()]}`);
    const year = date.getFullYear();
    const dateFormatted = `${day}-${month}-${year}`;
    
    // Format time as "h:mm AM/PM"
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? t("admin.reservationManagement.details.pm") : t("admin.reservationManagement.details.am");
    const displayHours = hours % 12 || 12;
    const timeFormatted = `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    
    // Check if it's tomorrow
    const isTomorrow = reservationDate.getTime() === tomorrow.getTime();
    
    if (isTomorrow) {
      return `${dateFormatted} / ${t("admin.reservationManagement.tomorrowAt")} ${timeFormatted}`;
    }
    
    return `${dateFormatted} / ${timeFormatted}`;
  };

  const filteredReservations = reservations.filter((reservation) => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        reservation.reservationNumber.toLowerCase().includes(searchLower) ||
        reservation.customerName.toLowerCase().includes(searchLower) ||
        reservation.customerEmail.toLowerCase().includes(searchLower) ||
        reservation.customerPhone?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.reservationManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.reservationManagement.description")}
          </p>
        </div>
        <Button
          onClick={loadReservations}
          variant="outline"
          size="sm"
          disabled={loading}
          className="flex items-center gap-2 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
        >
          <Icon path={mdiRefresh} size={0.67} className={loading ? "animate-spin" : ""} />
          {t("admin.reservationManagement.refresh")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search and Filter Dropdowns */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.reservationManagement.filters.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={selectedBranchId || ""}
                onValueChange={(value: string) => handleBranchFilter(value)}
                disabled={loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border min-w-[180px]">
                  <SelectValue placeholder={t("admin.reservationManagement.filters.selectBranch")} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedZoneId || "all"}
                onValueChange={(value: string) => handleZoneFilter(value)}
                disabled={!selectedBranchId || loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border min-w-[180px]">
                  <SelectValue 
                    placeholder={
                      !selectedBranchId
                        ? t("admin.tableManagement.selectBranchFirst") || "Select Branch First"
                        : t("admin.tableManagement.allZones") || "All Zones"
                    } 
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.tableManagement.allZones") || "All Zones"}</SelectItem>
                  {allZonesForFilter.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.reservationManagement.filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.reservationManagement.filters.allStatuses")}</SelectItem>
                  <SelectItem value="PENDING">{t("admin.reservationManagement.statuses.pending")}</SelectItem>
                  <SelectItem value="CONFIRMED">{t("admin.reservationManagement.statuses.confirmed")}</SelectItem>
                  <SelectItem value="SEATED">{t("admin.reservationManagement.statuses.seated")}</SelectItem>
                  <SelectItem value="COMPLETED">{t("admin.reservationManagement.statuses.completed")}</SelectItem>
                  <SelectItem value="CANCELLED">{t("admin.reservationManagement.statuses.cancelled")}</SelectItem>
                  <SelectItem value="NO_SHOW">{t("admin.reservationManagement.statuses.noShow")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.reservationManagement.filters.allTypes")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.reservationManagement.filters.allTypes")}</SelectItem>
                  <SelectItem value="SIMPLE">{t("admin.reservationManagement.types.simple")}</SelectItem>
                  <SelectItem value="PRE_ORDER">{t("admin.reservationManagement.types.preOrder")}</SelectItem>
                </SelectContent>
              </Select>
              <DatePicker
                date={startDate}
                onDateChange={(date) => {
                  setStartDate(date);
                  setCurrentPage(1);
                }}
                placeholder={t("admin.reservationManagement.filters.startDate", {
                  defaultValue: "Start Date",
                })}
                variant="outline"
                className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
              />
              <DatePicker
                date={endDate}
                onDateChange={(date) => {
                  setEndDate(date);
                  setCurrentPage(1);
                }}
                placeholder={t("admin.reservationManagement.filters.endDate", {
                  defaultValue: "End Date",
                })}
                variant="outline"
                className="bg-transparent text-foreground border-border min-w-[160px] justify-start text-left font-normal"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedStatus("all");
                  setSelectedType("all");
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setSelectedBranchId("");
                  setSelectedZoneId("");
                }}
                className="bg-transparent text-foreground border-border hover:bg-muted"
              >
                {t("admin.reservationManagement.filters.clearFilters")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reservations List */}
      {!selectedBranchId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Icon path={mdiOfficeBuilding} size={2.00} className="text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.reservationManagement.selectBranchToView")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.reservationManagement.selectBranchToViewSubtext")}
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.reservationManagement.loading")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.reservationManagement.loadingDescription")}
            </p>
          </div>
        </div>
      ) : filteredReservations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t("admin.reservationManagement.noReservations")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredReservations.map((reservation) => {
            const statusInfo = formatStatus(reservation.status);
            // Check if there are any unseen notifications (not just if notifications exist)
            const hasUnseenNotification = reservation.notifications && reservation.notifications.some((n) => !n.isSeen);
            return (
              <Card 
                key={reservation.id} 
                className={cn(
                  "hover:shadow-md transition-shadow",
                  hasUnseenNotification 
                    ? "bg-pink-500/10 border-l-4 border-l-pink-500" 
                    : ""
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Icon path={mdiCalendar} size={0.67} className="text-pink-500" />
                          <span className="truncate">{reservation.reservationNumber}</span>
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant={statusInfo.variant}
                          className={statusInfo.color}
                        >
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {reservation.type === "SIMPLE" ? t("admin.reservationManagement.types.simple") : t("admin.reservationManagement.types.preOrder")}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu
                      open={openReservationMenuId === reservation.id}
                      onOpenChange={(open) => {
                        setOpenReservationMenuId(open ? reservation.id : null);
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 touch-manipulation relative z-10 pointer-events-auto"
                          onPointerDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={() => {
                            setOpenReservationMenuId((prev) =>
                              prev === reservation.id ? null : reservation.id
                            );
                          }}
                        >
                          <Icon path={mdiDotsVertical} size={0.67} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenReservationMenuId(null);
                            setSelectedReservation(reservation);
                            setIsViewDialogOpen(true);
                          }}
                        >
                          <Icon path={mdiEye} size={0.67} className="mr-2" />
                          {t("admin.reservationManagement.actions.viewDetails")}
                        </DropdownMenuItem>
                        {reservation.status === "PENDING" && canConfirmReservation && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(reservation.id, "CONFIRMED")
                            }
                            disabled={isActionLoading === reservation.id}
                          >
                            <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                            {t("admin.reservationManagement.actions.confirm")}
                          </DropdownMenuItem>
                        )}
                        {reservation.status === "CONFIRMED" && (
                          <>
                            {canSeatReservation && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(reservation.id, "SEATED")
                                }
                                disabled={isActionLoading === reservation.id}
                              >
                                <Icon path={mdiChefHat} size={0.67} className="mr-2" />
                                {t("admin.reservationManagement.actions.markAsSeated")}
                              </DropdownMenuItem>
                            )}
                            {!reservation.tableId && canSeatReservation && (
                              <DropdownMenuItem
                                onClick={() => openAssignTableDialog(reservation)}
                              >
                                <Icon path={mdiMapMarker} size={0.67} className="mr-2" />
                                {t("admin.reservationManagement.actions.assignTable")}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {reservation.status === "SEATED" && canCompleteReservation && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(reservation.id, "COMPLETED")
                            }
                            disabled={isActionLoading === reservation.id}
                          >
                            <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                            {t("admin.reservationManagement.actions.markAsCompleted")}
                          </DropdownMenuItem>
                        )}
                        {["PENDING", "CONFIRMED"].includes(reservation.status) && canCancelReservation && (
                          <DropdownMenuItem
                            onClick={() => handleCancel(reservation.id)}
                            disabled={isActionLoading === reservation.id}
                            className="text-destructive"
                          >
                    <Icon path={mdiCloseCircle} size={0.67} className="mr-2" />
                    {t("admin.reservationManagement.actions.cancel")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Icon path={mdiCalendar} size={0.67} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{formatDate(reservation.reservationDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{reservation.numberOfGuests} {t("admin.reservationManagement.guests")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon path={mdiAccount} size={0.67} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground truncate">{reservation.customerName}</span>
                    </div>
                    {(Array.isArray(reservation.tables) &&
                      reservation.tables.length > 0) ||
                    reservation.table ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {Array.isArray(reservation.tables) &&
                          reservation.tables.length > 0
                            ? `${t("admin.reservationManagement.tablesLabel")} ${reservation.tables
                                .map((rt: any) => rt.table?.tableNumber)
                                .filter(Boolean)
                                .join(", ")}`
                            : reservation.table
                            ? `${t("admin.reservationManagement.tableLabel")} ${reservation.table.tableNumber}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                    {reservation.zone && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {t("admin.reservationManagement.zone")}: {reservation.zone.name}
                        </span>
                      </div>
                    )}
                    {reservation.branch && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon path={mdiOfficeBuilding} size={0.67} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {t("admin.reservationManagement.branch")}: {reservation.branch.name}
                        </span>
                      </div>
                    )}
                    {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
                      <div className="flex flex-col gap-1 pt-1 border-t">
                        <div className="flex items-center gap-2">
                          <Icon path={mdiCreditCard} size={0.67} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground text-xs">
                            {reservation.reservationOrder.orderNumber} - {formatPrice(reservation.reservationOrder.totalAmount, displayCurrency)}
                          </span>
                        </div>
                        {/* Show paid amount if different from total */}
                        {reservation.reservationOrder.paidAmount !== undefined && 
                         Number(reservation.reservationOrder.paidAmount) !== Number(reservation.reservationOrder.totalAmount) && (
                          <div className="flex items-center gap-2 ml-6">
                            <span className="text-green-500 text-[10px] font-medium">
                              {t("admin.reservationManagement.paid") || "Paid"}: {formatPrice(Number(reservation.reservationOrder.paidAmount || 0), displayCurrency)}
                            </span>
                            {reservation.reservationOrder.depositPercentage && (
                              <span className="text-muted-foreground text-[10px]">
                                ({Number(reservation.reservationOrder.depositPercentage)}% {t("admin.reservationManagement.deposit") || "deposit"})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.reservationManagement.pagination.showing", { current: reservations.length, total: totalCount })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronLeft} size={0.67} />
            </Button>
            <span className="text-sm text-foreground font-medium px-3 py-1 bg-muted rounded-md">
              {t("admin.reservationManagement.pagination.page", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}

      {/* View Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-card border-border text-foreground w-[95vw] sm:w-full">
          <DialogHeader className="pb-2 border-b border-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-sm font-semibold text-white break-words">
                  {t("admin.reservationManagement.details.title")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 break-words">
                  {selectedReservation?.reservationNumber}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {selectedReservation && (
                  <>
                    <Badge 
                      variant={formatStatus(selectedReservation.status).variant}
                      className={cn(formatStatus(selectedReservation.status).color, "text-[10px] px-1.5 py-0")}
                    >
                      {formatStatus(selectedReservation.status).label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {selectedReservation.type === "SIMPLE" ? t("admin.reservationManagement.types.simple") : t("admin.reservationManagement.types.preOrder")}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-2 pt-2">
              {/* Reservation Information - Compact */}
              <div className="bg-muted rounded-lg p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.date")}</span>
                    <span className="text-foreground font-medium break-words">{formatDate(selectedReservation.reservationDate)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.time")}</span>
                    <span className="text-foreground font-medium break-words">{formatTime(selectedReservation.reservationDate)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.guests")}</span>
                    <span className="text-foreground font-medium break-words">{selectedReservation.numberOfGuests}</span>
                  </div>
                  {(Array.isArray(selectedReservation.tables) &&
                    selectedReservation.tables.length > 0) ||
                  selectedReservation.table ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.table")}</span>
                      <span className="text-foreground break-words">
                        {Array.isArray(selectedReservation.tables) &&
                        selectedReservation.tables.length > 0
                          ? selectedReservation.tables
                              .map(
                                (rt: any) =>
                                  `${rt.table?.tableNumber ?? ""} (${
                                    rt.table?.capacity ?? "-"
                                  })${
                                    rt.table?.zone ? ` - ${rt.table.zone}` : ""
                                  }`
                              )
                              .filter(Boolean)
                              .join(", ")
                          : selectedReservation.table
                          ? `${selectedReservation.table.tableNumber} (${selectedReservation.table.capacity})${
                              selectedReservation.table.zone
                                ? ` - ${selectedReservation.table.zone}`
                                : ""
                            }`
                          : ""}
                      </span>
                    </div>
                  ) : null}
                  {selectedReservation.zone && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.zone")}</span>
                      <span className="text-foreground break-words">{selectedReservation.zone.name}</span>
                    </div>
                  )}
                  {selectedReservation.preferredZone && !selectedReservation.zone && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.zone")}</span>
                      <span className="text-foreground break-words">{selectedReservation.preferredZone}</span>
                    </div>
                  )}
                  {selectedReservation.branch && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.branch")}</span>
                      <span className="text-foreground break-words">{selectedReservation.branch.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Information - Compact */}
              <div className="bg-muted rounded-lg p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.name")}</span>
                    <span className="text-foreground break-words">{selectedReservation.customerName}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.email")}</span>
                    <span className="text-foreground text-xs break-words">{selectedReservation.customerEmail}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground text-xs sm:min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.phone")}</span>
                    <span className="text-foreground break-words">{selectedReservation.customerPhone}</span>
                  </div>
                </div>
              </div>

              {/* Special Requests - Compact */}
              {selectedReservation.specialRequests && (
                <div className="bg-muted rounded-lg p-2">
                  <div className="flex items-start gap-1.5">
                    <span className="text-muted-foreground text-xs min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.requests")}</span>
                    <p className="text-foreground text-[10px] break-words flex-1">{selectedReservation.specialRequests}</p>
                  </div>
                </div>
              )}

              {/* Pre-Order Details - Compact */}
              {selectedReservation.type === "PRE_ORDER" && selectedReservation.reservationOrder && (
                <div className="border-t border-border pt-2 space-y-2">

                  {/* Order Items - Compact */}
                  {selectedReservation.reservationOrder.items && selectedReservation.reservationOrder.items.length > 0 ? (
                    <div>
                      <div className="text-xs font-semibold text-foreground mb-1.5">
                        {t("admin.reservationManagement.details.items")}
                      </div>
                      <div className="space-y-0.5">
                        {selectedReservation.reservationOrder.items.map((item: any, index: number) => (
                          <div
                            key={index}
                            className="bg-transparent rounded-lg p-1.5 border border-border"
                          >
                            {/* Main Item Info - Compact */}
                            <div className="flex gap-2">
                              {item.meal?.image && (
                                <img
                                  src={
                                    isExternalImage(item.meal.image)
                                      ? item.meal.image
                                      : getOptimizedImageUrl(item.meal.image)
                                  }
                                  alt={item.meal.name}
                                  className="w-12 h-12 rounded object-cover flex-shrink-0 border border-border"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "/placeholder-meal.png";
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-2 mb-0.5">
                                  <h4 className="font-medium text-foreground text-xs break-words">
                                    {item.meal?.name || t("admin.reservationManagement.details.meal")}
                                  </h4>
                                  <p className="font-semibold text-xs text-pink-500 flex-shrink-0">
                                    {formatPrice(Number(item.totalPrice), displayCurrency)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span>{item.selectedSize}</span>
                                  <span>×</span>
                                  <span>{item.quantity}</span>
                                </div>
                              </div>
                            </div>

                            {/* Add-ons - Compact */}
                            {item.addons && item.addons.length > 0 && (
                              <div className="mt-1 pt-1 border-t border-border">
                                <div className="space-y-0.5">
                                  {item.addons.map((addOn: any) => {
                                    const addonUnitPrice = Number(addOn.addOnPrice || 0);
                                    const addonQuantity = addOn.quantity || 1;
                                    const addonTotalPrice = addonUnitPrice * addonQuantity;
                                    const addonName = addOn.addOnName || addOn.addon?.name || t("admin.reservationManagement.details.addon");
                                    return (
                                      <div key={addOn.id} className="flex justify-between items-center text-[10px]">
                                        <span className="text-foreground">
                                          {addonName}
                                          {addonQuantity > 1 && <span className="text-muted-foreground"> ×{addonQuantity}</span>}
                                        </span>
                                        <span className="text-foreground font-medium">
                                          {formatPrice(addonTotalPrice, displayCurrency)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Optional Ingredients - Compact */}
                            {item.optionalIngredients && item.optionalIngredients.length > 0 && (
                              <div className="mt-1 pt-1 border-t border-border">
                                {(() => {
                                  const included = item.optionalIngredients.filter(
                                    (ing: any) => ing.isIncluded
                                  );
                                  return included.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 text-[10px]">
                                      {included.map((ing: any) => (
                                        <span
                                          key={ing.id}
                                          className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded"
                                        >
                                          {ing.ingredientName}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            )}

                            {/* Special Instructions - Compact */}
                            {item.specialInstructions && (
                              <div className="mt-1 pt-1 border-t border-border">
                                <p className="text-[10px] text-muted-foreground break-words">
                                  {item.specialInstructions}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Order Summary - Compact */}
                      <div className="bg-gradient-to-br from-muted to-muted/50 rounded-lg p-2.5 mt-3 border border-border">
                        <h3 className="text-xs font-semibold text-foreground mb-2">{t("admin.reservationManagement.details.orderSummary")}</h3>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {isTaxInclusive
                                ? t("admin.reservationManagement.details.subtotalInclTax", { defaultValue: "Subtotal (incl. tax)" })
                                : t("admin.reservationManagement.details.subtotal")}
                            </span>
                            <span className="text-foreground font-medium">
                              {formatPrice(
                                isTaxInclusive
                                  ? Number(selectedReservation.reservationOrder.totalAmount)
                                  : Number(selectedReservation.reservationOrder.totalAmount) -
                                    Number(selectedReservation.reservationOrder.taxAmount || 0),
                                displayCurrency
                              )}
                            </span>
                          </div>
                          {isTaxInclusive && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                {t("admin.reservationManagement.details.subtotalExclTax", { defaultValue: "Subtotal (excl. tax)" })}
                              </span>
                              <span className="text-foreground font-medium">
                                {formatPrice(
                                  Number(selectedReservation.reservationOrder.totalAmount) -
                                    Number(selectedReservation.reservationOrder.taxAmount || 0),
                                  displayCurrency
                                )}
                              </span>
                            </div>
                          )}
                          {selectedReservation.reservationOrder.taxAmount && Number(selectedReservation.reservationOrder.taxAmount) > 0 && (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">
                                  {isTaxInclusive
                                    ? t("admin.reservationManagement.details.includedTax", { defaultValue: "Included Tax" })
                                    : t("admin.reservationManagement.details.tax")}
                                </span>
                                <span className="text-foreground font-medium">
                                  {formatPrice(Number(selectedReservation.reservationOrder.taxAmount), displayCurrency)}
                                </span>
                              </div>
                              {(selectedReservation.reservationOrder.itemTaxAmount !== undefined ||
                                selectedReservation.reservationOrder.addonTaxAmount !== undefined) && (
                                <div className="ml-3 space-y-1 text-[10px]">
                                  {selectedReservation.reservationOrder.itemTaxAmount !== undefined && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">
                                        {isTaxInclusive
                                          ? t("admin.reservationManagement.details.includedItemTax", { defaultValue: "Included item tax" })
                                          : t("admin.reservationManagement.details.itemTax")}
                                      </span>
                                      <span className="text-foreground">
                                        {formatPrice(
                                          Number(selectedReservation.reservationOrder.itemTaxAmount || 0),
                                          displayCurrency
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {selectedReservation.reservationOrder.addonTaxAmount !== undefined && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">
                                        {isTaxInclusive
                                          ? t("admin.reservationManagement.details.includedAddonTax", { defaultValue: "Included addon tax" })
                                          : t("admin.reservationManagement.details.addonTax")}
                                      </span>
                                      <span className="text-foreground">
                                        {formatPrice(
                                          Number(selectedReservation.reservationOrder.addonTaxAmount || 0),
                                          displayCurrency
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between items-center pt-1.5 border-t border-border mt-1.5">
                            <span className="text-foreground font-bold text-sm">{t("admin.reservationManagement.details.total")}</span>
                            <span className="text-pink-500 font-bold text-base">
                              {formatPrice(Number(selectedReservation.reservationOrder.totalAmount), displayCurrency)}
                            </span>
                          </div>
                          {/* Show paid amount vs total if deposit was used */}
                          {selectedReservation.reservationOrder.paidAmount !== undefined && 
                           Number(selectedReservation.reservationOrder.paidAmount) !== Number(selectedReservation.reservationOrder.totalAmount) && (
                            <>
                              <div className="flex justify-between items-center pt-1 border-t border-border/50 mt-1">
                                <span className="text-muted-foreground text-xs">{t("admin.reservationManagement.details.paidAmount") || "Paid Amount"}</span>
                                <span className="text-green-500 font-semibold text-sm">
                                  {formatPrice(Number(selectedReservation.reservationOrder.paidAmount || 0), displayCurrency)}
                                </span>
                              </div>
                              {selectedReservation.reservationOrder.depositPercentage && (
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-0.5">
                                  <span>{t("admin.reservationManagement.details.depositPercentage") || "Deposit"}</span>
                                  <span>{Number(selectedReservation.reservationOrder.depositPercentage)}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center pt-1 border-t border-border/50 mt-1">
                                <span className="text-muted-foreground text-xs">{t("admin.reservationManagement.details.remainingBalance") || "Remaining Balance"}</span>
                                <span className="text-amber-500 font-semibold text-sm">
                                  {formatPrice(
                                    Number(selectedReservation.reservationOrder.totalAmount) - Number(selectedReservation.reservationOrder.paidAmount || 0),
                                    displayCurrency
                                  )}
                                </span>
                              </div>
                              <div className="pt-2 mt-2">
                                {canUpdateReservation && (
                                  <Button
                                    onClick={async () => {
                                      if (!selectedReservation) return;
                                      try {
                                        setIsActionLoading(selectedReservation.id);
                                        const token = (await getToken()) || undefined;
                                        const updated =
                                          await reservationService.completeReservationPayment(
                                            selectedReservation.id,
                                            token
                                          );
                                        toast.success(
                                          t(
                                            "admin.reservationManagement.messages.paymentCompleted"
                                          )
                                        );

                                        // Update local state
                                        setReservations((prev) =>
                                          prev.map((res) =>
                                            res.id === selectedReservation.id
                                              ? updated
                                              : res
                                          )
                                        );

                                        setSelectedReservation(updated);
                                      } catch (error: any) {
                                        console.error(
                                          "Error completing payment:",
                                          error
                                        );
                                        toast.error(
                                          error.response?.data?.error ||
                                            t(
                                              "admin.reservationManagement.messages.completePaymentError"
                                            )
                                        );
                                      } finally {
                                        setIsActionLoading(null);
                                      }
                                    }}
                                    disabled={
                                      isActionLoading === selectedReservation.id
                                    }
                                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                                    size="sm"
                                  >
                                    {isActionLoading === selectedReservation.id ? (
                                      <>
                                        <Icon
                                          path={mdiRefresh}
                                          size={0.67}
                                          className="mr-2 animate-spin"
                                        />
                                        {t(
                                          "admin.reservationManagement.actions.completingPayment"
                                        ) || "Completing..."}
                                      </>
                                    ) : (
                                      <>
                                        <Icon
                                          path={mdiCreditCard}
                                          size={0.67}
                                          className="mr-2"
                                        />
                                        {t(
                                          "admin.reservationManagement.actions.completePayment"
                                        ) || "Complete Payment"}
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      {t("admin.reservationManagement.details.noPreOrderItems")}
                    </div>
                  )}
                </div>
              )}

              {/* Internal Notes - Compact */}
              {selectedReservation.internalNotes && (
                <div className="bg-muted rounded-lg p-2">
                  <div className="flex items-start gap-1.5">
                    <span className="text-muted-foreground text-xs min-w-[70px] flex-shrink-0">{t("admin.reservationManagement.details.notes")}</span>
                    <p className="text-foreground text-[10px] break-words flex-1">{selectedReservation.internalNotes}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-border">
                {canViewReservationHistory && (
                <Button
                  onClick={async () => {
                    if (selectedReservation) {
                      setLoadingHistory(true);
                      try {
                        const token = (await getToken()) || undefined;
                        const history = await reservationService.getReservationHistory(
                          selectedReservation.id,
                          token
                        );
                        setReservationHistory(history);
                        setIsHistoryDialogOpen(true);
                      } catch (error) {
                        console.error("Error loading history:", error);
                        toast.error(t("admin.reservationManagement.messages.loadHistoryError"));
                      } finally {
                        setLoadingHistory(false);
                      }
                    }
                  }}
                  disabled={loadingHistory}
                  className="bg-transparent border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/20 hover:border-pink-300 dark:hover:border-pink-700 transition-colors w-full sm:w-auto"
                >
                  {loadingHistory ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.reservationManagement.details.loadingHistory")}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiHistory} size={0.67} className="mr-2" />
                      {t("admin.reservationManagement.details.viewHistory")}
                    </>
                  )}
                </Button>
                )}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {selectedReservation.status === "PENDING" && canConfirmReservation && (
                  <Button
                    onClick={() => {
                      handleStatusChange(selectedReservation.id, "CONFIRMED");
                      setIsViewDialogOpen(false);
                    }}
                    disabled={isActionLoading === selectedReservation.id}
                    className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto"
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <>
                        <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                        {t("admin.reservationManagement.actions.confirming")}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                        {t("admin.reservationManagement.actions.confirm")}
                      </>
                    )}
                  </Button>
                )}
                {selectedReservation.status === "CONFIRMED" && !selectedReservation.tableId && canSeatReservation && (
                  <Button
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      openAssignTableDialog(selectedReservation);
                    }}
                    variant="outline"
                    className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 w-full sm:w-auto"
                  >
                    <Icon path={mdiMapMarker} size={0.67} className="mr-2" />
                    {t("admin.reservationManagement.actions.assignTable")}
                  </Button>
                )}
                {selectedReservation.status === "CONFIRMED" && canSeatReservation && (
                  <Button
                    onClick={() => {
                      handleStatusChange(selectedReservation.id, "SEATED");
                      setIsViewDialogOpen(false);
                    }}
                    disabled={isActionLoading === selectedReservation.id}
                    className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto"
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <>
                        <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                        {t("admin.reservationManagement.actions.updating")}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiChefHat} size={0.67} className="mr-2" />
                        {t("admin.reservationManagement.actions.markAsSeated")}
                      </>
                    )}
                  </Button>
                )}
                {selectedReservation.status === "SEATED" && canCompleteReservation && (
                  <Button
                    onClick={() => {
                      handleStatusChange(selectedReservation.id, "COMPLETED");
                      setIsViewDialogOpen(false);
                    }}
                    disabled={isActionLoading === selectedReservation.id}
                    className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto"
                  >
                    {isActionLoading === selectedReservation.id ? (
                      <>
                        <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                        {t("admin.reservationManagement.actions.updating")}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                        {t("admin.reservationManagement.actions.markAsCompleted")}
                      </>
                    )}
                  </Button>
                )}
                {["PENDING", "CONFIRMED"].includes(selectedReservation.status) && canCancelReservation && (
                  <Button
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      openCancelDialog(selectedReservation.id);
                    }}
                    disabled={isActionLoading === selectedReservation.id}
                    variant="outline"
                    className="bg-transparent hover:bg-transparent text-destructive hover:text-destructive w-full sm:w-auto"
                  >
                    <Icon path={mdiCloseCircle} size={0.67} className="mr-2" />
                    {t("admin.reservationManagement.actions.cancel")}
                  </Button>
                )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-card border-border text-foreground w-[95vw] sm:w-full">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon path={mdiHistory} size={0.83} className="text-pink-500 flex-shrink-0" />
              <DialogTitle className="text-lg font-semibold text-white break-words">
                {t("admin.reservationManagement.history.title")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1 break-words">
              {t("admin.reservationManagement.history.description", { reservationNumber: selectedReservation?.reservationNumber })}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-6">
            {reservationHistory.length > 0 ? (
              <div className="relative overflow-x-hidden">
                {/* Timeline line */}
                <div className="absolute left-3 sm:left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-pink-200 via-purple-200 to-blue-200 dark:from-pink-800 dark:via-purple-800 dark:to-blue-800" />
                
                <div className="space-y-6">
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
                            icon: <Icon path={mdiCalendar} size={0.83} className="text-white" />,
                            bgColor: "bg-blue-50 dark:bg-blue-950/30",
                            borderColor: "border-blue-200 dark:border-blue-800",
                            dotColor: "bg-blue-500",
                            ringColor: "ring-blue-200 dark:ring-blue-800",
                          };
                        case "RESERVATION_CONFIRMED":
                          return {
                            icon: <Icon path={mdiCheckCircle} size={0.83} className="text-white" />,
                            bgColor: "bg-green-50 dark:bg-green-950/30",
                            borderColor: "border-green-200 dark:border-green-800",
                            dotColor: "bg-green-500",
                            ringColor: "ring-green-200 dark:ring-green-800",
                          };
                        case "TABLE_ASSIGNED":
                        case "TABLES_ASSIGNED":
                          return {
                            icon: <Icon path={mdiMapMarker} size={0.83} className="text-white" />,
                            bgColor: "bg-purple-50 dark:bg-purple-950/30",
                            borderColor: "border-purple-200 dark:border-purple-800",
                            dotColor: "bg-purple-500",
                            ringColor: "ring-purple-200 dark:ring-purple-800",
                          };
                        case "CUSTOMER_SEATED":
                          return {
                            icon: <Icon path={mdiChefHat} size={0.83} className="text-white" />,
                            bgColor: "bg-orange-50 dark:bg-orange-950/30",
                            borderColor: "border-orange-200 dark:border-orange-800",
                            dotColor: "bg-orange-500",
                            ringColor: "ring-orange-200 dark:ring-orange-800",
                          };
                        case "RESERVATION_COMPLETED":
                          return {
                            icon: <Icon path={mdiCheckCircle} size={0.83} className="text-white" />,
                            bgColor: "bg-green-50 dark:bg-green-950/30",
                            borderColor: "border-green-200 dark:border-green-800",
                            dotColor: "bg-green-600",
                            ringColor: "ring-green-200 dark:ring-green-800",
                          };
                        case "RESERVATION_CANCELLED":
                          return {
                            icon: <Icon path={mdiCloseCircle} size={0.83} className="text-white" />,
                            bgColor: "bg-red-50 dark:bg-red-950/30",
                            borderColor: "border-red-200 dark:border-red-800",
                            dotColor: "bg-red-500",
                            ringColor: "ring-red-200 dark:ring-red-800",
                          };
                        case "NO_SHOW":
                          return {
                            icon: <Icon path={mdiCloseCircle} size={0.83} className="text-white" />,
                            bgColor: "bg-red-50 dark:bg-red-950/30",
                            borderColor: "border-red-200 dark:border-red-800",
                            dotColor: "bg-red-600",
                            ringColor: "ring-red-200 dark:ring-red-800",
                          };
                        case "PAYMENT_PROCESSED":
                        case "PAYMENT_ADDED":
                          return {
                            icon: <Icon path={mdiCurrencyUsd} size={0.83} className="text-white" />,
                            bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
                            borderColor: "border-emerald-200 dark:border-emerald-800",
                            dotColor: "bg-emerald-500",
                            ringColor: "ring-emerald-200 dark:ring-emerald-800",
                          };
                        default:
                          return {
                            icon: <Icon path={mdiClock} size={0.83} className="text-white" />,
                            bgColor: "bg-muted",
                            borderColor: "border-border",
                            dotColor: "bg-gray-500",
                            ringColor: "ring-border",
                          };
                      }
                    };

                    const eventConfig = getEventConfig();

                    return (
                      <div
                        key={index}
                        className="relative pl-8 sm:pl-12"
                      >
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            "absolute left-0 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-background flex items-center justify-center shadow-sm",
                            `ring-2 ${eventConfig.ringColor}`
                          )}
                          style={{
                            transform: "translateX(-12px)",
                          }}
                        >
                          <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full", eventConfig.dotColor)} />
                        </div>

                        {/* Event card */}
                        <div
                          className={cn(
                            "rounded-lg p-3 sm:p-4 border-2 shadow-sm transition-all hover:shadow-md",
                            eventConfig.bgColor,
                            eventConfig.borderColor
                          )}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div className={cn(
                              "p-1.5 sm:p-2 rounded-lg flex-shrink-0",
                              eventConfig.bgColor,
                              "border",
                              eventConfig.borderColor
                            )}>
                              {React.cloneElement(eventConfig.icon, { className: "h-4 w-4 sm:h-5 sm:w-5 text-white" })}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs sm:text-sm font-semibold text-foreground mb-1 break-words">
                                    {entry.action}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground flex-wrap">
                                    <Icon path={mdiClock} size={0.50} className="flex-shrink-0" />
                                    <span className="break-words">
                                      {formattedDate} {t("admin.reservationManagement.at")} {formattedTime}
                                    </span>
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 font-medium flex-shrink-0",
                                    eventConfig.borderColor
                                  )}
                                >
                                  {t(`admin.reservationManagement.history.eventTypes.${entry.type}`, entry.type.replace(/_/g, " "))}
                                </Badge>
                              </div>
                              {entry.details && (
                                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                                  {entry.details.reservationNumber && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.reservation")}</span>
                                      <span className="text-muted-foreground font-mono break-all">{entry.details.reservationNumber}</span>
                                    </div>
                                  )}
                                  {entry.details.tableNumber && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.table")}</span>
                                      <span className="text-muted-foreground break-words">
                                        {entry.details.tableNumber}
                                        {entry.details.capacity && ` (${entry.details.capacity} ${t("admin.reservationManagement.history.seats")})`}
                                        {entry.details.zone && ` - ${entry.details.zone}`}
                                      </span>
                                    </div>
                                  )}
                                  {entry.details.tables && Array.isArray(entry.details.tables) && (
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.tables")}</span>
                                      <div className="flex flex-wrap gap-1">
                                        {entry.details.tables.map((t: any, idx: number) => (
                                          <Badge
                                            key={idx}
                                            variant="outline"
                                            className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0"
                                          >
                                            {t.tableNumber} ({t.capacity}{t.zone ? `, ${t.zone}` : ""})
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.details.numberOfGuests && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.guests")}</span>
                                      <span className="text-muted-foreground break-words">{entry.details.numberOfGuests}</span>
                                    </div>
                                  )}
                                  {entry.details.reason && (
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.reason")}</span>
                                      <span className="text-muted-foreground flex-1 break-words">{entry.details.reason}</span>
                                    </div>
                                  )}
                                  {entry.details.type && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.type")}</span>
                                      <span className="text-muted-foreground break-words">{entry.details.type}</span>
                                    </div>
                                  )}
                                  {(entry.details.amount !== undefined || entry.details.refundAmount !== undefined) && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.amount")}</span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold break-words">
                                        {(() => {
                                          const amount = entry.details.refundAmount !== undefined 
                                            ? entry.details.refundAmount 
                                            : entry.details.amount;
                                          return typeof amount === 'number' 
                                            ? amount.toFixed(2) 
                                            : amount;
                                        })()}{' '}
                                        {entry.details.currency || currency}
                                      </span>
                                    </div>
                                  )}
                                  {entry.details.paymentIntentId && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.paymentId")}</span>
                                      <span className="text-muted-foreground font-mono text-[9px] sm:text-[10px] break-all">{entry.details.paymentIntentId}</span>
                                    </div>
                                  )}
                                  {entry.details.incrementalPaymentIntentId && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                                      <span className="font-medium text-foreground sm:min-w-[80px] flex-shrink-0">{t("admin.reservationManagement.history.incrementalPaymentId")}</span>
                                      <span className="text-muted-foreground font-mono text-[9px] sm:text-[10px] break-all">{entry.details.incrementalPaymentIntentId}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Icon path={mdiHistory} size={2.67} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm font-medium">{t("admin.reservationManagement.history.noHistory")}</p>
                <p className="text-xs mt-1">{t("admin.reservationManagement.history.noHistoryDescription")}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Table Dialog */}
      <Dialog 
        open={assignTableDialogOpen} 
        onOpenChange={(open) => {
          setAssignTableDialogOpen(open);
          if (!open) {
            setSelectedTableIds([]);
            setAssignedTables([]);
            setTableToAssign(null);
            setIsAssignConfirmationOpen(false);
            setCapacityAction(null);
            setOverrideNote("");
          }
        }}
      >
        <DialogContent className="bg-background border-border max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-white">{t("admin.reservationManagement.assignTable.title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.reservationManagement.assignTable.description", { guests: selectedReservation?.numberOfGuests })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {/* Suggestions */}
            {(() => {
              const suggestions = getSuggestedTables();
              if (suggestions.length > 0 && selectedTableIds.length === 0) {
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-pink-500" />
                      {t("admin.reservationManagement.assignTable.suggestedCombinations")}
                    </Label>
                    <div className="space-y-2">
                      {suggestions.map((suggestion, idx) => (
                        <Card
                          key={idx}
                          className="border-pink-200 dark:border-pink-800 bg-pink-50/50 dark:bg-pink-950/10 cursor-pointer hover:bg-pink-100/50 dark:hover:bg-pink-950/20 transition-colors"
                          onClick={() => {
                            setSelectedTableIds(suggestion.tables.map(t => t.id));
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon path={mdiCheckCircle} size={0.67} className="text-pink-500" />
                                <div>
                                  <div className="text-sm font-medium text-foreground">
                                    {suggestion.tables.map(t => t.tableNumber).join(" + ")}
                                    {suggestion.tables[0].zone && ` (${suggestion.tables[0].zone})`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {t("admin.reservationManagement.assignTable.seatsTotal", { count: suggestion.totalCapacity })}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs border-pink-300 dark:border-pink-700">
                                {t("admin.reservationManagement.assignTable.table", { count: suggestion.tables.length })}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Table Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-foreground font-semibold">{t("admin.reservationManagement.assignTable.selectTables")}</Label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("admin.reservationManagement.assignTable.required")}</span>
                  <Badge variant="outline" className="font-semibold">
                    {t("admin.reservationManagement.assignTable.guests", { count: selectedReservation?.numberOfGuests })}
                  </Badge>
                </div>
              </div>
              
              <div className="max-h-[350px] overflow-y-auto border border-border rounded-lg p-3 space-y-3">
                {loadingTables ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon path={mdiRefresh} size={1.00} className="animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">{t("admin.reservationManagement.assignTable.loadingTables")}</span>
                  </div>
                ) : (
                  <>
                {availableTables.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground sticky top-0 bg-background mb-2 flex items-center gap-2">
                      <Icon path={mdiCheckCircle} size={0.50} />
                      {t("admin.reservationManagement.assignTable.availableTables")}
                    </div>
                    <div className="space-y-2">
                      {availableTables.map((table) => {
                        const isSelected = selectedTableIds.includes(table.id);
                        return (
                          <div
                            key={table.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                              isSelected
                                ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700 shadow-sm"
                                : "hover:bg-accent/50 border-border"
                            )}
                            onClick={() => handleTableToggle(table.id)}
                          >
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleTableToggle(table.id)}
                                variant="pink"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground flex-shrink-0" />
                                <div className="font-medium text-foreground">
                                  {table.tableNumber}
                                </div>
                                {table.zone && (
                                  <Badge variant="outline" className="text-xs">
                                    {table.zone}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                {table.capacity} {table.capacity === 1 ? t("admin.reservationManagement.seat") : t("admin.reservationManagement.seats")}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {assignedTables.length > 0 && (
                  <div className="mt-4">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground sticky top-0 bg-background mb-2 flex items-center gap-2">
                      <Icon path={mdiCloseCircle} size={0.50} />
                      {t("admin.reservationManagement.assignTable.alreadyAssigned")}
                    </div>
                    <div className="space-y-2">
                      {assignedTables.map((table) => {
                        const isSelected = selectedTableIds.includes(table.id);
                        return (
                          <div
                            key={table.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer opacity-75",
                              isSelected
                                ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700 shadow-sm"
                                : "bg-muted/30 border-border"
                            )}
                            onClick={() => handleTableToggle(table.id)}
                          >
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleTableToggle(table.id)}
                                variant="pink"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground flex-shrink-0" />
                                <div className="font-medium text-foreground">
                                  {table.tableNumber}
                                </div>
                                {table.zone && (
                                  <Badge variant="outline" className="text-xs">
                                    {table.zone}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                {table.capacity} {table.capacity === 1 ? t("admin.reservationManagement.seat") : t("admin.reservationManagement.seats")}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs border-orange-300 dark:border-orange-700">
                              {t("admin.reservationManagement.assignTable.alreadyAssigned")}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {!loadingTables && availableTables.length === 0 && assignedTables.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon path={mdiAccountGroup} size={1.33} className="mx-auto mb-2 opacity-50" />
                    <p>{t("admin.reservationManagement.assignTable.noTablesAvailable")}</p>
                  </div>
                )}
                  </>
                )}
              </div>
              
              {/* Selection Summary */}
              {selectedTableIds.length > 0 && (() => {
                const selectedTables = [...availableTables, ...assignedTables].filter((t) => selectedTableIds.includes(t.id));
                const totalCapacity = selectedTables.reduce((sum, table) => sum + table.capacity, 0);
                const requiredGuests = selectedReservation?.numberOfGuests || 0;
                const isSufficient = totalCapacity >= requiredGuests;
                const excess = totalCapacity - requiredGuests;
                const capacityShort = requiredGuests - totalCapacity;
                const largerTableOption = getLargerTableOptions();
                
                return (
                  <div className="space-y-3 mt-3">
                    <Card className={cn(
                      "border-2",
                      isSufficient 
                        ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/10" 
                        : "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/10"
                    )}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {isSufficient ? (
                                <Icon path={mdiCheckCircle} size={0.67} className="text-green-600 dark:text-green-400" />
                              ) : (
                                <Icon path={mdiCloseCircle} size={0.67} className="text-orange-600 dark:text-orange-400" />
                              )}
                              <span className="text-sm font-medium text-foreground">
                                {t("admin.reservationManagement.assignTable.tablesSelected", { count: selectedTableIds.length })}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground pl-6">
                              {t("admin.reservationManagement.assignTable.totalCapacity")} <strong className="text-foreground">{totalCapacity}</strong> {t("admin.reservationManagement.assignTable.seats")}
                              {isSufficient && excess > 0 && (
                                <span className="text-green-600 dark:text-green-400"> {t("admin.reservationManagement.assignTable.extra", { count: excess })}</span>
                              )}
                              {!isSufficient && (
                                <span className="text-orange-600 dark:text-orange-400"> {t("admin.reservationManagement.assignTable.short", { count: capacityShort })}</span>
                              )}
                            </div>
                          </div>
                          {isSufficient && (
                            <Badge className="bg-green-500 hover:bg-green-600 text-white">
                              {t("admin.reservationManagement.assignTable.ready")}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Capacity Warning and Options */}
                    {!isSufficient && capacityShort <= 2 && (
                      <Card className="border-2 border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/10">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold text-orange-900 dark:text-orange-100 flex items-center gap-2">
                            <Icon path={mdiCloseCircle} size={0.67} />
                            {t("admin.reservationManagement.assignTable.insufficientCapacity")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-orange-800 dark:text-orange-200">
                            {t("admin.reservationManagement.assignTable.capacityWarning", { short: capacityShort })}
                          </p>
                          
                          <div className="space-y-2">
                            {/* Proceed with warning */}
                            <div
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                capacityAction === "proceed"
                                  ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700"
                                  : "hover:bg-accent/50 border-border"
                              )}
                              onClick={() => {
                                setCapacityAction("proceed");
                                setOverrideNote("");
                              }}
                            >
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={capacityAction === "proceed"}
                                  onCheckedChange={(checked) => {
                                    setCapacityAction(checked ? "proceed" : null);
                                    setOverrideNote("");
                                  }}
                                  variant="pink"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground text-sm">
                                  {t("admin.reservationManagement.assignTable.proceedShort", { short: capacityShort })}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {t("admin.reservationManagement.assignTable.proceedDescription")}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs border-orange-300 dark:border-orange-700">
                                {t("admin.reservationManagement.assignTable.warning")}
                              </Badge>
                            </div>

                            {/* Contact customer */}
                            <div
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                capacityAction === "contact"
                                  ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700"
                                  : "hover:bg-accent/50 border-border"
                              )}
                              onClick={() => {
                                setCapacityAction("contact");
                                setOverrideNote("");
                              }}
                            >
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={capacityAction === "contact"}
                                  onCheckedChange={(checked) => {
                                    setCapacityAction(checked ? "contact" : null);
                                    setOverrideNote("");
                                  }}
                                  variant="pink"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground text-sm">
                                  {t("admin.reservationManagement.assignTable.contactCustomer")}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {t("admin.reservationManagement.assignTable.contactDescription")}
                                </div>
                              </div>
                              <Icon path={mdiPhone} size={0.67} className="text-muted-foreground" />
                            </div>

                            {/* Wait for larger table */}
                            {largerTableOption && (
                              <div
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                  capacityAction === "wait"
                                    ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700"
                                    : "hover:bg-accent/50 border-border"
                                )}
                                onClick={() => {
                                  setCapacityAction("wait");
                                  setOverrideNote("");
                                }}
                            >
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={capacityAction === "wait"}
                                  onCheckedChange={(checked) => {
                                    setCapacityAction(checked ? "wait" : null);
                                    setOverrideNote("");
                                  }}
                                  variant="pink"
                                />
                              </div>
                              <div className="flex-1">
                                  <div className="font-medium text-foreground text-sm">
                                    {t("admin.reservationManagement.assignTable.waitForLarger")}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {t("admin.reservationManagement.assignTable.waitDescription", { tableNumber: largerTableOption.tableNumber, capacity: largerTableOption.capacity })}
                                  </div>
                                </div>
                                <Icon path={mdiClock} size={0.67} className="text-muted-foreground" />
                              </div>
                            )}

                            {/* Admin override */}
                            <div
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                capacityAction === "override"
                                  ? "bg-pink-50 dark:bg-pink-950/20 border-pink-300 dark:border-pink-700"
                                  : "hover:bg-accent/50 border-border"
                              )}
                              onClick={() => {
                                setCapacityAction("override");
                              }}
                            >
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={capacityAction === "override"}
                                  onCheckedChange={(checked) => {
                                    setCapacityAction(checked ? "override" : null);
                                    if (!checked) setOverrideNote("");
                                  }}
                                  variant="pink"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground text-sm">
                                  {t("admin.reservationManagement.assignTable.overrideCapacity")}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {t("admin.reservationManagement.assignTable.overrideDescription")}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs border-pink-300 dark:border-pink-700">
                                {t("admin.reservationManagement.assignTable.admin")}
                              </Badge>
                            </div>
                          </div>

                          {/* Override note input */}
                          {capacityAction === "override" && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <Label className="text-sm text-foreground">{t("admin.reservationManagement.assignTable.overrideNote")}</Label>
                              <Input
                                value={overrideNote}
                                onChange={(e) => setOverrideNote(e.target.value)}
                                placeholder={t("admin.reservationManagement.assignTable.overrideNotePlaceholder")}
                                className="mt-1 bg-transparent text-foreground border-border"
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border flex-shrink-0">
              <Button
                onClick={() => {
                  setAssignTableDialogOpen(false);
                  setSelectedTableIds([]);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.reservationManagement.cancel")}
              </Button>
              <Button
                onClick={handleAssignTable}
                disabled={
                  selectedTableIds.length === 0 || 
                  isActionLoading === selectedReservation?.id ||
                  (() => {
                    const selectedTables = [...availableTables, ...assignedTables].filter((t) => selectedTableIds.includes(t.id));
                    const totalCapacity = selectedTables.reduce((sum, table) => sum + table.capacity, 0);
                    const requiredGuests = selectedReservation?.numberOfGuests || 0;
                    const isInsufficient = totalCapacity < requiredGuests;
                    // Allow if sufficient OR if insufficient but action is selected (except contact/wait)
                    return isInsufficient && (!capacityAction || capacityAction === "contact" || capacityAction === "wait");
                  })()
                }
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {isActionLoading === selectedReservation?.id ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("admin.reservationManagement.assignTable.assigning")}
                  </>
                ) : (
                  <>
                    <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                    {capacityAction === "contact" ? t("admin.reservationManagement.assignTable.contactCustomerButton") :
                     capacityAction === "wait" ? t("admin.reservationManagement.assignTable.waitForTable") :
                     t("admin.reservationManagement.assignTable.assignTable", { count: selectedTableIds.length })}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Table Confirmation Dialog */}
      <Dialog open={isAssignConfirmationOpen} onOpenChange={setIsAssignConfirmationOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.reservationManagement.assignConfirmation.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.reservationManagement.assignConfirmation.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => {
                setIsAssignConfirmationOpen(false);
                setTableToAssign(null);
                setSelectedTableIds([]);
              }}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("admin.reservationManagement.assignConfirmation.cancel")}
            </Button>
            <Button
              onClick={confirmAssignTable}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("admin.reservationManagement.assignConfirmation.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.reservationManagement.cancelDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.reservationManagement.cancelDialog.description", { 
                reservationNumber: reservations.find((r) => r.id === reservationToCancel)?.reservationNumber 
              })}
              {reservations.find((r) => r.id === reservationToCancel)?.type === "PRE_ORDER" && (
                <div className="mt-3 p-3 bg-yellow-500/20 dark:bg-yellow-900/20 border border-yellow-500/50 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {t("admin.reservationManagement.cancelDialog.preOrderWarning")}
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => setIsCancelDialogOpen(false)}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("admin.reservationManagement.cancelDialog.keepReservation")}
            </Button>
            <Button
              onClick={() => reservationToCancel && handleCancel(reservationToCancel)}
              disabled={isActionLoading === reservationToCancel}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isActionLoading === reservationToCancel ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("admin.reservationManagement.cancelDialog.cancelling")}
                </>
              ) : (
                t("admin.reservationManagement.cancelDialog.cancelReservation")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReservationManagement;
