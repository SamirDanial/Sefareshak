import React, { useState, useEffect, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useScroll } from "@/src/contexts/ScrollContext";
import branchService from "@/src/services/branchService";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { Calendar } from "react-native-calendars";
import {
  reservationService,
  type Reservation,
  type Zone,
  type ZoneFloorPlan,
} from "@/src/services/reservationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TimeSlotBottomSheet,
  ZoneSelectionBottomSheet,
  TableSelectionBottomSheet,
} from "@/components/ReservationBottomSheets";
import { formatPrice, fetchCurrency } from "@/src/utils/currency";
import { useCartStore } from "@/src/store/cartStore";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/200x200?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

export default function ModifyReservationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const { width } = useWindowDimensions();
  
  // Calculate slot width for 4 columns with gaps
  const slotWidth = useMemo(() => {
    const containerPadding = 32; // 16px padding on each side
    const gapSize = 10;
    const gapsPerRow = 3; // 3 gaps for 4 items
    const availableWidth = width - containerPadding - (gapsPerRow * gapSize);
    return availableWidth / 4;
  }, [width]);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [modifying, setModifying] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
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
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const { clearCart } = useCartStore();
  const [branchData, setBranchData] = useState<any>(null);
  
  // Zone and table states
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [reservedTables, setReservedTables] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  const [originalTableIds, setOriginalTableIds] = useState<string[]>([]);
  
  // Bottom sheet states
  const [isTimeSlotSheetOpen, setIsTimeSlotSheetOpen] = useState(false);
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [isZoneSheetOpen, setIsZoneSheetOpen] = useState(false);
  const [isFloorPlanSheetOpen, setIsFloorPlanSheetOpen] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });
  const [timeSlotsSheetVisible, setTimeSlotsSheetVisible] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: "", type: "success" }), 3000);
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }
    
    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    loadReservationData();
    loadSettings();
    fetchCurrency().then(setCurrency);
  }, []);

  const loadReservationData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        router.back();
        return;
      }

      // Try to parse reservation from params
      let reservationData: Reservation | null = null;
      if (params.data) {
        try {
          reservationData = JSON.parse(params.data as string);
        } catch (e) {
          console.error("Error parsing reservation data:", e);
        }
      }

      // If not in params, fetch by ID
      if (!reservationData && params.id) {
        const response = await reservationService.getUserReservations(1, 100, undefined, token);
        reservationData = response.data.reservations?.find((r: Reservation) => r.id === params.id) || null;
      }

      if (!reservationData) {
        showToast(t("reservations.myReservations.modifyDialog.notFound") || "Reservation not found", "error");
        router.back();
        return;
      }

      setReservation(reservationData);
      // Lock branch and modification context for downstream screens (menu, checkout)
      await AsyncStorage.setItem("modifyingReservationId", reservationData.id);
      if (reservationData.branch?.id) {
        await AsyncStorage.setItem("modifyingReservationBranchId", reservationData.branch.id);
        console.log("[ModifyReservation] locked branchId", reservationData.branch.id);
      } else {
        await AsyncStorage.removeItem("modifyingReservationBranchId");
        console.log("[ModifyReservation] no branchId on reservation");
      }
      try {
        const branches = await branchService.getBranches(token);
        const branch = branches.find((b) => b.id === reservationData.branch?.id);
        setBranchData(branch || null);
      } catch (branchErr) {
        console.warn("Failed to load branch data", branchErr);
        setBranchData(null);
      }

      // Pre-fill form with current reservation data
      const reservationDate = new Date(reservationData.reservationDate);
      const hours = String(reservationDate.getHours()).padStart(2, "0");
      const minutes = String(reservationDate.getMinutes()).padStart(2, "0");
      
      // Create a date object for the date picker (without time)
      const dateOnly = new Date(reservationDate);
      dateOnly.setHours(0, 0, 0, 0);
      
      // Convert reservation order items to format for modification
      let orderItems: any[] = [];
      if (reservationData.type === "PRE_ORDER" && reservationData.reservationOrder?.items) {
        orderItems = reservationData.reservationOrder.items.map((item: any) => {
          const itemQuantity = item.quantity || 1;
          return {
            mealId: item.mealId,
            meal: item.meal ? {
              id: item.meal.id,
              name: item.meal.name,
              image: item.meal.image,
            } : null,
            mealSizeType: item.mealSizeType || "M",
            quantity: itemQuantity,
            addons: (item.addons || []).map((addon: any) => {
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
      
      // Extract zone and table information
      const firstTable = reservationData.tables?.[0]?.table || reservationData.tables?.[0];
      const zoneId = firstTable?.zoneId || firstTable?.zoneRelation?.id || reservationData.zone?.id || null;
      const zoneName = firstTable?.zoneRelation?.name || reservationData.zone?.name || "";
      const tableIds = reservationData.tables?.map((t: any) => t.table?.id || t.id).filter(Boolean) || [];
      const tableNumbers = reservationData.tables?.map((t: any) => t.table?.tableNumber || t.tableNumber).filter(Boolean) || [];
      
      setOriginalTableIds(tableIds);
      
      setModifyFormData({
        date: dateOnly,
        time: `${hours}:${minutes}`,
        numberOfGuests: reservationData.numberOfGuests,
        orderItems,
        zoneId,
        zoneName,
        tableIds,
        tableNumbers,
      });
      
      // Load zones for the branch
      if (reservationData.branch?.id) {
        await loadZones(reservationData.branch.id);
      }
      
      // Load floor plan and table availability if zone is set
      if (zoneId && reservationData.branch?.id) {
        await loadFloorPlan(zoneId, false);
        // Load tables with override params since state isn't updated yet
        await loadTables(zoneId, {
          date: dateOnly,
          time: `${hours}:${minutes}`,
          numberOfGuests: reservationData.numberOfGuests,
          branchId: reservationData.branch.id,
          originalTableIds: tableIds, // Pass original table IDs directly
        });
      }

      // Load available time slots for the current date
      const year = dateOnly.getFullYear();
      const month = String(dateOnly.getMonth() + 1).padStart(2, "0");
      const day = String(dateOnly.getDate()).padStart(2, "0");
      await loadTimeSlots(`${year}-${month}-${day}`, reservationData.numberOfGuests);
    } catch (error: any) {
      console.error("Error loading reservation:", error);
      showToast(error.message || "Failed to load reservation", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const token = await getToken();
      if (token) {
        const settings = await reservationService.getSettings(token);
        setReservationSettings(settings);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const loadTimeSlots = async (date: string, numberOfGuests: number): Promise<boolean> => {
    try {
      setLoadingTimeSlots(true);
      const token = await getToken();
      if (!token) return false;
      const response = await reservationService.getAvailableTimeSlots(
        date,
        numberOfGuests,
        token
      );
      const slots = response.data.timeSlots || [];
      setAvailableTimeSlots(slots);
      return slots.length > 0;
    } catch (error) {
      console.error("Error loading time slots:", error);
      setAvailableTimeSlots([]);
      return false;
    } finally {
      setLoadingTimeSlots(false);
    }
  };

  // Load zones for a branch
  const loadZones = async (branchId: string) => {
    try {
      setLoadingZones(true);
      const token = await getToken();
      const response = await reservationService.getZones(branchId, token || undefined);
      const activeZones = response.zones.filter((zone: Zone) => zone.isActive !== false);
      setAvailableZones(activeZones);
    } catch (error: any) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  // Load floor plan for a zone
  const loadFloorPlan = async (zoneId: string, openSheet: boolean = true) => {
    try {
      setLoadingFloorPlan(true);
      const token = await getToken();
      const data = await reservationService.getZoneFloorPlan(zoneId, token || undefined);
      setFloorPlanData(data);
      
      // Check if floor plan has positioned tables
      const hasFloorPlan =
        (data.tables && data.tables.some((t: any) => t.positionX !== 0 || t.positionY !== 0)) ||
        (data.floorElements && data.floorElements.length > 0);
      
      if (hasFloorPlan && openSheet) {
        setIsFloorPlanSheetOpen(true);
      }
    } catch (error: any) {
      console.error("Error loading floor plan:", error);
      setFloorPlanData(null);
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  // Load table availability for a zone
  // Optional params allow calling this during initial load before state is updated
  const loadTables = async (
    zoneId: string,
    overrideParams?: {
      date: Date;
      time: string;
      numberOfGuests: number;
      branchId: string;
      originalTableIds?: string[]; // Pass original table IDs during initial load
    }
  ) => {
    const date = overrideParams?.date || modifyFormData.date;
    const time = overrideParams?.time || modifyFormData.time;
    const numberOfGuests = overrideParams?.numberOfGuests || modifyFormData.numberOfGuests;
    const branchId = overrideParams?.branchId || reservation?.branch?.id;
    // Use passed originalTableIds if provided, otherwise use state
    const origTableIds = overrideParams?.originalTableIds || originalTableIds;

    if (!date || !time || numberOfGuests <= 0 || !branchId) {
      return;
    }

    try {
      setLoadingTables(true);
      const token = await getToken();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const response = await reservationService.getTableAvailability(
        dateStr,
        time,
        numberOfGuests,
        token || undefined,
        branchId,
        zoneId
      );

      if (response.success) {
        const zoneAvailableTables = (response.data?.available || []).filter(
          (t: any) => t.zoneId === zoneId || t.zoneRelation?.id === zoneId
        );
        let zoneReservedTables = (response.data?.reserved || []).filter(
          (t: any) => t.zoneId === zoneId || t.zoneRelation?.id === zoneId
        );

        // Move original tables from reserved to available for modification
        const originallySelectedTables = zoneReservedTables.filter((t: any) =>
          origTableIds.includes(t.id)
        );
        zoneReservedTables = zoneReservedTables.filter(
          (t: any) => !origTableIds.includes(t.id)
        );

        setAvailableTables([...zoneAvailableTables, ...originallySelectedTables]);
        setReservedTables(zoneReservedTables);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      setAvailableTables([]);
      setReservedTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  // Handle zone selection
  const handleZoneSelect = async (zone: Zone) => {
    setModifyFormData((prev) => ({
      ...prev,
      zoneId: zone.id,
      zoneName: zone.name,
      tableIds: [],
      tableNumbers: [],
    }));
    await loadFloorPlan(zone.id);
    await loadTables(zone.id);
  };

  // Handle table selection from floor plan
  const handleFloorPlanTableSelect = (tableId: string) => {
    const table = floorPlanData?.tables.find((t: any) => t.id === tableId);
    if (!table) return;

    setModifyFormData((prev) => {
      const currentIds = prev.tableIds;
      const currentNumbers = prev.tableNumbers;

      if (currentIds.includes(tableId)) {
        // Deselect
        const index = currentIds.indexOf(tableId);
        return {
          ...prev,
          tableIds: currentIds.filter((id) => id !== tableId),
          tableNumbers: currentNumbers.filter((_, i) => i !== index),
        };
      } else {
        // Check if table is available (either in availableTables or originalTableIds)
        const isAvailable =
          availableTables.some((t: any) => t.id === tableId) ||
          originalTableIds.includes(tableId) ||
          currentIds.includes(tableId);
        if (!isAvailable) return prev;

        // Check capacity
        const currentCapacity = currentIds.reduce((sum, id) => {
          const t =
            availableTables.find((at: any) => at.id === id) ||
            floorPlanData?.tables.find((ft: any) => ft.id === id);
          return sum + (t?.capacity || 0);
        }, 0);

        if (currentCapacity >= prev.numberOfGuests) {
          return prev; // Capacity already met
        }

        return {
          ...prev,
          tableIds: [...currentIds, tableId],
          tableNumbers: [...currentNumbers, table.tableNumber],
        };
      }
    });
  };

  const handleDateChange = async (date: Date | undefined): Promise<boolean> => {
    setModifyFormData({ ...modifyFormData, date, time: "" }); // Clear time when date changes
    if (date && modifyFormData.numberOfGuests > 0) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const hasSlots = await loadTimeSlots(dateStr, modifyFormData.numberOfGuests);
      return Boolean(hasSlots);
    } else {
      setAvailableTimeSlots([]);
      return false;
    }
  };

  const handleTimeSelect = (slot: string) => {
    setModifyFormData({ ...modifyFormData, time: slot });
    setTimeSlotsSheetVisible(false);
  };

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  const handleModify = async () => {
    if (!reservation) return;

    try {
      setModifying(true);
      const token = await getToken();
      if (!token) return;
      
      // Prepare modification data (only send changed fields, like React frontend)
      const modificationData: any = {};
      
      // Always include date/time if both are set (React frontend always sends if both are set)
      if (modifyFormData.date && modifyFormData.time) {
        const year = modifyFormData.date.getFullYear();
        const month = String(modifyFormData.date.getMonth() + 1).padStart(2, "0");
        const day = String(modifyFormData.date.getDate()).padStart(2, "0");
        modificationData.reservationDate = `${year}-${month}-${day}`;
        modificationData.time = modifyFormData.time;
      }
      
      // Only include numberOfGuests if it changed
      if (modifyFormData.numberOfGuests !== reservation.numberOfGuests) {
        modificationData.numberOfGuests = modifyFormData.numberOfGuests;
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
          modificationData.orderItems = modifyFormData.orderItems;
        }
        // If orderItems haven't changed, don't send them to avoid backend recalculating totals
      }
      
      // Only send zoneId if it changed
      const originalZoneId = reservation.tables?.[0]?.table?.zoneId || reservation.tables?.[0]?.zoneId || reservation.zone?.id || null;
      if (modifyFormData.zoneId !== originalZoneId) {
        modificationData.zoneId = modifyFormData.zoneId;
      }
      
      // Only send tableIds if they changed
      const currentTableIds = new Set(modifyFormData.tableIds);
      const originalTableIdsSet = new Set(originalTableIds);
      if (currentTableIds.size !== originalTableIdsSet.size || 
          ![...currentTableIds].every(id => originalTableIdsSet.has(id))) {
        modificationData.tableIds = modifyFormData.tableIds;
      }
      
      const modifiedReservation = await reservationService.modifyReservation(
        reservation.id,
        modificationData,
        token
      );
      
      // Check if reservation was cancelled (all items removed)
      if (modifiedReservation.status === "CANCELLED") {
        const originalTotal = reservation.reservationOrder?.totalAmount 
          ? Number(reservation.reservationOrder.totalAmount) 
          : 0;
        const originalTax = reservation.reservationOrder?.taxAmount 
          ? Number(reservation.reservationOrder.taxAmount) 
          : 0;
        const fullRefundAmount = originalTotal + (originalTax || 0);
        
        showToast(
          `${t("reservations.myReservations.modifyDialog.cancelledSuccess") || "Reservation cancelled. Full refund:"} ${formatPrice(fullRefundAmount, currency)}`,
          "success"
        );
        router.back();
        return;
      }
      
      // Calculate refund amount for display (like React frontend)
      const originalTotal = reservation.reservationOrder?.totalAmount 
        ? Number(reservation.reservationOrder.totalAmount) 
        : 0;
      const newTotal = modifiedReservation.reservationOrder?.totalAmount 
        ? Number(modifiedReservation.reservationOrder.totalAmount) 
        : 0;
      const refundAmount = originalTotal - newTotal;
      
      // Show meaningful notification
      if (refundAmount > 0) {
        showToast(
          `${t("reservations.myReservations.modifyDialog.modifiedSuccess") || "Reservation modified. Refund:"} ${formatPrice(refundAmount, currency)}`,
          "success"
        );
      } else {
        showToast(
          t("reservations.myReservations.modifyDialog.modifySuccess") || "Reservation modified successfully",
          "success"
        );
      }
      
      router.back();
    } catch (error: any) {
      console.error("Error modifying reservation:", error);
      
      // Check if error is about needing payment intent
      const errorMessage = error.response?.data?.error || error.message || "";
      if (errorMessage.includes("payment intent") || errorMessage.includes("Payment intent") || errorMessage.includes("incremental payment")) {
        showToast(
          t("reservations.myReservations.modifyDialog.paymentRequired") || "This modification requires additional payment. Please contact support or try modifying items separately.",
          "error"
        );
      } else {
        showToast(
          errorMessage || t("reservations.myReservations.modifyDialog.modifyError") || "Failed to modify reservation",
          "error"
        );
      }
    } finally {
      setModifying(false);
    }
  };

  const handleCancel = async () => {
    // Clear modification mode
    await AsyncStorage.removeItem("modifyingReservationId");
    await AsyncStorage.removeItem("modifyingReservationBranchId");
    
    // Clear cart (items added during modification)
    clearCart();
    
    // Show toast
    showToast(
      t("reservations.myReservations.modification.exited") || "Reservation editing cancelled. Cart cleared.",
      "info"
    );
    
    // Navigate back to my-reservations page
    router.push("/my-reservations");
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.modifyDialog.title") || "Modify Reservation"}
          onBackPress={() => router.back()}
          rightContent={
            <TouchableOpacity
              onPress={handleCancel}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#1f2937",
              }}
            >
              <Text style={{ color: "#f3f4f6", fontWeight: "600", fontSize: 12 }}>
                {t("reservations.myReservations.modifyDialog.cancel") || "Cancel"}
              </Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.myReservations.modifyDialog.title") || "Modify Reservation"}
          onBackPress={() => router.back()}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {t("reservations.myReservations.modifyDialog.notFound") || "Reservation not found"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t("reservations.myReservations.modifyDialog.title") || "Modify Reservation"}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.form}>
          {branchData && (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                {t("reservations.myReservations.modifyDialog.branchLocked") ||
                  "Note: The branch for this reservation cannot be changed. All items must be available at the original branch."}
              </Text>
            </View>
          )}

          {/* Select Date */}
          <View style={styles.rowGroup}>
            <View style={styles.inlineField}>
              <View style={styles.inlineLabelRow}>
                <Text style={styles.inlineLabel}>
                  {t("reservations.myReservations.modifyDialog.selectDate") || "Select Date"}
                </Text>
                <Text style={styles.separator}>:</Text>
                <TouchableOpacity onPress={() => setDatePickerVisible(true)}>
                  <Text style={styles.inlineValue}>
                    {modifyFormData.date
                      ? modifyFormData.date.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : t("reservations.myReservations.modifyDialog.chooseDate") || "Choose Date"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Number of Guests */}
          <View style={styles.rowGroup}>
            <View style={styles.inlineField}>
              <View style={styles.inlineLabelRow}>
                <Text style={styles.inlineLabel}>
                  {t("reservations.myReservations.modifyDialog.numberOfGuests") || "Guests"}
                </Text>
                <Text style={styles.separator}>:</Text>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  value={modifyFormData.numberOfGuests > 0 ? modifyFormData.numberOfGuests.toString() : ""}
                  onChangeText={(text) => {
                    if (text === "") {
                      setModifyFormData({ ...modifyFormData, numberOfGuests: 0 });
                      setAvailableTimeSlots([]);
                      return;
                    }
                    if (!/^\d+$/.test(text)) {
                      return;
                    }
                    const guests = parseInt(text);
                    const maxGuests = reservationSettings?.maxGuestsPerReservation || 20;
                    if (guests > maxGuests) {
                      const lastChar = text[text.length - 1];
                      const singleDigit = parseInt(lastChar);
                      if (singleDigit > 0 && singleDigit <= maxGuests) {
                        handleGuestsChange(singleDigit);
                        return;
                      }
                      return;
                    }
                    if (guests > 0 && guests <= maxGuests) {
                      handleGuestsChange(guests);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="2"
                />
              </View>
            </View>
          </View>

          {/* Time Slot Selection */}
          {modifyFormData.date && modifyFormData.numberOfGuests > 0 && (
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.inlineLabelRow}
                onPress={() => setIsTimeSlotSheetOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.inlineLabel}>
                  {t("reservations.myReservations.modifyDialog.timeSlot") || "Time Slot"}
                </Text>
                <Text style={styles.separator}>:</Text>
                <Text style={styles.inlineValue}>
                  {modifyFormData.time || t("reservations.booking.tapToSelectTime") || "Tap to select"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Zone Selection */}
          {modifyFormData.date && modifyFormData.time && modifyFormData.numberOfGuests > 0 && (
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.inlineLabelRow}
                onPress={() => setIsZoneSheetOpen(true)}
                activeOpacity={0.8}
                disabled={loadingZones || availableZones.length === 0}
              >
                <Text style={styles.inlineLabel}>
                  {t("reservations.booking.selectZone") || "Zone"}
                </Text>
                <Text style={styles.separator}>:</Text>
                <Text style={[
                  styles.inlineValue,
                  !modifyFormData.zoneName && styles.inlineValuePlaceholder,
                ]}>
                  {loadingZones 
                    ? (t("reservations.booking.loadingZones") || "Loading...")
                    : modifyFormData.zoneName || (t("reservations.booking.tapToSelectZone") || "Tap to select")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Table Selection */}
          {modifyFormData.date && modifyFormData.time && modifyFormData.numberOfGuests > 0 && modifyFormData.zoneId && (
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.inlineLabelRow}
                onPress={() => setIsFloorPlanSheetOpen(true)}
                activeOpacity={0.8}
                disabled={loadingFloorPlan}
              >
                <Text style={styles.inlineLabel}>
                  {t("reservations.booking.tables") || "Tables"}
                </Text>
                <Text style={styles.separator}>:</Text>
                <Text style={[
                  styles.inlineValue,
                  modifyFormData.tableNumbers.length === 0 && styles.inlineValuePlaceholder,
                ]}>
                  {loadingFloorPlan 
                    ? (t("reservations.booking.loadingFloorPlan") || "Loading...")
                    : modifyFormData.tableNumbers.length > 0
                      ? modifyFormData.tableNumbers.length === 1 
                        ? `${t("reservations.booking.table") || "Table"} ${modifyFormData.tableNumbers[0]}`
                        : modifyFormData.tableNumbers.join(", ")
                      : (t("reservations.booking.tapToSelectTable") || "Tap to select")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pre-Order Items Section */}
          {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
            <View style={[styles.formGroup, styles.formGroupNoMargin]}>
              <View style={styles.orderItemsHeader}>
                <Text style={styles.label}>
                  {t("reservations.myReservations.modifyDialog.orderItems") || "Order Items"}
                </Text>
                {(() => {
                  const originalItems = reservation.reservationOrder?.items || [];
                  const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
                  const currentItemIds = modifyFormData.orderItems.map((item: any) => item.mealId);
                  const removedItems = originalItems.filter((item: any) => !currentItemIds.includes(item.mealId));
                  const hasRemovedItems = removedItems.length > 0;
                  const hasAddedItems = modifyFormData.orderItems.some((item: any) => !originalItemIds.has(item.mealId));
                  
                  if (!hasRemovedItems && !hasAddedItems) {
                    return (
                      <TouchableOpacity
                        style={styles.addItemsButton}
                        onPress={() => {
                          // Store reservation ID and navigate to menu
                          AsyncStorage.setItem("modifyingReservationId", reservation.id);
                          if (reservation.branch?.id) {
                            AsyncStorage.setItem("modifyingReservationBranchId", reservation.branch.id);
                          }
                          router.push("/(tabs)/menu?reservation=pre-order&modify=true");
                        }}
                      >
                        <MaterialCommunityIcons name="plus-circle" size={16} color="#ec4899" />
                        <Text style={styles.addItemsButtonText}>
                          {t("reservations.myReservations.modifyDialog.addItems") || "Add Items"}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  if (hasRemovedItems) {
                    return (
                      <Text style={styles.warningText}>
                        {t("reservations.myReservations.modifyDialog.completeBeforeAdding") || "Please complete removing items before adding new ones."}
                      </Text>
                    );
                  }
                  if (hasAddedItems && !hasRemovedItems) {
                    return (
                      <Text style={styles.warningText}>
                        {t("reservations.myReservations.modifyDialog.completeBeforeRemoving") || "Please complete adding items before removing any."}
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
              
              {modifyFormData.orderItems.length > 0 ? (
                <View style={styles.orderItemsList}>
                  {modifyFormData.orderItems.map((item: any, index: number) => {
                    const originalItems = reservation.reservationOrder?.items || [];
                    const originalItemIds = new Set(originalItems.map((item: any) => item.mealId));
                    const isOriginalItem = originalItemIds.has(item.mealId);
                    const hasAddedItems = modifyFormData.orderItems.some((it: any) => !originalItemIds.has(it.mealId));
                    const canRemove = isOriginalItem && !hasAddedItems;
                    
                    return (
                      <View key={index} style={styles.modifyOrderItem}>
                        {canRemove && (
                          <TouchableOpacity
                            style={styles.removeItemButton}
                            onPress={() => {
                              const newItems = modifyFormData.orderItems.filter((_, i) => i !== index);
                              setModifyFormData({ ...modifyFormData, orderItems: newItems });
                            }}
                          >
                            <MaterialCommunityIcons name="close" size={14} color="#ec4899" />
                          </TouchableOpacity>
                        )}
                        <View style={styles.modifyOrderItemContent}>
                          {item.meal?.image && (
                            <Image
                              source={{ uri: getImageUrl(item.meal.image) }}
                              style={styles.modifyOrderItemImage}
                            />
                          )}
                          <View style={styles.modifyOrderItemInfo}>
                            <View style={styles.modifyOrderItemHeader}>
                              <Text style={styles.modifyOrderItemName}>
                                {item.meal?.name || `${t("reservations.myReservations.details.meal") || "Meal"} ${index + 1}`}
                              </Text>
                              {item.mealSizeType && (
                                <View style={styles.sizeBadge}>
                                  <Text style={styles.sizeBadgeText}>{item.mealSizeType}</Text>
                                </View>
                              )}
                              <Text style={styles.modifyOrderItemQuantity}>×{item.quantity}</Text>
                            </View>
                            {/* Addons */}
                            {item.addons && item.addons.length > 0 && (
                              <View style={styles.modifyOrderItemAddons}>
                                {item.addons.map((addon: any, addonIndex: number) => (
                                  <Text key={addonIndex} style={styles.modifyOrderItemAddon}>
                                    + {addon.name || t("reservations.myReservations.details.addon") || "Addon"}
                                    {addon.quantity > 1 && ` ×${addon.quantity}`}
                                  </Text>
                                ))}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.noItemsContainer}>
                  <Text style={styles.noItemsText}>
                    {t("reservations.myReservations.modifyDialog.noItems") || "No items in order"}
                  </Text>
                </View>
              )}

              {/* Calculate and display estimated refund */}
              {(() => {
                const originalItems = reservation.reservationOrder?.items || [];
                const modifiedItemIds = modifyFormData.orderItems.map((item: any) => item.mealId);
                const removedItems = originalItems.filter((item: any) => !modifiedItemIds.includes(item.mealId));
                
                // Get the original total amount paid (includes meal + addons + tax)
                const originalTotal = reservation.reservationOrder?.totalAmount 
                  ? Number(reservation.reservationOrder.totalAmount) 
                  : 0;
                
                // Calculate estimated refund amount
                let estimatedRefund = 0;
                if (removedItems.length > 0) {
                  if (removedItems.length === originalItems.length) {
                    // All items removed - refund the FULL amount paid
                    estimatedRefund = originalTotal;
                  } else {
                    // Some items removed - calculate properly including meal + addons + tax
                    estimatedRefund = removedItems.reduce((sum: number, item: any) => {
                      // Meal price (from totalPrice which is unitPrice * quantity)
                      const mealPrice = Number(item.totalPrice || item.unitPrice * (item.quantity || 1) || 0);
                      
                      // Addon prices (stored separately in item.addons)
                      const addonTotal = (item.addons || []).reduce((addonSum: number, addon: any) => {
                        const addonPrice = Number(addon.addOnPrice || addon.price || 0);
                        const addonQuantity = Number(addon.quantity || 1);
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
                  <View style={styles.refundSection}>
                    {removedItems.length > 0 && estimatedRefund > 0 && (
                      <View style={styles.estimatedRefundBox}>
                        <View style={styles.refundHeader}>
                          <Text style={styles.estimatedRefundLabel}>
                            {t("reservations.myReservations.modifyDialog.estimatedRefund") || "Estimated Refund:"}
                          </Text>
                          <Text style={styles.estimatedRefundAmount}>
                            {formatPrice(estimatedRefund, currency)}
                          </Text>
                        </View>
                        <Text style={styles.refundNote}>
                          {t("reservations.myReservations.modifyDialog.refundNote") || "Refund will be processed automatically to your original payment method within 5-10 business days."}
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.modificationNoteBox}>
                      <Text style={styles.modificationNoteText}>
                        {t("reservations.myReservations.modifyDialog.modificationNote") || "Modifying order items will recalculate the total."}
                        {removedItems.length > 0 
                          ? ` ${t("reservations.myReservations.modifyDialog.removedItemsRefund") || "Removed items will be refunded automatically."}`
                          : ` ${t("reservations.myReservations.modifyDialog.chargeOrRefund") || "You will be charged or refunded the difference automatically."}`
                        }
                      </Text>
                      {reservation.reservationOrder && (
                        <Text style={styles.currentOrderTotal}>
                          {t("reservations.myReservations.modifyDialog.currentOrderTotal") || "Current order total:"} {formatPrice(originalTotal, currency)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Modification Window Notice */}
          {reservationSettings?.modificationWindowHours && (
            <View style={[styles.modificationWindowNotice, styles.modificationWindowNoticeCompact]}>
              <Text style={styles.modificationWindowText}>
                {t("reservations.myReservations.modifyDialog.modificationWindow") || "Reservations can be modified up to"} {reservationSettings.modificationWindowHours} {t("reservations.myReservations.modifyDialog.modificationWindowHours") || "hours before the reservation time"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View
        style={[
          styles.footerActions,
          { paddingBottom: Math.max(insets.bottom, 14) + 6 },
        ]}
      >
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={modifying}
          >
            <Text style={styles.cancelButtonText}>
              {t("reservations.myReservations.modifyDialog.cancel") || "Cancel"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!modifyFormData.date || !modifyFormData.time || modifyFormData.numberOfGuests < 1) && styles.saveButtonDisabled,
            ]}
            onPress={handleModify}
            disabled={modifying || !modifyFormData.date || !modifyFormData.time || modifyFormData.numberOfGuests < 1}
          >
            {modifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>
                {t("reservations.myReservations.modifyDialog.saveChanges") || "Save Changes"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Time Slots Bottom Sheet */}
      <Modal
        visible={timeSlotsSheetVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setTimeSlotsSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.timeSheetOverlay}
          activeOpacity={1}
          onPress={() => setTimeSlotsSheetVisible(false)}
        />
        <View style={styles.timeSheetContainer}>
          <View style={styles.timeSheetHandleWrapper}>
            <View style={styles.timeSheetHandle} />
          </View>
          <View style={styles.timeSheetHeader}>
            <Text style={styles.timeSheetTitle}>
              {t("reservations.myReservations.modifyDialog.timeSlot") || "Time Slot"}
            </Text>
            <TouchableOpacity onPress={() => setTimeSlotsSheetVisible(false)}>
              <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {loadingTimeSlots ? (
            <View style={styles.timeSheetLoading}>
              <ActivityIndicator size="small" color="#ec4899" />
            </View>
          ) : availableTimeSlots.length > 0 ? (
            <View style={styles.timeSheetList}>
              {availableTimeSlots.map((slot) => {
                const selected = modifyFormData.time === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.timeSheetSlot,
                      { width: slotWidth },
                      selected && styles.timeSheetSlotSelected,
                    ]}
                    onPress={() => handleTimeSelect(slot)}
                  >
                    <Text
                      style={[
                        styles.timeSheetSlotText,
                        selected && styles.timeSheetSlotTextSelected,
                      ]}
                    >
                      {slot}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.timeSheetLoading}>
              <Text style={styles.noTimeSlotsText}>
                {t("reservations.myReservations.modifyDialog.noTimeSlots") || "No available time slots"}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Date Picker */}
      {datePickerVisible && (
        <Modal
          visible={datePickerVisible}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t("reservations.booking.selectDate") || "Select Date"}
                </Text>
                <TouchableOpacity
                  onPress={() => setDatePickerVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <Calendar
                current={formatLocalDate(modifyFormData.date || new Date())}
                minDate={formatLocalDate(new Date())}
                maxDate={
                  reservationSettings?.maxAdvanceBookingDays
                    ? formatLocalDate(
                        new Date(
                          Date.now() +
                            reservationSettings.maxAdvanceBookingDays *
                              24 *
                              60 *
                              60 *
                              1000
                        )
                      )
                    : undefined
                }
                onDayPress={async (day) => {
                  const selectedDate = new Date(day.dateString);
                  const ok = await handleDateChange(selectedDate);
                  if (!ok) {
                    showToast(
                      t("reservations.myReservations.modifyDialog.noTimeSlots") ||
                        "No available time slots for this date",
                      "error"
                    );
                    return;
                  }
                  setDatePickerVisible(false);
                }}
                markedDates={{
                  [formatLocalDate(modifyFormData.date || new Date())]: {
                    selected: true,
                    selectedColor: "#ec4899",
                    selectedTextColor: "#fff",
                  },
                }}
                theme={{
                  calendarBackground: "#1a1a1a",
                  dayTextColor: "#e5e7eb",
                  monthTextColor: "#fff",
                  textMonthFontWeight: "700",
                  todayTextColor: "#ec4899",
                  selectedDayBackgroundColor: "#ec4899",
                  selectedDayTextColor: "#fff",
                  textDisabledColor: "#404040",
                }}
                style={styles.calendar}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Time Slot Bottom Sheet */}
      <TimeSlotBottomSheet
        visible={isTimeSlotSheetOpen}
        onClose={() => setIsTimeSlotSheetOpen(false)}
        timeSlots={availableTimeSlots}
        selectedTime={modifyFormData.time}
        onSelectTime={(time) => {
          setModifyFormData({ ...modifyFormData, time });
        }}
        loading={loadingTimeSlots}
        filter={timeSlotFilter}
        onFilterChange={setTimeSlotFilter}
      />

      {/* Zone Selection Bottom Sheet */}
      <ZoneSelectionBottomSheet
        visible={isZoneSheetOpen}
        onClose={() => setIsZoneSheetOpen(false)}
        zones={availableZones}
        selectedZoneId={modifyFormData.zoneId}
        onSelectZone={handleZoneSelect}
        loading={loadingZones}
      />

      {/* Table Selection Bottom Sheet (Floor Plan) */}
      <TableSelectionBottomSheet
        visible={isFloorPlanSheetOpen}
        onClose={() => setIsFloorPlanSheetOpen(false)}
        floorPlanData={floorPlanData}
        selectedTableIds={modifyFormData.tableIds}
        availableTableIds={[
          ...availableTables.map((t: any) => t.id),
          ...modifyFormData.tableIds, // Include currently selected to allow deselection
        ]}
        onTableSelect={handleFloorPlanTableSelect}
        numberOfGuests={modifyFormData.numberOfGuests}
        loading={loadingFloorPlan}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ visible: false, message: "", type: "success" })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  footerActions: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "#0a0a0a",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#9CA3AF",
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
  },
  form: {
    gap: 8,
  },
  formGroup: {
    marginBottom: 12,
  },
  formGroupNoMargin: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  infoBanner: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  infoBannerText: {
    fontSize: 12,
    color: "#bfdbfe",
    lineHeight: 18,
  },
  rowGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  inlineField: {
    flex: 1,
  },
  inlineLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  inlineLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 0,
    lineHeight: 20,
  },
  separator: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  inlineLink: {
    color: "#ec4899",
    fontWeight: "600",
    fontSize: 14,
    flexShrink: 1,
  },
  inlineValue: {
    color: "#ec4899",
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
  inlineValuePlaceholder: {
    color: "#6B7280",
    fontWeight: "500",
  },
  inlineInput: {
    flex: 1,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
  },
  input: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#fff",
    minHeight: 44,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
  },
  dateButtonText: {
    fontSize: 14,
    color: "#fff",
  },
  timeSlotsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#404040",
  },
  timeSheetTriggerText: {
    fontSize: 14,
    color: "#ec4899",
    fontWeight: "700",
    flexShrink: 1,
  },
  timeSlotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeSlotButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#404040",
    backgroundColor: "transparent",
    minWidth: 80,
    alignItems: "center",
  },
  timeSlotButtonSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  timeSlotButtonText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  timeSlotButtonTextSelected: {
    color: "#ec4899",
    fontWeight: "600",
  },
  noTimeSlotsContainer: {
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#404040",
  },
  noTimeSlotsText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  timeSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  timeSheetContainer: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  timeSheetHandleWrapper: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  timeSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#666",
    borderRadius: 2,
  },
  timeSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  timeSheetList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  timeSheetSlot: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f2937",
    minWidth: 72,
  },
  timeSheetSlotSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  timeSheetSlotText: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
  },
  timeSheetSlotTextSelected: {
    color: "#ec4899",
  },
  timeSheetLoading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  orderItemsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  addItemsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addItemsButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  orderItemsList: {
    gap: 8,
    marginTop: 8,
  },
  modifyOrderItem: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#262626",
    position: "relative",
  },
  modifyOrderItemContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 24, // Space for the remove button
  },
  modifyOrderItemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#262626",
    marginRight: 12,
  },
  modifyOrderItemInfo: {
    flex: 1,
  },
  modifyOrderItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  modifyOrderItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  modifyOrderItemQuantity: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  modifyOrderItemAddons: {
    marginTop: 6,
    gap: 4,
  },
  modifyOrderItemAddon: {
    fontSize: 11,
    color: "#9CA3AF",
    marginLeft: 4,
  },
  removeItemButton: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 1,
  },
  noItemsContainer: {
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 8,
  },
  noItemsText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  modificationWindowNotice: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: -4,
  },
  modificationWindowNoticeCompact: {
    marginTop: 0,
  },
  modificationWindowText: {
    fontSize: 12,
    color: "#60a5fa",
  },
  warningText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "right",
  },
  sizeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizeBadgeText: {
    fontSize: 10,
    color: "#D1D5DB",
  },
  refundSection: {
    marginTop: 8,
    gap: 8,
    marginBottom: 0,
  },
  estimatedRefundBox: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderRadius: 8,
    padding: 12,
  },
  refundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  estimatedRefundLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#22c55e",
  },
  estimatedRefundAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16a34a",
  },
  refundNote: {
    fontSize: 10,
    color: "#16a34a",
    marginTop: 4,
  },
  modificationNoteBox: {
    backgroundColor: "rgba(234, 179, 8, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 0,
  },
  modificationNoteText: {
    fontSize: 12,
    color: "#eab308",
    lineHeight: 16,
  },
  modificationNoteBold: {
    fontWeight: "700",
  },
  currentOrderTotal: {
    fontSize: 10,
    color: "#eab308",
    marginTop: 4,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  calendar: {
    borderRadius: 12,
    margin: 16,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#ec4899",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
