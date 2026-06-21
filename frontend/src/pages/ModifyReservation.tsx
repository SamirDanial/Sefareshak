import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import {
  reservationService,
  type Reservation,
  type ZoneFloorPlan,
} from "@/services/reservationService";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiCalendar, mdiClock, mdiAccountGroup, mdiArrowLeft, mdiRefresh, mdiPlus, mdiClose, mdiMapMarker, mdiSilverwareForkKnife, mdiFloorPlan, mdiArrowRight, mdiAlertCircle, mdiLoading } from "@mdi/js";
import { FloorPlanViewer } from "@/components/FloorPlanViewer";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useSettings } from "@/contexts/SettingsContext";
import { useCartStore } from "@/store/cartStore";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ModifyReservation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { currency } = useSettings();
  const { clearCart } = useCartStore();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [modifyFormData, setModifyFormData] = useState({
    date: undefined as Date | undefined,
    time: "",
    numberOfGuests: 0,
    orderItems: [] as any[],
    zoneId: null as string | null,
    zoneName: "" as string,
    tableIds: [] as string[],
    tableNumbers: [] as string[],
  });

  // Zone and table selection state
  const [availableZones, setAvailableZones] = useState<any[]>([]);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [reservedTables, setReservedTables] = useState<any[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  
  // Store original table IDs from the reservation (these should always be treated as available)
  const [originalTableIds, setOriginalTableIds] = useState<string[]>([]);

  // Bottom sheet states
  const [isZoneSheetOpen, setIsZoneSheetOpen] = useState(false);
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  
  // Time slot filter for segmented control
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  
  // Ref to prevent clearing during initial load
  const isInitialLoadRef = useRef(true);

  const loadReservationData = async () => {
    if (!id) {
      navigate("/reservations/my-reservations");
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        toast.error(t("reservations.checkout.signInRequired"));
        navigate("/reservations/my-reservations");
        return;
      }
      const res = await reservationService.getReservationById(id, token);
      setReservation(res);

      // Prefill form data
      const dateObj = new Date(res.reservationDate);
      const extractedTime = (() => {
        try {
          const dt = new Date(res.reservationDate);
          const h = String(dt.getHours()).padStart(2, "0");
          const m = String(dt.getMinutes()).padStart(2, "0");
          return `${h}:${m}`;
        } catch {
          return "";
        }
      })();

      // Convert reservation order items to format for modification (matching mobile app format)
      let orderItems: any[] = [];
      if (res.type === "PRE_ORDER" && res.reservationOrder?.items) {
        orderItems = res.reservationOrder.items.map((item: any) => {
          const itemQuantity = item.quantity || 1;
          return {
            mealId: item.mealId,
            meal: item.meal ? {
              id: item.meal.id,
              name: item.meal.name,
              image: item.meal.image,
            } : null,
            mealSizeType: item.mealSizeType || item.size || "M",
            quantity: itemQuantity,
            addons: (item.addons || item.addOns || []).map((addon: any) => {
              const storedAddonQuantity = addon.quantity || 1;
              const perItemAddonQuantity = Math.max(1, Math.round(storedAddonQuantity / itemQuantity));
              
              return {
                addonId: addon.addon_id || addon.addonId,
                name: addon.addOnName || addon.name,
                quantity: perItemAddonQuantity,
                price: Number(addon.addOnPrice || addon.price || 0),
                type: addon.addon_type || addon.type || "BOOLEAN",
                sizeType: addon.addonSizeType || addon.sizeType,
              };
            }),
            optionalIngredients: (item.optionalIngredients || []).map((ing: any) => ({
              id: ing.optionalIngredientId || ing.id,
              name: ing.ingredientName || ing.name,
              isIncluded: ing.isIncluded,
            })),
            specialInstructions: item.specialInstructions,
          };
        });
      }

      // Get zone and table info from reservation
      // The API returns tables as pivot records with nested table objects:
      // tables: [{ table: { id, tableNumber, zoneId, zoneRelation: { id, name } } }]
      const firstTableRecord = res.tables?.[0];
      const firstTable = (firstTableRecord as any)?.table || firstTableRecord;
      const zoneId =
        (firstTable as any)?.zoneId ||
        (firstTable as any)?.zoneRelation?.id ||
        res.zone?.id ||
        null;
      const zoneName =
        (firstTable as any)?.zoneRelation?.name || res.zone?.name || "";
      const tableIds = res.tables?.map((t: any) => t.table?.id || t.id).filter(Boolean) || [];
      const tableNumbers = res.tables?.map((t: any) => t.table?.tableNumber || t.tableNumber).filter(Boolean) || [];
      
      // Store original table IDs so we can treat them as available when modifying
      setOriginalTableIds(tableIds);
      
      setModifyFormData({
        date: dateObj,
        time: extractedTime,
        numberOfGuests: res.numberOfGuests || 0,
        orderItems,
        zoneId,
        zoneName,
        tableIds,
        tableNumbers,
      });
      
      // Load floor plan if zone is set
      if (zoneId) {
        try {
          const floorPlanResponse = await reservationService.getZoneFloorPlan(zoneId, token);
          setFloorPlanData(floorPlanResponse);
        } catch (floorPlanErr) {
          console.warn("Failed to load floor plan:", floorPlanErr);
        }
      }
      
      // Mark initial load complete after a short delay
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);

      // Load reservation settings and initial time slots
      try {
        const settings = await reservationService.getSettings(
          token,
          res.branch?.id
        );
        setReservationSettings(settings);
      } catch (settingsErr) {
        console.warn("Failed to load reservation settings:", settingsErr);
        setReservationSettings(null);
      }

      await loadTimeSlotsWrapper(dateObj, res.numberOfGuests || 0, token);
    } catch (error: any) {
      console.error("Failed to load reservation:", error);
      toast.error(
        error?.response?.data?.error ||
          t("reservations.myReservations.loadError")
      );
      navigate("/reservations/my-reservations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Reload reservation data when returning from menu/checkout
  useEffect(() => {
    const handleFocus = () => {
      // Check if we're returning from adding items
      const modifyingReservationId = sessionStorage.getItem("modifyingReservationId");
      if (modifyingReservationId === id) {
        // Reload reservation data to get updated items
        loadReservationData();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load zones when reservation is loaded
  useEffect(() => {
    if (reservation?.branch?.id) {
      loadZones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.branch?.id]);

  // Load tables when zone, date, time, or guests change
  useEffect(() => {
    if (!isInitialLoadRef.current && modifyFormData.zoneId && modifyFormData.date && modifyFormData.time && modifyFormData.numberOfGuests > 0) {
      loadTables(modifyFormData.zoneId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifyFormData.zoneId, modifyFormData.date, modifyFormData.time, modifyFormData.numberOfGuests]);

  // Load floor plan when zone is set (for initial load)
  useEffect(() => {
    if (modifyFormData.zoneId && !floorPlanData) {
      loadFloorPlan(modifyFormData.zoneId, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifyFormData.zoneId]);

  // Time slot grouping helper
  type TimeSlotPeriod = 'morning' | 'afternoon' | 'evening';
  
  const getTimeSlotPeriod = (time: string): TimeSlotPeriod => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
  };
  
  const groupedTimeSlots = useMemo(() => {
    const groups: Record<TimeSlotPeriod | 'all', string[]> = {
      all: availableTimeSlots,
      morning: [],
      afternoon: [],
      evening: []
    };
    
    availableTimeSlots.forEach(time => {
      const period = getTimeSlotPeriod(time);
      groups[period].push(time);
    });
    
    return groups;
  }, [availableTimeSlots]);
  
  const filteredTimeSlots = timeSlotFilter === 'all' 
    ? availableTimeSlots 
    : groupedTimeSlots[timeSlotFilter];

  const loadTimeSlotsWrapper = async (
    date: Date | undefined,
    guests: number,
    token?: string | null
  ) => {
    if (!date || guests < 1) {
      setAvailableTimeSlots([]);
      return;
    }
    const formattedDate = date.toISOString().split("T")[0];
    try {
      setLoadingTimeSlots(true);
      const authToken = token || (await getToken()) || undefined;
      const response = await reservationService.getAvailableTimeSlots(
        formattedDate,
        guests,
        authToken,
        reservation?.branch?.id
      );
      setAvailableTimeSlots(response.data.timeSlots || []);
    } catch (error) {
      console.error("Error loading time slots:", error);
      setAvailableTimeSlots([]);
    } finally {
      setLoadingTimeSlots(false);
    }
  };

  // Load zones for the branch
  const loadZones = async () => {
    if (!reservation?.branch?.id) return;
    try {
      setLoadingZones(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(reservation.branch.id, token);
      setAvailableZones(response.zones || []);
    } catch (error) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  // Load tables for a zone
  const loadTables = async (zoneId: string) => {
    if (!reservation?.branch?.id || !modifyFormData.date || !modifyFormData.time || modifyFormData.numberOfGuests < 1) {
      return;
    }
    try {
      setLoadingTables(true);
      const token = (await getToken()) || undefined;
      const year = modifyFormData.date.getFullYear();
      const month = String(modifyFormData.date.getMonth() + 1).padStart(2, "0");
      const day = String(modifyFormData.date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      
      const response = await reservationService.getTableAvailability(
        dateStr,
        modifyFormData.time,
        modifyFormData.numberOfGuests,
        token,
        reservation.branch.id,
        zoneId
      );
      
      let zoneAvailableTables = (response.data?.available || []).filter((t: any) => t.zoneId === zoneId || t.zoneRelation?.id === zoneId);
      let zoneReservedTables = (response.data?.reserved || []).filter((t: any) => t.zoneId === zoneId || t.zoneRelation?.id === zoneId);
      
      // IMPORTANT: Tables that belong to the CURRENT reservation being modified should be treated as available
      // Move any originally-selected tables from reserved to available
      if (originalTableIds.length > 0) {
        const originalTablesInReserved = zoneReservedTables.filter((t: any) => originalTableIds.includes(t.id));
        if (originalTablesInReserved.length > 0) {
          // Add original tables to available (if not already there)
          const availableIds = new Set(zoneAvailableTables.map((t: any) => t.id));
          originalTablesInReserved.forEach((t: any) => {
            if (!availableIds.has(t.id)) {
              zoneAvailableTables.push(t);
            }
          });
          // Remove original tables from reserved
          zoneReservedTables = zoneReservedTables.filter((t: any) => !originalTableIds.includes(t.id));
        }
      }
      
      setAvailableTables(zoneAvailableTables);
      setReservedTables(zoneReservedTables);
    } catch (error) {
      console.error("Error loading tables:", error);
      setAvailableTables([]);
      setReservedTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  // Load floor plan for a zone
  const loadFloorPlan = async (zoneId: string, openSheet: boolean = true) => {
    try {
      setLoadingFloorPlan(true);
      const token = (await getToken()) || undefined;
      const data = await reservationService.getZoneFloorPlan(zoneId, token);
      setFloorPlanData(data);
      
      const hasFloorPlan = 
        (data.tables && data.tables.some((t: any) => t.positionX !== 0 || t.positionY !== 0)) ||
        (data.floorElements && data.floorElements.length > 0);
      
      if (hasFloorPlan && openSheet) {
        setIsFloorPlanOpen(true);
      }
    } catch (error) {
      console.error("Error loading floor plan:", error);
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  // Handle table selection from floor plan
  const handleFloorPlanTableSelect = (tableId: string) => {
    const table = floorPlanData?.tables.find((t: any) => t.id === tableId);
    if (!table) return;
    
    // Check if table is already selected (allow deselection even if not "available")
    const isAlreadySelected = modifyFormData.tableIds.includes(tableId);
    
    // Check if table is available (for new selections)
    // Original tables from this reservation are always considered available
    const isAvailable = availableTables.some((t: any) => t.id === tableId) || originalTableIds.includes(tableId);
    
    // If trying to select a new table and it's not available, return
    if (!isAlreadySelected && !isAvailable) return;
    
    setModifyFormData(prev => {
      const currentIds = prev.tableIds;
      const currentNumbers = prev.tableNumbers;
      
      if (currentIds.includes(tableId)) {
        // Deselect - always allow
        const index = currentIds.indexOf(tableId);
        return {
          ...prev,
          tableIds: currentIds.filter(id => id !== tableId),
          tableNumbers: currentNumbers.filter((_, i) => i !== index),
        };
      } else {
        // Check capacity
        const currentCapacity = currentIds.reduce((sum, id) => {
          const t = availableTables.find((at: any) => at.id === id) || floorPlanData?.tables.find((ft: any) => ft.id === id);
          return sum + (t?.capacity || 0);
        }, 0);
        
        if (currentCapacity >= prev.numberOfGuests) {
          // Capacity already met
          return prev;
        }
        
        // Select
        return {
          ...prev,
          tableIds: [...currentIds, tableId],
          tableNumbers: [...currentNumbers, table.tableNumber],
        };
      }
    });
  };

  const handleSave = async () => {
    if (!reservation) return;
    if (!modifyFormData.date || !modifyFormData.time) {
      toast.error(t("reservations.myReservations.modifyDialog.missingFields"));
      return;
    }
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) {
        toast.error(t("reservations.checkout.signInRequired"));
        return;
      }
      const year = modifyFormData.date.getFullYear();
      const month = String(modifyFormData.date.getMonth() + 1).padStart(2, "0");
      const day = String(modifyFormData.date.getDate()).padStart(2, "0");
      const newDateStr = `${year}-${month}-${day}`;
      const originalDate = new Date(reservation.reservationDate);
      const originalDateStr = `${originalDate.getFullYear()}-${String(originalDate.getMonth() + 1).padStart(2, "0")}-${String(originalDate.getDate()).padStart(2, "0")}`;
      const originalTimeStr = `${String(originalDate.getHours()).padStart(2, "0")}:${String(originalDate.getMinutes()).padStart(2, "0")}`;
      const payload: any = {};

      // Only send date/time if they actually changed to avoid triggering availability/operating-hours validation when just editing items
      if (newDateStr !== originalDateStr || modifyFormData.time !== originalTimeStr) {
        payload.reservationDate = newDateStr;
        payload.time = modifyFormData.time;
      }

      // Only send number of guests if changed
      if (modifyFormData.numberOfGuests !== reservation.numberOfGuests) {
        payload.numberOfGuests = modifyFormData.numberOfGuests;
      }
      
      // Send zone and table IDs if they have been set
      if (modifyFormData.zoneId) {
        payload.zoneId = modifyFormData.zoneId;
      }
      if (modifyFormData.tableIds && modifyFormData.tableIds.length > 0) {
        payload.tableIds = modifyFormData.tableIds;
      }
      
      // For PRE_ORDER, only include orderItems if they have been modified
      // This prevents the backend from recalculating totals when only time/date/guests change
      if (reservation.type === "PRE_ORDER") {
        const originalItems = reservation.reservationOrder?.items || [];
        const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
        const currentItemIds = new Set(modifyFormData.orderItems.map((item: any) => item.mealId));
        
        // Check if items have been added or removed
        const hasAddedItems = modifyFormData.orderItems.some((item: any) => !originalItemIds.has(item.mealId));
        const hasRemovedItems = originalItems.some((item: any) => !currentItemIds.has(item.mealId));
        
        // Only send orderItems if they have been modified (added or removed)
        // Empty array means cancel reservation, so always send if empty
        if (hasAddedItems || hasRemovedItems || modifyFormData.orderItems.length === 0) {
          payload.orderItems = modifyFormData.orderItems;
        }
        // If orderItems haven't changed, don't send them to avoid backend recalculating totals
      }
      await reservationService.modifyReservation(reservation.id, payload, token);
      // Clear modification mode after successful save
      sessionStorage.removeItem("modifyingReservationId");
      sessionStorage.removeItem("modifyingReservationBranchId");
      toast.success(t("reservations.myReservations.modifyDialog.success"));
      navigate("/reservations/my-reservations");
    } catch (error: any) {
      console.error("Failed to modify reservation:", error);
      toast.error(
        error?.response?.data?.error ||
          t("reservations.myReservations.modifyDialog.error")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddItems = () => {
    if (!reservation) return;
    sessionStorage.setItem("modifyingReservationId", reservation.id);
    if (reservation.branch?.id) {
      sessionStorage.setItem("modifyingReservationBranchId", reservation.branch.id);
    }
    navigate("/menu?reservation=pre-order&modify=true");
  };

  const handleRemoveItem = (index: number) => {
    const originalItems = reservation?.reservationOrder?.items || [];
    const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
    const hasAddedItems = modifyFormData.orderItems.some((item: any) => !originalItemIds.has(item.mealId));
    
    // Only allow removal if no items have been added
    if (!hasAddedItems) {
      const newItems = modifyFormData.orderItems.filter((_, i) => i !== index);
      setModifyFormData({ ...modifyFormData, orderItems: newItems });
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getCurrentOrderTotal = () => {
    if (!reservation?.reservationOrder?.totalAmount) return 0;
    return Number(reservation.reservationOrder.totalAmount);
  };

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const minDate = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => {
    if (reservationSettings?.maxAdvanceBookingDays) {
      return new Date(
        Date.now() + reservationSettings.maxAdvanceBookingDays * 24 * 60 * 60 * 1000
      );
    }
    return undefined;
  }, [reservationSettings]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4 text-center text-muted-foreground">
        <Icon path={mdiRefresh} size={0.83} className="animate-spin inline-block mr-2" />
        {t("reservations.myReservations.loading")}
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="container mx-auto py-8 px-4 text-center text-muted-foreground">
        {t("reservations.myReservations.loadError")}
      </div>
    );
  }

  const getSizeLabel = (item: any) => {
    const candidates = [
      item.size,
      item.mealSizeType,
      item.sizeType,
      item.mealSize?.name,
      item.mealSize?.sizeType,
      item.size?.name,
      item.size?.label,
    ];
    const found = candidates.find((c) => c !== undefined && c !== null && `${c}`.trim() !== "");
    return found ? `${found}`.trim() : null;
  };

  // Check if items can be removed (only if no new items have been added)
  const originalItems = reservation.reservationOrder?.items || [];
  const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
  const hasAddedItems = modifyFormData.orderItems.some((item: any) => !originalItemIds.has(item.mealId));
  const canRemoveItems = !hasAddedItems;
  const removedItems = originalItems.filter(
    (item: any) => !modifyFormData.orderItems.some((modItem: any) => modItem.mealId === item.mealId)
  );
  const paymentProvider = reservation.reservationOrder?.payment?.paymentProvider;
  const originalTotalAmount = reservation?.reservationOrder?.totalAmount
    ? Number(reservation.reservationOrder.totalAmount)
    : 0;
  let estimatedRefundAmount = 0;
  if (removedItems.length > 0) {
    if (removedItems.length === originalItems.length) {
      // All items removed -> full refund (matches mobile logic)
      estimatedRefundAmount = originalTotalAmount;
    } else {
      // Partial removal -> include meal + addons + taxes (match mobile calculation)
      estimatedRefundAmount = removedItems.reduce((sum: number, item: any) => {
        const mealQuantity = Number(item.quantity || 1);
        const mealPrice = Number(item.totalPrice || item.unitPrice * mealQuantity || 0);
        const addonTotal = (item.addons || []).reduce((addonSum: number, addon: any) => {
          const addonPrice = Number(addon.addOnPrice || addon.price || 0);
          const addonQuantity = Number(addon.quantity || 1);
          return addonSum + addonPrice * addonQuantity;
        }, 0);
        const mealTax = Number(item.taxAmount || 0);
        const addonTaxTotal = (item.addons || []).reduce(
          (taxSum: number, addon: any) => taxSum + Number(addon.taxAmount || 0),
          0
        );
        return sum + mealPrice + addonTotal + mealTax + addonTaxTotal;
      }, 0);
    }
  }
  const refundNoteText =
    paymentProvider === "PAYPAL"
      ? t(
          "reservations.myReservations.modifyDialog.paypalRefundNote",
          "Refunds via PayPal can take up to 180 days to complete."
        )
      : paymentProvider === "STRIPE"
      ? t(
          "reservations.myReservations.modifyDialog.stripeRefundNote",
          "Card/Stripe refunds typically appear within 5-10 business days."
        )
      : t(
          "reservations.myReservations.modifyDialog.refundNote",
          "Refund will be processed automatically to your original payment method within 5-10 business days."
        );

  return (
    <>
      <div className="mx-auto w-full pt-0 pb-6 px-4 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <Link
          to="/reservations/my-reservations"
          className="flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors"
        >
          <Icon path={mdiArrowLeft} size={0.83} className="text-pink-500" />
          <span className="text-sm font-medium">
            {t("reservations.checkout.back")}
          </span>
        </Link>
        <h1 className="text-lg font-semibold text-white whitespace-nowrap">
          {t("reservations.myReservations.modifyDialog.title", "Modify Reservation")}
        </h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>
      <div className="space-y-5">
        {reservation.branch?.id && (
          <div className="bg-[#11263f] border border-blue-500/40 rounded-lg p-3">
            <p className="text-xs text-blue-100 leading-snug">
              <strong>Note:</strong> The branch for this reservation cannot be changed. All items must be available at the original branch.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm text-foreground flex items-center gap-2 whitespace-nowrap">
              <Icon path={mdiCalendar} size={0.67} className="text-pink-500" />
              {t("reservations.myReservations.modifyDialog.selectDate")} :
            </Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-pink-500 font-semibold text-sm hover:text-pink-400"
                >
                  {modifyFormData.date ? formatDate(modifyFormData.date) : t("reservations.myReservations.modifyDialog.chooseDate") || "Choose Date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <ReactDatePicker
                  selected={modifyFormData.date}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setModifyFormData((prev) => ({ ...prev, date }));
                      loadTimeSlotsWrapper(date, modifyFormData.numberOfGuests).catch(() => {});
                    }
                    setIsDatePickerOpen(false);
                  }}
                  minDate={minDate}
                  maxDate={maxDate}
                  inline
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm text-foreground flex items-center gap-2 whitespace-nowrap">
              <Icon path={mdiAccountGroup} size={0.67} className="text-pink-500" />
              {t("reservations.myReservations.modifyDialog.numberOfGuests")} :
            </Label>
            <Input
              type="number"
              min={1}
              value={modifyFormData.numberOfGuests || ""}
              onChange={(e) => {
                const value = Number(e.target.value);
                setModifyFormData((prev) => ({
                  ...prev,
                  numberOfGuests: value,
                }));
                loadTimeSlotsWrapper(modifyFormData.date, value).catch(() => {});
              }}
              className="w-28 bg-transparent text-sm border-border"
            />
          </div>

          {modifyFormData.date && modifyFormData.numberOfGuests > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm text-foreground flex items-center gap-2 whitespace-nowrap">
                <Icon path={mdiClock} size={0.67} className="text-pink-500" />
                {t("reservations.myReservations.modifyDialog.timeSlot")} :
              </Label>
              <button
                type="button"
                onClick={() => setIsTimeSheetOpen(true)}
                className="text-pink-500 font-semibold text-sm hover:text-pink-400"
              >
                {modifyFormData.time || t("reservations.myReservations.modifyDialog.timeSlot") || "Time Slot"}
              </button>
            </div>
          )}

          {/* Zone Selection */}
          {modifyFormData.date && modifyFormData.time && modifyFormData.numberOfGuests > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm text-foreground flex items-center gap-2 whitespace-nowrap">
                <Icon path={mdiMapMarker} size={0.67} className="text-pink-500" />
                {t("reservations.checkout.zone") || "Zone"} :
              </Label>
              <button
                type="button"
                onClick={() => setIsZoneSheetOpen(true)}
                disabled={loadingZones}
                className="text-pink-500 font-semibold text-sm hover:text-pink-400 disabled:opacity-50"
              >
                {loadingZones ? (
                  <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                ) : modifyFormData.zoneName ? (
                  modifyFormData.zoneName
                ) : (
                  t("reservations.booking.tapToSelectZone") || "Tap to select"
                )}
              </button>
            </div>
          )}

          {/* Table Selection */}
          {modifyFormData.date && modifyFormData.time && modifyFormData.numberOfGuests > 0 && modifyFormData.zoneId && (
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm text-foreground flex items-center gap-2 whitespace-nowrap">
                <Icon path={mdiSilverwareForkKnife} size={0.67} className="text-pink-500" />
                {t("reservations.checkout.tables") || "Tables"} :
              </Label>
              <button
                type="button"
                onClick={() => {
                  if (floorPlanData) {
                    loadTables(modifyFormData.zoneId!);
                    setIsFloorPlanOpen(true);
                  } else {
                    loadFloorPlan(modifyFormData.zoneId!);
                  }
                }}
                disabled={loadingFloorPlan || loadingTables}
                className="text-pink-500 font-semibold text-sm hover:text-pink-400 disabled:opacity-50"
              >
                {loadingFloorPlan || loadingTables ? (
                  <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                ) : modifyFormData.tableNumbers.length > 0 ? (
                  modifyFormData.tableNumbers.length === 1
                    ? `${t("reservations.checkout.table") || "Table"} ${modifyFormData.tableNumbers[0]}`
                    : modifyFormData.tableNumbers.join(", ")
                ) : (
                  t("reservations.booking.addTable") || "Add table"
                )}
              </button>
            </div>
          )}
        </div>

        {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                {t("reservations.myReservations.modifyDialog.orderItems") || "Order Items"}
              </p>
              {canRemoveItems ? (
                <button
                  type="button"
                  onClick={handleAddItems}
                  className="flex items-center gap-1.5 bg-transparent border border-[#404040] rounded-md px-2.5 py-1.5 hover:bg-[#1a1a1a] transition-colors"
                >
                  <Icon path={mdiPlus} size={0.67} className="text-pink-500" />
                  <span className="text-xs font-semibold text-pink-500">
                    {t("reservations.myReservations.modifyDialog.addItems")}
                  </span>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {hasAddedItems
                    ? t("reservations.myReservations.modifyDialog.completeBeforeRemoving") || "Please complete adding items before removing any."
                    : t("reservations.myReservations.modifyDialog.completeBeforeAdding") || "Please complete removing items before adding new ones."}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {modifyFormData.orderItems.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4">
                  {t("reservations.myReservations.modifyDialog.noItems") || "No items in order"}
                </div>
              ) : (
                modifyFormData.orderItems.map((item: any, index: number) => {
                  const isOriginalItem = originalItemIds.has(item.mealId);
                  const canRemove = isOriginalItem && canRemoveItems;
                  
                  return (
                    <div
                      key={`${item.mealId}-${item.mealSizeType || item.size}-${index}`}
                      className="relative flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3"
                      style={{ minHeight: 68 }}
                    >
                      {canRemove && (
                        <button
                          type="button"
                          aria-label="Remove item"
                          className="absolute right-3 top-3 text-pink-500 hover:text-pink-400 transition-colors z-10"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Icon path={mdiClose} size={0.67} />
                        </button>
                      )}
                      <div className="h-12 w-12 overflow-hidden rounded-md bg-[#0f0f0f] flex-shrink-0">
                        {item.meal?.image || item.image ? (
                          <img
                            src={item.meal?.image || item.image}
                            alt={item.meal?.name || item.mealName || "Item"}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="flex flex-col flex-1 justify-center pr-8">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white leading-tight">
                            {item.meal?.name || item.mealName || "Item"}
                          </span>
                          {getSizeLabel(item) && (
                            <span className="px-2 py-0.5 rounded border border-[#404040] text-foreground text-[10px] uppercase bg-[#0f0f0f]">
                              {getSizeLabel(item)}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground font-semibold">
                            ×{item.quantity || 1}
                          </span>
                        </div>
                        {item.addons && item.addons.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.addons.map((addon: any, addonIndex: number) => (
                              <p key={addonIndex} className="text-xs text-muted-foreground">
                                + {addon.name || "Addon"}
                                {addon.quantity > 1 && ` ×${addon.quantity}`}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
          <div className="space-y-2">
            {removedItems.length > 0 && estimatedRefundAmount > 0 && (
              <div className="rounded-lg p-3 bg-emerald-900/20 border border-emerald-500/40 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300">
                    {t("reservations.myReservations.modifyDialog.estimatedRefund") || "Estimated Refund"}
                  </span>
                  <span className="text-sm font-bold text-emerald-300">
                    {formatPrice(estimatedRefundAmount, currency)}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200 mt-1">
                  {refundNoteText}
                </p>
              </div>
            )}
            <div className="rounded-lg p-3 bg-[#2a2010] border border-[#7b5a1c] shadow-sm">
              <p className="text-xs text-[#f2d08a] leading-snug">
                {t("reservations.myReservations.modifyDialog.modificationNote") ||
                  "Modifying order items will recalculate the total."}{" "}
                {removedItems.length > 0
                  ? t("reservations.myReservations.modifyDialog.removedItemsRefund") || "Removed items will be refunded automatically."
                  : t("reservations.myReservations.modifyDialog.chargeOrRefund") || "You will be charged or refunded the difference automatically."}
              </p>
              <p className="text-[10px] text-[#f2d08a] mt-1">
                {t("reservations.myReservations.modifyDialog.currentOrderTotal") || "Current order total:"}{" "}
                {formatPrice(getCurrentOrderTotal(), currency)}
              </p>
            </div>
          </div>
        )}
        {reservationSettings?.modificationWindowHours ? (
          <div className="rounded-lg p-3 bg-[#102442] border border-[#1e4b8a] shadow-sm">
            <p className="text-xs text-[#99b8f2] leading-snug">
              {t("reservations.myReservations.modifyDialog.modificationWindow") || "Reservations can be modified up to"} {reservationSettings.modificationWindowHours} {t("reservations.myReservations.modifyDialog.modificationWindowHours") || "hours before the reservation time"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg p-3 bg-[#102442] border border-[#1e4b8a] shadow-sm">
            <p className="text-xs text-[#99b8f2] leading-snug">
              {t("reservations.checkout.modificationWindow") ||
                "Reservations can be modified up to 24 hours before the reservation time."}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border border-[#404040] text-[#9CA3AF] bg-transparent h-12 font-semibold"
              onClick={() => {
                // Clear modification mode - same as navbar "Cancel Editing" button
                sessionStorage.removeItem("modifyingReservationId");
                sessionStorage.removeItem("modifyingReservationBranchId");
                // Clear cart
                clearCart();
                // Show toast
                toast.success(t("reservations.myReservations.modification.exited") || "Reservation editing cancelled. Cart cleared.");
                // Navigate to reservations page
                navigate("/reservations/my-reservations");
                // Trigger storage events to update other components
                window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationId" }));
                window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationBranchId" }));
              }}
              disabled={saving}
            >
              {t("reservations.myReservations.modifyDialog.cancel") || "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !modifyFormData.date || !modifyFormData.time || modifyFormData.numberOfGuests < 1}
              className="flex-1 h-12 bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 font-semibold"
            >
              {saving ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("reservations.myReservations.modifyDialog.modifying")}
                </>
              ) : (
                t("reservations.myReservations.modifyDialog.saveChanges")
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Time Slot Selection Bottom Sheet */}
      <Sheet open={isTimeSheetOpen} onOpenChange={setIsTimeSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] bg-[#151718] border-t border-[#262626] text-white rounded-t-3xl p-0 pt-8">
          <SheetHeader className="px-4 pb-4 border-b border-[#333]">
            <SheetTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                <span>{t("reservations.booking.selectTimeSlot") || "Select Time Slot"}</span>
              </div>
              {modifyFormData.time && (
                <Badge className="bg-pink-500 text-white">
                  {modifyFormData.time}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          
          {loadingTimeSlots ? (
            <div className="flex items-center justify-center py-16">
              <Icon path={mdiLoading} size={1.5} className="animate-spin text-pink-500" />
            </div>
          ) : availableTimeSlots.length === 0 ? (
            <div className="p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-[#262626] p-4">
                  <Icon path={mdiAlertCircle} size={1.5} className="text-gray-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">
                    {t("reservations.booking.noTimeSlots")}
                  </h3>
                  <p className="text-sm text-gray-400 max-w-md">
                    {t("reservations.booking.noTimeSlotsDescription")}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Time Period Tabs - Sliding Segmented Control */}
              <div className="px-4 py-3 border-b border-[#333]">
                <div className="relative bg-[#262626] rounded-xl p-1">
                  {/* Sliding Indicator */}
                  <div 
                    className="absolute top-1 bottom-1 bg-pink-500 rounded-lg transition-all duration-300 ease-out"
                    style={{
                      width: 'calc(25% - 2px)',
                      left: `calc(${(['all', 'morning', 'afternoon', 'evening'] as const).indexOf(timeSlotFilter)} * 25% + 2px)`,
                    }}
                  />
                  
                  {/* Tab Buttons */}
                  <div className="relative flex">
                    {(['all', 'morning', 'afternoon', 'evening'] as const).map((period) => {
                      const count = period === 'all' ? availableTimeSlots.length : groupedTimeSlots[period].length;
                      const labels: Record<typeof period, string> = {
                        all: t("reservations.booking.allTimes") || "All",
                        morning: t("reservations.booking.morning") || "Morning",
                        afternoon: t("reservations.booking.afternoon") || "Afternoon",
                        evening: t("reservations.booking.evening") || "Evening"
                      };
                      const isDisabled = period !== 'all' && count === 0;
                      const isActive = timeSlotFilter === period;
                      
                      return (
                        <button
                          key={period}
                          type="button"
                          onClick={() => !isDisabled && setTimeSlotFilter(period)}
                          disabled={isDisabled}
                          className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors duration-200 rounded-lg z-10 ${
                            isActive
                              ? "text-white"
                              : isDisabled
                              ? "text-gray-600 cursor-not-allowed"
                              : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span>{labels[period]}</span>
                            <span className={`text-[10px] ${isActive ? "text-white/80" : "text-gray-500"}`}>
                              ({count})
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Time Slots Grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredTimeSlots.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {t("reservations.booking.noSlotsInPeriod") || "No slots available in this period"}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {filteredTimeSlots.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => {
                          setModifyFormData((prev) => ({ ...prev, time }));
                          setIsTimeSheetOpen(false);
                        }}
                        className={`p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                          modifyFormData.time === time
                            ? "bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/30"
                            : "border-[#333] bg-[#1a1a1a] text-white hover:border-pink-400 hover:bg-[#262626]"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {modifyFormData.time === time && (
                            <div className="h-2 w-2 rounded-full bg-white" />
                          )}
                          {time}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Zone Selection Bottom Sheet */}
      <Sheet open={isZoneSheetOpen} onOpenChange={setIsZoneSheetOpen}>
        <SheetContent side="bottom" className="h-[60vh] bg-[#151718] border-t border-[#262626] text-white rounded-t-3xl p-0 pt-8">
          <SheetHeader className="px-4 pb-4 border-b border-[#333]">
            <SheetTitle className="text-white flex items-center gap-2">
              <Icon path={mdiMapMarker} size={0.83} className="text-pink-500" />
              <span>{t("reservations.booking.selectZone") || "Select Zone"}</span>
            </SheetTitle>
          </SheetHeader>
          
          {loadingZones ? (
            <div className="flex items-center justify-center py-16">
              <Icon path={mdiLoading} size={1.5} className="animate-spin text-pink-500" />
            </div>
          ) : availableZones.length === 0 ? (
            <div className="p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-[#262626] p-4">
                  <Icon path={mdiAlertCircle} size={1.5} className="text-gray-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">
                    {t("reservations.booking.noZonesAvailable") || "No Zones Available"}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {t("reservations.booking.noZonesDescription") || "There are no zones configured for this branch."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {availableZones.map((zone: any) => (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={async () => {
                      setModifyFormData(prev => ({
                        ...prev,
                        zoneId: zone.id,
                        zoneName: zone.name,
                        tableIds: [],
                        tableNumbers: [],
                      }));
                      setIsZoneSheetOpen(false);
                      await loadFloorPlan(zone.id);
                    }}
                    disabled={loadingFloorPlan}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      modifyFormData.zoneId === zone.id
                        ? "border-pink-500 bg-pink-500/10"
                        : "border-[#333] bg-[#1a1a1a] hover:border-pink-400 hover:bg-[#262626]"
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-full bg-pink-500/20">
                          <Icon 
                            path={zone.canvasWidth ? mdiFloorPlan : mdiMapMarker} 
                            size={1} 
                            className="text-pink-500" 
                          />
                        </div>
                        <div>
                          <div className="font-semibold text-white text-lg">{zone.name}</div>
                          {zone.description && (
                            <div className="text-sm text-gray-400 mt-0.5">
                              {zone.description}
                            </div>
                          )}
                          {zone.canvasWidth && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 text-xs text-pink-400 mt-2">
                              <Icon path={mdiFloorPlan} size={0.5} />
                              {t("reservations.booking.hasFloorPlan") || "Floor Plan"}
                            </span>
                          )}
                        </div>
                      </div>
                      {modifyFormData.zoneId === zone.id ? (
                        <div className="h-5 w-5 rounded-full bg-pink-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      ) : loadingFloorPlan ? (
                        <Icon path={mdiLoading} size={0.83} className="text-pink-500 animate-spin" />
                      ) : (
                        <Icon path={mdiArrowRight} size={0.83} className="text-gray-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Floor Plan Bottom Sheet */}
      <Sheet open={isFloorPlanOpen} onOpenChange={setIsFloorPlanOpen}>
        <SheetContent side="bottom" className="h-[85vh] bg-[#151718] border-t border-[#262626] text-white rounded-t-3xl p-0 pt-8">
          <SheetHeader className="px-4 pb-4 border-b border-[#333]">
            <SheetTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon path={mdiFloorPlan} size={0.83} className="text-pink-500" />
                <span>{floorPlanData?.name || modifyFormData.zoneName || t("reservations.booking.floorPlan") || "Floor Plan"}</span>
              </div>
              {modifyFormData.tableIds.length > 0 && (
                <Badge className="bg-pink-500 text-white">
                  {modifyFormData.tableIds.length} {t("reservations.booking.tablesSelected") || "selected"}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          {floorPlanData && (
            <div className="flex-1 h-[calc(85vh-120px)]">
              <div className="px-4 pt-3 pb-2 text-xs text-gray-400 text-center">
                {`Tip: Try to choose table(s) that best fit ${modifyFormData.numberOfGuests} guest${modifyFormData.numberOfGuests === 1 ? "" : "s"}.`}
              </div>
              <FloorPlanViewer
                canvasWidth={floorPlanData.canvasWidth || 800}
                canvasHeight={floorPlanData.canvasHeight || 600}
                tables={floorPlanData.tables.map((t: any) => ({
                  ...t,
                  // Original tables from this reservation should always show as AVAILABLE
                  status: originalTableIds.includes(t.id) ? "AVAILABLE" :
                          availableTables.some((at) => at.id === t.id) ? "AVAILABLE" : 
                          reservedTables.some((rt) => rt.id === t.id) ? "RESERVED" : t.status,
                }))}
                floorElements={floorPlanData.floorElements || []}
                selectedTableIds={modifyFormData.tableIds}
                availableTableIds={[...new Set([...availableTables.map((t: any) => t.id), ...originalTableIds, ...modifyFormData.tableIds])]}
                onTableSelect={handleFloorPlanTableSelect}
                enableTouchScroll
                className="h-full"
              />
            </div>
          )}
          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#1a1a1a] border-t border-[#333]">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                {(() => {
                  const totalCapacity = modifyFormData.tableIds
                    .map((id) => floorPlanData?.tables.find((t: any) => t.id === id)?.capacity || availableTables.find((t: any) => t.id === id)?.capacity || 0)
                    .reduce((sum, cap) => sum + cap, 0);
                  const isCapacityMet = totalCapacity >= modifyFormData.numberOfGuests;
                  return (
                    <span className={isCapacityMet ? "text-green-500" : "text-gray-400"}>
                      {totalCapacity} / {modifyFormData.numberOfGuests} {t("reservations.booking.seats") || "seats"}
                      {isCapacityMet && " ✓"}
                    </span>
                  );
                })()}
              </div>
              <Button
                onClick={() => setIsFloorPlanOpen(false)}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("reservations.booking.done") || "Done"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      </div>
    </>
  );
};

export default ModifyReservation;

