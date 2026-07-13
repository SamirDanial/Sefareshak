import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Icon from "@mdi/react";
import { mdiCalendar, mdiClock, mdiAccount, mdiArrowLeft, mdiArrowRight, mdiCreditCard, mdiAlertCircle, mdiOfficeBuilding, mdiLoading, mdiMapMarker, mdiSilverwareForkKnife, mdiFloorPlan } from "@mdi/js";
import {
  reservationService,
  type ReservationType,
  type ZoneFloorPlan,
} from "@/services/reservationService";
import branchService, { type Branch } from "@/services/branchService";
import { toast } from "sonner";
import { FloorPlanViewer } from "@/components/FloorPlanViewer";
import { useSettings } from "@/contexts/SettingsContext";
import AppStatusNotice from "@/components/AppStatusNotice";
import type { AppStatus } from "@/services/settingsService";

const ReservationBooking: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { getToken, user } = useAuth();
  const { branch } = useBranch();
  const { settings: appSettings } = useSettings();
  const appStatus = (appSettings?.appStatus || "LIVE") as AppStatus;
  const isAppUnavailable = appStatus !== "LIVE";
  const [loading, setLoading] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [excludedDates, setExcludedDates] = useState<Date[]>([]);
  const [excludedDateIntervals, setExcludedDateIntervals] = useState<Array<{ start: Date; end: Date }>>([]);

  if (isAppUnavailable) {
    return <AppStatusNotice status={appStatus} />;
  }

  // Form state
  const [reservationType, setReservationType] = useState<ReservationType>("SIMPLE");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [numberOfGuests, setNumberOfGuests] = useState<number>(2);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");
  const [specialRequests, setSpecialRequests] = useState<string>("");
  const [preferredZone, setPreferredZone] = useState<string>("");
  const [fromCheckout, setFromCheckout] = useState<boolean>(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [reservedTables, setReservedTables] = useState<any[]>([]);
  const [, setLoadingTables] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  
  // Branch selection state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [availableZones, setAvailableZones] = useState<any[]>([]);
  const [, setLoadingZones] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  // Floor plan modal state
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  const [nearestBranchId, setNearestBranchId] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Ref to track if we're in the restoration phase (from checkout)
  const isRestoringRef = useRef(false);
  
  // Bottom sheet states for time and zone selection
  const [isTimeSlotSheetOpen, setIsTimeSlotSheetOpen] = useState(false);
  const [isZoneSheetOpen, setIsZoneSheetOpen] = useState(false);
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  
  // Time slot grouping helper function
  type TimeSlotPeriod = 'morning' | 'afternoon' | 'evening';
  
  const getTimeSlotPeriod = (time: string): TimeSlotPeriod => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
  };
  
  const groupedTimeSlots = React.useMemo(() => {
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

  // Clear pre-order lock when switching to SIMPLE reservation type
  useEffect(() => {
    if (reservationType === "SIMPLE") {
      sessionStorage.removeItem("preOrderBranchLock");
    }
  }, [reservationType]);

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
  const getUserLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t("reservations.booking.geolocationNotSupported") || "Geolocation is not supported by your browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Filter branches to only include those with reservations enabled
  const filterBranchesWithReservations = async (branches: Branch[]): Promise<Branch[]> => {
    const token = (await getToken()) || undefined;
    const branchesWithReservations: Branch[] = [];

    // Check each branch for reservation availability
    for (const branch of branches) {
      try {
        // Check if branch has reservations enabled
        const s = await reservationService.getSettings(token, branch.id);
        if (s.isEnabled) {
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

  useEffect(() => {
    if (branch?.id) {
      setSelectedBranchId(branch.id);
    }
  }, [branch?.id]);

  // Load branches on mount
  useEffect(() => {
    if (!branch?.id) {
      loadBranches();
    }
  }, [branch?.id]);

  // Load zones when branch is selected
  useEffect(() => {
    if (selectedBranchId) {
      loadZones();
      loadSettings();
    } else {
      setAvailableZones([]);
      setReservationSettings(null);
      // Clear form when branch is deselected (but not during restoration)
      if (!isRestoringRef.current) {
        setSelectedDate(undefined);
        setSelectedTime("");
        setAvailableTimeSlots([]);
        setAvailableTables([]);
        setReservedTables([]);
        setSelectedTableIds([]);
        setSelectedZoneId(null);
      }
    }
  }, [selectedBranchId]);

  useEffect(() => {
    // Only load settings if branch is selected (handled in branch useEffect)
    // Check if coming from checkout
    // Check if coming from checkout
    const fromCheckoutFlag = sessionStorage.getItem("fromCheckout");
    if (fromCheckoutFlag === "true") {
      setFromCheckout(true);
      // Set restoration flag to prevent clearing during restoration
      isRestoringRef.current = true;
      // Only restore previous selections if coming from checkout
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      if (pendingReservation) {
        try {
          const data = JSON.parse(pendingReservation);
          // Restore form fields
          if (data.date) {
            // Parse date string (YYYY-MM-DD) as local date to avoid timezone issues
            const [year, month, day] = data.date.split('-').map(Number);
            setSelectedDate(new Date(year, month - 1, day));
          }
          // Restore time - store it so it can be preserved when time slots load
          if (data.time) {
            setSelectedTime(data.time);
            // Store the time in sessionStorage temporarily so loadTimeSlots can use it
            sessionStorage.setItem("restoredTime", data.time);
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
            // Validate phone number on load
            const digitsOnly = data.customerPhone.replace(/\D/g, "");
            if (digitsOnly.length < 7) {
              setPhoneError(t("checkout.step1.addressSelector.phoneTooShort") || "Phone number is too short (minimum 7 digits required)");
            } else if (digitsOnly.length > 15) {
              setPhoneError(t("checkout.step1.addressSelector.phoneTooLong") || "Phone number cannot exceed 15 digits");
            } else {
              setPhoneError("");
            }
          }
          if (data.specialRequests) {
            setSpecialRequests(data.specialRequests);
          }
          if (data.preferredZone) {
            setPreferredZone(data.preferredZone);
          }
          if (data.type) {
            setReservationType(data.type);
          }
          // Restore zone and table selections
          if (data.zoneId) {
            setSelectedZoneId(data.zoneId);
          }
          if (data.tableIds && Array.isArray(data.tableIds)) {
            setSelectedTableIds(data.tableIds);
          }
          
          // Clear restoration flag after a short delay to allow all useEffects to process
          setTimeout(() => {
            isRestoringRef.current = false;
          }, 500);
        } catch (error) {
          console.error("Error parsing pending reservation:", error);
          isRestoringRef.current = false;
        }
      } else {
        isRestoringRef.current = false;
      }
    } else {
      // If not coming from checkout, clear any old flags but keep pendingReservation
      // if user is actively creating a reservation
      // Clear fromCheckout flag to prevent navigation issues
      sessionStorage.removeItem("fromCheckout");
      sessionStorage.removeItem("restoredTime");
    }
  }, []);

  useEffect(() => {
    if (user) {
      // Only set user data if not already set from sessionStorage
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      if (!pendingReservation) {
        setCustomerName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || "");
        setCustomerEmail(user.email || "");
        if (user.phone) {
          setCustomerPhone(user.phone);
          // Validate phone number on load
          const digitsOnly = user.phone.replace(/\D/g, "");
          if (digitsOnly.length < 7) {
            setPhoneError(t("checkout.step1.addressSelector.phoneTooShort") || "Phone number is too short (minimum 7 digits required)");
          } else if (digitsOnly.length > 15) {
            setPhoneError(t("checkout.step1.addressSelector.phoneTooLong") || "Phone number cannot exceed 15 digits");
          } else {
            setPhoneError("");
          }
        }
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedDate && selectedBranchId) {
      loadTimeSlots();
    } else {
      setAvailableTimeSlots([]);
      setSelectedTime("");
    }
  }, [selectedDate, numberOfGuests, selectedBranchId]);

  // Clear zone and tables when date, time, numberOfGuests, or branch changes (but not during restoration)
  useEffect(() => {
    if (!isRestoringRef.current) {
      setSelectedTableIds([]);
      setSelectedZoneId(null);
      setAvailableTables([]);
      setReservedTables([]);
    }
  }, [selectedDate, selectedTime, numberOfGuests, selectedBranchId]);

  // Load tables only when zone is selected (after time is already selected)
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

  // Load floor plan when zone is restored from checkout (but don't open the sheet)
  useEffect(() => {
    if (fromCheckout && selectedZoneId && !floorPlanData) {
      loadFloorPlan(selectedZoneId, false); // Don't open sheet during restoration
    }
  }, [fromCheckout, selectedZoneId, floorPlanData]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = (await getToken()) || undefined;
      const data = await branchService.getBranches(token);
      // Filter to only active branches
      const activeBranches = data.filter(branch => branch.isActive !== false);
      
      // Filter to only branches with reservations enabled
      const branchesWithReservations = await filterBranchesWithReservations(activeBranches);
      setBranches(branchesWithReservations);
      
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
      toast.error(t("reservations.booking.failedToLoadBranches") || "Failed to load branches");
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async () => {
    if (!selectedBranchId) return;
    
    try {
      setLoadingZones(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getPublicZones(selectedBranchId, token);
      setAvailableZones(response.zones || []);
    } catch (error: any) {
      console.error("Error loading zones:", error);
      toast.error(error?.response?.data?.error || t("reservations.booking.failedToLoadZones") || "Failed to load zones");
    } finally {
      setLoadingZones(false);
    }
  };

  const loadSettings = async () => {
    if (!selectedBranchId) return;
    
    try {
      const token = (await getToken()) || undefined;
      // Load branch-specific settings (merged with global)
      const data = await reservationService.getSettings(token, selectedBranchId);
      setReservationSettings(data);

      if (!data.isEnabled) {
        toast.error(t("reservations.booking.disabled"));
        navigate("/");
        return;
      }
      
      // Load excluded dates
      if (data.excludedDates) {
        const excluded = typeof data.excludedDates === 'string' 
          ? JSON.parse(data.excludedDates) 
          : data.excludedDates;
        
        // Convert single excluded dates to Date objects
        const singleDates: Date[] = [];
        if (excluded.singleDates && Array.isArray(excluded.singleDates)) {
          excluded.singleDates.forEach((dateStr: string) => {
            const date = new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            singleDates.push(date);
          });
        }
        setExcludedDates(singleDates);
        
        // Convert date ranges to Date intervals
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
      toast.error(t("reservations.booking.loadSettingsError"));
    }
  };

  const loadTimeSlots = async () => {
    if (!selectedDate || !selectedBranchId) return;

    try {
      setLoadingTimeSlots(true);
      const token = (await getToken()) || undefined;
      // Format date as local date string (YYYY-MM-DD) to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const response = await reservationService.getAvailableTimeSlots(
        dateStr,
        numberOfGuests,
        token,
        selectedBranchId
      );
      
      setAvailableTimeSlots(response.data.timeSlots || []);
      // Check if we have a restored time from sessionStorage (when coming from checkout)
      const restoredTime = sessionStorage.getItem("restoredTime");
      if (restoredTime && response.data.timeSlots.includes(restoredTime)) {
        // Restore the time if it's available in the time slots
        setSelectedTime(restoredTime);
        // Clear the temporary storage
        sessionStorage.removeItem("restoredTime");
      } else if (restoredTime) {
        // If restored time is not available, clear it
        sessionStorage.removeItem("restoredTime");
      }
      
      // Clear selected time if it's no longer available (only if not restoring)
      if (!restoredTime && selectedTime && !response.data.timeSlots.includes(selectedTime)) {
        setSelectedTime("");
      }
      
      // Show debug info if no slots
      // Additional logging can be added here if needed
    } catch (error: any) {
      console.error("Error loading time slots:", error);
      toast.error(
        error.response?.data?.error || t("reservations.booking.loadTimeSlotsError")
      );
    } finally {
      setLoadingTimeSlots(false);
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
      const token = (await getToken()) || undefined;
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      
      const response = await reservationService.getTableAvailability(
        dateStr,
        selectedTime,
        numberOfGuests,
        token,
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

  // Load floor plan for a zone
  const loadFloorPlan = async (zoneId: string, openSheet: boolean = true) => {
    try {
      setLoadingFloorPlan(true);
      const token = (await getToken()) || undefined;
      const data = await reservationService.getZoneFloorPlan(zoneId, token);
      setFloorPlanData(data);
      // Check if zone has floor plan configured (any table has position or there are floor elements)
      const hasFloorPlan = 
        (data.tables && data.tables.some((t: any) => t.positionX !== 0 || t.positionY !== 0)) ||
        (data.floorElements && data.floorElements.length > 0);
      
      // Only open the sheet if requested (not during restoration from checkout)
      if (hasFloorPlan && openSheet) {
        setIsFloorPlanOpen(true);
      }
    } catch (error) {
      console.error("Error loading floor plan:", error);
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  // Handle table selection from floor plan viewer
  const handleFloorPlanTableSelect = (tableId: string) => {
    const isSelected = selectedTableIds.includes(tableId);
    if (isSelected) {
      setSelectedTableIds((prev) => prev.filter((id) => id !== tableId));
    } else {
      // Check capacity before adding
      const table = floorPlanData?.tables.find((t) => t.id === tableId);
      if (table) {
        // Only prevent adding if capacity is already met
        const currentCapacity = selectedTableIds
          .map((id) => floorPlanData?.tables.find((t) => t.id === id)?.capacity || 0)
          .reduce((sum, cap) => sum + cap, 0);

        if (currentCapacity < numberOfGuests) {
          setSelectedTableIds((prev) => [...prev, tableId]);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBranchId) {
      toast.error(t("reservations.booking.selectBranchFirst") || "Please select a branch first");
      return;
    }

    if (!selectedDate || !selectedTime) {
      toast.error(t("reservations.booking.selectDateAndTime"));
      return;
    }

    if (reservationType === "PRE_ORDER") {
      try {
        // Validate phone number before proceeding
        const digitsOnly = customerPhone.replace(/\D/g, "");
        if (digitsOnly.length < 7 || digitsOnly.length > 15) {
          toast.error(t("checkout.step1.addressSelector.invalidPhoneNumber") || "Please enter a valid phone number (7-15 digits)");
          return;
        }

        // For pre-order, redirect to menu with reservation context
        // Store reservation details in sessionStorage
        // Format date as local date string (YYYY-MM-DD) to avoid timezone issues
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        // Get zone name for display
        const selectedZone = availableZones.find((z: any) => z.id === selectedZoneId);
        const zoneName = selectedZone?.name || "";
        
        // Get table numbers for display
        const tableNumbers = selectedTableIds.map(id => {
          const table = availableTables.find(t => t.id === id) || 
                        floorPlanData?.tables.find((t: any) => t.id === id);
          return table?.tableNumber || "";
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
          ...(zoneName && { zoneName }),
          ...(tableNumbers.length > 0 && { tableNumbers }),
        };
        
        // Always save reservation data first
        sessionStorage.setItem("pendingReservation", JSON.stringify(reservationData));
        
        // Lock the branch for pre-order reservation
        sessionStorage.setItem("preOrderBranchLock", selectedBranchId);
        
        // Check if coming from checkout - if so, go to checkout page instead of menu
        const fromCheckout = sessionStorage.getItem("fromCheckout");
        sessionStorage.removeItem("fromCheckout"); // Always clear the flag
        
        if (fromCheckout === "true") {
          // Coming from checkout - navigate to checkout page
          // Verify reservation data is set before navigating
          const verifyData = sessionStorage.getItem("pendingReservation");
          if (verifyData) {
            navigate("/reservations/checkout");
          } else {
            // Fallback if data wasn't set properly
            console.error("Reservation data not set properly, redirecting to menu");
            navigate("/menu?reservation=pre-order");
          }
        } else {
          // Verify data is saved before navigating
          const verifyData = sessionStorage.getItem("pendingReservation");
          if (!verifyData) {
            console.error("[ReservationBooking] Failed to save reservation data");
            toast.error(t("reservations.booking.saveDataError"));
            return;
          }
          navigate("/menu?reservation=pre-order");
        }
      } catch (error) {
        console.error("[ReservationBooking] Error in PRE_ORDER submission:", error);
        toast.error(t("reservations.booking.errorOccurred"));
      }
      return;
    }

    // Simple reservation - create directly
    try {
      setLoading(true);

      // Validate phone number before submitting
      const digitsOnly = customerPhone.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        toast.error(t("checkout.step1.addressSelector.invalidPhoneNumber") || "Please enter a valid phone number (7-15 digits)");
        setLoading(false);
        return;
      }
      const token = (await getToken()) || undefined;
      // Format date as local date string (YYYY-MM-DD) to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      // Validate table capacity if tables are selected
      if (selectedTableIds.length > 0) {
        const totalCapacity = selectedTableIds
          .map(id => availableTables.find(t => t.id === id)?.capacity || 0)
          .reduce((sum, cap) => sum + cap, 0);
        
        if (totalCapacity < numberOfGuests) {
          toast.error(
            t("reservations.booking.insufficientCapacity", { 
              capacity: totalCapacity, 
              required: numberOfGuests 
            }) || `Selected tables have ${totalCapacity} seats, but ${numberOfGuests} guests are required. Please select more tables.`
          );
          setLoading(false);
          return;
        }
      }

      const reservationData = {
        reservationDate: dateStr,
        time: selectedTime,
        numberOfGuests,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests: specialRequests || undefined,
        preferredZone: preferredZone || undefined,
        branchId: selectedBranchId,
        ...(selectedTableIds.length > 0 && { tableIds: selectedTableIds }),
        ...(selectedZoneId && { zoneId: selectedZoneId }),
      };
      
      await reservationService.createSimpleReservation(
        reservationData,
        token
      );

      // Clear any pending reservation data
      sessionStorage.removeItem("pendingReservation");
      sessionStorage.removeItem("fromCheckout");

      toast.success(t("reservations.booking.createdSuccess"));
      navigate("/reservations/my-reservations");
    } catch (error: any) {
      console.error("Error creating reservation:", error);
      toast.error(
        error.response?.data?.error || t("reservations.booking.createError")
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? t("reservations.booking.pm") || "PM" : t("reservations.booking.am") || "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Check if a date falls on a day that's off (no reservation hours) based on branch settings
  const isDayOff = (date: Date): boolean => {
    if (!reservationSettings) return false;
    
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];
    
    const openKey = `${dayName}Open` as keyof typeof reservationSettings;
    const closeKey = `${dayName}Close` as keyof typeof reservationSettings;
    
    const openTime = reservationSettings[openKey] as string | undefined;
    const closeTime = reservationSettings[closeKey] as string | undefined;
    
    // Day is off if there's no open time or no close time (empty string, null, or undefined)
    return !openTime || !closeTime || openTime === '' || closeTime === '';
  };

  const isFormValid = () => {
    // Validate phone number format
    const digitsOnly = customerPhone.replace(/\D/g, "");
    const isPhoneValid = customerPhone.trim() !== "" && 
                         digitsOnly.length >= 7 && 
                         digitsOnly.length <= 15 && 
                         !phoneError;

    return (
      selectedDate &&
      selectedTime &&
      numberOfGuests > 0 &&
      numberOfGuests <= (reservationSettings?.maxGuestsPerReservation || 20) &&
      customerName.trim() !== "" &&
      customerEmail.trim() !== "" &&
      isPhoneValid
    );
  };


  return (
    <div className="space-y-6 loading-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors"
        >
          <Icon path={i18n.language === "da" ? mdiArrowRight : mdiArrowLeft} size={0.83} className="text-pink-500" />
          <span className="text-sm font-medium">{t("reservations.booking.back")}</span>
        </button>
        <h1 className="text-lg font-semibold text-white">{t("reservations.booking.title")}</h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 0: Branch Selection */}
        {!branch?.id ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon path={mdiOfficeBuilding} size={0.83} />
                {t("reservations.booking.selectBranch") || "Select Branch"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBranches ? (
                <div className="flex items-center justify-center py-8">
                  <Icon path={mdiLoading} size={1.0} className="animate-spin text-pink-500" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t("reservations.booking.loadingBranches") || "Loading branches..."}
                  </span>
                </div>
              ) : branches.length === 0 ? (
                <div className="p-6 border rounded-lg bg-muted/50 text-center">
                  <Icon
                    path={mdiAlertCircle}
                    size={1.0}
                    className="text-muted-foreground mx-auto mb-2"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("reservations.booking.noBranchesAvailable") ||
                      "No branches available for reservations."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{t("reservations.booking.branch") || "Branch"}</Label>
                  <Select
                    value={selectedBranchId || ""}
                    onValueChange={(value) => {
                      setSelectedBranchId(value);
                      // Clear form when branch changes
                      setSelectedDate(undefined);
                      setSelectedTime("");
                      setAvailableTimeSlots([]);
                      setAvailableTables([]);
                      setReservedTables([]);
                      setSelectedTableIds([]);
                      setSelectedZoneId(null);
                    }}
                  >
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue
                        placeholder={
                          t("reservations.booking.selectBranchPlaceholder") || "Select a branch"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name || `Branch ${branch.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isGettingLocation && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon path={mdiLoading} size={0.5} className="animate-spin" />
                      <span>
                        {t("reservations.booking.findingNearestBranch") ||
                          "Finding nearest branch..."}
                      </span>
                    </div>
                  )}
                  {nearestBranchId && selectedBranchId === nearestBranchId && userLocation && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-pink-500/10 border border-pink-500/20">
                      <Icon path={mdiMapMarker} size={0.67} className="text-pink-500" />
                      <span className="text-xs text-pink-500">
                        {t("reservations.booking.nearestBranchSelected") ||
                          "Nearest branch selected based on your location"}
                      </span>
                    </div>
                  )}
                  {locationError && !selectedBranchId && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon path={mdiAlertCircle} size={0.5} />
                      <span>
                        {t("reservations.booking.locationError") ||
                          "Could not determine your location. Please select a branch manually."}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("reservations.booking.selectBranchDescription") ||
                      "Choose the branch where you'd like to make a reservation"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Step 1: Reservation Type */}
        {selectedBranchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon path={mdiSilverwareForkKnife} size={0.83} />
              {t("reservations.booking.chooseType")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={reservationType}
              onValueChange={(value) => setReservationType(value as ReservationType)}
            >
              <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 cursor-pointer">
                <RadioGroupItem value="SIMPLE" id="simple" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="simple" className="cursor-pointer">
                    <div className="font-semibold">{t("reservations.booking.simpleReservation")}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("reservations.booking.simpleDescription")}
                    </div>
                  </Label>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 cursor-pointer">
                <RadioGroupItem value="PRE_ORDER" id="preorder" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="preorder" className="cursor-pointer">
                    <div className="font-semibold flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <span>{t("reservations.booking.preOrderReservation")}</span>
                      <Badge variant="outline" className="text-xs">
                        <Icon path={mdiCreditCard} size={0.50} className="mr-1" />
                        {t("reservations.booking.paymentRequired")}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("reservations.booking.preOrderDescription")}
                    </div>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
        )}

        {/* Step 2: Booking Details */}
        {selectedBranchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon path={mdiCalendar} size={0.83} />
              {t("reservations.booking.bookingDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date Selection */}
            <div className="space-y-2">
              <Label>{t("reservations.booking.selectDate")}</Label>
              <DatePicker
                date={selectedDate}
                onDateChange={(date) => {
                  setSelectedDate(date);
                  setSelectedTime("");
                }}
                placeholder={t("reservations.booking.chooseDate")}
                minDate={new Date()}
                maxDate={
                  reservationSettings?.maxAdvanceBookingDays
                    ? new Date(
                        Date.now() +
                          reservationSettings.maxAdvanceBookingDays * 24 * 60 * 60 * 1000
                      )
                    : undefined
                }
                excludeDates={excludedDates}
                excludeDateIntervals={excludedDateIntervals}
                filterDate={(date: Date) => {
                  // Disable days that are off (no reservation hours)
                  return !isDayOff(date);
                }}
              />
            </div>

            {/* Time Slot Selection - Trigger Button */}
            {selectedDate && (
              <div className="space-y-2">
                <Label>{t("reservations.booking.selectTime")}</Label>
                <button
                  type="button"
                  onClick={() => setIsTimeSlotSheetOpen(true)}
                  disabled={loadingTimeSlots}
                  className={`w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between ${
                    selectedTime
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-border hover:border-pink-300 hover:bg-pink-50 dark:hover:bg-pink-500/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${selectedTime ? "bg-pink-500" : "bg-muted"}`}>
                      {loadingTimeSlots ? (
                        <Icon path={mdiLoading} size={0.83} className="text-white animate-spin" />
                      ) : (
                        <Icon path={mdiClock} size={0.83} className={selectedTime ? "text-white" : "text-muted-foreground"} />
                      )}
                    </div>
                    <div>
                      {selectedTime ? (
                        <>
                          <div className="font-semibold text-foreground">{formatTime(selectedTime)}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("reservations.booking.tapToChange") || "Tap to change"}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-muted-foreground">
                            {loadingTimeSlots 
                              ? (t("reservations.booking.loadingTimeSlots") || "Loading time slots...")
                              : (t("reservations.booking.tapToSelectTime") || "Tap to select a time")}
                          </div>
                          {!loadingTimeSlots && availableTimeSlots.length > 0 && (
                            <div className="text-xs text-pink-500">
                              {t("reservations.booking.slotsAvailable", { count: availableTimeSlots.length }) || `${availableTimeSlots.length} slots available`}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <Icon path={mdiArrowRight} size={0.67} className="text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Number of Guests */}
            <div className="space-y-2">
              <Label>{t("reservations.booking.numberOfGuests")}</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={numberOfGuests > 0 ? numberOfGuests.toString() : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow numbers
                  if (value === "" || /^\d+$/.test(value)) {
                    if (value === "") {
                      setNumberOfGuests(0);
                    } else {
                      const numValue = Number(value);
                      const maxGuests = reservationSettings?.maxGuestsPerReservation || 20;
                      if (numValue > 0 && numValue <= maxGuests) {
                        setNumberOfGuests(numValue);
                      } else if (numValue > maxGuests) {
                        // Don't update if exceeds max, but allow typing
                        return;
                      }
                    }
                  }
                }}
                placeholder={t("reservations.booking.guestsPlaceholder")}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t("reservations.booking.guestsHint", { max: reservationSettings?.maxGuestsPerReservation || 20 })}
              </p>
            </div>

            {/* Booking Summary - Compact tappable items */}
            {(selectedDate || selectedTime || selectedZoneId) && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {t("reservations.booking.yourSelection") || "Your Selection"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {/* Date Badge */}
                  {selectedDate && (
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
                      <Icon path={mdiCalendar} size={0.67} className="text-pink-500" />
                      <span className="text-sm font-medium text-foreground">
                        {selectedDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  
                  {/* Time Badge - Tappable to open sheet */}
                  {selectedTime ? (
                    <button
                      type="button"
                      onClick={() => setIsTimeSlotSheetOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 transition-colors"
                    >
                      <Icon path={mdiClock} size={0.67} className="text-pink-500" />
                      <span className="text-sm font-medium text-foreground">{formatTime(selectedTime)}</span>
                      <span className="text-xs text-pink-400">{t("reservations.booking.tapToChange") || "tap to change"}</span>
                    </button>
                  ) : selectedDate && (
                    <button
                      type="button"
                      onClick={() => setIsTimeSlotSheetOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-pink-400 transition-colors"
                    >
                      <Icon path={mdiClock} size={0.67} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("reservations.booking.addTime") || "Add time"}</span>
                    </button>
                  )}
                  
                  {/* Zone Badge - Tappable to open sheet */}
                  {selectedZoneId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedZoneId(null);
                        setIsZoneSheetOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 transition-colors"
                    >
                      <Icon path={mdiMapMarker} size={0.67} className="text-pink-500" />
                      <span className="text-sm font-medium text-foreground">
                        {availableZones.find((z: any) => z.id === selectedZoneId)?.name || t("reservations.booking.zone") || "Zone"}
                      </span>
                      <span className="text-xs text-pink-400">{t("reservations.booking.tapToChange") || "tap to change"}</span>
                    </button>
                  ) : selectedTime && (
                    <button
                      type="button"
                      onClick={() => setIsZoneSheetOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-pink-400 transition-colors"
                    >
                      <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("reservations.booking.addZone") || "Add zone"}</span>
                    </button>
                  )}
                  
                  {/* Guests Badge */}
                  {numberOfGuests > 0 && (
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
                      <Icon path={mdiAccount} size={0.67} className="text-pink-500" />
                      <span className="text-sm font-medium text-foreground">
                        {numberOfGuests} {numberOfGuests === 1 ? (t("reservations.booking.guest") || "guest") : (t("reservations.booking.guests") || "guests")}
                      </span>
                    </div>
                  )}

                  {/* Table Badge - Tappable to open floor plan/zone sheet */}
                  {selectedTableIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (floorPlanData) {
                          setIsFloorPlanOpen(true);
                        } else if (selectedZoneId) {
                          loadFloorPlan(selectedZoneId);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 transition-colors"
                    >
                      <Icon path={mdiSilverwareForkKnife} size={0.67} className="text-pink-500" />
                      <span className="text-sm font-medium text-foreground">
                        {selectedTableIds.length === 1 
                          ? `${t("reservations.booking.table") || "Table"} ${availableTables.find(t => t.id === selectedTableIds[0])?.tableNumber || floorPlanData?.tables.find((t: any) => t.id === selectedTableIds[0])?.tableNumber || ""}`
                          : `${selectedTableIds.length} ${t("reservations.booking.tables") || "tables"}`}
                      </span>
                      <span className="text-xs text-pink-400">{t("reservations.booking.tapToChange") || "tap to change"}</span>
                    </button>
                  ) : selectedZoneId && selectedTime && (
                    <button
                      type="button"
                      onClick={() => {
                        if (floorPlanData) {
                          setIsFloorPlanOpen(true);
                        } else {
                          loadFloorPlan(selectedZoneId);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-pink-400 transition-colors"
                    >
                      <Icon path={mdiSilverwareForkKnife} size={0.67} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("reservations.booking.addTable") || "Add table"}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Zone Preference (Medium Tier) */}
            {reservationSettings?.tier === "MEDIUM" && (
              <div className="space-y-2">
                <Label>{t("reservations.booking.preferredZone")}</Label>
                <Input
                  placeholder={t("reservations.booking.zonePlaceholder")}
                  value={preferredZone}
                  onChange={(e) => setPreferredZone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("reservations.booking.zoneHint")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Step 3: Contact Information */}
        {selectedBranchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon path={mdiAccount} size={0.83} />
              {t("reservations.booking.contactInformation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("reservations.booking.fullName")}</Label>
              <Input
                id="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t("reservations.booking.fullNamePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("reservations.booking.email")}</Label>
              <Input
                id="email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder={t("reservations.booking.emailPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">
                {t("reservations.booking.phone")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow only digits, spaces, dashes, parentheses, and plus sign
                  const phoneRegex = /^[\d\s\-\(\)\+]*$/;
                  
                  if (value === "" || phoneRegex.test(value)) {
                    setCustomerPhone(value);
                    
                    // Validate phone number format
                    if (value.trim() === "") {
                      setPhoneError("");
                    } else {
                      // Remove all non-digit characters for validation
                      const digitsOnly = value.replace(/\D/g, "");
                      // Check if it has at least 7 digits (minimum for a valid phone number)
                      // and at most 15 digits (ITU-T E.164 standard)
                      if (digitsOnly.length < 7) {
                        setPhoneError(t("checkout.step1.addressSelector.phoneTooShort") || "Phone number is too short (minimum 7 digits required)");
                      } else if (digitsOnly.length > 15) {
                        setPhoneError(t("checkout.step1.addressSelector.phoneTooLong") || "Phone number cannot exceed 15 digits");
                      } else {
                        setPhoneError("");
                      }
                    }
                  }
                }}
                placeholder={t("reservations.booking.phonePlaceholder")}
                className={phoneError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                required
              />
              {phoneError && (
                <p className="text-xs text-red-500 mt-1">{phoneError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="requests">{t("reservations.booking.specialRequests")}</Label>
              <Textarea
                id="requests"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder={t("reservations.booking.specialRequestsPlaceholder")}
                rows={3}
                className="bg-transparent"
              />
            </div>
          </CardContent>
        </Card>
        )}

        {/* Submit Button */}
        {selectedBranchId && (
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex-1"
          >
            {t("reservations.booking.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!isFormValid() || loading || loadingTimeSlots}
            className="flex-1 bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50"
          >
            {loading ? (
              <>
                <Icon path={mdiClock} size={0.67} className="mr-2 animate-spin" />
                {t("reservations.booking.creating")}
              </>
            ) : reservationType === "PRE_ORDER" ? (
              <>
                {fromCheckout ? t("reservations.booking.completePayment") : t("reservations.booking.continueToMenu")}
                <Icon path={mdiArrowRight} size={0.67} className="ml-2" />
              </>
            ) : (
              <>
                {t("reservations.booking.bookReservation")}
                <Icon path={mdiCalendar} size={0.67} className="ml-2" />
              </>
            )}
          </Button>
        </div>
        )}

      </form>

      {/* Time Slot Selection Bottom Sheet */}
      <Sheet open={isTimeSlotSheetOpen} onOpenChange={setIsTimeSlotSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] bg-[#151718] border-t border-[#262626] text-white rounded-t-3xl p-0 pt-8 flex flex-col">
          <SheetHeader className="px-4 pb-4 border-b border-[#333]">
            <SheetTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                <span>{t("reservations.booking.selectTimeSlot") || "Select Time Slot"}</span>
              </div>
              {selectedTime && (
                <Badge className="bg-pink-500 text-white">
                  {formatTime(selectedTime)}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 min-h-0">
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
                      {t("reservations.booking.noTimeSlotsDescription")}{" "}
                      <strong className="text-white">
                        {selectedDate?.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </strong>
                      .
                    </p>
                    <div className="pt-2 space-y-1 text-xs text-gray-500">
                      <p>{t("reservations.booking.pleaseTry")}</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>{t("reservations.booking.tryDifferentDate")}</li>
                        <li>
                          {t("reservations.booking.bookInAdvance", {
                            hours: reservationSettings?.minAdvanceBookingHours || 2,
                          })}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col min-h-0">
                {/* Time Period Tabs - Sliding Segmented Control */}
                <div className="px-4 py-3 border-b border-[#333]">
                  <div className="relative bg-[#262626] rounded-xl p-1">
                    {/* Sliding Indicator */}
                    <div
                      className="absolute top-1 bottom-1 bg-pink-500 rounded-lg transition-all duration-300 ease-out"
                      style={{
                        width: "calc(25% - 2px)",
                        left: `calc(${(
                          ["all", "morning", "afternoon", "evening"] as const
                        ).indexOf(timeSlotFilter)} * 25% + 2px)`,
                      }}
                    />

                    {/* Tab Buttons */}
                    <div className="relative flex">
                      {(["all", "morning", "afternoon", "evening"] as const).map((period) => {
                        const count =
                          period === "all"
                            ? availableTimeSlots.length
                            : groupedTimeSlots[period].length;
                        const labels: Record<typeof period, string> = {
                          all: t("reservations.booking.allTimes") || "All",
                          morning: t("reservations.booking.morning") || "Morning",
                          afternoon: t("reservations.booking.afternoon") || "Afternoon",
                          evening: t("reservations.booking.evening") || "Evening",
                        };
                        const isDisabled = period !== "all" && count === 0;
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
                              <span
                                className={`text-[10px] ${
                                  isActive ? "text-white/80" : "text-gray-500"
                                }`}
                              >
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
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {filteredTimeSlots.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {t("reservations.booking.noSlotsInPeriod") ||
                        "No slots available in this period"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {filteredTimeSlots.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => {
                            setSelectedTime(time);
                            setIsTimeSlotSheetOpen(false);
                          }}
                          className={`p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                            selectedTime === time
                              ? "bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/30"
                              : "border-[#333] bg-[#1a1a1a] text-white hover:border-pink-400 hover:bg-[#262626]"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {selectedTime === time && (
                              <div className="h-2 w-2 rounded-full bg-white" />
                            )}
                            {formatTime(time)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
          
          {availableZones.length === 0 ? (
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
                      setSelectedZoneId(zone.id);
                      setIsZoneSheetOpen(false);
                      // Try to load floor plan
                      await loadFloorPlan(zone.id);
                    }}
                    disabled={loadingFloorPlan}
                    className="w-full p-4 rounded-xl border-2 border-[#333] bg-[#1a1a1a] hover:border-pink-400 hover:bg-[#262626] transition-all text-left disabled:opacity-50"
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
                          <div className="flex items-center gap-3 mt-2">
                            {zone.canvasWidth && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 text-xs text-pink-400">
                                <Icon path={mdiFloorPlan} size={0.5} />
                                {t("reservations.booking.hasFloorPlan") || "Floor Plan"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {loadingFloorPlan ? (
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
                <span>{floorPlanData?.name || t("reservations.booking.floorPlan") || "Floor Plan"}</span>
              </div>
              {selectedTableIds.length > 0 && (
                <Badge className="bg-pink-500 text-white">
                  {selectedTableIds.length} {t("reservations.booking.tablesSelected") || "selected"}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          {floorPlanData && (
            <div className="flex-1 h-[calc(85vh-120px)]">
              <div className="px-4 pt-3 pb-2 text-xs text-gray-400 text-center">
                {`Tip: Try to choose table(s) that best fit ${numberOfGuests} guest${numberOfGuests === 1 ? "" : "s"}.`}
              </div>
              <FloorPlanViewer
                canvasWidth={floorPlanData.canvasWidth || 800}
                canvasHeight={floorPlanData.canvasHeight || 600}
                tables={floorPlanData.tables.map((t: any) => ({
                  ...t,
                  // Merge availability info
                  status: availableTables.some((at) => at.id === t.id) ? "AVAILABLE" : 
                          reservedTables.some((rt) => rt.id === t.id) ? "RESERVED" : t.status,
                }))}
                floorElements={floorPlanData.floorElements || []}
                selectedTableIds={selectedTableIds}
                availableTableIds={availableTables.map((t: any) => t.id)}
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
                  const totalCapacity = selectedTableIds
                    .map((id) => floorPlanData?.tables.find((t: any) => t.id === id)?.capacity || 0)
                    .reduce((sum, cap) => sum + cap, 0);
                  const isCapacityMet = totalCapacity >= numberOfGuests;
                  return (
                    <span className={isCapacityMet ? "text-green-500" : "text-gray-400"}>
                      {totalCapacity} / {numberOfGuests} {t("reservations.booking.seats") || "seats"}
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
  );
};

export default ReservationBooking;

