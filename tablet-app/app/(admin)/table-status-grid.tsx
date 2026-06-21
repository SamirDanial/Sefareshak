import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
  Dimensions,
  TextInput,
  Linking,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { Calendar } from "react-native-calendars";
import DateTimePicker from "@react-native-community/datetimepicker";
import ApiService from "@/src/services/apiService";
import branchService from "@/src/services/branchService";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CELL_MIN_WIDTH = 100;
const ITEMS_PER_PAGE = 12;

interface TableStatusGridData {
  date: string;
  timeSlots: string[];
  tables: Array<{
    id: string;
    tableNumber: string;
    capacity: number;
    zone: string | null;
    status: string;
    timeSlots: Record<string, {
      status: "AVAILABLE" | "RESERVED";
      reservation: {
        reservationId: string;
        reservationNumber: string;
        customerName: string;
        customerEmail: string;
        customerPhone: string;
        numberOfGuests: number;
        status: string;
        type: string;
        userId?: string;
        user?: {
          id: string;
          firstName?: string;
          lastName?: string;
          email: string;
        };
      } | null;
    }>;
  }>;
  operatingHours: {
    open: string;
    close: string;
  };
}

export default function TableStatusGridScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();
  const isSuperAdmin = userType === "SUPER_ADMIN";
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition, isScrollingDown, isAtTop } = useScroll();
  const lastScrollY = useRef(0);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const stickyHeaderScrollRef = useRef<ScrollView>(null);
  const [headerSticky, setHeaderSticky] = useState(false);
  const headerLayoutRef = useRef<{ y: number; height: number } | null>(null);
  const gridContainerLayoutRef = useRef<{ y: number } | null>(null);
  const horizontalScrollX = useRef(0);
  const stickyHeaderTop = useRef(new Animated.Value(headerHeight)).current;

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;

    // Check if header should be sticky
    // The header should be sticky when we've scrolled past its position
    if (headerLayoutRef.current && gridContainerLayoutRef.current) {
      // gridContainerLayoutRef.current.y is the position of the grid container within ScrollView content
      // headerLayoutRef.current.y is the position of the header within the grid container
      // Total position of header from top of ScrollView content
      const headerAbsolutePosition = gridContainerLayoutRef.current.y + headerLayoutRef.current.y;
      // Show sticky header when we've scrolled past the header's position (accounting for navbar)
      const scrollThreshold = headerAbsolutePosition - headerHeight;
      const shouldBeSticky = currentScrollY >= scrollThreshold;
      
      if (shouldBeSticky !== headerSticky) {
        setHeaderSticky(shouldBeSticky);
      }
    }
  };

  // Animate sticky header position based on navbar visibility
  useEffect(() => {
    if (headerSticky) {
      // When navbar is hidden (scrolling down and not at top), sticky header should be at top
      // But account for status bar so it's not cut off - use insets.top
      // When navbar is visible (at top or scrolling up), sticky header should be below navbar (headerHeight)
      const targetTop = isScrollingDown && !isAtTop ? insets.top : headerHeight;
      
      Animated.timing(stickyHeaderTop, {
        toValue: targetTop,
        duration: 300,
        useNativeDriver: false, // 'top' doesn't support native driver
      }).start();
    }
  }, [headerSticky, isScrollingDown, isAtTop, headerHeight, insets.top, stickyHeaderTop]);

  const handleHorizontalScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    horizontalScrollX.current = offsetX;
    
    // Sync sticky header horizontal scroll
    if (stickyHeaderScrollRef.current && headerSticky) {
      stickyHeaderScrollRef.current.scrollTo({ x: offsetX, animated: false });
    }
  };

  const handleHeaderLayout = (event: any) => {
    // Get the absolute position of the header within the ScrollView content
    event.target.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      headerLayoutRef.current = { y, height };
    });
  };

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [gridData, setGridData] = useState<TableStatusGridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    tableId: string;
    tableNumber: string;
    timeSlot: string;
    reservation: any;
  } | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [branches, setBranches] = useState<Array<{ id: string; name?: string | null; code?: string | null }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchDropdownVisible, setBranchDropdownVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [timeRangeStart, setTimeRangeStart] = useState<string>("");
  const [timeRangeEnd, setTimeRangeEnd] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoneDropdownVisible, setZoneDropdownVisible] = useState(false);
  const [timePickerState, setTimePickerState] = useState<{
    visible: boolean;
    type: "start" | "end";
    date: Date;
  }>({
    visible: false,
    type: "start",
    date: new Date(),
  });
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "info",
  });

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (orgLoading) return;

    setBranches([]);
    setBranchDropdownVisible(false);

    setGridData(null);
    setSelectedZone("all");
    setTimeRangeStart("");
    setTimeRangeEnd("");
    setShowFilters(false);

    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, orgLoading, selectedOrganizationId]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      if (!token) return;

      const loadedBranches = await branchService.getBranches(token);
      setBranches(loadedBranches);

      const currentIsValid = selectedBranchId && loadedBranches.some((b) => b.id === selectedBranchId);
      if (!currentIsValid && loadedBranches.length > 0 && loadedBranches[0]?.id) {
        setSelectedBranchId(loadedBranches[0].id);
      }
    } catch (error: any) {
      console.error("Error loading branches:", error);
      setToast({
        visible: true,
        message: error.message || "Failed to load branches",
        type: "error",
      });
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadGridData = async () => {
    if (!selectedBranchId) {
      setGridData(null);
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const apiService = ApiService.getInstance();
      const params = new URLSearchParams({
        date: dateStr,
        branchId: selectedBranchId,
      });
      const result = await apiService.get(
        `/api/reservations/tables/status-grid?${params.toString()}`,
        token
      );

      if (result.success) {
        setGridData(result.data);
      } else {
        throw new Error(result.error || "Failed to load data");
      }
    } catch (error: any) {
      const message =
        (error?.data && (error.data.message || error.data.error)) ||
        error?.message ||
        t("admin.tableStatusGrid.errorLoading");

      const isReservationsDisabledForBranch =
        typeof message === "string" &&
        message.toLowerCase().includes("reservations are not enabled");

      if (isReservationsDisabledForBranch) {
        setGridData(null);
        setToast({
          visible: true,
          message: t("admin.tableStatusGrid.reservationsNotEnabled") || "Reservations are not enabled for this branch",
          type: "info",
        });
      } else {
        console.error("Error loading grid data:", error);
        setToast({
          visible: true,
          message,
          type: "error",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadGridData();
  };

  useEffect(() => {
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    if (isSuperAdmin) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLoading]);

  useEffect(() => {
    if (selectedBranchId) {
    loadGridData();
    } else {
      setGridData(null);
    }
  }, [selectedDate, selectedBranchId]);

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const handleCellClick = (tableId: string, tableNumber: string, timeSlot: string, reservation: any) => {
    setSelectedCell({
      tableId,
      tableNumber,
      timeSlot,
      reservation,
    });
    setIsDetailsModalOpen(true);
  };

  const getZones = () => {
    if (!gridData) return [];
    const zones = new Set<string>();
    gridData.tables.forEach((table) => {
      if (table.zone) {
        zones.add(table.zone);
      }
    });
    return Array.from(zones).sort();
  };

  const getFilteredTables = () => {
    if (!gridData) return [];
    let filtered = [...gridData.tables];

    // Filter by zone if not "all"
    if (selectedZone !== "all") {
      if (selectedZone === "no-zone") {
        // Filter for tables with no zone assigned
        filtered = filtered.filter((table) => !table.zone || table.zone.trim() === "");
      } else {
      filtered = filtered.filter((table) => table.zone === selectedZone);
      }
    }

    // Sort alphabetically by zone name, then by table number
    filtered.sort((a, b) => {
      const zoneA = a.zone || "";
      const zoneB = b.zone || "";
      
      // First sort by zone
      if (zoneA !== zoneB) {
        return zoneA.localeCompare(zoneB);
      }
      
      // If same zone, sort by table number
      return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: 'base' });
    });

    return filtered;
  };

  const getFilteredTimeSlots = () => {
    if (!gridData) return [];
    let slots = gridData.timeSlots;

    if (timeRangeStart) {
      slots = slots.filter((slot) => slot >= timeRangeStart);
    }
    if (timeRangeEnd) {
      slots = slots.filter((slot) => slot <= timeRangeEnd);
    }

    return slots;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RESERVED":
        return { bg: "#dc2626", border: "#991b1b", text: "#fff" };
      case "AVAILABLE":
        return { bg: "#16a34a", border: "#15803d", text: "#fff" };
      default:
        return { bg: "#6b7280", border: "#4b5563", text: "#fff" };
    }
  };

  const formatDateString = (date: Date): string => {
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
    const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    const day = date.getDate();
    const year = date.getFullYear();
    return `${weekday}, ${month} ${day}, ${year}`;
  };

  const formatTimeString = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const formatTimeDisplay = (timeStr: string): string => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleTimePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setTimePickerState((prev) => ({ ...prev, visible: false }));
      if (event.type === "set" && selectedDate) {
        const timeStr = formatTimeString(selectedDate);
        if (timePickerState.type === "start") {
          setTimeRangeStart(timeStr);
        } else {
          setTimeRangeEnd(timeStr);
        }
      }
    } else {
      if (selectedDate) {
        setTimePickerState((prev) => ({ ...prev, date: selectedDate }));
      }
    }
  };

  const filteredTables = getFilteredTables();
  const filteredTimeSlots = getFilteredTimeSlots();
  const zones = getZones();

  // Check if filters are applied
  const hasFilters = selectedZone !== "all" || timeRangeStart || timeRangeEnd;
  
  // Pagination logic - only apply when no filters
  const totalPages = hasFilters ? 1 : Math.ceil(filteredTables.length / ITEMS_PER_PAGE);
  const startIndex = hasFilters ? 0 : (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = hasFilters ? filteredTables.length : startIndex + ITEMS_PER_PAGE;
  const paginatedTables = filteredTables.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedZone, timeRangeStart, timeRangeEnd]);

  return (
    <View style={styles.container}>
      {/* Sticky Header Row - Positioned at root level, smoothly transitions */}
      {headerSticky && (
        <Animated.View 
          style={[
            styles.stickyHeaderContainer, 
            { 
              top: stickyHeaderTop,
            }
          ]}
        >
          <View style={styles.stickyHeaderWrapper}>
            {/* Fixed First Column Header */}
            <View style={styles.tableHeaderCellSticky}>
              <Text style={styles.tableHeaderText}>Table</Text>
            </View>
            {/* Scrollable Time Slot Headers */}
          <ScrollView
            ref={stickyHeaderScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={false}
            style={styles.stickyHeaderScroll}
            contentContainerStyle={styles.stickyHeaderContent}
          >
            <View style={styles.gridHeaderRow}>
              {filteredTimeSlots.map((timeSlot) => (
                <View key={timeSlot} style={styles.timeSlotHeaderCell}>
                  <Text style={styles.timeSlotHeaderText}>{timeSlot}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          </View>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Table Status Grid</Text>
          <Text style={styles.pageSubtitle}>View and manage table reservations by time slot</Text>
        </View>

        {/* Branch Selector */}
        <View style={styles.branchSelector}>
          <Text style={styles.branchLabel}>{t("admin.tableStatusGrid.branch") || "Branch"}:</Text>
          <TouchableOpacity
            style={styles.branchDropdownButton}
            onPress={() => setBranchDropdownVisible(true)}
            disabled={loadingBranches || branches.length === 0}
          >
            <Text style={[styles.branchDropdownText, !selectedBranchId && styles.branchDropdownTextPlaceholder]}>
              {loadingBranches
                ? t("admin.tableStatusGrid.loading") || "Loading..."
                : selectedBranchId
                ? branches.find((b) => b.id === selectedBranchId)?.name || branches.find((b) => b.id === selectedBranchId)?.code || selectedBranchId
                : t("admin.tableStatusGrid.selectBranch") || "Select Branch"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Date Selector */}
        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => handleDateChange(-1)}
          >
            <MaterialCommunityIcons name="chevron-left" size={20} color="#ec4899" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButtonMain}
            onPress={() => setDatePickerVisible(true)}
          >
            <MaterialCommunityIcons name="calendar" size={18} color="#ec4899" />
            <Text style={styles.dateText}>{formatDateString(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => handleDateChange(1)}
          >
            <MaterialCommunityIcons name="chevron-right" size={20} color="#ec4899" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.todayButton}
            onPress={() => setSelectedDate(new Date())}
          >
            <Text style={styles.todayButtonText}>{t("admin.tableStatusGrid.today")}</Text>
          </TouchableOpacity>
        </View>

        {gridData?.operatingHours && (
          <View style={styles.operatingHours}>
            <Text style={styles.operatingHoursText}>
              {t("admin.tableStatusGrid.operatingHours")}: {gridData.operatingHours.open} - {gridData.operatingHours.close}
            </Text>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filtersContainer}>
          <TouchableOpacity
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
          >
            <MaterialCommunityIcons name="tune-vertical" size={18} color="#ec4899" />
            <Text style={styles.filterToggleText}>{t("admin.tableStatusGrid.filters")}</Text>
            <MaterialCommunityIcons
              name={showFilters ? "chevron-up" : "chevron-down"}
              size={16}
              color="#9CA3AF"
            />
          </TouchableOpacity>

          {showFilters && (
            <View style={styles.filtersContent}>
              {/* Zone Filter - Dropdown */}
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>{t("admin.tableStatusGrid.zone")}:</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setZoneDropdownVisible(true)}
                >
                  <Text style={styles.dropdownButtonText}>
                    {selectedZone === "all" 
                      ? t("admin.tableStatusGrid.allZones") 
                      : selectedZone === "no-zone"
                      ? t("admin.tableStatusGrid.unassigned")
                      : selectedZone}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Time Range Filter - Time Pickers */}
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>{t("admin.tableStatusGrid.timeRange")}:</Text>
                <View style={styles.timeRangeInputs}>
                  <TouchableOpacity
                    style={styles.timePickerTriggerButton}
                    onPress={() => {
                      const currentTime = timeRangeStart
                        ? (() => {
                            const [hours, minutes] = timeRangeStart.split(":").map(Number);
                            const date = new Date();
                            date.setHours(hours, minutes, 0, 0);
                            return date;
                          })()
                        : new Date();
                      setTimePickerState({
                        visible: true,
                        type: "start",
                        date: currentTime,
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="clock" size={16} color="#ec4899" />
                    <Text style={[styles.timePickerTriggerButtonText, !timeRangeStart && styles.timePickerTriggerButtonTextPlaceholder]}>
                      {timeRangeStart ? formatTimeDisplay(timeRangeStart) : t("admin.tableStatusGrid.startTime")}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.timeRangeSeparator}>-</Text>
                  <TouchableOpacity
                    style={styles.timePickerTriggerButton}
                    onPress={() => {
                      const currentTime = timeRangeEnd
                        ? (() => {
                            const [hours, minutes] = timeRangeEnd.split(":").map(Number);
                            const date = new Date();
                            date.setHours(hours, minutes, 0, 0);
                            return date;
                          })()
                        : new Date();
                      setTimePickerState({
                        visible: true,
                        type: "end",
                        date: currentTime,
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="clock" size={16} color="#ec4899" />
                    <Text style={[styles.timePickerTriggerButtonText, !timeRangeEnd && styles.timePickerTriggerButtonTextPlaceholder]}>
                      {timeRangeEnd ? formatTimeDisplay(timeRangeEnd) : t("admin.tableStatusGrid.endTime")}
                    </Text>
                  </TouchableOpacity>
                  {(timeRangeStart || timeRangeEnd) && (
                    <TouchableOpacity
                      style={styles.clearTimeButton}
                      onPress={() => {
                        setTimeRangeStart("");
                        setTimeRangeEnd("");
                      }}
                    >
                      <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Grid */}
        {!selectedBranchId ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="map-marker" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>
              {t("admin.tableStatusGrid.selectBranchToView") || "Select a Branch"}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("admin.tableStatusGrid.selectBranchToViewDescription") || "Please select a branch to view table status grid"}
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading table status...</Text>
          </View>
        ) : !gridData || gridData.tables.length === 0 ? (
          <View style={styles.emptyContainer}>
                              <MaterialCommunityIcons name="chart-bar" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>
              {t("admin.tableStatusGrid.noTablesFound")}
            </Text>
          </View>
        ) : (
          <View 
            style={styles.gridContainer}
            onLayout={(e) => {
              const { y } = e.nativeEvent.layout;
              gridContainerLayoutRef.current = { y };
            }}
          >
            <View style={styles.gridWrapper}>
              {/* Fixed First Column */}
              <View style={styles.fixedColumn}>
                {/* Header */}
                <View 
                  style={styles.tableHeaderCellSticky}
                  onLayout={(e) => {
                    const layout = e.nativeEvent.layout;
                    headerLayoutRef.current = { 
                      y: layout.y, 
                      height: layout.height 
                    };
                  }}
                >
                    <Text style={styles.tableHeaderText}>Table</Text>
                  </View>
                {/* Table Rows */}
                {paginatedTables.map((table, index) => (
                  <View 
                    key={table.id} 
                    style={[
                      styles.tableCellSticky,
                      index % 2 === 1 && styles.tableCellStickyAlternate
                    ]}
                  >
                      <Text style={styles.tableNumber}>{table.tableNumber}</Text>
                      <View style={styles.tableInfo}>
                        {table.zone && (
                          <View style={styles.tableInfoRow}>
                            <MaterialCommunityIcons name="map-marker" size={12} color="#9CA3AF" />
                            <Text style={styles.tableInfoText}>{table.zone}</Text>
                          </View>
                        )}
                        <View style={styles.tableInfoRow}>
                          <MaterialCommunityIcons name="account-group" size={12} color="#9CA3AF" />
                          <Text style={styles.tableInfoText}>{table.capacity} seats</Text>
                        </View>
                      </View>
                    </View>
                ))}
              </View>

              {/* Horizontal Scroll for Time Slots */}
              <ScrollView
                ref={horizontalScrollRef}
                horizontal
                showsHorizontalScrollIndicator={true}
                style={styles.horizontalScroll}
                contentContainerStyle={styles.horizontalScrollContent}
                nestedScrollEnabled={true}
                onScroll={handleHorizontalScroll}
                scrollEventThrottle={16}
              >
                <View style={styles.grid}>
                  {/* Header Row */}
                  <View style={styles.gridHeaderRow}>
                    {filteredTimeSlots.map((timeSlot) => (
                      <View key={timeSlot} style={styles.timeSlotHeaderCell}>
                        <Text style={styles.timeSlotHeaderText}>{timeSlot}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Table Rows */}
                  {paginatedTables.map((table, index) => (
                    <View 
                      key={table.id} 
                      style={[
                        styles.gridRow,
                        index % 2 === 1 && styles.gridRowAlternate
                      ]}
                    >
                    {filteredTimeSlots.map((timeSlot) => {
                      const slotData = table.timeSlots[timeSlot];
                      const status = slotData?.status || "AVAILABLE";
                      const reservation = slotData?.reservation;
                      const colors = getStatusColor(status);

                      return (
                        <TouchableOpacity
                          key={timeSlot}
                          style={[
                            styles.timeSlotCell,
                              { 
                                backgroundColor: colors.bg, 
                                borderColor: colors.border,
                                opacity: index % 2 === 1 ? 0.7 : 1.0,
                              },
                          ]}
                          onPress={() =>
                            handleCellClick(table.id, table.tableNumber, timeSlot, reservation)
                          }
                        >
                          {reservation ? (
                            <View style={styles.reservedCellContent}>
                              <Text
                                style={[styles.reservedCellText, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {reservation.customerName}
                              </Text>
                              <Text
                                style={[styles.reservedCellSubtext, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {reservation.numberOfGuests} {t("admin.tableStatusGrid.guests")}
                              </Text>
                            </View>
                          ) : (
                            <Text style={[styles.availableCellText, { color: colors.text }]}>
                              {t("admin.tableStatusGrid.available")}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            </View>
          </View>
        )}

        {/* Pagination Controls - Only show when no filters applied */}
        {!hasFilters && filteredTables.length > ITEMS_PER_PAGE && (
          <View style={styles.paginationContainer}>
            <TouchableOpacity
              style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
              onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={currentPage === 1 ? "#6B7280" : "#ec4899"} />
            </TouchableOpacity>
            
            <Text style={styles.paginationText}>
              Page {currentPage} of {totalPages}
            </Text>
            
            <TouchableOpacity
              style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
              onPress={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={currentPage === totalPages ? "#6B7280" : "#ec4899"} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Branch Dropdown Modal - Bottom Sheet */}
      <Modal
        visible={branchDropdownVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setBranchDropdownVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setBranchDropdownVisible(false)}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>
                {t("admin.tableStatusGrid.selectBranch") || "Select Branch"}
              </Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                {branches.map((branch) => (
                  <TouchableOpacity
                    key={branch.id}
                    style={styles.sheetItem}
                    onPress={() => {
                      setSelectedBranchId(branch.id);
                      setBranchDropdownVisible(false);
                    }}
                  >
                    <Text style={styles.sheetItemText}>
                      {branch.name || branch.code || branch.id}
                    </Text>
                    {selectedBranchId === branch.id && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setBranchDropdownVisible(false)}
              >
                <Text style={styles.sheetCancelText}>
                  {t("common.cancel") || "Cancel"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zone Dropdown Modal - Bottom Sheet */}
      <Modal
        visible={zoneDropdownVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setZoneDropdownVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setZoneDropdownVisible(false)}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>
                {t("admin.tableStatusGrid.selectZone") || "Select Zone"}
              </Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setSelectedZone("all");
                    setZoneDropdownVisible(false);
                  }}
                >
                  <Text style={styles.sheetItemText}>
                    {t("admin.tableStatusGrid.allZones") || "All Zones"}
                  </Text>
                  {selectedZone === "all" && (
                    <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setSelectedZone("no-zone");
                    setZoneDropdownVisible(false);
                  }}
                >
                  <Text style={styles.sheetItemText}>
                    {t("admin.tableStatusGrid.unassigned") || "Unassigned"}
                  </Text>
                  {selectedZone === "no-zone" && (
                    <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>

                {zones.map((zone) => (
                  <TouchableOpacity
                    key={zone}
                    style={styles.sheetItem}
                    onPress={() => {
                      setSelectedZone(zone);
                      setZoneDropdownVisible(false);
                    }}
                  >
                    <Text style={styles.sheetItemText}>{zone}</Text>
                    {selectedZone === zone && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setZoneDropdownVisible(false)}
              >
                <Text style={styles.sheetCancelText}>
                  {t("common.cancel") || "Cancel"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Time Picker Modal */}
      {timePickerState.visible && (
        <>
          {Platform.OS === "ios" ? (
            <Modal
              visible={timePickerState.visible}
              transparent
              animationType="slide"
              onRequestClose={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.timePickerModalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {timePickerState.type === "start" ? t("admin.tableStatusGrid.startTime") : t("admin.tableStatusGrid.endTime")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
                      style={styles.modalCloseButton}
                    >
                      <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.timePickerContainer}>
                    <DateTimePicker
                      value={timePickerState.date}
                      mode="time"
                      is24Hour={false}
                      display="spinner"
                      onChange={handleTimePickerChange}
                      textColor="#111827"
                      themeVariant="light"
                      style={styles.timePicker}
                    />
                  </View>
                  <View style={styles.timePickerActions}>
                    <TouchableOpacity
                      style={styles.timePickerButtonCancel}
                      onPress={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
                    >
                      <Text style={styles.timePickerButtonTextCancel}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timePickerButtonConfirm}
                      onPress={() => {
                        const timeStr = formatTimeString(timePickerState.date);
                        if (timePickerState.type === "start") {
                          setTimeRangeStart(timeStr);
                        } else {
                          setTimeRangeEnd(timeStr);
                        }
                        setTimePickerState((prev) => ({ ...prev, visible: false }));
                      }}
                    >
                      <Text style={styles.timePickerButtonTextConfirm}>{t("common.confirm")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={timePickerState.date}
              mode="time"
              is24Hour={false}
              display="default"
              onChange={handleTimePickerChange}
              textColor="#111827"
              themeVariant="light"
              positiveButton={{ label: t("common.confirm"), textColor: "#ec4899" }}
              negativeButton={{ label: t("common.cancel"), textColor: "#6B7280" }}
            />
          )}
        </>
      )}

      {/* Date Picker Modal */}
      <Modal
        visible={datePickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setDatePickerVisible(false)}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.tableStatusGrid.selectDate") || "Select Date"}</Text>
              <View style={styles.calendarContainer}>
                <Calendar
                  current={(() => {
                    const year = selectedDate.getFullYear();
                    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(selectedDate.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                  })()}
                  minDate={(() => {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const day = String(today.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                  })()}
                  onDayPress={(day: { dateString: string }) => {
                    const newDate = new Date(day.dateString);
                    setSelectedDate(newDate);
                    setDatePickerVisible(false);
                  }}
                  markedDates={{
                    [(() => {
                      const year = selectedDate.getFullYear();
                      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(selectedDate.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    })()]: {
                      selected: true,
                      selectedColor: "#ec4899",
                      selectedTextColor: "#fff",
                    },
                  }}
                  theme={{
                    backgroundColor: "#ffffff",
                    calendarBackground: "#ffffff",
                    textSectionTitleColor: "#374151",
                    selectedDayBackgroundColor: "#ec4899",
                    selectedDayTextColor: "#fff",
                    todayTextColor: "#ec4899",
                    dayTextColor: "#111827",
                    textDisabledColor: "#d1d5db",
                    dotColor: "#ec4899",
                    selectedDotColor: "#fff",
                    arrowColor: "#ec4899",
                    monthTextColor: "#111827",
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

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setDatePickerVisible(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel") || "Cancel"}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reservation Details Modal */}
      <Modal
        visible={isDetailsModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsDetailsModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsDetailsModalOpen(false)}
        >
          <Pressable style={styles.detailsModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <View>
                  <Text style={styles.modalTitle}>
                    {selectedCell?.tableNumber} at {selectedCell?.timeSlot}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedCell?.reservation
                      ? t("admin.tableStatusGrid.reservationNumber", { number: selectedCell.reservation.reservationNumber })
                      : t("admin.tableStatusGrid.noReservation")}
                  </Text>
                </View>
                
                {/* Customer Contact in Header */}
                {selectedCell?.reservation && (
                  <View style={styles.headerContactInfo}>
                    <View style={styles.headerContactRow}>
                      <MaterialCommunityIcons name="account" size={16} color="#ec4899" />
                      <Text style={styles.headerContactText}>
                        {selectedCell.reservation.customerName}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.headerContactRow}
                      onPress={() => {
                        const phoneNumber = selectedCell.reservation.customerPhone.replace(/\D/g, "");
                        Linking.openURL(`tel:${phoneNumber}`);
                      }}
                    >
                      <MaterialCommunityIcons name="phone" size={16} color="#ec4899" />
                      <Text style={[styles.headerContactText, styles.headerContactLink]}>
                        {selectedCell.reservation.customerPhone}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.headerContactRow}
                      onPress={() => {
                        Linking.openURL(`mailto:${selectedCell.reservation.customerEmail}`);
                      }}
                    >
                      <MaterialCommunityIcons name="email" size={16} color="#ec4899" />
                      <Text style={[styles.headerContactText, styles.headerContactLink]} numberOfLines={1}>
                        {selectedCell.reservation.customerEmail}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setIsDetailsModalOpen(false)}>
                <MaterialCommunityIcons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailsScrollView} showsVerticalScrollIndicator={true}>
              {selectedCell?.reservation ? (
                <View style={styles.detailsContent}>
                  {/* Contact Information Section */}
                  <View style={styles.contactSection}>
                    <Text style={styles.sectionTitle}>{t("admin.tableStatusGrid.contactInformation")}</Text>
                    
                    {/* Customer Name */}
                    <View style={styles.contactCard}>
                      <View style={styles.contactRow}>
                        <MaterialCommunityIcons name="account" size={20} color="#ec4899" />
                        <View style={styles.contactTextContainer}>
                          <Text style={styles.contactLabel}>{t("admin.tableStatusGrid.customerName")}</Text>
                          <Text style={styles.contactValue}>
                            {selectedCell.reservation.customerName}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Phone - Clickable */}
                    <TouchableOpacity
                      style={styles.contactCard}
                      onPress={() => {
                        const phoneNumber = selectedCell.reservation.customerPhone.replace(/\D/g, "");
                        Linking.openURL(`tel:${phoneNumber}`);
                      }}
                    >
                      <View style={styles.contactRow}>
                        <MaterialCommunityIcons name="phone" size={20} color="#ec4899" />
                        <View style={styles.contactTextContainer}>
                          <Text style={styles.contactLabel}>{t("admin.tableStatusGrid.phone")}</Text>
                          <Text style={[styles.contactValue, styles.clickableText]}>
                            {selectedCell.reservation.customerPhone}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="arrow-top-right" size={16} color="#9CA3AF" />
                      </View>
                    </TouchableOpacity>

                    {/* Email - Clickable */}
                    <TouchableOpacity
                      style={styles.contactCard}
                      onPress={() => {
                        Linking.openURL(`mailto:${selectedCell.reservation.customerEmail}`);
                      }}
                    >
                      <View style={styles.contactRow}>
                        <MaterialCommunityIcons name="email" size={20} color="#ec4899" />
                        <View style={styles.contactTextContainer}>
                          <Text style={styles.contactLabel}>{t("admin.tableStatusGrid.email")}</Text>
                          <Text style={[styles.contactValue, styles.clickableText]} numberOfLines={1}>
                            {selectedCell.reservation.customerEmail}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="arrow-top-right" size={16} color="#9CA3AF" />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Reservation Details Section */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.sectionTitle}>{t("admin.tableStatusGrid.reservationDetails")}</Text>

                    {/* Reservation Date & Time */}
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="calendar" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.dateAndTime")}</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.reservationDate
                            ? new Date(selectedCell.reservation.reservationDate).toLocaleString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : `${formatDateString(selectedDate)} at ${selectedCell.timeSlot}`}
                        </Text>
                      </View>
                    </View>

                    {/* Number of Guests */}
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="account-group" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.numberOfGuests")}</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.numberOfGuests}
                        </Text>
                      </View>
                    </View>

                  {/* All Reserved Tables */}
                  {selectedCell.reservation.tables && selectedCell.reservation.tables.length > 0 && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="table-furniture" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.reservedTables")}</Text>
                        <View style={styles.tablesList}>
                          {selectedCell.reservation.tables.map((table: any, index: number) => (
                            <View key={index} style={styles.tableItem}>
                              <Text style={styles.tableItemText}>
                                {table.tableNumber}
                                {table.zone && ` • ${table.zone}`}
                                {table.capacity && ` (${table.capacity} ${t("admin.tableStatusGrid.seats")})`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Preferred Zone */}
                  {selectedCell.reservation.preferredZone && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="map-marker" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.preferredZone")}</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.preferredZone}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Special Requests */}
                  {selectedCell.reservation.specialRequests && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="note-text" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.specialRequests")}</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.specialRequests}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Status */}
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.status")}</Text>
                      <View style={styles.badgeContainer}>
                        <View
                          style={[
                            styles.statusBadge,
                            selectedCell.reservation.status === "CONFIRMED"
                              ? styles.statusBadgeConfirmed
                              : selectedCell.reservation.status === "SEATED"
                              ? styles.statusBadgeSeated
                              : styles.statusBadgePending,
                          ]}
                        >
                          <Text style={styles.statusBadgeText}>
                            {selectedCell.reservation.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Type */}
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="tag" size={18} color="#ec4899" />
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.type")}</Text>
                      <View style={styles.badgeContainer}>
                        <View style={styles.typeBadge}>
                          <Text style={styles.typeBadgeText}>
                            {selectedCell.reservation.type}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Confirmed At */}
                  {selectedCell.reservation.confirmedAt && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="check-decagram" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>{t("admin.tableStatusGrid.confirmedAt")}</Text>
                        <Text style={styles.detailValue}>
                          {new Date(selectedCell.reservation.confirmedAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Created At */}
                  {selectedCell.reservation.createdAt && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="clock" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>Created At</Text>
                        <Text style={styles.detailValue}>
                          {new Date(selectedCell.reservation.createdAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Internal Notes */}
                  {selectedCell.reservation.internalNotes && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="file-document" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>Internal Notes</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.internalNotes}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* User Account */}
                  {selectedCell.reservation.user && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="account-circle" size={18} color="#ec4899" />
                      <View style={styles.detailTextContainer}>
                        <Text style={styles.detailLabel}>User Account</Text>
                        <Text style={styles.detailValue}>
                          {selectedCell.reservation.user.firstName ||
                          selectedCell.reservation.user.lastName
                            ? `${selectedCell.reservation.user.firstName || ""} ${
                                selectedCell.reservation.user.lastName || ""
                              }`.trim()
                            : selectedCell.reservation.user.email}
                        </Text>
                      </View>
                    </View>
                  )}

                  </View>

                  {/* View Full Details Button */}
                  <TouchableOpacity
                    style={styles.viewDetailsButton}
                    onPress={() => {
                      setIsDetailsModalOpen(false);
                      router.push(`/(admin)/reservation-details?id=${selectedCell.reservation.reservationId}`);
                    }}
                  >
                    <Text style={styles.viewDetailsButtonText}>View Full Details</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.noReservationContent}>
                  <MaterialCommunityIcons name="clock" size={48} color="#6B7280" />
                  <Text style={styles.noReservationText}>
                    This table is available at {selectedCell?.timeSlot}
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
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
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  branchDropdownButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchDropdownText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  branchDropdownTextPlaceholder: {
    color: "#6B7280",
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  dateButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateButtonMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  operatingHours: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  operatingHoursText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  filtersContainer: {
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  filterToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  filtersContent: {
    padding: 12,
    paddingTop: 0,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  filterRow: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  filterChips: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  timeRangeInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInput: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
    fontSize: 14,
  },
  timeRangeSeparator: {
    fontSize: 14,
    color: "#6B7280",
  },
  clearTimeButton: {
    padding: 8,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  gridContainer: {
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  gridWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  fixedColumn: {
    width: 140,
    zIndex: 10,
    backgroundColor: "#f9fafb",
    borderRightWidth: 2,
    borderRightColor: "#e5e7eb",
    position: "relative",
  },
  tableHeaderCellSticky: {
    width: 140,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
  },
  tableCellSticky: {
    width: 140,
    padding: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 80,
  },
  tableCellStickyAlternate: {
    backgroundColor: "#f9fafb",
  },
  horizontalScroll: {
    flex: 1,
  },
  horizontalScrollContent: {
    padding: 0,
  },
  grid: {
    padding: 0,
  },
  stickyHeaderContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: "hidden",
  },
  stickyHeaderWrapper: {
    flexDirection: "row",
  },
  stickyHeaderScroll: {
    flex: 1,
  },
  stickyHeaderContent: {
    padding: 8,
  },
  gridHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    padding: 0,
  },
  tableHeaderCell: {
    width: 140,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  timeSlotHeaderCell: {
    minWidth: CELL_MIN_WIDTH,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  timeSlotHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  gridRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 80,
  },
  gridRowAlternate: {
    backgroundColor: "#f9fafb",
  },
  tableCell: {
    width: 140,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  tableNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  tableInfo: {
    gap: 4,
  },
  tableInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tableInfoText: {
    fontSize: 11,
    color: "#6B7280",
  },
  timeSlotCell: {
    minWidth: CELL_MIN_WIDTH,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 80,
  },
  reservedCellContent: {
    alignItems: "center",
    gap: 2,
  },
  reservedCellText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  reservedCellSubtext: {
    fontSize: 10,
    textAlign: "center",
    opacity: 0.9,
  },
  availableCellText: {
    fontSize: 10,
    textAlign: "center",
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  calendarContainer: {
    marginVertical: 16,
  },
  calendar: {
    borderRadius: 12,
    overflow: "hidden",
  },
  detailsModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  modalHeaderContent: {
    flex: 1,
    gap: 12,
  },
  headerContactInfo: {
    marginTop: 8,
    gap: 8,
  },
  headerContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerContactText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  headerContactLink: {
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  modalConfirmButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  detailsScrollView: {
    flex: 1,
  },
  detailsContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 20,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  badgeContainer: {
    marginTop: 4,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeConfirmed: {
    backgroundColor: "#3b82f6",
  },
  statusBadgePending: {
    backgroundColor: "#fbbf24",
  },
  statusBadgeSeated: {
    backgroundColor: "#22c55e",
  },
  tablesList: {
    gap: 8,
    marginTop: 4,
  },
  tableItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  tableItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  viewDetailsButton: {
    marginTop: 8,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  viewDetailsButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  noReservationContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  noReservationText: {
    marginTop: 16,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  contactSection: {
    marginBottom: 24,
  },
  detailsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  contactCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  contactTextContainer: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  clickableText: {
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  paginationContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  paginationButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    minWidth: 80,
    textAlign: "center",
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
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
  sheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sheetScrollView: {
    maxHeight: 360,
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
  sheetItemText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 14,
  },
  timePickerTriggerButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  timePickerTriggerButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  timePickerTriggerButtonTextPlaceholder: {
    color: "#6B7280",
  },
  timePickerModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  timePickerContainer: {
    padding: 20,
    alignItems: "center",
  },
  timePicker: {
    width: "100%",
  },
  timePickerActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  timePickerButtonCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  timePickerButtonConfirm: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  timePickerButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  timePickerButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  fullViewButtonContainer: {
    marginBottom: 12,
    alignItems: "flex-end",
    paddingHorizontal: 16,
  },
  fullViewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullViewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  fullViewContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: "#ffffff",
  },
  rotatedStickyHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  rotatedTableHeaderCell: {
    width: 140,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRightWidth: 2,
    borderRightColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "flex-start",
    minHeight: 50,
  },
  rotatedHeaderScroll: {
    flex: 1,
  },
  rotatedHeaderScrollContent: {
    padding: 0,
  },
  rotatedGridScroll: {
    flex: 1,
  },
  rotatedGridScrollContent: {
    paddingBottom: 20,
  },
  rotatedGridWrapper: {
    flexDirection: "row",
  },
  rotatedFixedColumn: {
    width: 140,
    backgroundColor: "#f9fafb",
    borderRightWidth: 2,
    borderRightColor: "#e5e7eb",
  },
  rotatedHorizontalScroll: {
    flex: 1,
  },
  rotatedHorizontalScrollContent: {
    padding: 0,
  },
  rotatedGrid: {
    padding: 0,
  },
  rotatedTimeSlotHeaderCell: {
    minWidth: CELL_MIN_WIDTH,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  rotatedGridRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 80,
  },
  rotatedGridRowAlternate: {
    backgroundColor: "#f9fafb",
  },
  rotatedTableCellSticky: {
    width: 140,
    padding: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 80,
  },
  rotatedTableCellStickyAlternate: {
    backgroundColor: "#f9fafb",
  },
  rotatedTimeSlotCell: {
    minWidth: CELL_MIN_WIDTH,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 80,
  },
  fullViewDateControls: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1001,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullViewControlButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "rgba(243, 244, 246, 0.8)",
  },
  fullViewControlButtonDisabled: {
    opacity: 0.5,
  },
  fullViewControlText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  fullViewDateButton: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "rgba(243, 244, 246, 0.8)",
    alignItems: "center",
  },
  fullViewDateText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  fullViewToggleButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 1001,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullViewBottomControls: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 1001,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fullViewExitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fce7f3",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullViewExitButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  fullViewPagination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullViewPaginationText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    minWidth: 60,
    textAlign: "center",
  },
});
