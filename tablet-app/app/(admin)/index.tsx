import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { dashboardService } from "@/src/services/dashboardService";
import type { DashboardStats, ChartData } from "@/src/services/dashboardService";
import branchService, { type Organization, type Branch } from "@/src/services/branchService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { TimePeriodFilter, type TimePeriod } from "@/components/admin/TimePeriodFilter";
import { StatsCard } from "@/components/admin/StatsCard";
import { Chart } from "@/components/admin/Chart";
import { FullscreenChart } from "@/components/admin/FullscreenChart";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import ApiService from "@/src/services/apiService";
import NetInfo from '@react-native-community/netinfo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_TABLET = SCREEN_WIDTH >= 768;
const IS_LANDSCAPE = SCREEN_WIDTH > SCREEN_HEIGHT;

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userType, getToken } = useAuthRole();
  const { assignedBranchIds, canAny, isOrgAdmin, rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const { selectedBranchId: ctxBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const [orientation, setOrientation] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("last_30_days");
  // Dashboard uses 'all' as sentinel for 'no specific branch'; BranchContext uses '' for same
  const selectedBranchId = ctxBranchId || "all";
  const setSelectedBranchId = (id: string) => setSelectedBranch(id === "all" ? "" : id);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const selectedBranch = selectedBranchId && selectedBranchId !== "all" 
    ? branches.find(b => b.id === selectedBranchId) || null 
    : null;
  const [ordersChartData, setOrdersChartData] = useState<ChartData | null>(null);
  const [categoriesChartData, setCategoriesChartData] = useState<ChartData | null>(null);
  const [branchRevenueChartData, setBranchRevenueChartData] = useState<ChartData | null>(null);
  const [branchOrdersChartData, setBranchOrdersChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFullscreenChart, setShowFullscreenChart] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info"; }>({ visible: false, message: "", type: "success" });
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [showBranchOfflineDialog, setShowBranchOfflineDialog] = useState(false);
  const orgFetchSeqRef = useRef(0);
  const prevDashboardOrgIdRef = useRef<string | null | undefined>(undefined);

  const effectiveUserType = ((rbacUser as any)?.userType as string | null | undefined) || userType;
  const isEntitledAdmin = Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== "USER"));
  const isBranchAdmin = effectiveUserType === "BRANCH_ADMIN";
  const isEmployee = effectiveUserType === "EMPLOYEE";
  const isWaiter = effectiveUserType === "WAITER";
  const isBranchScoped = isBranchAdmin || isEmployee || isWaiter;
  const canViewBranches = !permissionsLoading && canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW }]);
  
  // Offline detection
  useEffect(() => {
    const checkConnection = async () => {
      const netInfo = await NetInfo.fetch();
      const offline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      setIsOffline(offline);
    };

    checkConnection();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
  }, []);
  
  // Update orientation when device rotates
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setOrientation({ width: window.width, height: window.height });
    });
    return () => subscription?.remove();
  }, []);
  
  const IS_TABLET_CURRENT = orientation.width >= 768;
  const IS_LANDSCAPE_CURRENT = orientation.width > orientation.height;

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) setScrollDirection('down');
    else if (currentScrollY < lastScrollY.current) setScrollDirection('up');
    lastScrollY.current = currentScrollY;
  };

  const formatPrice = (amount: number): string => {
    const getLocaleForCurrency = (curr: string): string => {
      const currencyLocaleMap: { [key: string]: string } = { USD: "en-US", EUR: "de-DE", GBP: "en-GB", INR: "en-IN", AED: "ar-AE" };
      return currencyLocaleMap[curr] || "en-US";
    };
    return new Intl.NumberFormat(getLocaleForCurrency(currency), { style: "currency", currency }).format(amount);
  };

  // Helper function to determine validation status
  const getValidationStatus = (organization: Organization) => {
    // Get expiration date from the latest validation record, not the organization field (same logic as organizations page)
    const latestValidation = organization.validations && organization.validations.length > 0 ? organization.validations[0] : null;
    const expiresAt = latestValidation?.expiresAt ? new Date(latestValidation.expiresAt) : (organization.validationExpiresAt ? new Date(organization.validationExpiresAt) : null);
    const gracePeriodEndsAt = latestValidation?.gracePeriodEndsAt ? new Date(latestValidation.gracePeriodEndsAt) : (organization.gracePeriodEndsAt ? new Date(organization.gracePeriodEndsAt) : null);

    const hasExplicitValidationFlag = typeof organization.isValidated === "boolean";

    // Check for temporarily unvalidated (has validations but org.isValidated is false)
    if (organization.isValidated === false && organization.validations && organization.validations.length > 0) {
      const latestValidation = organization.validations[0];
      if (latestValidation.isActive === false && latestValidation.unvalidatedAt) {
        return { status: 'temporarily_invalid', message: 'Validation temporarily inactive' };
      }
    }

    // Only treat as manually unvalidated when backend explicitly tells us it's unvalidated.
    if (organization.isValidated === false) {
      return { status: 'unvalidated', message: 'Organization not validated' };
    }

    const now = new Date();

    if (!expiresAt) {
      // If we don't have any validation fields (e.g. endpoint did not select them),
      // don't show an incorrect warning.
      if (!hasExplicitValidationFlag) {
        return { status: 'valid', message: 'Unknown validation status (missing fields)' };
      }
      return { status: 'unvalidated', message: 'No expiration date found' };
    }

    // Check if still valid
    if (now <= expiresAt) {
      return { status: 'valid', message: 'Valid', expiresAt };
    }

    // Check if in grace period
    if (gracePeriodEndsAt && now <= gracePeriodEndsAt) {
      return { status: 'grace_period', message: 'In grace period after expiration' };
    }

    // Expired
    return { status: 'expired', message: 'Validation expired' };
  };

  const fetchSettings = async () => {
    if (effectiveUserType === "SUPER_ADMIN" && !selectedOrganizationId) return;
    try {
      const token = await getToken();
      if (!token) return;
      
      // Use the same logic as fetchDashboardData for consistency
      let branchIdForApi: string | undefined;
      
      if (isSwitchingOrg) {
        // Always send undefined when switching organizations
        branchIdForApi = undefined;
      } else if (isBranchScoped) {
        // For branch-scoped users, send their assigned branch or empty string
        branchIdForApi = selectedBranchId === "all" || !selectedBranchId ? undefined : selectedBranchId;
      } else {
        // For org admins and super admins, "all" means undefined (all branches)
        branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      }

      // Backend applies org-level settings overrides (incl. currency) when a branchId is provided.
      // When "all" branches is selected, use any available branch as a representative to get the org-scoped currency.
      const branchIdForSettings =
        !isBranchScoped && selectedBranchId === "all" && branches.length > 0
          ? branches[0]?.id
          : branchIdForApi;
      const apiService = ApiService.getInstance();
      try {
        const result = await apiService.getSettings(token, branchIdForSettings);
        const settings = (result as any)?.data?.data ?? (result as any)?.data ?? (result as any);
        if (settings?.currency) setCurrency(settings.currency);
      } catch (settingsError: any) {
        // If settings fetch fails (e.g., inactive branch), try without branchId to get org-level settings
        if (settingsError?.status === 404 && branchIdForSettings) {
          try {
            const orgResult = await apiService.getSettings(token, undefined);
            const orgSettings = (orgResult as any)?.data?.data ?? (orgResult as any)?.data ?? (orgResult as any);
            if (orgSettings?.currency) setCurrency(orgSettings.currency);
          } catch (orgError) {
            console.warn("Failed to fetch org-level settings:", orgError);
            // Keep existing currency as fallback
          }
        } else {
          console.warn("Failed to fetch settings:", settingsError);
          // Keep existing currency as fallback
        }
      }
    } catch (error) { console.error("Failed to fetch settings:", error); }
  };

  const fetchOrganization = async () => {
    if (!selectedOrganizationId) {
      setSelectedOrganization(null);
      return;
    }

    const requestSeq = ++orgFetchSeqRef.current;

    try {
      const token = await getToken();
      if (!token) return;

      let nextOrg: Organization | null = null;

      try {
        nextOrg =
          (await branchService.getOrganizationById(selectedOrganizationId, token)) ||
          null;
      } catch (directFetchError) {
        if (effectiveUserType === "SUPER_ADMIN") {
          const organizations = await branchService.getOrganizations(token);
          nextOrg = organizations.find((o) => o.id === selectedOrganizationId) || null;
        } else {
          throw directFetchError;
        }
      }

      if (requestSeq === orgFetchSeqRef.current) {
        setSelectedOrganization(nextOrg);
      }
    } catch (error) {
      console.error("Failed to fetch organization:", error);
      if (requestSeq === orgFetchSeqRef.current) {
        setSelectedOrganization(null);
      }
    }
  };

  const fetchDashboardData = async () => {
    // IMMEDIATE GUARD: Don't fetch if organization is switching or if no organization is selected for super admin
    if (effectiveUserType === "SUPER_ADMIN" && !selectedOrganizationId) {
      setLoading(false);
      setRefreshing(false);
      setStats(null);
      setOrdersChartData(null);
      setCategoriesChartData(null);
      setBranchRevenueChartData(null);
      setBranchOrdersChartData(null);
      return;
    }

    // CRITICAL GUARD: If we have a specific branch selected but no branches loaded yet, don't fetch
    if (!isBranchScoped && selectedBranchId && selectedBranchId !== "all" && branches.length === 0) {
      console.warn("Specific branch selected but no branches loaded yet, skipping fetch");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Don't fetch if currently switching organizations
    if (isSwitchingOrg) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Don't fetch if branches are empty (organization is switching)
    if (branches.length === 0 && !isBranchScoped) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // CRITICAL FIX: Always send undefined when switching organizations or when branch validation fails
    let branchIdForApi: string | undefined;
    
    // If we're in a transition state or the selected branch might be invalid, send undefined
    if (isSwitchingOrg || (!isBranchScoped && selectedBranchId && selectedBranchId !== "all" && branches.length > 0)) {
      const branchExists = branches.some(branch => branch.id === selectedBranchId);
      if (!branchExists && selectedBranchId !== "all") {
        console.warn(`Selected branch ${selectedBranchId} not found in current organization, sending undefined for all branches`);
        branchIdForApi = undefined;
        // Reset the selected branch to "all" for next time
        setSelectedBranchId("all");
      } else {
        // Normal logic
        if (isBranchScoped) {
          branchIdForApi = selectedBranchId === "all" || !selectedBranchId ? undefined : selectedBranchId;
        } else {
          branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
        }
      }
    } else {
      // Normal logic
      if (isBranchScoped) {
        branchIdForApi = selectedBranchId === "all" || !selectedBranchId ? undefined : selectedBranchId;
      } else {
        branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      }
    }

    if (!selectedBranchId || selectedBranchId === "") {
      setLoading(false);
      setRefreshing(false);
      setStats(null);
      setOrdersChartData(null);
      setCategoriesChartData(null);
      setBranchRevenueChartData(null);
      setBranchOrdersChartData(null);
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
      
      const isAllBranches = !isBranchScoped && selectedBranchId === "all";
      // Only use selectedOrganizationId so it matches the x-organization-id header the
      // backend uses to validate org-scoped routes. Falling back to rbacUser.organizationId
      // can mismatch the header during the brief auto-select window and trigger
      // "Selected organization does not match requested organization".
      const orgIdForStats = selectedOrganizationId || undefined;
      const promises: Promise<any>[] = [
        dashboardService.getDashboardStats(selectedPeriod, branchIdForApi, token || undefined, orgIdForStats),
        dashboardService.getChartData(selectedPeriod, "orders", branchIdForApi, token || undefined, orgIdForStats),
        dashboardService.getChartData(selectedPeriod, "categories", branchIdForApi, token || undefined, orgIdForStats),
      ];
      if (isAllBranches) promises.push(
        dashboardService.getChartData(selectedPeriod, "branchRevenue", branchIdForApi, token || undefined, orgIdForStats),
        dashboardService.getChartData(selectedPeriod, "branchOrders", branchIdForApi, token || undefined, orgIdForStats)
      );
      const results = await Promise.all(promises);
      setStats(results[0]);
      setOrdersChartData(results[1]);
      setCategoriesChartData(results[2]);
      if (isAllBranches) { setBranchRevenueChartData(results[3]); setBranchOrdersChartData(results[4]); }
      else { setBranchRevenueChartData(null); setBranchOrdersChartData(null); }
    } catch (error) {
      const message = (error as any)?.message;
      const apiMessage = (error as any)?.data?.error || (error as any)?.data?.message;
      const combined = String(apiMessage || message || "");
      
      // Handle offline errors gracefully
      if (combined.includes("No cached data available and offline") || combined.includes("offline")) {
        console.log("Dashboard data not available offline - showing cached data or empty state");
        // Don't show error for offline - just keep existing data or show empty state
        if (!stats) {
          setStats(null);
          setOrdersChartData(null);
          setCategoriesChartData(null);
          setBranchRevenueChartData(null);
          setBranchOrdersChartData(null);
        }
      } else if (!combined.includes("organizationId is required")) {
        console.error("Error fetching dashboard data:", error);
      }
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    if (!isEntitledAdmin) return;
    if (branchLoading) return; // Wait until AsyncStorage has restored the persisted branch
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        // Prevent API calls during logout
        if (ApiService.shouldPreventRequest()) {
          console.log("Skipping branches fetch during logout");
          return;
        }
        if (effectiveUserType === "SUPER_ADMIN" && !selectedOrganizationId) {
          setBranches([]);
          setSelectedBranchId("all");
          setIsSwitchingOrg(false);
          return;
        }
        if (!canViewBranches) {
          const token = (await getToken()) || undefined;
          const apiService = ApiService.getInstance();
          let userBranches: Array<{ id: string; name?: string | null }> = [];
          try { const userResult = await apiService.get("/api/user/branches", token); userBranches = Array.isArray(userResult?.data) ? (userResult.data as Array<{ id: string; name?: string | null }>) : []; } catch (e) { }
          const fallbackBranches = (assignedBranchIds || []).map((id) => { const match = userBranches.find((b) => b.id === id); return match ? { id: match.id, name: match.name } : { id }; });
          setBranches(fallbackBranches);
          if (isBranchScoped) {
            if (!(selectedBranchId && selectedBranchId !== "all" && fallbackBranches.some((b) => b.id === selectedBranchId))) {
              setSelectedBranchId(fallbackBranches[0]?.id || "");
            }
          } else if (!selectedBranchId) {
            setSelectedBranchId("all");
          }
          return;
        }
        const token = (await getToken()) || undefined;
        if (!token) {
          console.log("No token available for admin branches fetch - skipping");
          return;
        }
        const apiService = ApiService.getInstance();
        const result = await apiService.get("/api/admin/branches", token);
        if (result.success && result.data) {
          const nextBranches = Array.isArray(result.data) ? (result.data as Array<{ id: string; name?: string | null }>) : [];
          const filtered = isBranchScoped && assignedBranchIds.length ? nextBranches.filter((b) => assignedBranchIds.includes(b.id)) : nextBranches;
          setBranches(filtered);
          const currentBranchId = selectedBranchId;
          if (isBranchScoped) {
            if (currentBranchId && currentBranchId !== "all" && filtered.some((b) => b.id === currentBranchId)) {
              // keep current selection
            } else {
              setSelectedBranchId(filtered[0]?.id || "");
            }
          } else {
            if (!currentBranchId || (currentBranchId !== "all" && !filtered.some((b) => b.id === currentBranchId))) {
              setSelectedBranchId("all");
            }
            // else keep current valid selection
          }
        }
      } catch (error) { 
      // Handle authentication errors gracefully
      if ((error as any)?.status === 401 || (error as any)?.isAuthError) {
        console.warn("Authentication error loading admin branches - this may be expected during login process");
      } else if ((error as any)?.isWarning || (error as any)?.message?.includes("Organization selection is required")) {
        console.warn("Organization selection required for branches - this is expected for super admins without organization");
      } else {
        console.error("Error loading branches:", error);
      }
    }
      finally {
        setLoadingBranches(false);
        setIsSwitchingOrg(false);
      }
    };
    loadBranches();
  // branchLoading is in deps so the effect re-runs once AsyncStorage read completes
  }, [isEntitledAdmin, branchLoading, getToken, assignedBranchIds, canViewBranches, isBranchScoped, selectedOrganizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) { router.replace("/no-access" as any); return; }
    if (loadingBranches) return;
    // Prevent API calls during logout
    if (ApiService.shouldPreventRequest()) {
      console.log("Skipping dashboard data fetch during logout");
      return;
    }
    // Only fetch dashboard data if we have branches loaded or if user is branch-scoped
    if (branches.length > 0 || isBranchScoped) {
      fetchSettings();
      fetchDashboardData();
    }
  }, [selectedBranchId, branches, isEntitledAdmin, selectedOrganizationId, organizationLoading, isBranchScoped, loadingBranches]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) return;
    fetchOrganization();
  }, [selectedOrganizationId, organizationLoading, isEntitledAdmin]);

  // Separate useEffect for period changes to refresh dashboard data
  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) return;
    // Prevent API calls during logout
    if (ApiService.shouldPreventRequest()) {
      console.log("Skipping dashboard data fetch during logout (period change)");
      return;
    }
    if (branches.length > 0 || isBranchScoped) {
      fetchDashboardData();
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) return;

    // On the very first run, record the org id without resetting anything
    // (the branch was already restored from AsyncStorage by BranchContext).
    if (prevDashboardOrgIdRef.current === undefined) {
      prevDashboardOrgIdRef.current = selectedOrganizationId;
      return;
    }

    // Only reset branch + data when the org id actually changes.
    if (prevDashboardOrgIdRef.current === selectedOrganizationId) return;
    prevDashboardOrgIdRef.current = selectedOrganizationId;

    // Start organization switching
    setIsSwitchingOrg(true);
    
    // Clear all data and reset state
    setSelectedOrganization(null);
    setBranches([]);
    setSelectedBranchId(isBranchScoped ? "" : "all");
    setStats(null); 
    setOrdersChartData(null); 
    setCategoriesChartData(null); 
    setBranchRevenueChartData(null); 
    setBranchOrdersChartData(null);
  }, [selectedOrganizationId, organizationLoading, isEntitledAdmin, isBranchScoped]);

  const onRefresh = () => { setRefreshing(true); fetchDashboardData(); };

  if (!isEntitledAdmin) return null;
  
  // Show organization selection prompt for super admin without organization
  if (effectiveUserType === "SUPER_ADMIN" && !selectedOrganizationId) {
    return (
      <View style={styles.container}>
        <View style={styles.organizationPromptContainer}>
          <MaterialCommunityIcons name="office-building" size={48} color="#9CA3AF" />
          <Text style={styles.organizationPromptTitle}>
            {t("admin.dashboard.selectOrganizationTitle") || "Please Select an Organization"}
          </Text>
          <Text style={styles.organizationPromptText}>
            {t("admin.dashboard.selectOrganizationMessage") || "As a Super Admin, you need to select an organization to view the dashboard."}
          </Text>
        </View>
      </View>
    );
  }
  
  if (loading && !stats) return (
    <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>{t("admin.dashboard.loading")}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec4899" colors={["#ec4899"]} progressBackgroundColor="#f3f4f6" />}>
        <View style={styles.header}>
          {/* Organization Number Info */}
          {selectedOrganization && selectedOrganization.organizationNumber && (
            <View style={styles.statusMessageContainer}>
              <View style={styles.statusMessageContent}>
                <MaterialCommunityIcons name="identifier" size={16} color="#3B82F6" />
                <Text style={styles.statusMessageText}>
                  {t("admin.dashboard.organizationNumber")}: {selectedOrganization.organizationNumber}
                </Text>
              </View>
            </View>
          )}
          <View style={[styles.filtersContainer, IS_TABLET && styles.filtersContainerTablet]}>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>{t("admin.dashboard.branchLabel")}</Text>
              <TouchableOpacity style={[styles.branchFilterButton, selectedBranchId !== "" && styles.branchFilterButtonActive]} onPress={() => {
                if (isOffline) {
                  setShowBranchOfflineDialog(true);
                  return;
                }
                setShowBranchFilterModal(true);
              }} disabled={loadingBranches || (isBranchScoped && branches.length <= 1)}>
                <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                <Text style={styles.branchFilterText} numberOfLines={1}>{selectedBranchId === "all" && !isBranchScoped ? t("admin.dashboard.allBranches") : selectedBranchId ? branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId : t("admin.dashboard.selectBranch")}</Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>{t("admin.dashboard.periodLabel")}</Text>
              <TimePeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
            </View>
          </View>
        </View>

        {/* Status Messages */}
        {(() => {
          const formatDate = (dateString: string | null | undefined) => {
            if (!dateString) return '';
            return new Date(dateString).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          };

          const messages = [];

          // Inactive Branch Message
          if (selectedBranch && !selectedBranch.isActive) {
            messages.push(
              <View key="inactive-branch" style={styles.statusMessageContainer}>
                <View style={styles.statusMessageContent}>
                  <Text style={styles.statusMessageIcon}>{"\u26a0\ufe0f"}</Text>
                  <Text style={styles.statusMessageText}>
                    {t("admin.dashboard.inactiveBranchMessage", {
                      branchName: selectedBranch.name || selectedBranch.id,
                    })}
                  </Text>
                </View>
              </View>
            );
          }

          // Inactive Organization Message
          if (selectedOrganization && !selectedOrganization.isActive) {
            messages.push(
              <View key="inactive-organization" style={styles.statusMessageContainer}>
                <View style={styles.statusMessageContent}>
                  <Text style={styles.statusMessageIcon}>{"\ud83d\udeab"}</Text>
                  <Text style={styles.statusMessageText}>
                    {t("admin.dashboard.inactiveOrganizationMessage", {
                      organizationName: selectedOrganization.name || selectedOrganization.id,
                    })}
                  </Text>
                </View>
              </View>
            );
          }

          // Organization Validation Status Messages
          if (selectedOrganization && selectedOrganization.isActive) {
            const validationStatus = getValidationStatus(selectedOrganization);

            switch (validationStatus.status) {
              case 'valid':
                messages.push(
                  <View key="validation-valid" style={[styles.statusMessageContainer, styles.statusMessageSuccess]}>
                    <View style={styles.statusMessageContent}>
                      <Text style={styles.statusMessageIcon}>{"\u2705"}</Text>
                      <Text style={[styles.statusMessageText, styles.statusMessageTextSuccess]}>
                        {t("admin.dashboard.validationValidMessage", {
                          organizationName: selectedOrganization.name || selectedOrganization.id,
                          validUntil: validationStatus.expiresAt ? formatDate(validationStatus.expiresAt.toISOString()) : 'Unknown',
                        })}
                      </Text>
                    </View>
                  </View>
                );
                break;
              case 'grace_period':
                messages.push(
                  <View key="validation-grace-period" style={[styles.statusMessageContainer, styles.statusMessageWarning]}>
                    <View style={styles.statusMessageContent}>
                      <Text style={styles.statusMessageIcon}>{"\u23f0"}</Text>
                      <Text style={[styles.statusMessageText, styles.statusMessageTextWarning]}>
                        {t("admin.dashboard.validationGracePeriodMessage", {
                          organizationName: selectedOrganization.name || selectedOrganization.id,
                          gracePeriodEnds: (() => {
                            const latestValidation = selectedOrganization.validations && selectedOrganization.validations.length > 0 ? selectedOrganization.validations[0] : null;
                            const gracePeriodEndsAt = latestValidation?.gracePeriodEndsAt || selectedOrganization.gracePeriodEndsAt;
                            return gracePeriodEndsAt ? formatDate(gracePeriodEndsAt) : 'Unknown';
                          })(),
                        })}
                      </Text>
                    </View>
                  </View>
                );
                break;
              case 'expired':
                messages.push(
                  <View key="validation-expired" style={[styles.statusMessageContainer, styles.statusMessageError]}>
                    <View style={styles.statusMessageContent}>
                      <Text style={styles.statusMessageIcon}>{"\u274c"}</Text>
                      <Text style={[styles.statusMessageText, styles.statusMessageTextError]}>
                        {t("admin.dashboard.validationExpiredMessage", {
                          organizationName: selectedOrganization.name || selectedOrganization.id,
                          expiredOn: formatDate(selectedOrganization.validationExpiresAt),
                        })}
                      </Text>
                    </View>
                  </View>
                );
                break;
              case 'unvalidated':
                messages.push(
                  <View key="validation-unvalidated" style={[styles.statusMessageContainer, styles.statusMessageWarning]}>
                    <View style={styles.statusMessageContent}>
                      <Text style={styles.statusMessageIcon}>{"\u26a0\ufe0f"}</Text>
                      <Text style={[styles.statusMessageText, styles.statusMessageTextWarning]}>
                        {t("admin.dashboard.validationUnvalidatedMessage", {
                          organizationName: selectedOrganization.name || selectedOrganization.id,
                        })}
                      </Text>
                    </View>
                  </View>
                );
                break;
              case 'temporarily_invalid':
                messages.push(
                  <View key="validation-temporarily-invalid" style={[styles.statusMessageContainer, styles.statusMessageWarning]}>
                    <View style={styles.statusMessageContent}>
                      <Text style={styles.statusMessageIcon}>{"\u23f8\ufe0f"}</Text>
                      <Text style={[styles.statusMessageText, styles.statusMessageTextWarning]}>
                        {t("admin.dashboard.validationTemporarilyInvalidMessage", {
                          organizationName: selectedOrganization.name || selectedOrganization.id,
                        })}
                      </Text>
                    </View>
                  </View>
                );
                break;
            }
          }

          return messages.length > 0 ? <View style={{ marginBottom: 16 }}>{messages}</View> : null;
        })()}

        <View style={[
          styles.statsGrid, 
          IS_TABLET_CURRENT && styles.statsGridTablet,
          IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsGridLandscape
        ]}>
          <View style={[
            styles.statsCardWrapper, 
            IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsCardWrapperLandscape
          ]}>
            <StatsCard title={t("admin.dashboard.totalUsers")} value={stats?.totalUsers || 0} icon="account-group" iconColor="#3b82f6" />
          </View>
          <View style={[
            styles.statsCardWrapper, 
            IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsCardWrapperLandscape
          ]}>
            <StatsCard title={t("admin.dashboard.menuItems")} value={stats?.totalMenuItems || 0} icon="food" iconColor="#22c55e" />
          </View>
          <View style={[
            styles.statsCardWrapper, 
            IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsCardWrapperLandscape
          ]}>
            <StatsCard title={t("admin.dashboard.orders")} value={stats?.totalOrders || 0} change={stats?.ordersChange} icon="clipboard-list" iconColor="#a855f7" />
          </View>
          <View style={[
            styles.statsCardWrapper, 
            IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsCardWrapperLandscape
          ]}>
            <StatsCard title={t("admin.dashboard.revenue")} value={formatPrice(stats?.totalRevenue || 0)} change={stats?.revenueChange} icon="currency-usd" iconColor="#ec4899" />
          </View>
          <View style={[
            styles.statsCardWrapper, 
            IS_TABLET_CURRENT && IS_LANDSCAPE_CURRENT && styles.statsCardWrapperLandscape
          ]}>
            <StatsCard 
              title={!isBranchScoped && selectedBranchId === "all" 
                ? (t("admin.dashboard.totalBranchClicks") || "Total Branch Clicks")
                : (t("admin.dashboard.branchClicks") || "Branch Clicks")} 
              value={stats?.totalBranchClicks || 0} 
              icon="cursor-default-click" 
              iconColor="#f97316" 
            />
          </View>
        </View>
        <View style={[styles.chartsContainer, IS_TABLET && styles.chartsContainerTablet]}>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleContainer}>
                <MaterialCommunityIcons name="chart-bar" size={20} color="#ec4899" />
                <Text style={styles.chartTitle}>{t("admin.dashboard.ordersRevenueTrend")}</Text>
              </View>
            </View>
            <View style={styles.chartContent}>
              {ordersChartData ? <Chart type="line" data={ordersChartData} height={300} showFullscreenButton onFullscreen={() => setShowFullscreenChart(true)} /> : <View style={styles.emptyChart}><Text style={styles.emptyText}>{t("admin.dashboard.noDataAvailable")}</Text></View>}
            </View>
          </View>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleContainer}>
                <MaterialCommunityIcons name="package-variant" size={20} color="#ec4899" />
                <Text style={styles.chartTitle}>{t("admin.dashboard.popularCategories")}</Text>
              </View>
            </View>
            <View style={styles.chartContent}>
              {categoriesChartData && categoriesChartData.labels?.length > 0 ? <Chart type="doughnut" data={categoriesChartData} height={300} /> : <View style={styles.emptyChart}><MaterialCommunityIcons name="package-variant" size={48} color="#9CA3AF" /><Text style={styles.emptyText}>{t("admin.dashboard.noCategoryData")}</Text></View>}
            </View>
          </View>
        </View>
        {!isBranchAdmin && selectedBranchId === "all" && (
          <View style={styles.chartsContainer}>
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartTitleContainer}>
                  <MaterialCommunityIcons name="chart-bar" size={20} color="#ec4899" />
                  <Text style={styles.chartTitle}>{t("admin.dashboard.branchRevenue")}</Text>
                </View>
              </View>
              <View style={styles.chartContent}>
                {branchRevenueChartData && branchRevenueChartData.labels?.length > 0 && branchRevenueChartData.labels[0] !== "No Data" ? <Chart type="doughnut" data={branchRevenueChartData} height={300} /> : <View style={styles.emptyChart}><MaterialCommunityIcons name="chart-bar" size={48} color="#9CA3AF" /><Text style={styles.emptyText}>{t("admin.dashboard.noBranchRevenueData")}</Text></View>}
              </View>
            </View>
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartTitleContainer}>
                  <MaterialCommunityIcons name="file-document" size={20} color="#ec4899" />
                  <Text style={styles.chartTitle}>{t("admin.dashboard.branchOrders")}</Text>
                </View>
              </View>
              <View style={styles.chartContent}>
                {branchOrdersChartData && branchOrdersChartData.labels?.length > 0 && branchOrdersChartData.labels[0] !== "No Data" ? <Chart type="doughnut" data={branchOrdersChartData} height={300} /> : <View style={styles.emptyChart}><MaterialCommunityIcons name="file-document" size={48} color="#9CA3AF" /><Text style={styles.emptyText}>{t("admin.dashboard.noBranchOrdersData")}</Text></View>}
              </View>
            </View>
          </View>
        )}
        {ordersChartData && <FullscreenChart visible={showFullscreenChart} onClose={() => setShowFullscreenChart(false)} data={ordersChartData} title={t("admin.dashboard.ordersRevenueTrend")} />}
      </ScrollView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast({ ...toast, visible: false })} />
      <RefreshSpinner visible={refreshing} topOffset={insets.top + 80} />
      <Modal visible={showBranchFilterModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowBranchFilterModal(false)}>
        <View style={styles.bottomSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBranchFilterModal(false)} />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.dashboard.selectBranch")}</Text>
              <TouchableOpacity onPress={() => setShowBranchFilterModal(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingBranches ? <View style={{ padding: 20, alignItems: "center" }}><ActivityIndicator size="small" color="#ec4899" /></View> : (
                <>
                  {!isBranchScoped && <TouchableOpacity style={[styles.bottomSheetOption, selectedBranchId === "all" && styles.bottomSheetOptionActive]} onPress={() => { setSelectedBranchId("all"); setShowBranchFilterModal(false); }}>
                    <Text style={[styles.bottomSheetOptionText, selectedBranchId === "all" && styles.bottomSheetOptionTextActive]}>{t("admin.dashboard.allBranches")}</Text>
                    {selectedBranchId === "all" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>}
                  {branches.map((branch) => <TouchableOpacity key={branch.id} style={[styles.bottomSheetOption, selectedBranchId === branch.id && styles.bottomSheetOptionActive]} onPress={() => { setSelectedBranchId(branch.id); setShowBranchFilterModal(false); }}>
                    <Text style={[styles.bottomSheetOptionText, selectedBranchId === branch.id && styles.bottomSheetOptionTextActive]} numberOfLines={1}>{branch.name || branch.id}</Text>
                    {selectedBranchId === branch.id && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>)}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* BRANCH OFFLINE DIALOG */}
      <Modal
        visible={showBranchOfflineDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchOfflineDialog(false)}
      >
        <Pressable
          style={styles.offlineDialogOverlay}
          onPress={() => setShowBranchOfflineDialog(false)}
        >
          <Pressable style={styles.offlineDialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.offlineDialogHandle} />
            <View style={styles.offlineDialogContent}>
              <MaterialCommunityIcons name="wifi-off" size={48} color="#ec4899" />
              <Text style={styles.offlineDialogTitle}>
                {t('admin.pos.branchSwitchOfflineTitle', { defaultValue: 'Branch Switch Not Available Offline' })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t('admin.pos.branchSwitchOfflineMessage', { defaultValue: 'Switching branches requires an internet connection. Please connect to the internet to change branches.' })}
              </Text>
              <TouchableOpacity
                style={styles.offlineDialogButton}
                onPress={() => setShowBranchOfflineDialog(false)}
              >
                <Text style={styles.offlineDialogButtonText}>
                  {t('common.ok', { defaultValue: 'OK' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingTop: 20 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  loadingText: { fontSize: 16, color: "#6b7280" },
  header: { flexDirection: "column", marginBottom: 16, gap: 16 },
  filtersContainer: { flexDirection: "column", gap: 16, width: "100%" },
  filtersContainerTablet: { flexDirection: "row", gap: 24 },
  filterGroup: { flexDirection: "column", gap: 8, width: "100%" },
  filterLabel: { fontSize: 13, fontWeight: "500", color: "#6b7280", marginBottom: 4 },
  branchFilterButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", width: "100%" },
  branchFilterButtonActive: { borderColor: "rgba(236, 72, 153, 0.5)", backgroundColor: "rgba(236, 72, 153, 0.08)" },
  branchFilterText: { flex: 1, fontSize: 14, color: "#374151", fontWeight: "500" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  statsGridTablet: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statsGridLandscape: { gap: 12 },
  statsCardWrapper: { width: "48%", flex: 1, minWidth: 140 },
  statsCardWrapperTablet: { width: "48%", flex: 1, minWidth: 200 },
  statsCardWrapperLandscape: { width: "23%", flex: 1, minWidth: 180 },
  chartsContainer: { flexDirection: "column", gap: 16 },
  chartsContainerTablet: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  chartCard: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden", width: "100%" },
  chartCardTablet: { width: "48%", flex: 1, minWidth: 300 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  chartTitleContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  chartTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  chartContent: { padding: 12 },
  emptyChart: { height: 250, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  bottomSheetOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end", marginTop: "auto" },
  bottomSheetContent: { backgroundColor: "#ffffff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: "80%", borderWidth: 1, borderColor: "#e5e7eb", borderBottomWidth: 0, alignSelf: "stretch" },
  bottomSheetHandle: { width: 40, height: 4, backgroundColor: "#d1d5db", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8 },
  bottomSheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  closeButton: { padding: 4 },
  bottomSheetBody: { padding: 8, maxHeight: 400 },
  bottomSheetOption: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 8, marginVertical: 4 },
  bottomSheetOptionActive: { backgroundColor: "rgba(236, 72, 153, 0.08)", borderWidth: 1, borderColor: "rgba(236, 72, 153, 0.35)" },
  bottomSheetOptionText: { fontSize: 15, color: "#374151", flex: 1, paddingRight: 10 },
  bottomSheetOptionTextActive: { color: "#111827", fontWeight: "600" },
  // Status Messages
  statusMessageContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  statusMessageSuccess: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  statusMessageWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  statusMessageError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  statusMessageContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusMessageIcon: {
    fontSize: 16,
  },
  statusMessageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 20,
  },
  statusMessageTextSuccess: {
    color: "#22c55e",
  },
  statusMessageTextWarning: {
    color: "#f59e0b",
  },
  statusMessageTextError: {
    color: "#ef4444",
  },
  // Organization Prompt
  organizationPromptContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  organizationPromptTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  organizationPromptText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 400,
  },
  // Offline dialog styles
  offlineDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  offlineDialogContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    maxWidth: 400,
  },
  offlineDialogHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  offlineDialogContent: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  offlineDialogTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  offlineDialogMessage: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  offlineDialogButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    width: '100%',
  },
  offlineDialogButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
