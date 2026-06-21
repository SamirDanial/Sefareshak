import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiCalendar, mdiClock, mdiAccountGroup, mdiMapMarker, mdiArrowLeft, mdiEye, mdiCloseCircle, mdiCreditCard, mdiRefresh, mdiPencil, mdiOfficeBuilding, mdiTableFurniture, mdiChefHat } from "@mdi/js";
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
} from "@/services/reservationService";
import SocketService from "@/services/socketService";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";

const MyReservations: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken } = useAuth();
  const { currency } = useSettings();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [modifyFormData, setModifyFormData] = useState({
    date: undefined as Date | undefined,
    time: "",
    numberOfGuests: 0,
    orderItems: [] as any[], // For PRE_ORDER reservations
  });
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [reservationSettings] = useState<any>(null);

  useEffect(() => {
    loadReservations();
  }, []);

  // Scroll to top when navigating to this page
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // Refresh selectedReservation when view sheet opens to ensure we have latest paidAmount
  useEffect(() => {
    const refreshSelectedReservation = async () => {
      if (isViewDialogOpen && selectedReservation) {
        try {
          const token = await getToken();
          if (token) {
            const latestReservation = await reservationService.getReservationById(selectedReservation.id, token);
            setSelectedReservation(latestReservation);
          }
        } catch (error) {
          console.error("Error refreshing selected reservation:", error);
          // Don't show error to user, just use existing data
        }
      }
    };

    refreshSelectedReservation();
  }, [isViewDialogOpen]); // Only refresh when sheet opens, not on every selectedReservation change

  // Listen for real-time reservation status changes
  useEffect(() => {
    const socketService = SocketService.getInstance();
    let isMounted = true;

    const handleReservationStatusChange = (data: {
      reservationId: string;
      reservationNumber: string;
      status: string;
      updatedAt: string;
    }) => {
      if (!isMounted) return;

      // Update reservation in the list if it exists
      setReservations((prev) =>
        prev.map((res) =>
          res.id === data.reservationId
            ? {
                ...res,
                status: data.status as ReservationStatus,
                updatedAt: data.updatedAt,
              }
            : res
        )
      );

      // Update selectedReservation if it's the same reservation
      setSelectedReservation((prev) => {
        if (prev && prev.id === data.reservationId) {
          return {
            ...prev,
            status: data.status as ReservationStatus,
            updatedAt: data.updatedAt,
          };
        }
        return prev;
      });
    };

    // Handle reservation modification events (includes full reservation data with updated paidAmount)
    const handleReservationModified = (data: {
      notification: any;
      reservation: Reservation;
    }) => {
      if (!isMounted || !data.reservation) return;

      // Update reservation in the list if it exists
      setReservations((prev) =>
        prev.map((res) =>
          res.id === data.reservation.id
            ? {
                ...data.reservation,
                notifications: res.notifications ? [...res.notifications, data.notification].filter(Boolean) : (data.notification ? [data.notification] : []),
              }
            : res
        )
      );

      // Update selectedReservation if it's the same reservation (important for paidAmount updates)
      setSelectedReservation((prev) => {
        if (prev && prev.id === data.reservation.id) {
          return {
            ...data.reservation,
            notifications: prev.notifications ? [...prev.notifications, data.notification].filter(Boolean) : (data.notification ? [data.notification] : []),
          };
        }
        return prev;
      });
    };

    // Register listeners
    socketService.on("reservation-status-changed", handleReservationStatusChange);
    socketService.on("reservation-modified", handleReservationModified);

    // Cleanup
    return () => {
      isMounted = false;
      socketService.off("reservation-status-changed", handleReservationStatusChange);
      socketService.off("reservation-modified", handleReservationModified);
    };
  }, []);

  const loadReservations = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await reservationService.getUserReservations(1, 10, undefined, token || undefined);
      const updatedReservations = response.data.reservations || [];
      setReservations(updatedReservations);
      
      // Update selectedReservation if it exists in the updated list (to get latest paidAmount)
      setSelectedReservation((prev) => {
        if (prev) {
          const updatedReservation = updatedReservations.find((r: Reservation) => r.id === prev.id);
          if (updatedReservation) {
            return updatedReservation;
          }
        }
        return prev;
      });
    } catch (error: any) {
      console.error("Error loading reservations:", error);
      toast.error(t("reservations.myReservations.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedReservation) return;

    try {
      setCancelling(true);
      const token = await getToken();
      await reservationService.cancelReservation(
        selectedReservation.id,
        undefined,
        token || undefined
      );
      toast.success(t("reservations.myReservations.cancelDialog.cancelSuccess"));
      await loadReservations();
      setIsCancelDialogOpen(false);
      setIsViewDialogOpen(false);
      setSelectedReservation(null);
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      toast.error(
        error.response?.data?.error || t("reservations.myReservations.cancelDialog.cancelError")
      );
    } finally {
      setCancelling(false);
    }
  };

  const formatStatus = (status: ReservationStatus) => {
    const statusMap: Record<ReservationStatus, { label: string; color: string }> = {
      PENDING: { label: t("reservations.statuses.pending"), color: "#fbbf24" },
      CONFIRMED: { label: t("reservations.statuses.confirmed"), color: "#22c55e" },
      SEATED: { label: t("reservations.statuses.seated"), color: "#3b82f6" },
      COMPLETED: { label: t("reservations.statuses.completed"), color: "#6b7280" },
      CANCELLED: { label: t("reservations.statuses.cancelled"), color: "#ef4444" },
      NO_SHOW: { label: t("reservations.statuses.noshow"), color: "#ef4444" },
    };
    return statusMap[status] || { label: status, color: "#6b7280" };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const canCancel = (reservation: Reservation) => {
    return ["PENDING", "CONFIRMED"].includes(reservation.status);
  };

  const canModify = (reservation: Reservation) => {
    if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
      return false;
    }
    // Check modification window (will be checked on backend too)
    const now = new Date();
    const reservationDate = new Date(reservation.reservationDate);
    const hoursUntilReservation =
      (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Default to 24 hours if settings not loaded yet
    const modificationWindow = reservationSettings?.modificationWindowHours || 24;
    return hoursUntilReservation >= modificationWindow;
  };

  const openModifyDialog = async (reservation: Reservation) => {
    // Don't set modifyingReservationId here - only set it when user clicks "Add Items"
    // This matches mobile app behavior where cancel button only appears when adding items
    if (reservation.branch?.id) {
      sessionStorage.setItem("modifyingReservationBranchId", reservation.branch.id);
    }
    navigate(`/reservations/modify/${reservation.id}`);
  };

  const loadTimeSlots = async (date: string, numberOfGuests: number) => {
    try {
      setLoadingTimeSlots(true);
      const token = await getToken();
      const response = await reservationService.getAvailableTimeSlots(
        date,
        numberOfGuests,
        token || undefined
      );
      setAvailableTimeSlots(response.data.timeSlots || []);
    } catch (error) {
      console.error("Error loading time slots:", error);
      setAvailableTimeSlots([]);
    } finally {
      setLoadingTimeSlots(false);
    }
  };

  const handleModify = async () => {
    if (!selectedReservation) return;

    try {
      setModifying(true);
      const token = await getToken();
      
      // Prepare modification data
      const modificationData: any = {};
      
      if (modifyFormData.date && modifyFormData.time) {
        const year = modifyFormData.date.getFullYear();
        const month = String(modifyFormData.date.getMonth() + 1).padStart(2, "0");
        const day = String(modifyFormData.date.getDate()).padStart(2, "0");
        modificationData.reservationDate = `${year}-${month}-${day}`;
        modificationData.time = modifyFormData.time;
      }
      
      if (modifyFormData.numberOfGuests !== selectedReservation.numberOfGuests) {
        modificationData.numberOfGuests = modifyFormData.numberOfGuests;
      }

      // For PRE_ORDER, include orderItems (even if empty - empty means cancel reservation)
      if (selectedReservation.type === "PRE_ORDER") {
        modificationData.orderItems = modifyFormData.orderItems; // Can be empty array
      }
      
      // Ensure branchId is not sent (or matches original) - branch cannot be changed
      // The backend will validate this, but we should not send it at all
      if (modificationData.branchId) {
        delete modificationData.branchId;
      }
      
      let modifiedReservation;
      try {
        modifiedReservation = await reservationService.modifyReservation(
          selectedReservation.id,
          modificationData,
          token || undefined
        );
      } catch (modifyError: any) {
        // Re-throw the error to be caught by outer catch block
        // This ensures no success messages are shown when validation fails
        throw modifyError;
      }
      
      // Check if reservation was cancelled (all items removed)
      if (modifiedReservation.status === "CANCELLED") {
        // Reservation was cancelled - show cancellation message
        // The backend already processed the full refund using the actual Stripe payment amount
        // We'll show a message indicating full refund was processed
        const originalTotal = selectedReservation.reservationOrder?.totalAmount 
          ? Number(selectedReservation.reservationOrder.totalAmount) 
          : 0;
        const originalTax = selectedReservation.reservationOrder?.taxAmount 
          ? Number(selectedReservation.reservationOrder.taxAmount) 
          : 0;
        // Estimate full refund amount (backend uses actual Stripe amount which includes everything)
        const fullRefundAmount = originalTotal + (originalTax || 0);
        
        toast.success(
          <div className="space-y-2">
            <div className="font-semibold text-base">
              {t("reservations.myReservations.modifyDialog.cancelledSuccess")}
            </div>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("reservations.myReservations.modifyDialog.fullRefund")}</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  {formatPrice(fullRefundAmount, currency)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/30">
                {t("reservations.myReservations.modifyDialog.cancelledDescription")}
              </div>
            </div>
          </div>,
          {
            duration: 10000,
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            },
          }
        );
        
        // Close dialog and reload reservations
        setIsModifyDialogOpen(false);
        // Clear modification mode
        sessionStorage.removeItem("modifyingReservationId");
        sessionStorage.removeItem("modifyingReservationBranchId");
        loadReservations();
        return;
      }
      
      // Calculate refund amount - use the actual payment amount, not just stored totalAmount
      // The backend now retrieves the actual Stripe payment amount, so the refund will be correct
      const originalTotal = selectedReservation.reservationOrder?.totalAmount 
        ? Number(selectedReservation.reservationOrder.totalAmount) 
        : 0;
      const newTotal = modifiedReservation.reservationOrder?.totalAmount 
        ? Number(modifiedReservation.reservationOrder.totalAmount) 
        : 0;
      
      // Note: The actual refund processed by backend uses the real Stripe payment amount
      // This calculation is just for display - the backend handles the correct refund
      const refundAmount = originalTotal - newTotal;
      
      // Show meaningful notification
      if (refundAmount > 0) {
        toast.success(
          <div className="space-y-2">
            <div className="font-semibold text-base">
              {t("reservations.myReservations.modifyDialog.modifiedSuccess")}
            </div>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("reservations.myReservations.modifyDialog.refundAmount")}</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  {formatPrice(refundAmount, currency)}
                </span>
              </div>
              <div className="text-xs text-white pt-1 border-t border-border/30">
                {t("reservations.myReservations.modifyDialog.refundDescription")}
              </div>
            </div>
          </div>,
          {
            duration: 8000,
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
            },
          }
        );
      } else {
        toast.success(t("reservations.myReservations.modifyDialog.modifySuccess"));
      }
      
      // Update selectedReservation with the modified reservation data to ensure paidAmount is updated
      if (selectedReservation && selectedReservation.id === modifiedReservation.id) {
        setSelectedReservation(modifiedReservation);
        try {
          const latest = await reservationService.getReservationById(
            modifiedReservation.id,
            token || undefined
          );
          setSelectedReservation(latest);
        } catch (refreshError) {
          console.error("Error refetching reservation after modify:", refreshError);
        }
      }
      
      await loadReservations();
      setIsModifyDialogOpen(false);
      // Don't clear selectedReservation if view dialog might still be open - let user see updated data
      // setSelectedReservation(null);
      // Clear modification mode
      sessionStorage.removeItem("modifyingReservationId");
      sessionStorage.removeItem("modifyingReservationBranchId");
    } catch (error: any) {
      console.error("Error modifying reservation:", error);
      toast.error(
        error.response?.data?.error || t("reservations.myReservations.modifyDialog.modifyError")
      );
    } finally {
      setModifying(false);
    }
  };

  const handleDateChange = async (date: Date | undefined) => {
    setModifyFormData({ ...modifyFormData, date, time: "" }); // Clear time when date changes
    if (date && modifyFormData.numberOfGuests > 0) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      await loadTimeSlots(dateStr, modifyFormData.numberOfGuests);
    } else {
      setAvailableTimeSlots([]);
    }
  };

  const handleGuestsChange = async (guests: number) => {
    setModifyFormData({ ...modifyFormData, numberOfGuests: guests });
    if (modifyFormData.date && guests > 0) {
      const year = modifyFormData.date.getFullYear();
      const month = String(modifyFormData.date.getMonth() + 1).padStart(2, "0");
      const day = String(modifyFormData.date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      await loadTimeSlots(dateStr, guests);
    }
  };

  const upcomingReservations = reservations.filter(
    (r) => new Date(r.reservationDate) >= new Date() && r.status !== "CANCELLED"
  );
  const pastReservations = reservations.filter(
    (r) => new Date(r.reservationDate) < new Date() || r.status === "CANCELLED"
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] loading-fade-in">
      <div className="max-w-7xl mx-auto px-4 pt-0 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors"
          >
            <Icon path={mdiArrowLeft} size={0.83} className="text-pink-500" />
            <span className="text-sm font-medium">{t("reservations.myReservations.back")}</span>
          </button>
          <h1 className="text-lg font-semibold text-white whitespace-nowrap">{t("reservations.myReservations.title")}</h1>
          <Button
            onClick={() => navigate("/reservations/book")}
            size="sm"
            className="bg-pink-500 text-white hover:bg-pink-600 flex items-center gap-2"
          >
            <Icon path={mdiCalendar} size={0.67} />
            {t("reservations.myReservations.new")}
          </Button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Icon path={mdiRefresh} size={1.33} className="animate-spin text-pink-500" />
            <p className="text-[#9CA3AF] text-sm mt-3">{t("reservations.myReservations.loading")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Upcoming Reservations */}
            {upcomingReservations.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-4">{t("reservations.myReservations.upcoming")}</h2>
                <div className="space-y-3">
                  {upcomingReservations.map((reservation) => {
                    const statusInfo = formatStatus(reservation.status);
                    const tables = reservation.tables?.map((rt: any) => rt.table) || [];
                    const legacyTable = reservation.table ? [reservation.table] : [];
                    const allTables = [...tables, ...legacyTable].filter((t, index, self) => 
                      index === self.findIndex((table) => table?.id === t?.id)
                    );
                    const zoneName = reservation.zone?.name || 
                      reservation.tables?.[0]?.table?.zoneRelation?.name ||
                      reservation.table?.zoneRelation?.name ||
                      reservation.preferredZone;
                    
                    return (
                      <div key={reservation.id} className="bg-[#171717] rounded-xl p-4 border border-[#262626]">
                        {/* Reservation Header */}
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-base font-bold text-white">
                            {reservation.reservationNumber}
                          </h3>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className="text-xs font-semibold px-2 py-0.5 rounded-md"
                              style={{ 
                                backgroundColor: `${statusInfo.color}20`,
                                color: statusInfo.color,
                                border: `1px solid ${statusInfo.color}40`
                              }}
                            >
                              {statusInfo.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Reservation Info */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Icon path={mdiCalendar} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">{formatDate(reservation.reservationDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon path={mdiClock} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">{formatTime(reservation.reservationDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon path={mdiAccountGroup} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">
                              {reservation.numberOfGuests} {t("reservations.myReservations.guests")}
                            </span>
                          </div>
                          {reservation.branch && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiOfficeBuilding} size={0.67} className="text-[#9CA3AF]" />
                              <span className="text-sm text-[#D1D5DB]">
                                {t("reservations.myReservations.details.branch") || "Branch:"} {reservation.branch.name}
                              </span>
                            </div>
                          )}
                          {zoneName && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiMapMarker} size={0.67} className="text-[#9CA3AF]" />
                              <span className="text-sm text-[#D1D5DB]">
                                {t("reservations.myReservations.details.zone") || "Zone/Area:"} {zoneName}
                              </span>
                            </div>
                          )}
                          {allTables.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiTableFurniture} size={0.67} className="text-[#9CA3AF]" />
                              <div className="flex flex-wrap gap-2">
                                {allTables.map((table: any) => (
                                  <span
                                    key={table?.id}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-pink-500/10 text-pink-500 border border-pink-500/20"
                                  >
                                    {table?.tableNumber}
                                    {table?.capacity && ` (${table.capacity} ${t("reservations.myReservations.details.seats") || "seats"})`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiCreditCard} size={0.67} className="text-[#9CA3AF]" />
                              <span className="text-sm text-[#D1D5DB]">
                                {t("reservations.myReservations.order")}: {formatPrice(reservation.reservationOrder.totalAmount, currency)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              // Fetch latest reservation data to ensure we have updated paidAmount
                              try {
                                const token = await getToken();
                                if (token) {
                                  const latestReservation = await reservationService.getReservationById(reservation.id, token);
                                  setSelectedReservation(latestReservation);
                                } else {
                                  setSelectedReservation(reservation);
                                }
                              } catch (error) {
                                console.error("Error fetching latest reservation:", error);
                                // Fallback to using reservation from list
                                setSelectedReservation(reservation);
                              }
                              setIsViewDialogOpen(true);
                            }}
                            className={`bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 border border-pink-500/30 h-8 px-3 text-sm font-semibold ${
                              !canModify(reservation) && !canCancel(reservation) ? "w-full justify-center" : ""
                            }`}
                          >
                            <Icon path={mdiEye} size={0.67} className="mr-1.5" />
                            {t("reservations.myReservations.view")}
                          </Button>
                          {canModify(reservation) && (
                            <Button
                              size="sm"
                              onClick={() => openModifyDialog(reservation)}
                              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 h-8 px-3 text-sm font-semibold"
                            >
                              <Icon path={mdiPencil} size={0.67} className="mr-1.5" />
                              {t("reservations.myReservations.modify")}
                            </Button>
                          )}
                          {canCancel(reservation) && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedReservation(reservation);
                                setIsCancelDialogOpen(true);
                              }}
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 h-8 px-3 text-sm font-semibold"
                            >
                              <Icon path={mdiCloseCircle} size={0.67} className="mr-1.5" />
                              {t("reservations.myReservations.cancel")}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past Reservations */}
            {pastReservations.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-4">{t("reservations.myReservations.past")}</h2>
                <div className="space-y-3">
                  {pastReservations.map((reservation) => {
                    const statusInfo = formatStatus(reservation.status);
                    const tables = reservation.tables?.map((rt: any) => rt.table) || [];
                    const legacyTable = reservation.table ? [reservation.table] : [];
                    const allTables = [...tables, ...legacyTable].filter((t, index, self) => 
                      index === self.findIndex((table) => table?.id === t?.id)
                    );
                    const zoneName = reservation.zone?.name || 
                      reservation.tables?.[0]?.table?.zoneRelation?.name ||
                      reservation.table?.zoneRelation?.name ||
                      reservation.preferredZone;
                    
                    return (
                      <div key={reservation.id} className="bg-[#171717] rounded-xl p-4 border border-[#262626] opacity-70">
                        {/* Reservation Header */}
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-base font-bold text-white">
                            {reservation.reservationNumber}
                          </h3>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className="text-xs font-semibold px-2 py-0.5 rounded-md"
                              style={{ 
                                backgroundColor: `${statusInfo.color}20`,
                                color: statusInfo.color,
                                border: `1px solid ${statusInfo.color}40`
                              }}
                            >
                              {statusInfo.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Reservation Info */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Icon path={mdiCalendar} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">{formatDate(reservation.reservationDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon path={mdiClock} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">{formatTime(reservation.reservationDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon path={mdiAccountGroup} size={0.67} className="text-[#9CA3AF]" />
                            <span className="text-sm text-[#D1D5DB]">
                              {reservation.numberOfGuests} {t("reservations.myReservations.guests")}
                            </span>
                          </div>
                          {reservation.branch && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiOfficeBuilding} size={0.67} className="text-[#9CA3AF]" />
                              <span className="text-sm text-[#D1D5DB]">
                                {t("reservations.myReservations.details.branch") || "Branch:"} {reservation.branch.name}
                              </span>
                            </div>
                          )}
                          {zoneName && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiMapMarker} size={0.67} className="text-[#9CA3AF]" />
                              <span className="text-sm text-[#D1D5DB]">
                                {t("reservations.myReservations.details.zone") || "Zone/Area:"} {zoneName}
                              </span>
                            </div>
                          )}
                          {allTables.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Icon path={mdiTableFurniture} size={0.67} className="text-[#9CA3AF]" />
                              <div className="flex flex-wrap gap-2">
                                {allTables.map((table: any) => (
                                  <span
                                    key={table?.id}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-pink-500/10 text-pink-500 border border-pink-500/20"
                                  >
                                    {table?.tableNumber}
                                    {table?.capacity && ` (${table.capacity} ${t("reservations.myReservations.details.seats") || "seats"})`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Button */}
                        <Button
                          size="sm"
                          onClick={async () => {
                            // Fetch latest reservation data to ensure we have updated paidAmount
                            try {
                              const token = await getToken();
                              if (token) {
                                const latestReservation = await reservationService.getReservationById(reservation.id, token);
                                setSelectedReservation(latestReservation);
                              } else {
                                setSelectedReservation(reservation);
                              }
                            } catch (error) {
                              console.error("Error fetching latest reservation:", error);
                              // Fallback to using reservation from list
                              setSelectedReservation(reservation);
                            }
                            setIsViewDialogOpen(true);
                          }}
                          className="w-full bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 border border-pink-500/30 h-8 px-3 text-sm font-semibold justify-center"
                        >
                          <Icon path={mdiEye} size={0.67} className="mr-1.5" />
                          {t("reservations.myReservations.view")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reservations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <Icon path={mdiCalendar} size={2.67} className="text-[#6b7280] mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{t("reservations.myReservations.noReservations")}</h3>
                <p className="text-sm text-[#9CA3AF] text-center mb-6 max-w-md">
                  {t("reservations.myReservations.noReservationsDescription")}
                </p>
                <Button
                  onClick={() => navigate("/reservations/book")}
                  className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
                >
                  <Icon path={mdiCalendar} size={0.83} />
                  {t("reservations.myReservations.makeReservation")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Details Bottom Sheet */}
      <Sheet open={isViewDialogOpen} onOpenChange={(open) => {
        setIsViewDialogOpen(open);
        // When closing the sheet, optionally clear selectedReservation
        if (!open) {
          // Keep selectedReservation in case user wants to reopen quickly
          // setSelectedReservation(null);
        }
      }}>
        <SheetContent 
          side="bottom" 
          className="max-h-[90vh] overflow-y-auto bg-[#151718] border-t border-[#262626] text-white p-0 rounded-t-3xl"
        >
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-lg sm:text-xl font-bold text-white break-words">
                {t("reservations.myReservations.details.title")}
              </SheetTitle>
              <SheetDescription className="text-[#9CA3AF]">
                {selectedReservation?.reservationNumber}
              </SheetDescription>
            </SheetHeader>
            {selectedReservation && (
              <>
              <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">{t("reservations.myReservations.details.status") || "Status"}:{" "}</span>
                <Badge 
                  className="text-[10px] px-1.5 py-0"
                  style={{ 
                    backgroundColor: `${formatStatus(selectedReservation.status).color}20`,
                    color: formatStatus(selectedReservation.status).color,
                    border: `1px solid ${formatStatus(selectedReservation.status).color}40`
                  }}
                >
                  {formatStatus(selectedReservation.status).label}
                </Badge>
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">
                  {t("reservations.myReservations.details.date") || "Date & Time"}:{" "}
                  <span className="text-white font-medium">
                    {formatDate(selectedReservation.reservationDate)} {formatTime(selectedReservation.reservationDate)}
                  </span>
                </span>
              </div>

              {/* Number of Guests */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">
                  {t("reservations.myReservations.details.guests") || "Number of Guests"}:{" "}
                  <span className="text-white font-medium">{selectedReservation.numberOfGuests}</span>
                </span>
              </div>

              {/* Branch */}
              {selectedReservation.branch && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#9CA3AF] text-sm">
                    {t("reservations.myReservations.details.branch") || "Branch"}:{" "}
                    <span className="text-white font-medium">{selectedReservation.branch.name}</span>
                  </span>
                </div>
              )}

              {/* Zone */}
              {(() => {
                const zoneName = selectedReservation.zone?.name || 
                  selectedReservation.tables?.[0]?.table?.zoneRelation?.name ||
                  selectedReservation.table?.zoneRelation?.name ||
                  selectedReservation.preferredZone;
                if (zoneName) {
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#9CA3AF] text-sm">
                        {t("reservations.myReservations.details.zone") || "Zone/Area"}:{" "}
                        <span className="text-white font-medium">{zoneName}</span>
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Tables */}
              {(() => {
                const tables = selectedReservation.tables?.map((rt: any) => rt.table) || [];
                const legacyTable = selectedReservation.table ? [selectedReservation.table] : [];
                const allTables = [...tables, ...legacyTable].filter((t, index, self) => 
                  index === self.findIndex((table) => table?.id === t?.id)
                );
                
                if (allTables.length > 0) {
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#9CA3AF] text-sm">{t("reservations.myReservations.details.tables") || "Tables"}:{" "}</span>
                      <div className="flex flex-wrap gap-2">
                        {allTables.map((table: any, idx: number) => (
                          <span
                            key={table?.id || idx}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-pink-500/10 text-pink-500 border border-pink-500/20"
                          >
                            {table?.tableNumber} ({table?.capacity} {t("reservations.myReservations.details.seats") || "seats"})
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Customer Name */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">
                  {t("reservations.myReservations.details.name") || "Name"}:{" "}
                  <span className="text-white font-medium truncate">{selectedReservation.customerName}</span>
                </span>
              </div>

              {/* Customer Email */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">
                  {t("reservations.myReservations.details.email") || "Email"}:{" "}
                  <span className="text-white font-medium truncate">{selectedReservation.customerEmail}</span>
                </span>
              </div>

              {/* Customer Phone */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#9CA3AF] text-sm">
                  {t("reservations.myReservations.details.phone") || "Phone"}:{" "}
                  <span className="text-white font-medium">{selectedReservation.customerPhone}</span>
                </span>
              </div>

              {/* Special Requests */}
              {selectedReservation.specialRequests && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[#9CA3AF] text-sm">
                    {t("reservations.myReservations.details.requests") || "Special Requests"}:{" "}
                    <span className="text-white text-sm break-words">{selectedReservation.specialRequests}</span>
                  </span>
                </div>
              )}
              </div>
              {selectedReservation.type === "PRE_ORDER" && selectedReservation.reservationOrder && (
                <div className="border-t border-[#262626] pt-6 space-y-6 px-4">
                  {/* Order Items */}
                  {selectedReservation.reservationOrder.items && selectedReservation.reservationOrder.items.length > 0 && (
                    <div>
                      {(() => {
                        const itemCount =
                          selectedReservation.reservationOrder.items.length;
                        const itemsLabel =
                          t("reservations.myReservations.details.items") || "Order Items";
                        return (
                          <h3 className="text-sm font-bold text-white mb-3">
                            {itemsLabel} ({itemCount})
                          </h3>
                        );
                      })()}
                      <div className="space-y-3">
                        {selectedReservation.reservationOrder.items.map((item: any, index: number) => {
                          const totalAddonsPrice = item.addons && item.addons.length > 0
                            ? item.addons.reduce((sum: number, addOn: any) => {
                                return sum + (Number(addOn.addOnPrice || 0) * (addOn.quantity || 1));
                              }, 0)
                            : 0;
                          const mealPrice = Number(item.unitPrice) * item.quantity;
                          const itemSubtotal = mealPrice + totalAddonsPrice;
                          const included = item.optionalIngredients?.filter((ing: any) => ing.isIncluded) || [];

                          return (
                            <div
                              key={index}
                              className="bg-[#1a1a1a] rounded-lg p-3 border border-[#262626]"
                            >
                              {/* Main Item Info */}
                              <div className="flex gap-3 items-center">
                                {item.meal?.image && (
                                  <img
                                    src={
                                      isExternalImage(item.meal.image)
                                        ? item.meal.image
                                        : getOptimizedImageUrl(item.meal.image)
                                    }
                                    alt={item.meal.name}
                                    className="w-10 h-10 rounded object-cover flex-shrink-0 border border-[#262626]"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = "/placeholder-meal.png";
                                    }}
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold text-white text-sm">
                                          {item.meal?.name || t("reservations.myReservations.details.meal")}
                                        </h4>
                                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-[#404040] text-[#D1D5DB]">
                                          {item.selectedSize}
                                        </Badge>
                                        <span className="text-xs text-[#9CA3AF]">×</span>
                                        <span className="text-xs text-white font-medium">{item.quantity}</span>
                                      </div>
                                    </div>
                                    <p className="font-bold text-sm text-pink-500 whitespace-nowrap">
                                      {formatPrice(itemSubtotal, currency)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Add-ons */}
                              {item.addons && item.addons.length > 0 && (
                                <div className="ml-12 mt-2 space-y-1">
                                  {item.addons.map((addOn: any) => {
                                    const addonQuantity = addOn.quantity || 1;
                                    const addonTotalPrice = Number(addOn.addOnPrice || 0) * addonQuantity;
                                    const addonName = addOn.addOnName || addOn.addon?.name || t("reservations.myReservations.details.addon");
                                    
                                    return (
                                      <div key={addOn.id} className="flex items-center justify-between text-xs">
                                        <span className="text-[#9CA3AF]">
                                          + {addonName}{addonQuantity > 1 && ` ×${addonQuantity}`}
                                        </span>
                                        <span className="text-white font-medium">
                                          {formatPrice(addonTotalPrice, currency)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Optional Ingredients & Special Instructions */}
                              {(included.length > 0 || item.specialInstructions) && (
                                <div className="ml-12 mt-2 space-y-1">
                                  {included.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {included.map((ing: any) => (
                                        <span
                                          key={ing.id}
                                          className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-[9px] border border-green-500/30"
                                        >
                                          {ing.ingredientName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {item.specialInstructions && (
                                    <p className="text-[#9CA3AF] italic break-words text-xs">
                                      {item.specialInstructions}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Order Summary */}
                      <div className="mt-6">
                        <h3 className="text-base font-bold text-white mb-3">{t("reservations.myReservations.details.orderSummary") || "Order Summary"}</h3>
                        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#262626]">
                          <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-[#9CA3AF]">{t("reservations.myReservations.details.subtotal")}</span>
                            <span className="text-white font-medium">
                              {formatPrice(
                                Number(selectedReservation.reservationOrder.totalAmount) -
                                Number(selectedReservation.reservationOrder.taxAmount || 0),
                                currency
                              )}
                            </span>
                          </div>
                          {selectedReservation.reservationOrder.taxAmount && Number(selectedReservation.reservationOrder.taxAmount) > 0 && (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-[#9CA3AF]">{t("reservations.myReservations.details.tax")}</span>
                                <span className="text-white font-medium">
                                  {formatPrice(Number(selectedReservation.reservationOrder.taxAmount), currency)}
                                </span>
                              </div>
                              {(selectedReservation.reservationOrder.itemTaxAmount !== undefined ||
                                selectedReservation.reservationOrder.addonTaxAmount !== undefined) && (
                                <div className="ml-3 space-y-1 text-xs">
                                  {selectedReservation.reservationOrder.itemTaxAmount !== undefined && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-[#9CA3AF]">{t("reservations.myReservations.details.itemTax")}</span>
                                      <span className="text-white">
                                        {formatPrice(
                                          Number(selectedReservation.reservationOrder.itemTaxAmount || 0),
                                          currency
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {selectedReservation.reservationOrder.addonTaxAmount !== undefined && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-[#9CA3AF]">{t("reservations.myReservations.details.addonTax")}</span>
                                      <span className="text-white">
                                        {formatPrice(
                                          Number(selectedReservation.reservationOrder.addonTaxAmount || 0),
                                          currency
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-[#262626] mt-2">
                            <span className="text-white font-bold text-base">{t("reservations.myReservations.details.total")}</span>
                            <span className="text-pink-500 font-bold text-lg">
                              {formatPrice(Number(selectedReservation.reservationOrder.totalAmount), currency)}
                            </span>
                          </div>
                          {/* Show paid amount vs total if deposit was used */}
                          {selectedReservation.reservationOrder && (
                            (() => {
                              // Prefer reservationOrder.paidAmount (source of truth), fall back to payment.amount
                              const paidAmount = Number(
                                selectedReservation.reservationOrder.paidAmount ??
                                  selectedReservation.reservationOrder.payment?.amount ??
                                  selectedReservation.reservationOrder.totalAmount ??
                                  0
                              );
                              const total = Number(selectedReservation.reservationOrder.totalAmount ?? 0);
                              if (isNaN(paidAmount) || isNaN(total)) return null;
                              if (Math.abs(paidAmount - total) < 0.001) return null;
                              const remaining = total - paidAmount;
                              return (
                            <>
                              <div className="flex justify-between items-center pt-2 border-t border-[#262626] mt-2">
                                <span className="text-[#9CA3AF] text-sm">{t("reservations.myReservations.details.paidAmount") || "Paid Amount"}</span>
                                <span className="text-green-500 font-semibold text-base">
                                  {formatPrice(paidAmount, currency)}
                                </span>
                              </div>
                              {selectedReservation.reservationOrder.depositPercentage && (
                                <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-1">
                                  <span>{t("reservations.myReservations.details.depositPercentage") || "Deposit"}</span>
                                  <span>{Number(selectedReservation.reservationOrder.depositPercentage)}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center pt-2 border-t border-[#262626] mt-2">
                                <span className="text-[#9CA3AF] text-sm">{t("reservations.myReservations.details.remainingBalance") || "Remaining Balance"}</span>
                                <span className="text-amber-500 font-semibold text-base">
                                  {formatPrice(remaining, currency)}
                                </span>
                              </div>
                            </>
                              );
                            })()
                          )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-2xl bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("reservations.myReservations.cancelDialog.title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("reservations.myReservations.cancelDialog.description")}{" "}
              <strong className="text-foreground">{selectedReservation?.reservationNumber}</strong>?
            </DialogDescription>
          </DialogHeader>
          {selectedReservation?.type === "PRE_ORDER" && (
            <div className="mt-3 p-3 bg-yellow-500/20 dark:bg-yellow-900/20 border border-yellow-500/50 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("reservations.myReservations.cancelDialog.preOrderWarning")}
              </p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsCancelDialogOpen(false)}
              className="border-border text-foreground hover:bg-muted"
            >
              {t("reservations.myReservations.cancelDialog.keepReservation")}
            </Button>
            <Button
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("reservations.myReservations.cancelDialog.cancelling")}
                </>
              ) : (
                t("reservations.myReservations.cancelDialog.cancelReservation")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modify Reservation Dialog - Compact */}
      <Dialog open={isModifyDialogOpen} onOpenChange={setIsModifyDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-card border-border text-foreground">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle className="text-sm font-semibold text-foreground">{t("reservations.myReservations.modifyDialog.title")}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("reservations.myReservations.modifyDialog.description")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
            {selectedReservation && (
              <div className="space-y-2 py-2">
              {/* Branch cannot be changed notice */}
              {selectedReservation.branch?.id && (
                <div className="bg-blue-500/10 dark:bg-blue-900/20 border border-blue-500/30 dark:border-blue-800/30 rounded-lg p-2 mb-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> The branch for this reservation cannot be changed. All items must be available at the original branch.
                  </p>
                </div>
              )}
              {/* Date Selection - Compact */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-foreground min-w-[80px]">{t("reservations.myReservations.modifyDialog.selectDate")}</Label>
                <DatePicker
                  date={modifyFormData.date}
                  onDateChange={handleDateChange}
                  placeholder={t("reservations.myReservations.modifyDialog.chooseDate")}
                  minDate={new Date()}
                  maxDate={
                    reservationSettings?.maxAdvanceBookingDays
                      ? new Date(
                          Date.now() +
                            reservationSettings.maxAdvanceBookingDays * 24 * 60 * 60 * 1000
                        )
                      : undefined
                  }
                />
              </div>

              {/* Number of Guests - Compact */}
              <div className="flex items-center gap-2">
                <Label htmlFor="modify-guests" className="text-xs text-foreground min-w-[80px]">{t("reservations.myReservations.modifyDialog.numberOfGuests")}</Label>
                <Input
                  id="modify-guests"
                  type="number"
                  min="1"
                  max={reservationSettings?.maxGuestsPerReservation || 20}
                  value={modifyFormData.numberOfGuests || ""}
                  onChange={(e) => handleGuestsChange(Number(e.target.value))}
                  className="flex-1 bg-transparent text-sm text-foreground border-border"
                />
              </div>

              {/* Time Slot Selection - Dropdown */}
              {modifyFormData.date && modifyFormData.numberOfGuests > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-foreground min-w-[80px]">{t("reservations.myReservations.modifyDialog.timeSlot")}</Label>
                  {loadingTimeSlots ? (
                    <div className="flex items-center justify-center flex-1 py-2 bg-muted/30 rounded-lg border border-border">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
                    </div>
                  ) : availableTimeSlots.length > 0 ? (
                    <Select
                      value={modifyFormData.time || ""}
                      onValueChange={(value) => setModifyFormData({ ...modifyFormData, time: value })}
                    >
                      <SelectTrigger className="flex-1 bg-transparent text-sm border-border">
                        <SelectValue placeholder={t("reservations.myReservations.modifyDialog.selectTimeSlot")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTimeSlots.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex-1 p-2 bg-muted/30 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground text-center">
                        {t("reservations.myReservations.modifyDialog.noTimeSlots")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Pre-Order Items Section - Compact */}
              {selectedReservation.type === "PRE_ORDER" && selectedReservation.reservationOrder && (
                <div className="space-y-2">
                  {(() => {
                    // Check if items have been removed by comparing original items with current items
                    const originalItems = selectedReservation.reservationOrder?.items || [];
                    const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
                    const currentItemIds = modifyFormData.orderItems.map((item: any) => item.mealId);
                    const removedItems = originalItems.filter((item: any) => !currentItemIds.includes(item.mealId));
                    const hasRemovedItems = removedItems.length > 0;
                    
                    // Check if items have been added (items in current list that weren't in original)
                    const hasAddedItems = modifyFormData.orderItems.some((item: any) => !originalItemIds.has(item.mealId));
                    
                    return (
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-foreground">{t("reservations.myReservations.modifyDialog.orderItems")}</Label>
                        {!hasRemovedItems && !hasAddedItems && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Navigate to menu to add more items
                              // Store reservation ID and branchId in sessionStorage to return here
                              sessionStorage.setItem("modifyingReservationId", selectedReservation.id);
                              if (selectedReservation.branch?.id) {
                                sessionStorage.setItem("modifyingReservationBranchId", selectedReservation.branch.id);
                              }
                              navigate("/menu?reservation=pre-order&modify=true");
                            }}
                            className="bg-transparent border-border text-foreground hover:bg-muted/50 text-xs h-7 px-2"
                          >
                            <Icon path={mdiChefHat} size={0.5} className="mr-1.5" />
                            {t("reservations.myReservations.modifyDialog.addItems")}
                          </Button>
                        )}
                        {hasRemovedItems && (
                          <span className="text-xs text-muted-foreground italic">
                            {t("reservations.myReservations.modifyDialog.completeBeforeAdding")}
                          </span>
                        )}
                        {hasAddedItems && !hasRemovedItems && (
                          <span className="text-xs text-muted-foreground italic">
                            {t("reservations.myReservations.modifyDialog.completeBeforeRemoving")}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  
                  {modifyFormData.orderItems.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto p-2 bg-muted/20 rounded-lg border border-border">
                      {modifyFormData.orderItems.map((item: any, index: number) => (
                        <div key={index} className="flex items-start justify-between gap-2 p-1.5 bg-transparent rounded border border-border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-xs text-foreground">
                                {item.meal?.name || `${t("reservations.myReservations.details.meal")} ${index + 1}`}
                              </span>
                              {item.mealSizeType && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {item.mealSizeType}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Qty: {item.quantity}
                            </div>
                            {item.addons && item.addons.length > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Addons: {item.addons.map((a: any) => a.name).join(", ")}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 italic truncate">
                                Note: {item.specialInstructions}
                              </div>
                            )}
                          </div>
                          {(() => {
                            // Check if this item is from the original order (not newly added)
                            const originalItems = selectedReservation.reservationOrder?.items || [];
                            const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
                            const isOriginalItem = originalItemIds.has(item.mealId);
                            
                            // Check if any items have been added (items in current list that weren't in original)
                            const hasAddedItems = modifyFormData.orderItems.some((it: any) => !originalItemIds.has(it.mealId));
                            
                            // Only show remove button if:
                            // 1. This is an original item (not newly added)
                            // 2. No items have been added (user can only remove OR add, not both)
                            const canRemove = isOriginalItem && !hasAddedItems;
                            
                            return canRemove ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newItems = modifyFormData.orderItems.filter((_, i) => i !== index);
                                  setModifyFormData({ ...modifyFormData, orderItems: newItems });
                                }}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0 flex-shrink-0"
                              >
                                <Icon path={mdiCloseCircle} size={0.50} />
                              </Button>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-muted/30 rounded-lg border border-border text-center">
                      <p className="text-xs text-muted-foreground">
                        {t("reservations.myReservations.modifyDialog.noItems")}
                      </p>
                    </div>
                  )}
                  
                  {/* Calculate estimated refund/charge */}
                  {(() => {
                    const originalItems = selectedReservation.reservationOrder?.items || [];
                    const modifiedItemIds = modifyFormData.orderItems.map((item: any) => item.mealId);
                    const removedItems = originalItems.filter((item: any) => !modifiedItemIds.includes(item.mealId));
                    
                    // Get the original total amount paid (includes meal + addons + tax)
                    const originalTotal = selectedReservation.reservationOrder?.totalAmount 
                      ? Number(selectedReservation.reservationOrder.totalAmount) 
                      : 0;
                    
                    // Calculate estimated refund amount
                    // If ALL items are removed, refund the FULL amount paid (€32.09)
                    // If SOME items are removed, calculate based on removed items including addons and tax
                    let estimatedRefund = 0;
                    if (removedItems.length > 0) {
                      if (removedItems.length === originalItems.length) {
                        // All items removed - refund the FULL amount paid
                        estimatedRefund = originalTotal;
                      } else {
                        // Some items removed - calculate properly including meal + addons + tax
                        // item.totalPrice is meal price only, addons are stored separately
                        estimatedRefund = removedItems.reduce((sum: number, item: any) => {
                          // Meal price (from totalPrice which is unitPrice * quantity)
                          const mealPrice = Number(item.totalPrice || 0);
                          
                          // Addon prices (stored separately in item.addons)
                          const addonTotal = (item.addons || []).reduce((addonSum: number, addon: any) => {
                            const addonPrice = Number(addon.addOnPrice || 0);
                            const addonQuantity = Number(addon.quantity || 1);
                            // addon.quantity already includes item.quantity multiplication from backend
                            return addonSum + (addonPrice * addonQuantity);
                          }, 0);
                          
                          // Meal tax (stored in item.taxAmount)
                          const mealTax = Number(item.taxAmount || 0);
                          
                          // Addon tax (stored separately in each addon.taxAmount)
                          const addonTaxTotal = (item.addons || []).reduce((taxSum: number, addon: any) => {
                            return taxSum + Number(addon.taxAmount || 0);
                          }, 0);
                          
                          // Total tax = meal tax + addon tax
                          const totalTax = mealTax + addonTaxTotal;
                          
                          // Total for this removed item: meal + addons + meal tax + addon tax
                          const itemTotal = mealPrice + addonTotal + totalTax;
                          return sum + itemTotal;
                        }, 0);
                      }
                    }
                    
                    return (
                      <div className="space-y-2">
                        {removedItems.length > 0 && estimatedRefund > 0 && (
                          <div className="p-2 bg-green-500/10 dark:bg-green-900/30 border border-green-500/30 dark:border-green-800/50 rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-medium text-green-800 dark:text-green-200">
                                {t("reservations.myReservations.modifyDialog.estimatedRefund")}
                              </span>
                              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                {formatPrice(estimatedRefund, currency)}
                              </span>
                            </div>
                            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                              {t("reservations.myReservations.modifyDialog.refundNote")}
                            </p>
                          </div>
                        )}
                        
                        <div className="p-2 bg-yellow-500/10 dark:bg-yellow-900/30 border border-yellow-500/30 dark:border-yellow-800/50 rounded-lg">
                          <p className="text-xs text-yellow-800 dark:text-yellow-200">
                            <strong className="font-semibold">{t("common.note")}:</strong> {t("reservations.myReservations.modifyDialog.modificationNote")} 
                            {removedItems.length > 0 
                              ? ` ${t("reservations.myReservations.modifyDialog.removedItemsRefund")}`
                              : ` ${t("reservations.myReservations.modifyDialog.chargeOrRefund")}`
                            }
                            {selectedReservation.reservationOrder && (
                              <span className="block mt-0.5 text-[10px]">
                                {t("reservations.myReservations.modifyDialog.currentOrderTotal")} {formatPrice(originalTotal, currency)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Modification Window Notice - Compact */}
              {reservationSettings?.modificationWindowHours && (
                <div className="p-2 bg-blue-500/10 dark:bg-blue-900/30 border border-blue-500/30 dark:border-blue-800/50 rounded-lg">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    {t("reservations.myReservations.modifyDialog.modificationWindow")} <strong className="font-semibold">{reservationSettings.modificationWindowHours}</strong> {t("reservations.myReservations.modifyDialog.modificationWindowHours")}
                  </p>
                </div>
              )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              onClick={() => setIsModifyDialogOpen(false)}
              className="bg-transparent border border-border text-foreground hover:bg-muted/50 hover:text-foreground text-sm h-8 px-3"
            >
              {t("reservations.myReservations.modifyDialog.cancel")}
            </Button>
            <Button
              onClick={handleModify}
              disabled={modifying || !modifyFormData.date || !modifyFormData.time || modifyFormData.numberOfGuests < 1}
              className="bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm h-8 px-3"
            >
              {modifying ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("reservations.myReservations.modifyDialog.modifying")}
                </>
              ) : (
                t("reservations.myReservations.modifyDialog.saveChanges")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyReservations;

