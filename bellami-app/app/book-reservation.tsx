import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import DatePicker from "react-native-date-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "react-native-calendars";
import {
  reservationService,
  type ReservationType,
  type Zone,
  type ZoneFloorPlan,
} from "@/src/services/reservationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import branchService, { type Branch } from "@/src/services/branchService";
import {
  TimeSlotBottomSheet,
  ZoneSelectionBottomSheet,
  TableSelectionBottomSheet,
} from "@/components/ReservationBottomSheets";
import * as Location from "expo-location";

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export default function BookReservationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const { setBranch, branch: contextBranch, visibleBranches } = useBranch();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [excludedDates, setExcludedDates] = useState<Date[]>([]);
  const [excludedDateIntervals, setExcludedDateIntervals] = useState<Array<{ start: Date; end: Date }>>([]);

  // Form state
  const [reservationType, setReservationType] = useState<ReservationType>("SIMPLE");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [numberOfGuests, setNumberOfGuests] = useState<number>(2);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [specialRequests, setSpecialRequests] = useState<string>("");
  const [preferredZone, setPreferredZone] = useState<string>("");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [reservedTables, setReservedTables] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerDate, setDatePickerDate] = useState<Date>(new Date());
  const [datePickerTitle, setDatePickerTitle] = useState<string>("");
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const selectedBranch = contextBranch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === contextBranch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(contextBranch?.id) && organizationAppStatus !== "LIVE";
  
  // Branch selection state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [availableZones, setAvailableZones] = useState<any[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearestBranchId, setNearestBranchId] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showBranchSelectModal, setShowBranchSelectModal] = useState(false);
  
  // Bottom sheet states
  const [isTimeSlotSheetOpen, setIsTimeSlotSheetOpen] = useState(false);
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [isZoneSheetOpen, setIsZoneSheetOpen] = useState(false);
  const [isFloorPlanSheetOpen, setIsFloorPlanSheetOpen] = useState(false);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  
  // Flag to prevent clearing zone/table during restoration from checkout
  const isRestoringRef = useRef(false);

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

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Get user's current location
  const getUserLocation = async (): Promise<{ latitude: number; longitude: number }> => {
    try {
      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        throw new Error(t("reservations.booking.locationServicesDisabled") || "Location services are disabled");
      }

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error(t("reservations.booking.locationPermissionDenied") || "Location permission denied");
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error: any) {
      throw error;
    }
  };

  // Filter branches to only include those with reservations enabled
  const filterBranchesWithReservations = async (branches: Branch[]): Promise<Branch[]> => {
    const token = await getToken();
    const branchesWithReservations: Branch[] = [];

    // Check each branch for reservation availability
    for (const branch of branches) {
      try {
        // Check if branch has reservations enabled
        const settings = await reservationService.getSettings(token || undefined, branch.id);
        if (settings.isEnabled) {
          branchesWithReservations.push(branch);
        }
      } catch (error) {
        // Skip branch if we can't check its settings
        console.warn(`Could not check reservation settings for branch ${branch.id}:`, error);
      }
    }

    return branchesWithReservations;
  };

  // Find nearest branch with reservations enabled
  const findNearestBranch = async (branches: Branch[], userLat: number, userLon: number): Promise<string | null> => {
    const branchesWithReservations: Array<{ branch: Branch; distance: number }> = [];

    // Check each branch for reservation availability and calculate distance
    for (const branch of branches) {
      if (!branch.latitude || !branch.longitude) continue;

      const distance = calculateDistance(
        userLat,
        userLon,
        branch.latitude,
        branch.longitude
      );
      branchesWithReservations.push({ branch, distance });
    }

    if (branchesWithReservations.length === 0) {
      return null;
    }

    // Sort by distance and return the nearest branch ID
    branchesWithReservations.sort((a, b) => a.distance - b.distance);
    return branchesWithReservations[0].branch.id;
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const data = await branchService.getBranches(token || undefined);
      // Filter to only active branches
      const activeBranches = data.filter(branch => branch.isActive !== false);
      
      // Filter to only branches with reservations enabled
      const branchesWithReservations = await filterBranchesWithReservations(activeBranches);
      setBranches(branchesWithReservations);
      
      // Check if we're coming from checkout - if so, skip auto-selection
      // because the restoration useEffect will handle setting the branch
      const fromCheckoutFlag = await AsyncStorage.getItem("fromCheckout");
      if (fromCheckoutFlag === "true") {
        setLoadingBranches(false);
        return;
      }
      
      // If only one branch, auto-select it
      if (branchesWithReservations.length === 1) {
        setSelectedBranchId(branchesWithReservations[0].id);
      } else if (branchesWithReservations.length > 1) {
        // Try to get user location and suggest nearest branch
        try {
          setIsGettingLocation(true);
          setLocationError(null);
          const location = await getUserLocation();
          setUserLocation(location);
          
          const nearestId = await findNearestBranch(branchesWithReservations, location.latitude, location.longitude);
          if (nearestId) {
            setNearestBranchId(nearestId);
            // Auto-select the nearest branch
            setSelectedBranchId(nearestId);
          }
        } catch (error: any) {
          console.warn("Could not get user location:", error);
          setLocationError(error.message || t("reservations.booking.couldNotGetLocation") || "Could not get your location");
          // Don't show error toast, just silently fail
        } finally {
          setIsGettingLocation(false);
        }
      }
    } catch (error: any) {
      console.error("Error loading branches:", error);
      setToast({
        visible: true,
        message: t("reservations.booking.failedToLoadBranches") || "Failed to load branches",
        type: "error",
      });
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async () => {
    if (!selectedBranchId) return;
    
    try {
      setLoadingZones(true);
      const token = await getToken();
      const response = await reservationService.getZones(selectedBranchId, token || undefined);
      // Filter to only active zones
      const activeZones = response.zones.filter((zone: any) => zone.isActive !== false);
      setAvailableZones(activeZones);
    } catch (error: any) {
      console.error("Error loading zones:", error);
      setToast({
        visible: true,
        message: error?.response?.data?.error || t("reservations.booking.failedToLoadZones") || "Failed to load zones",
        type: "error",
      });
    } finally {
      setLoadingZones(false);
    }
  };

  // Clear zone and tables when date, time, numberOfGuests, or branch changes
  // Skip clearing during restoration from checkout
  useEffect(() => {
    if (isRestoringRef.current) return;
    setSelectedTableIds([]);
    setSelectedZoneId(null);
    setSelectedZone(null);
    setAvailableTables([]);
    setReservedTables([]);
  }, [selectedDate, selectedTime, numberOfGuests, selectedBranchId]);

  // Load tables only when zone is selected (after time is already selected)
  // Skip clearing during restoration from checkout
  useEffect(() => {
    if (!isRestoringRef.current) {
      setSelectedTableIds([]);
    }
    if (selectedZoneId && selectedDate && selectedTime && numberOfGuests > 0 && selectedBranchId) {
      loadTables();
    } else {
      setAvailableTables([]);
      setReservedTables([]);
    }
  }, [selectedZoneId, selectedDate, selectedTime, numberOfGuests, selectedBranchId]);

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, []);

  // Load zones and settings when branch is selected
  useEffect(() => {
    if (selectedBranchId) {
      loadZones();
      loadSettings();
    } else {
      setAvailableZones([]);
      setSettings(null);
      // Clear form when branch is deselected
      setSelectedDate(undefined);
      setSelectedTime("");
      setAvailableTimeSlots([]);
      setAvailableTables([]);
      setReservedTables([]);
    setSelectedTableIds([]);
      setSelectedZoneId(null);
      setSelectedZone(null);
    }
  }, [selectedBranchId]);

  // Lock branch when PRE_ORDER reservation type is selected with a branch
  useEffect(() => {
    const lockBranchForPreOrder = async () => {
      if (reservationType === "PRE_ORDER" && selectedBranchId) {
        // Lock the branch for pre-order reservation
        await AsyncStorage.setItem("preOrderBranchLock", selectedBranchId);
      } else if (reservationType === "SIMPLE") {
        // Clear lock if switching to SIMPLE reservation
        await AsyncStorage.removeItem("preOrderBranchLock");
      }
    };
    lockBranchForPreOrder();
  }, [reservationType, selectedBranchId]);

  // Keep BranchContext in sync with the selected branch on this screen
  useEffect(() => {
    if (!selectedBranchId) return;
    if (contextBranch?.id === selectedBranchId) return;

    const selected = branches.find((b) => b.id === selectedBranchId);
    if (selected) {
      // Distance is not required here; null keeps it minimal
      setBranch({ id: selected.id, name: selected.name || null, distanceKm: null });
    }
  }, [selectedBranchId, branches, contextBranch?.id, setBranch]);

  useEffect(() => {
    if (isOrganizationUnavailable) {
      setAppStatus(organizationAppStatus);
      setSettingsLoading(false);
      return;
    }

    fetchPublicSettings().then((settings) => {
      setAppStatus(settings.appStatus);
      setSettingsLoading(false);
    });
    // Check if coming from checkout
    AsyncStorage.getItem("fromCheckout").then(async (fromCheckoutFlag) => {
      if (fromCheckoutFlag === "true") {
        // Set flag to prevent clearing zone/table during restoration
        isRestoringRef.current = true;
        
        // Restore previous selections if coming from checkout
        const pendingReservation = await AsyncStorage.getItem("pendingReservation");
        if (pendingReservation) {
          try {
            const data = JSON.parse(pendingReservation);
            if (data.branchId) {
              setSelectedBranchId(data.branchId);
              // Load zones for the branch
              const token = await getToken();
              if (token) {
                try {
                  const response = await reservationService.getZones(data.branchId, token);
                  const activeZones = response.zones.filter((zone: Zone) => zone.isActive !== false);
                  setAvailableZones(activeZones);
                } catch (error) {
                  console.error("Error loading zones during restoration:", error);
                }
              }
            }
            if (data.date) {
              const [year, month, day] = data.date.split('-').map(Number);
              setSelectedDate(new Date(year, month - 1, day));
            }
            if (data.time) {
              setSelectedTime(data.time);
            }
            if (data.numberOfGuests) {
              setNumberOfGuests(data.numberOfGuests);
            }
            if (data.customerName) {
              setCustomerName(data.customerName);
            }
            if (data.customerEmail) {
              setCustomerEmail(data.customerEmail);
            }
            if (data.customerPhone) {
              setCustomerPhone(data.customerPhone);
            }
            if (data.specialRequests) {
              setSpecialRequests(data.specialRequests);
            }
            if (data.preferredZone) {
              setPreferredZone(data.preferredZone);
            }
            if (data.zoneId) {
              setSelectedZoneId(data.zoneId);
              if (data.zoneName) {
                setSelectedZone(data.zoneName);
              }
              // Load floor plan for the zone
              const token = await getToken();
              if (token) {
                try {
                  const floorPlan = await reservationService.getZoneFloorPlan(data.zoneId, token);
                  setFloorPlanData(floorPlan);
                } catch (error) {
                  console.error("Error loading floor plan during restoration:", error);
                }
              }
            }
            if (data.tableIds && data.tableIds.length > 0) {
              setSelectedTableIds(data.tableIds);
            }
            if (data.type) {
              setReservationType(data.type);
            }
            
            // Clear the restoration flag after a delay to allow state to settle
            setTimeout(() => {
              isRestoringRef.current = false;
            }, 1000);
          } catch (error) {
            console.error("Error parsing pending reservation:", error);
            isRestoringRef.current = false;
          }
        } else {
          isRestoringRef.current = false;
        }
      } else {
        AsyncStorage.removeItem("fromCheckout");
      }
    });
  }, []);

  useEffect(() => {
    if (user) {
      AsyncStorage.getItem("pendingReservation").then((pendingReservation) => {
        if (!pendingReservation) {
          setCustomerName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || "");
          setCustomerEmail(user.primaryEmailAddress?.emailAddress || "");
          setCustomerPhone(user.phoneNumbers?.[0]?.phoneNumber || "");
        }
      });
    }
  }, [user]);

  // Update title whenever datePickerDate changes (for real-time updates as user scrolls)
  useEffect(() => {
    if (datePickerVisible && datePickerDate) {
      setDatePickerTitle(
        datePickerDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
    }
  }, [datePickerDate, datePickerVisible]);

  useEffect(() => {
    if (selectedDate && selectedBranchId) {
      loadTimeSlots();
    } else {
      setAvailableTimeSlots([]);
      setSelectedTime("");
    }
  }, [selectedDate, numberOfGuests, selectedBranchId]);

  const loadSettings = async () => {
    if (!selectedBranchId) return;
    
    try {
      const token = await getToken();
      // Load branch-specific settings (merged with global)
      const data = await reservationService.getSettings(token || undefined, selectedBranchId);
      setSettings(data);

      if (!data.isEnabled) {
        setToast({
          visible: true,
          message: t("reservations.booking.disabled") || "Reservations are currently disabled",
          type: "error",
        });
        setTimeout(() => router.back(), 2000);
        return;
      }
      
      // Load excluded dates
      if (data.excludedDates) {
        const excluded = typeof data.excludedDates === 'string' 
          ? JSON.parse(data.excludedDates) 
          : data.excludedDates;
        
        const singleDates: Date[] = [];
        if (excluded.singleDates && Array.isArray(excluded.singleDates)) {
          excluded.singleDates.forEach((dateStr: string) => {
            const date = new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            singleDates.push(date);
          });
        }
        setExcludedDates(singleDates);
        
        const dateIntervals: Array<{ start: Date; end: Date }> = [];
        if (excluded.dateRanges && Array.isArray(excluded.dateRanges)) {
          excluded.dateRanges.forEach((range: { start: string; end: string }) => {
            if (range.start && range.end) {
              const startDate = new Date(range.start + 'T00:00:00');
              startDate.setHours(0, 0, 0, 0);
              const endDate = new Date(range.end + 'T00:00:00');
              endDate.setHours(23, 59, 59, 999);
              dateIntervals.push({ start: startDate, end: endDate });
            }
          });
        }
        setExcludedDateIntervals(dateIntervals);
      } else {
        setExcludedDates([]);
        setExcludedDateIntervals([]);
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
      setToast({
        visible: true,
        message: error.message || t("reservations.booking.loadSettingsError") || "Failed to load reservation settings",
        type: "error",
      });
    }
  };

  const loadTables = async () => {
    if (!selectedDate || !selectedTime || !numberOfGuests || numberOfGuests <= 0 || !selectedBranchId || !selectedZoneId) {
      setAvailableTables([]);
      setReservedTables([]);
      return;
    }

    try {
      setLoadingTables(true);
      const token = await getToken();
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      
      const response = await reservationService.getTableAvailability(
        dateStr,
        selectedTime,
        numberOfGuests,
        token || undefined,
        selectedBranchId,
        selectedZoneId
      );
      
      if (response.success) {
        setAvailableTables(response.data.available || []);
        setReservedTables(response.data.reserved || []);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      setAvailableTables([]);
      setReservedTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const loadTimeSlots = async () => {
    if (!selectedDate || !selectedBranchId) return;

    try {
      setLoadingTimeSlots(true);
      const token = await getToken();
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      
      const response = await reservationService.getAvailableTimeSlots(
        dateStr,
        numberOfGuests,
        token || undefined,
        selectedBranchId
      );
      
      setAvailableTimeSlots(response.data?.timeSlots || []);
      
      // Check if we have a restored time from AsyncStorage
      const restoredTime = await AsyncStorage.getItem("restoredTime");
      if (restoredTime && response.data?.timeSlots?.includes(restoredTime)) {
        setSelectedTime(restoredTime);
        await AsyncStorage.removeItem("restoredTime");
      } else if (restoredTime) {
        await AsyncStorage.removeItem("restoredTime");
      }
      
      // Clear selected time if it's no longer available
      if (!restoredTime && selectedTime && !response.data?.timeSlots?.includes(selectedTime)) {
        setSelectedTime("");
      }
    } catch (error: any) {
      console.error("Error loading time slots:", error);
      setToast({
        visible: true,
        message: error.message || t("reservations.booking.loadTimeSlotsError") || "Failed to load available time slots",
        type: "error",
      });
    } finally {
      setLoadingTimeSlots(false);
    }
  };

  // Load floor plan data for a zone
  const loadFloorPlan = async (zoneId: string, openSheet: boolean = true) => {
    try {
      setLoadingFloorPlan(true);
      const token = await getToken();
      const data = await reservationService.getZoneFloorPlan(zoneId, token || undefined);
      setFloorPlanData(data);
      
      // Check if floor plan has positioned tables or floor elements
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

  // Handle zone selection with floor plan loading
  const handleZoneSelect = async (zone: Zone) => {
    setSelectedZoneId(zone.id);
    setSelectedZone(zone.name);
    setSelectedTableIds([]);
    
    // Load floor plan for the zone
    await loadFloorPlan(zone.id);
  };

  // Handle table selection from floor plan
  const handleFloorPlanTableSelect = (tableId: string) => {
    const table = floorPlanData?.tables.find((t: any) => t.id === tableId);
    if (!table) return;
    
    // Check if table is available
    const isAvailable = availableTables.some((t: any) => t.id === tableId);
    if (!isAvailable && !selectedTableIds.includes(tableId)) return;
    
    setSelectedTableIds((prevIds) => {
      if (prevIds.includes(tableId)) {
        // Deselect
        return prevIds.filter((id) => id !== tableId);
      } else {
        // Check capacity
        const currentCapacity = prevIds.reduce((sum, id) => {
          const t = availableTables.find((at: any) => at.id === id) || 
                   floorPlanData?.tables.find((ft: any) => ft.id === id);
          return sum + (t?.capacity || 0);
        }, 0);
        
        if (currentCapacity >= numberOfGuests) {
          // Capacity already met
          return prevIds;
        }
        
        // Select
        return [...prevIds, tableId];
      }
    });
  };

  const isDateExcluded = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    
    // Check single excluded dates
    for (const excludedDate of excludedDates) {
      const excludedDateStr = excludedDate.toISOString().split('T')[0];
      if (dateStr === excludedDateStr) {
        return true;
      }
    }
    
    // Check date intervals
    for (const interval of excludedDateIntervals) {
      const startDate = new Date(interval.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(interval.end);
      endDate.setHours(23, 59, 59, 999);
      
      if (date >= startDate && date <= endDate) {
        return true;
      }
    }
    
    return false;
  };

  // Helper function to format date as YYYY-MM-DD in local timezone (avoiding UTC conversion issues)
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if a day of the week has operating hours set
  const isDayOfWeekActive = (dayOfWeek: number): boolean => {
    if (!settings) return false;
    
    const dayMap: { [key: number]: { open: string; close: string } } = {
      0: { open: "sundayOpen", close: "sundayClose" },
      1: { open: "mondayOpen", close: "mondayClose" },
      2: { open: "tuesdayOpen", close: "tuesdayClose" },
      3: { open: "wednesdayOpen", close: "wednesdayClose" },
      4: { open: "thursdayOpen", close: "thursdayClose" },
      5: { open: "fridayOpen", close: "fridayClose" },
      6: { open: "saturdayOpen", close: "saturdayClose" },
    };
    
    const dayFields = dayMap[dayOfWeek];
    if (!dayFields) return false;
    
    const openTime = settings[dayFields.open];
    const closeTime = settings[dayFields.close];
    
    // Check if both open and close times are set (not null, undefined, or empty)
    const hasOpenTime = openTime != null && openTime !== "" && String(openTime).trim() !== "";
    const hasCloseTime = closeTime != null && closeTime !== "" && String(closeTime).trim() !== "";
    
    return hasOpenTime && hasCloseTime;
  };

  // Check if a specific date falls on a day without operating hours
  const isDateOnInactiveDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    return !isDayOfWeekActive(dayOfWeek);
  };

  const handleSubmit = async () => {
    if (!selectedBranchId) {
      setToast({
        visible: true,
        message: t("reservations.booking.selectBranchFirst") || "Please select a branch first",
        type: "error",
      });
      return;
    }

    if (!selectedDate || !selectedTime) {
      setToast({
        visible: true,
        message: t("reservations.booking.selectDateAndTime") || "Please select a date and time",
        type: "error",
      });
      return;
    }

    if (reservationType === "PRE_ORDER") {
      try {
        // Validate phone number before proceeding
        const digitsOnly = customerPhone.replace(/\D/g, "");
        if (digitsOnly.length < 7 || digitsOnly.length > 15) {
          setToast({
            visible: true,
            message: t("checkout.step1.addressSelector.invalidPhoneNumber") || "Please enter a valid phone number (7-15 digits)",
            type: "error",
          });
          return;
        }

        // For pre-order, redirect to menu with reservation context
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        
        // Get zone name and table numbers for display
        const selectedZone = availableZones.find((z: any) => z.id === selectedZoneId);
        const selectedTableNumbers = selectedTableIds.map(id => {
          const table = availableTables.find((t: any) => t.id === id) || 
                       floorPlanData?.tables.find((t: any) => t.id === id);
          return table?.tableNumber;
        }).filter(Boolean);

        const reservationData = {
          type: "PRE_ORDER",
          date: dateStr,
          time: selectedTime,
          numberOfGuests,
          customerName,
          customerEmail,
          customerPhone,
          specialRequests,
          preferredZone,
          branchId: selectedBranchId,
          ...(selectedTableIds.length > 0 && { tableIds: selectedTableIds }),
          ...(selectedZoneId && { zoneId: selectedZoneId }),
          ...(selectedZone && { zoneName: selectedZone.name }),
          ...(selectedTableNumbers.length > 0 && { tableNumbers: selectedTableNumbers }),
        };
        
        // Ensure BranchContext reflects the selected branch before navigating
        const selectedBranch = branches.find((b) => b.id === selectedBranchId);
        await setBranch({
          id: selectedBranchId,
          name: selectedBranch?.name || null,
          distanceKm: null,
        });

        // Save reservation data
        await AsyncStorage.setItem("pendingReservation", JSON.stringify(reservationData));
        
        // Lock the branch for pre-order reservation
        await AsyncStorage.setItem("preOrderBranchLock", selectedBranchId);
        
        // Check if coming from checkout
        const fromCheckout = await AsyncStorage.getItem("fromCheckout");
        await AsyncStorage.removeItem("fromCheckout");
        
        if (fromCheckout === "true") {
          router.push("/checkout");
        } else {
          router.push("/(tabs)/menu?reservation=pre-order");
        }
      } catch (error) {
        console.error("Error in PRE_ORDER submission:", error);
        setToast({
          visible: true,
          message: t("reservations.booking.errorOccurred") || "An error occurred. Please try again.",
          type: "error",
        });
      }
      return;
    }

    // Simple reservation - create directly
    try {
      setLoading(true);

      // Validate phone number before submitting
      const digitsOnly = customerPhone.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        setToast({
          visible: true,
          message: t("checkout.step1.addressSelector.invalidPhoneNumber") || "Please enter a valid phone number (7-15 digits)",
          type: "error",
        });
        setLoading(false);
        return;
      }

      const token = await getToken();
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      // Validate all required fields
      if (!dateStr || !selectedTime || !numberOfGuests || numberOfGuests <= 0) {
        setToast({
          visible: true,
          message: t("reservations.booking.selectDateAndTime") || "Please select a date and time",
          type: "error",
        });
        setLoading(false);
        return;
      }

      // Validate table capacity if tables are selected
      if (selectedTableIds.length > 0) {
        const totalCapacity = selectedTableIds
          .map(id => availableTables.find(t => t.id === id)?.capacity || 0)
          .reduce((sum, cap) => sum + cap, 0);
        
        if (totalCapacity < numberOfGuests) {
          setToast({
            visible: true,
            message: t("reservations.booking.insufficientCapacity", { 
              capacity: totalCapacity, 
              required: numberOfGuests 
            }) || `Selected tables have ${totalCapacity} seats, but ${numberOfGuests} guests are required. Please select more tables.`,
            type: "error",
          });
          setLoading(false);
          return;
        }
      }

      if (!customerName?.trim() || !customerEmail?.trim() || !customerPhone?.trim()) {
        setToast({
          visible: true,
          message: t("reservations.booking.fillAllFields") || "Please fill in all required fields",
          type: "error",
        });
        setLoading(false);
        return;
      }

      const reservationData = {
        reservationDate: dateStr,
        time: selectedTime,
        numberOfGuests: numberOfGuests,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        ...(specialRequests?.trim() && { specialRequests: specialRequests.trim() }),
        ...(preferredZone?.trim() && { preferredZone: preferredZone.trim() }),
        branchId: selectedBranchId,
        ...(selectedTableIds.length > 0 && { tableIds: selectedTableIds }),
        ...(selectedZoneId && { zoneId: selectedZoneId }),
      };

      await reservationService.createSimpleReservation(
        reservationData,
        token || undefined
      );

      // Clear any pending reservation data
      await AsyncStorage.removeItem("pendingReservation");
      await AsyncStorage.removeItem("fromCheckout");
      await AsyncStorage.removeItem("preOrderBranchLock");

      setToast({
        visible: true,
        message: t("reservations.booking.createdSuccess") || "Reservation created successfully!",
        type: "success",
      });
      
      setTimeout(() => {
        router.push("/my-reservations");
      }, 1500);
    } catch (error: any) {
      console.error("Error creating reservation:", error);
      setToast({
        visible: true,
        message: error.message || t("reservations.booking.createError") || "Failed to create reservation",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return (
      selectedBranchId &&
      selectedDate &&
      selectedTime &&
      numberOfGuests > 0 &&
      numberOfGuests <= (settings?.maxGuestsPerReservation || 20) &&
      customerName.trim() !== "" &&
      customerEmail.trim() !== "" &&
      customerPhone.trim() !== ""
    );
  };

  const maxDate = settings?.maxAdvanceBookingDays
    ? new Date(Date.now() + settings.maxAdvanceBookingDays * 24 * 60 * 60 * 1000)
    : undefined;

  if (settingsLoading && !isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.booking.title") || "Book Reservation"}
          onBackPress={() => router.back()}
        />
        <View style={{ paddingTop: headerHeight, flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ color: "#9CA3AF", marginTop: 16 }}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  const effectiveAppStatus = isOrganizationUnavailable ? organizationAppStatus : appStatus;
  const isAppUnavailable = effectiveAppStatus !== "LIVE";

  if (isAppUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("reservations.booking.title") || "Book Reservation"}
          onBackPress={() => router.back()}
        />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={effectiveAppStatus as any} />
        </View>
      </View>
    );
  }

  const handleBackPress = async () => {
    // Clear pre-order branch lock if user goes back
    // Only clear if reservation type is PRE_ORDER and we haven't submitted yet
    if (reservationType === "PRE_ORDER") {
      await AsyncStorage.removeItem("preOrderBranchLock");
    }
    router.back();
  };

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t("reservations.booking.title") || "Book Reservation"}
        onBackPress={handleBackPress}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: headerHeight + 24, padding: 16, paddingBottom: 32 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
        >
          {/* Step 0: Branch Selection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="office-building" size={20} color="#ec4899" />
              <Text style={styles.sectionTitle}>
                {t("reservations.booking.selectBranch") || "Select Branch"}
              </Text>
            </View>
            {loadingBranches ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.loadingText}>
                  {t("reservations.booking.loadingBranches") || "Loading branches..."}
                </Text>
              </View>
            ) : branches.length === 0 ? (
              <View style={styles.noSlotsContainer}>
                <MaterialCommunityIcons name="alert-circle" size={32} color="#6B7280" />
                <Text style={styles.noSlotsTitle}>
                  {t("reservations.booking.noBranchesAvailable") || "No Branches Available"}
                </Text>
                <Text style={styles.noSlotsDescription}>
                  {t("reservations.booking.noBranchesAvailableDescription") || "No branches are available for reservations at this time."}
                </Text>
              </View>
            ) : (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("reservations.booking.branch") || "Branch"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.branchSelectButton,
                    selectedBranchId && styles.branchSelectButtonActive,
                  ]}
                  onPress={() => setShowBranchSelectModal(true)}
                >
                  <Text
                    style={[
                      styles.branchSelectButtonText,
                      selectedBranchId && styles.branchSelectButtonTextActive,
                    ]}
                  >
                    {selectedBranchId
                      ? branches.find((b) => b.id === selectedBranchId)?.name || `Branch ${selectedBranchId}`
                      : t("reservations.booking.selectBranchPlaceholder") || "Select a branch"}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={16}
                    color={selectedBranchId ? "#ec4899" : "#9CA3AF"}
                  />
                </TouchableOpacity>
                {selectedBranchId && nearestBranchId === selectedBranchId && userLocation && (
                  <View style={styles.nearestBranchBadgeContainer}>
                    <View style={styles.nearestBranchBadge}>
                      <MaterialCommunityIcons name="map-marker" size={12} color="#ec4899" />
                      <Text style={styles.nearestBranchBadgeText}>
                        {t("reservations.booking.nearestBranch") || "Nearest"}
                      </Text>
                    </View>
                  </View>
                )}
                {isGettingLocation && (
                  <View style={styles.locationLoadingContainer}>
                    <ActivityIndicator size="small" color="#ec4899" />
                    <Text style={styles.locationLoadingText}>
                      {t("reservations.booking.findingNearestBranch") || "Finding nearest branch..."}
                    </Text>
                  </View>
                )}
                {locationError && !selectedBranchId && (
                  <View style={styles.locationErrorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#6B7280" />
                    <Text style={styles.locationErrorText}>
                      {t("reservations.booking.locationError") || "Could not determine your location. Please select a branch manually."}
                    </Text>
                  </View>
                )}
                <Text style={styles.hint}>
                  {t("reservations.booking.selectBranchDescription") || "Choose the branch where you'd like to make a reservation"}
                </Text>
              </View>
            )}
          </View>

          {/* Step 1: Reservation Type */}
          {selectedBranchId && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={20} color="#ec4899" />
              <Text style={styles.sectionTitle}>
                {t("reservations.booking.chooseType") || "Choose Reservation Type"}
              </Text>
            </View>
            <View style={styles.typeOptions}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  reservationType === "SIMPLE" && styles.typeOptionActive,
                ]}
                onPress={() => setReservationType("SIMPLE")}
              >
                <View style={styles.typeOptionContent}>
                  <View style={styles.radioButton}>
                    {reservationType === "SIMPLE" && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                  <View style={styles.typeOptionText}>
                    <Text style={styles.typeOptionTitle}>
                      {t("reservations.booking.simpleReservation") || "Simple Reservation"}
                    </Text>
                    <Text style={styles.typeOptionDescription}>
                      {t("reservations.booking.simpleDescription") || "Just book a table, no payment required"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeOption,
                  reservationType === "PRE_ORDER" && styles.typeOptionActive,
                ]}
                onPress={() => setReservationType("PRE_ORDER")}
              >
                <View style={styles.typeOptionContent}>
                  <View style={styles.radioButton}>
                    {reservationType === "PRE_ORDER" && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                  <View style={styles.typeOptionText}>
                    <Text style={styles.typeOptionTitle}>
                      {t("reservations.booking.preOrderReservation") || "Pre-Order Reservation"}
                    </Text>
                    <View style={styles.badgeContainer}>
                      <View style={styles.badge}>
                        <MaterialCommunityIcons name="credit-card" size={12} color="#ec4899" />
                        <Text style={styles.badgeText}>
                          {t("reservations.booking.paymentRequired") || "Payment Required"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.typeOptionDescription}>
                      {t("reservations.booking.preOrderDescription") || "Book a table and pre-order your meals"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {/* Step 2: Booking Details */}
          {selectedBranchId && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="calendar" size={20} color="#ec4899" />
              <Text style={styles.sectionTitle}>
                {t("reservations.booking.bookingDetails") || "Booking Details"}
              </Text>
            </View>

            {/* Date Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.selectDate") || "Select Date"}
              </Text>
              <TouchableOpacity
                style={[
                  styles.dateButton,
                  selectedDate && styles.dateButtonSelected,
                ]}
                onPress={() => {
                  const initialDate = selectedDate || new Date();
                  setDatePickerDate(initialDate);
                  setDatePickerTitle(
                    initialDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  );
                  setDatePickerVisible(true);
                }}
              >
                {selectedDate ? (
                  <View style={styles.dateButtonContent}>
                    <Text
                      style={[
                        styles.dateButtonWeekday,
                        styles.dateButtonTextSelected,
                      ]}
                    >
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                      })}
                    </Text>
                <Text
                  style={[
                    styles.dateButtonText,
                        styles.dateButtonTextSelected,
                  ]}
                >
                      {selectedDate.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.dateButtonText,
                      styles.dateButtonTextPlaceholder,
                    ]}
                  >
                    {t("reservations.booking.chooseDate") || "Choose Date"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Time Slot Selection - Trigger Button */}
            {selectedDate && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("reservations.booking.selectTime") || "Select Time"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.selectionTriggerButton,
                    !selectedDate && styles.selectionTriggerButtonDisabled,
                  ]}
                  onPress={() => setIsTimeSlotSheetOpen(true)}
                  disabled={!selectedDate || loadingTimeSlots}
                >
                  <View style={styles.selectionTriggerContent}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#ec4899" />
                    <Text style={styles.selectionTriggerText}>
                      {loadingTimeSlots 
                        ? (t("reservations.booking.loadingTimeSlots") || "Loading...")
                        : selectedTime 
                          ? formatTime(selectedTime) 
                          : (t("reservations.booking.tapToSelectTime") || "Tap to select a time")}
                    </Text>
                  </View>
                  {loadingTimeSlots ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={24} color="#6B7280" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Number of Guests */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.numberOfGuests") || "Number of Guests"}
              </Text>
              <TextInput
                style={styles.input}
                value={numberOfGuests > 0 ? numberOfGuests.toString() : ""}
                onChangeText={(value) => {
                  if (value === "" || /^\d+$/.test(value)) {
                    if (value === "") {
                      setNumberOfGuests(0);
                    } else {
                      const numValue = Number(value);
                      const maxGuests = settings?.maxGuestsPerReservation || 20;
                      if (numValue > 0 && numValue <= maxGuests) {
                        setNumberOfGuests(numValue);
                      }
                    }
                  }
                }}
                placeholder={t("reservations.booking.guestsPlaceholder") || "e.g., 2, 4, 6"}
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
              />
              <Text style={styles.hint}>
                {t("reservations.booking.guestsHint", { max: settings?.maxGuestsPerReservation || 20 }) || `Enter a number between 1 and ${settings?.maxGuestsPerReservation || 20}`}
              </Text>
            </View>

            {/* Zone Selection - Trigger Button */}
            {selectedDate && selectedTime && numberOfGuests > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("reservations.booking.selectZone") || "Select Zone"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.selectionTriggerButton,
                    (!selectedTime || availableZones.length === 0) && styles.selectionTriggerButtonDisabled,
                  ]}
                  onPress={() => setIsZoneSheetOpen(true)}
                  disabled={!selectedTime || loadingZones || availableZones.length === 0}
                >
                  <View style={styles.selectionTriggerContent}>
                    <MaterialCommunityIcons name="map-marker" size={20} color="#ec4899" />
                    <Text style={styles.selectionTriggerText}>
                      {loadingZones 
                        ? (t("reservations.booking.loadingZones") || "Loading...")
                        : selectedZoneId 
                          ? (availableZones.find((z: any) => z.id === selectedZoneId)?.name || t("reservations.booking.zoneSelected") || "Zone selected")
                          : (t("reservations.booking.tapToSelectZone") || "Tap to select a zone")}
                    </Text>
                  </View>
                  {loadingZones ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={24} color="#6B7280" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Table Selection - Trigger Button */}
            {selectedDate && selectedTime && numberOfGuests > 0 && selectedZoneId && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("reservations.booking.selectTable") || "Select Table"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.selectionTriggerButton,
                    !selectedZoneId && styles.selectionTriggerButtonDisabled,
                  ]}
                  onPress={() => setIsFloorPlanSheetOpen(true)}
                  disabled={!selectedZoneId || loadingFloorPlan}
                >
                  <View style={styles.selectionTriggerContent}>
                    <MaterialCommunityIcons name="floor-plan" size={20} color="#ec4899" />
                    <Text style={styles.selectionTriggerText}>
                      {loadingFloorPlan 
                        ? (t("reservations.booking.loadingFloorPlan") || "Loading floor plan...")
                        : selectedTableIds.length > 0
                          ? `${selectedTableIds.length} ${t("reservations.booking.tablesSelected") || "selected"}`
                          : (t("reservations.booking.tapToSelectTable") || "Tap to select tables")}
                    </Text>
                  </View>
                  {loadingFloorPlan ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={24} color="#6B7280" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Your Selection Summary */}
            {selectedDate && numberOfGuests > 0 && (selectedTime || selectedZoneId || selectedTableIds.length > 0) && (
              <View style={styles.yourSelectionContainer}>
                <Text style={styles.yourSelectionTitle}>
                  {t("reservations.booking.yourSelection") || "Your Selection"}
                </Text>
                <View style={styles.yourSelectionBadges}>
                  {/* Date Badge */}
                  <View style={styles.selectionBadge}>
                    <MaterialCommunityIcons name="calendar" size={14} color="#ec4899" />
                    <Text style={styles.selectionBadgeText}>
                      {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  
                  {/* Time Badge */}
                  {selectedTime && (
                    <TouchableOpacity 
                      style={styles.selectionBadge}
                      onPress={() => setIsTimeSlotSheetOpen(true)}
                    >
                      <MaterialCommunityIcons name="clock-outline" size={14} color="#ec4899" />
                      <Text style={styles.selectionBadgeText}>{formatTime(selectedTime)}</Text>
                      <Text style={styles.selectionBadgeEdit}>
                        {t("reservations.booking.tapToChange") || "edit"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Zone Badge */}
                  {selectedZoneId && (
                    <TouchableOpacity 
                      style={styles.selectionBadge}
                      onPress={() => setIsZoneSheetOpen(true)}
                    >
                      <MaterialCommunityIcons name="map-marker" size={14} color="#ec4899" />
                      <Text style={styles.selectionBadgeText}>
                        {availableZones.find((z: any) => z.id === selectedZoneId)?.name || "Zone"}
                      </Text>
                      <Text style={styles.selectionBadgeEdit}>
                        {t("reservations.booking.tapToChange") || "edit"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Tables Badge */}
                  {selectedTableIds.length > 0 && (
                    <TouchableOpacity 
                      style={styles.selectionBadge}
                      onPress={() => setIsFloorPlanSheetOpen(true)}
                    >
                      <MaterialCommunityIcons name="table-furniture" size={14} color="#ec4899" />
                      <Text style={styles.selectionBadgeText}>
                        {selectedTableIds.length === 1 
                          ? `${t("reservations.booking.table") || "Table"} ${availableTables.find((t: any) => t.id === selectedTableIds[0])?.tableNumber || floorPlanData?.tables.find((t: any) => t.id === selectedTableIds[0])?.tableNumber || ""}`
                          : `${selectedTableIds.length} ${t("reservations.booking.tables") || "Tables"}`}
                      </Text>
                      <Text style={styles.selectionBadgeEdit}>
                        {t("reservations.booking.tapToChange") || "edit"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Guests Badge */}
                  <View style={styles.selectionBadge}>
                    <MaterialCommunityIcons name="account-group" size={14} color="#ec4899" />
                    <Text style={styles.selectionBadgeText}>
                      {numberOfGuests} {numberOfGuests === 1 ? (t("reservations.booking.guest") || "guest") : (t("reservations.booking.guests") || "guests")}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
          )}

          {/* Zone Preference (Medium Tier) */}
          {selectedBranchId && settings?.tier === "MEDIUM" && (
            <View style={styles.section}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("reservations.booking.preferredZone") || "Preferred Zone (Optional)"}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("reservations.booking.zonePlaceholder") || "e.g., Outdoor, Window, Quiet Area"}
                  placeholderTextColor="#6B7280"
                  value={preferredZone}
                  onChangeText={setPreferredZone}
                />
                <Text style={styles.hint}>
                  {t("reservations.booking.zoneHint") || "We'll try to accommodate your preference"}
                </Text>
              </View>
          </View>
          )}

          {/* Step 3: Contact Information */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="account" size={20} color="#ec4899" />
              <Text style={styles.sectionTitle}>
                {t("reservations.booking.contactInformation") || "Contact Information"}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.fullName") || "Full Name"}
              </Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder={t("reservations.booking.fullNamePlaceholder") || "Your full name"}
                placeholderTextColor="#6B7280"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.email") || "Email"}
              </Text>
              <TextInput
                style={styles.input}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder={t("reservations.booking.emailPlaceholder") || "your.email@example.com"}
                placeholderTextColor="#6B7280"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.phone") || "Phone Number"}
              </Text>
              <TextInput
                style={styles.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder={t("reservations.booking.phonePlaceholder") || "+1 (555) 123-4567"}
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("reservations.booking.specialRequests") || "Special Requests (Optional)"}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={specialRequests}
                onChangeText={setSpecialRequests}
                placeholder={t("reservations.booking.specialRequestsPlaceholder") || "Any special requests or dietary restrictions..."}
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Submit Button */}
          <View style={styles.submitContainer}>
            <TouchableOpacity
              style={[styles.submitButton, (!isFormValid() || loading || loadingTimeSlots) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!isFormValid() || loading || loadingTimeSlots}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>
                    {reservationType === "PRE_ORDER"
                      ? (t("reservations.booking.continueToMenu") || "Continue to Menu")
                      : (t("reservations.booking.bookReservation") || "Book Reservation")}
                  </Text>
                  <MaterialCommunityIcons
                    name={reservationType === "PRE_ORDER" ? "arrow-right" : "calendar"}
                    size={18}
                    color="#fff"
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Branch Selection Bottom Sheet */}
      <Modal
        visible={showBranchSelectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchSelectModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchSelectModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("reservations.booking.selectBranch") || "Select Branch"}
              </Text>
              <TouchableOpacity
                onPress={() => setShowBranchSelectModal(false)}
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
                        // Clear form when branch changes
                        setSelectedDate(undefined);
                        setSelectedTime("");
                        setAvailableTimeSlots([]);
                        setAvailableTables([]);
                        setReservedTables([]);
                        setSelectedTableIds([]);
                        setSelectedZoneId(null);
                        setSelectedZone(null);
                        setShowBranchSelectModal(false);
                      }}
                    >
                      <View style={styles.bottomSheetOptionContent}>
                        <Text
                          style={[
                            styles.bottomSheetOptionText,
                            selectedBranchId === branch.id &&
                              styles.bottomSheetOptionTextActive,
                          ]}
                        >
                          {branch.name || `Branch ${branch.id}`}
                        </Text>
                        {nearestBranchId === branch.id && userLocation && (
                          <View style={styles.nearestBranchBadgeInline}>
                            <MaterialCommunityIcons name="map-marker" size={12} color="#ec4899" />
                            <Text style={styles.nearestBranchBadgeTextInline}>
                              {t("reservations.booking.nearestBranch") || "Nearest"}
                            </Text>
                          </View>
                        )}
                      </View>
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

      <Modal
        visible={datePickerVisible}
        transparent
        animationType="slide"
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
              current={(() => {
                const year = datePickerDate.getFullYear();
                const month = String(datePickerDate.getMonth() + 1).padStart(2, '0');
                const day = String(datePickerDate.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })()}
              minDate={(() => {
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })()}
              maxDate={maxDate ? (() => {
                const year = maxDate.getFullYear();
                const month = String(maxDate.getMonth() + 1).padStart(2, '0');
                const day = String(maxDate.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })() : undefined}
              onDayPress={(day) => {
                const selectedDate = new Date(day.dateString);
          // Check if date is excluded
                if (isDateExcluded(selectedDate)) {
            setToast({
              visible: true,
              message: t("reservations.booking.dateNotAvailable") || "This date is not available for reservations",
              type: "error",
            });
            return;
          }
                // Check if date falls on a day without operating hours
                if (isDateOnInactiveDay(selectedDate)) {
                  setToast({
                    visible: true,
                    message: t("reservations.booking.dayNotAvailable") || "Reservations are not accepted on this day",
                    type: "error",
                  });
                  return;
                }
                setDatePickerDate(selectedDate);
                setSelectedDate(selectedDate);
          setSelectedTime("");
          setDatePickerVisible(false);
        }}
              markedDates={(() => {
                const marked: any = {
                  [formatLocalDate(datePickerDate)]: {
                    selected: true,
                    selectedColor: "#ec4899",
                    selectedTextColor: "#fff",
                  },
                };
                
                // Mark excluded dates as disabled
                excludedDates.forEach((date) => {
                  const dateStr = formatLocalDate(date);
                  marked[dateStr] = {
                    disabled: true,
                    disableTouchEvent: true,
                    textColor: "#404040",
                  };
                });
                
                excludedDateIntervals.forEach((interval) => {
                  const start = new Date(interval.start);
                  const end = new Date(interval.end);
                  const current = new Date(start);
                  current.setHours(0, 0, 0, 0);
                  end.setHours(23, 59, 59, 999);
                  while (current <= end) {
                    const dateStr = formatLocalDate(current);
                    if (!marked[dateStr] || !marked[dateStr].selected) {
                      marked[dateStr] = {
                        disabled: true,
                        disableTouchEvent: true,
                        textColor: "#404040",
                      };
                    }
                    current.setDate(current.getDate() + 1);
                  }
                });
                
                // Mark dates on inactive days (days without operating hours) as disabled
                // We'll mark dates for the current month and next few months for visibility
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const currentMonth = datePickerDate.getMonth();
                const currentYear = datePickerDate.getFullYear();
                
                // Mark dates for current month and next 3 months
                for (let monthOffset = 0; monthOffset < 4; monthOffset++) {
                  const checkDate = new Date(currentYear, currentMonth + monthOffset, 1);
                  const daysInMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
                  
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateToCheck = new Date(checkDate.getFullYear(), checkDate.getMonth(), day);
                    dateToCheck.setHours(0, 0, 0, 0);
                    // Only mark future dates or today
                    if (dateToCheck >= today) {
                      const dayOfWeek = dateToCheck.getDay();
                      if (!isDayOfWeekActive(dayOfWeek)) {
                        const dateStr = formatLocalDate(dateToCheck);
                        // Don't override selected date styling
                        if (!marked[dateStr] || !marked[dateStr].selected) {
                          marked[dateStr] = {
                            disabled: true,
                            disableTouchEvent: true,
                            textColor: "#404040",
                          };
                        }
                      }
                    }
                  }
                }
                
                return marked;
              })()}
              disabledDaysIndexes={(() => {
                // Get days of week (0=Sunday, 1=Monday, etc.) that don't have operating hours
                const disabledDays: number[] = [];
                for (let day = 0; day < 7; day++) {
                  if (!isDayOfWeekActive(day)) {
                    disabledDays.push(day);
                  }
                }
                return disabledDays;
              })()}
              markingType="custom"
              theme={{
                backgroundColor: "#1a1a1a",
                calendarBackground: "#1a1a1a",
                textSectionTitleColor: "#9CA3AF",
                selectedDayBackgroundColor: "#ec4899",
                selectedDayTextColor: "#fff",
                todayTextColor: "#ec4899",
                dayTextColor: "#fff",
                textDisabledColor: "#404040",
                dotColor: "#ec4899",
                selectedDotColor: "#fff",
                arrowColor: "#ec4899",
                monthTextColor: "#fff",
                indicatorColor: "#ec4899",
                textDayFontWeight: "600",
                textMonthFontWeight: "700",
                textDayHeaderFontWeight: "600",
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
              style={styles.calendar}
            />
          </View>
        </View>
      </Modal>

      {/* Time Slot Bottom Sheet */}
      <TimeSlotBottomSheet
        visible={isTimeSlotSheetOpen}
        onClose={() => setIsTimeSlotSheetOpen(false)}
        timeSlots={availableTimeSlots}
        selectedTime={selectedTime}
        onSelectTime={setSelectedTime}
        loading={loadingTimeSlots}
        filter={timeSlotFilter}
        onFilterChange={setTimeSlotFilter}
      />

      {/* Zone Selection Bottom Sheet */}
      <ZoneSelectionBottomSheet
        visible={isZoneSheetOpen}
        onClose={() => setIsZoneSheetOpen(false)}
        zones={availableZones}
        selectedZoneId={selectedZoneId}
        onSelectZone={handleZoneSelect}
        loading={loadingZones}
      />

      {/* Table Selection Bottom Sheet (Floor Plan) */}
      <TableSelectionBottomSheet
        visible={isFloorPlanSheetOpen}
        onClose={() => setIsFloorPlanSheetOpen(false)}
        floorPlanData={floorPlanData}
        selectedTableIds={selectedTableIds}
        availableTableIds={availableTables.map((t: any) => t.id)}
        onTableSelect={handleFloorPlanTableSelect}
        numberOfGuests={numberOfGuests}
        loading={loadingFloorPlan}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  typeOptions: {
    gap: 12,
  },
  typeOption: {
    backgroundColor: "transparent",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  typeOptionActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  typeOptionContent: {
    flexDirection: "row",
    gap: 12,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#404040",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ec4899",
  },
  typeOptionText: {
    flex: 1,
  },
  typeOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  badgeContainer: {
    marginBottom: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ec4899",
  },
  typeOptionDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  dateButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  dateButtonSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  dateButtonContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dateButtonWeekday: {
    fontSize: 16,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  dateButtonTextSelected: {
    color: "#fff",
  },
  dateButtonTextPlaceholder: {
    color: "#6B7280",
  },
  textButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  textButtonSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  textButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  textButtonTextSelected: {
    color: "#fff",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  noSlotsContainer: {
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#262626",
  },
  noSlotsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginTop: 12,
    marginBottom: 8,
  },
  noSlotsDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 12,
  },
  noSlotsDate: {
    fontWeight: "600",
    color: "#D1D5DB",
  },
  noSlotsHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 4,
  },
  noSlotsHintItem: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  timeSlotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  input: {
    backgroundColor: "transparent",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
    color: "#fff",
    fontSize: 15,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  submitContainer: {
    marginTop: 8,
    marginBottom: 32,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 10,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalButtons: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#262626",
  },
  modalButtonConfirm: {
    backgroundColor: "#ec4899",
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  tableSelectionContainer: {
    gap: 20,
  },
  capacityStatusBar: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  capacityStatusBarMet: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  capacityStatusBarNeed: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  capacityStatusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  capacityStatusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  capacityStatusTextMet: {
    color: "#10b981",
  },
  capacityStatusTextNeed: {
    color: "#ef4444",
  },
  capacityStatusHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginLeft: 26,
  },
  tableSection: {
    gap: 12,
  },
  tableSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  tableSectionTitleReserved: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 8,
  },
  tablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tableCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#262626",
    minWidth: 150,
    flex: 1,
    maxWidth: "48%",
  },
  tableCardSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  tableCardDisabled: {
    opacity: 0.5,
  },
  tableCardReserved: {
    backgroundColor: "#1a1a1a",
    borderColor: "#404040",
    opacity: 0.7,
    borderWidth: 1,
  },
  tableCardContent: {
    gap: 12,
  },
  tableCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  tableNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  tableNumberSelected: {
    color: "#fff",
  },
  tableNumberReserved: {
    fontSize: 18,
    fontWeight: "700",
    color: "#9CA3AF",
    flex: 1,
  },
  unavailabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#262626",
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  cleaningBadge: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  unavailabilityBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  cleaningBadgeText: {
    color: "#fbbf24",
  },
  reservedBadge: {
    backgroundColor: "#404040",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  reservedBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.2,
  },
  tableCardDetails: {
    gap: 8,
  },
  tableDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableDetailText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  tableDetailTextSelected: {
    color: "#fff",
    opacity: 0.95,
  },
  tableDetailTextReserved: {
    fontSize: 12,
    color: "#6B7280",
  },
  selectedTablesSummary: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  selectedTablesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  selectedTablesSummaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
    flex: 1,
  },
  capacityBadgeMet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capacityBadgeTextMet: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  capacityBadgeNeed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capacityBadgeTextNeed: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
  selectedTablesCapacity: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  zoneSelectionSection: {
    gap: 12,
  },
  zoneSelectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  zoneSelectionDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  zonesGrid: {
    gap: 12,
  },
  zoneCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  zoneCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  zoneCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  zoneCardCount: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  zoneCardDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  branchSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#171717",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchSelectButtonActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  branchSelectButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#9CA3AF",
    flex: 1,
  },
  branchSelectButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  nearestBranchBadgeContainer: {
    marginTop: 8,
  },
  nearestBranchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  nearestBranchBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ec4899",
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
  bottomSheetOptionContent: {
    flex: 1,
    gap: 8,
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  nearestBranchBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  nearestBranchBadgeTextInline: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ec4899",
  },
  locationLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  locationLoadingText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  locationErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#404040",
  },
  locationErrorText: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  zoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  zoneBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoneBackButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  zoneHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zoneHeaderText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  // Selection trigger button styles
  selectionTriggerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  selectionTriggerButtonDisabled: {
    opacity: 0.5,
  },
  selectionTriggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  selectionTriggerText: {
    fontSize: 15,
    color: "#D1D5DB",
    flex: 1,
  },
  // Your Selection summary styles
  yourSelectionContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  yourSelectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 12,
  },
  yourSelectionBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#262626",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#404040",
  },
  selectionBadgeText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
  },
  selectionBadgeEdit: {
    fontSize: 11,
    color: "#9CA3AF",
    marginLeft: 4,
  },
});
