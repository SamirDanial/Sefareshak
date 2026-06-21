import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import branchService, {
  type Branch,
  type CustomerServiceMode,
  type ServiceType,
} from "@/src/services/branchService";
import { reservationService } from "@/src/services/reservationService";
import { useCartStore } from "@/src/store/cartStore";
import * as Location from "expo-location";

export type BranchSummary = {
  id: string;
  name?: string | null;
  distanceKm?: number | null;
};

export type BranchAvailability =
  | { available: true; branch: BranchSummary }
  | { available: false; message?: string };

export type CustomerScopeLocation = {
  latitude: number;
  longitude: number;
  label?: string | null;
};

type BranchContextValue = {
  branch: BranchSummary | null;
  availability: BranchAvailability | null;
  branches: Branch[];
  visibleBranches: Branch[];
  loadingBranches: boolean;
  setBranch: (branch: BranchSummary | null) => void;
  setAvailability: (availability: BranchAvailability | null) => void;
  clearBranch: () => void;
  refreshBranches: () => Promise<void>;
  selectNearestBranchByLocation: () => Promise<void>;
  clearReservationLock: () => Promise<void>;
  setForcedBranchId: (branchId: string | null) => void;

  customerServiceType: ServiceType | null;
  customerServiceMode: CustomerServiceMode;
  customerRadiusKm: number;
  customerLocation: CustomerScopeLocation | null;
  setCustomerServiceType: (serviceType: ServiceType | null) => void;
  setCustomerServiceMode: (mode: CustomerServiceMode) => void;
  setCustomerRadiusKm: (radiusKm: number) => void;
  setCustomerLocation: (location: CustomerScopeLocation | null) => void;
  customerBranchSearchQuery: string | null;
  setCustomerBranchSearchQuery: (query: string | null) => void;
  customerOrganizationSlug: string | null;
  setCustomerOrganizationSlug: (slug: string | null) => void;
};

const STORAGE_KEY = "bellami:selectedBranch";
const CUSTOMER_SCOPE_KEY = "bellami:customerScope";
const CUSTOMER_ORG_SCOPE_KEY = "bellami:customerOrgScope";
const SELECTED_ORG_ID_KEY = "bellami:selectedOrganizationId";

type StoredCustomerScope = {
  serviceType: ServiceType | null;
  serviceMode?: CustomerServiceMode;
  radiusKm?: number;
  location: CustomerScopeLocation | null;
  branchQuery?: string | null;
};

const normalizeServiceType = (raw: any): ServiceType => {
  const val = String(raw || "").trim().toUpperCase();
  if (val === "MEAT_SHOP" || val === "MEATSHOP" || val === "MEAT SHOP" || val === "MEAT-SHOP") {
    return "MEAT_SHOP";
  }
  if (val === "BAKERY") return "BAKERY";
  if (val === "FOOD_TRUCK" || val === "FOODTRUCK" || val === "FOOD TRUCK" || val === "FOOD-TRUCK") {
    return "FOOD_TRUCK";
  }
  return "RESTAURANT";
};

const normalizeServiceMode = (raw: any): CustomerServiceMode => {
  if (raw === "PICKUP" || raw === "RESERVATION") return raw;
  return "DELIVERY";
};

const parsePositiveNumber = (val: any, fallback: number): number => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

async function readInitialCustomerScope(): Promise<StoredCustomerScope> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_SCOPE_KEY);
    if (!raw) {
      return { serviceType: "RESTAURANT", serviceMode: "DELIVERY", radiusKm: 20, location: null, branchQuery: null };
    }
    const parsed = JSON.parse(raw) as StoredCustomerScope;
    const serviceType = normalizeServiceType((parsed as any)?.serviceType);
    const serviceMode = normalizeServiceMode((parsed as any)?.serviceMode);
    const radiusKm = parsePositiveNumber((parsed as any)?.radiusKm, 20);
    const lat = Number((parsed as any)?.location?.latitude);
    const lon = Number((parsed as any)?.location?.longitude);
    const location =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? {
            latitude: lat,
            longitude: lon,
            label:
              typeof (parsed as any)?.location?.label === "string"
                ? (parsed as any).location.label
                : null,
          }
        : null;
    const branchQueryRaw = (parsed as any)?.branchQuery;
    const branchQuery = typeof branchQueryRaw === "string" ? branchQueryRaw.trim() : null;

    // Migrate old radius values (5 or 10) to 20
    const migratedRadiusKm = (radiusKm === 5 || radiusKm === 10) ? 20 : radiusKm;

    // If migration was needed, update AsyncStorage
    if (migratedRadiusKm !== radiusKm) {
      const migratedScope: StoredCustomerScope = {
        serviceType,
        serviceMode,
        radiusKm: migratedRadiusKm,
        location,
        branchQuery,
      };
      AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(migratedScope));
      return migratedScope;
    }

    return { serviceType, serviceMode, radiusKm, location, branchQuery };
  } catch {
    return { serviceType: "RESTAURANT", serviceMode: "DELIVERY", radiusKm: 20, location: null, branchQuery: null };
  }
}

async function readInitialCustomerOrgSlug(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_ORG_SCOPE_KEY);
    const trimmed = raw ? String(raw).trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branch, setBranchState] = useState<BranchSummary | null>(null);
  const [availability, setAvailabilityState] =
    useState<BranchAvailability | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [forcedBranchId, setForcedBranchId] = useState<string | null>(null);

  const [customerServiceType, setCustomerServiceTypeState] = useState<ServiceType | null>(
    "RESTAURANT"
  );
  const [customerServiceMode, setCustomerServiceModeState] = useState<CustomerServiceMode>(
    "DELIVERY"
  );
  const [customerRadiusKm, setCustomerRadiusKmState] = useState<number>(20);
  const [customerLocation, setCustomerLocationState] = useState<CustomerScopeLocation | null>(
    null
  );
  const [customerOrganizationSlug, setCustomerOrganizationSlugState] = useState<string | null>(
    null
  );
  const [customerBranchSearchQuery, setCustomerBranchSearchQueryState] = useState<string | null>(null);

  const hasLoadedCustomerScopeRef = useRef(false);
  const clearCart = useCartStore((state) => state.clearCart);
  const previousBranchIdRef = useRef<string | null>(null);
  const isInitialMountRef = useRef<boolean>(true);

  useEffect(() => {
    const load = async () => {
      const [scope, slug] = await Promise.all([
        readInitialCustomerScope(),
        readInitialCustomerOrgSlug(),
      ]);
      setCustomerServiceTypeState(scope.serviceType || "RESTAURANT");
      setCustomerServiceModeState(scope.serviceMode || "DELIVERY");
      setCustomerRadiusKmState(parsePositiveNumber(scope.radiusKm, 20));
      setCustomerLocationState(scope.location);
      setCustomerBranchSearchQueryState(scope.branchQuery ?? null);
      setCustomerOrganizationSlugState(slug);
      hasLoadedCustomerScopeRef.current = true;
    };
    void load();
  }, []);

  // Fetch all branches (internal version that returns branches)
  const refreshBranchesInternal = useCallback(async (): Promise<Branch[]> => {
    try {
      setLoadingBranches(true);
      const orgScoped = Boolean(customerOrganizationSlug);
      const hasLocation = Boolean(customerLocation);
      const shouldDefaultToDeliverableDirectory = !orgScoped && hasLocation;
      const shouldApplyRadius =
        !orgScoped &&
        hasLocation &&
        (customerServiceMode === "PICKUP" || customerServiceMode === "RESERVATION");
      const allBranches = await branchService.getBranches(undefined, {
        serviceType: orgScoped ? null : customerServiceType,
        // Default customer directory: when location is set, show branches that can DELIVER to that location.
        // This keeps initial browsing relevant (deliverable branches first).
        // For PICKUP/RESERVATION we apply radius filtering around the user's location.
        serviceMode: shouldApplyRadius
          ? customerServiceMode
          : shouldDefaultToDeliverableDirectory
            ? "DELIVERY"
            : null,
        radiusKm: shouldApplyRadius ? customerRadiusKm : null,
        latitude: hasLocation ? (customerLocation?.latitude ?? null) : null,
        longitude: hasLocation ? (customerLocation?.longitude ?? null) : null,
        query: orgScoped ? null : customerBranchSearchQuery,
        organizationSlug: customerOrganizationSlug,
      });
      // Filter only active branches
      let activeBranches = allBranches.filter((b) => b.isActive !== false);

      setBranches(activeBranches);

      // Do NOT auto-clear the selected branch in background refreshes if it's out of range/filtered out.
      // Doing so silently resets the branch to null for users who selected a favorite or browsed out-of-range branches.
      /*
      if (branch?.id && !activeBranches.some((b) => b.id === branch.id)) {
        setBranchState(null);
        setAvailabilityState(null);
        previousBranchIdRef.current = null;
        try {
          await AsyncStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      */

      return activeBranches;
    } catch (err) {
      console.error("BranchContext: failed to fetch branches", err);
      return [];
    } finally {
      setLoadingBranches(false);
    }
  }, [
    branch?.id,
    customerBranchSearchQuery,
    customerLocation,
    customerOrganizationSlug,
    customerServiceMode,
    customerRadiusKm,
    customerServiceType,
  ]);

  // Fetch all branches (public API)
  const refreshBranches = useCallback(async () => {
    await refreshBranchesInternal();
  }, [refreshBranchesInternal]);

  // Refresh branches when customer scope changes.
  useEffect(() => {
    if (!hasLoadedCustomerScopeRef.current) return;
    void refreshBranches();
  }, [
    customerServiceType,
    customerLocation,
    customerServiceMode,
    customerRadiusKm,
    customerBranchSearchQuery,
    customerOrganizationSlug,
    refreshBranches,
  ]);

  // Get user's current location (same as book reservation page)
  const getUserLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        return null;
      }

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return null;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error: any) {
      return null;
    }
  };

  // Find nearest branch (same as book reservation page)
  const findNearestBranch = (
    branches: Branch[],
    userLat: number,
    userLon: number
  ): { branch: Branch; distance: number } | null => {
    const branchesWithDistance: Array<{ branch: Branch; distance: number }> = [];

    // Calculate distance for each branch
    for (const branch of branches) {
      if (!branch.latitude || !branch.longitude) continue;

      const distance = calculateDistance(
        userLat,
        userLon,
        branch.latitude,
        branch.longitude
      );
      branchesWithDistance.push({ branch, distance });
    }

    if (branchesWithDistance.length === 0) {
      return null;
    }

    // Sort by distance and return the nearest branch
    branchesWithDistance.sort((a, b) => a.distance - b.distance);
    return branchesWithDistance[0];
  };

  // Select nearest branch by device location (called from home page)
  const selectNearestBranchByLocation = useCallback(async () => {
    try {
      // Skip if branch is already set
      if (branch) {
        return;
      }

      // Skip if branches are not loaded yet
      if (branches.length === 0 || loadingBranches) {
        return;
      }

      // Check if there's a persisted branch - if yes, don't override
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        return; // Branch already persisted, don't override
      }

      // Get device location
      const location = await getUserLocation();
      if (!location) {
        return; // Could not get location
      }
      // Find nearest branch
      const nearest = findNearestBranch(
        branches,
        location.latitude,
        location.longitude
      );

      if (nearest) {
        const branchSummary: BranchSummary = {
          id: nearest.branch.id,
          name: nearest.branch.name || null,
          distanceKm: nearest.distance,
        };
        setBranchState(branchSummary);
        setAvailabilityState({ available: true, branch: branchSummary });
        previousBranchIdRef.current = nearest.branch.id;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(branchSummary));
      } else {
      }
    } catch (error: any) {
      console.warn("BranchContext: failed to select nearest branch by location", error);
    }
  }, [branch, branches, loadingBranches]);

  // Track if we've initialized to prevent re-running
  const hasInitializedRef = useRef(false);

  // Initialize branch selection (exact same pattern as book reservation page)
  useEffect(() => {
    const initializeBranch = async () => {
      try {
        // Check if we should skip auto-selection (from Favorites page)
        const skipAutoSelect = await AsyncStorage.getItem("skipAutoBranchSelect");
        if (skipAutoSelect === "true") {
          hasInitializedRef.current = true;
          // Still fetch branches for context
          await refreshBranchesInternal();
          return; // Skip auto-selection
        }

        // First, check for persisted branch
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as BranchSummary;
          if (parsed?.id) {
            setBranchState(parsed);
            setAvailabilityState({ available: true, branch: parsed });
            previousBranchIdRef.current = parsed.id;
            hasInitializedRef.current = true;
            // Still fetch branches for context
            const active = await refreshBranchesInternal();
            try {
              const selected = active.find((b) => b.id === parsed.id);
              const orgIdRaw = (selected as any)?.organizationId;
              const orgId = typeof orgIdRaw === "string" ? orgIdRaw.trim() : "";
              if (orgId) {
                await AsyncStorage.setItem(SELECTED_ORG_ID_KEY, orgId);
              }
            } catch {}
            return; // Branch already persisted, no need to find nearest
          }
        }

        setLoadingBranches(true);
        const orgScoped = Boolean(customerOrganizationSlug);
        const hasLocation = Boolean(customerLocation);
        const shouldDefaultToDeliverableDirectory = !orgScoped && hasLocation;
        const shouldApplyRadius =
          !orgScoped &&
          hasLocation &&
          (customerServiceMode === "PICKUP" || customerServiceMode === "RESERVATION");
        const allBranches = await branchService.getBranches(undefined, {
          serviceType: orgScoped ? null : customerServiceType,
          // Default customer directory: when location is set, show branches that can DELIVER to that location.
          // This keeps initial browsing relevant (deliverable branches first).
          // For PICKUP/RESERVATION we apply radius filtering around the user's location.
          serviceMode: shouldApplyRadius
            ? customerServiceMode
            : shouldDefaultToDeliverableDirectory
              ? "DELIVERY"
              : null,
          radiusKm: shouldApplyRadius ? customerRadiusKm : null,
          latitude: hasLocation ? (customerLocation?.latitude ?? null) : null,
          longitude: hasLocation ? (customerLocation?.longitude ?? null) : null,
          organizationSlug: customerOrganizationSlug,
        });
        // Filter only active branches
        let activeBranches = allBranches.filter((b) => b.isActive !== false);

        setBranches(activeBranches);
        setLoadingBranches(false);

        if (!activeBranches || activeBranches.length === 0) {
          hasInitializedRef.current = true;
          return;
        }

        // If only one branch, auto-select it
        if (activeBranches.length === 1) {
          const singleBranch = activeBranches[0];
          const branchSummary: BranchSummary = {
            id: singleBranch.id,
            name: singleBranch.name || null,
            distanceKm: null,
          };
          setBranchState(branchSummary);
          setAvailabilityState({ available: true, branch: branchSummary });
          previousBranchIdRef.current = singleBranch.id;
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(branchSummary));
          hasInitializedRef.current = true;
        } else if (activeBranches.length > 1) {
          // Try to get user location and suggest nearest branch (same as book reservation page)
          try {
            const location = await getUserLocation();
            if (location) {
              const nearest = findNearestBranch(
                activeBranches,
                location.latitude,
                location.longitude
              );
              
              if (nearest) {
                const branchSummary: BranchSummary = {
                  id: nearest.branch.id,
                  name: nearest.branch.name || null,
                  distanceKm: nearest.distance,
                };
                setBranchState(branchSummary);
                setAvailabilityState({ available: true, branch: branchSummary });
                previousBranchIdRef.current = nearest.branch.id;
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(branchSummary));
              } else {
              }
            } else {
            }
          } catch (error: any) {
            // Silently fail - user location is optional
            console.warn("BranchContext: failed to get location for nearest branch", error);
          } finally {
            hasInitializedRef.current = true;
          }
        }
      } catch (err) {
        console.warn("BranchContext: failed to initialize branch", err);
        setLoadingBranches(false);
        hasInitializedRef.current = true;
      }
    };

    if (!hasInitializedRef.current) {
      initializeBranch();
    }
  }, [customerLocation, customerOrganizationSlug, customerServiceType, refreshBranchesInternal]);

  const setCustomerBranchSearchQuery = useCallback((query: string | null) => {
    const next = query && String(query).trim().length > 0 ? String(query).trim() : null;
    setCustomerBranchSearchQueryState(next);
    try {
      AsyncStorage.getItem(CUSTOMER_SCOPE_KEY).then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as StoredCustomerScope) : ({} as StoredCustomerScope);
        const nextStored: StoredCustomerScope = {
          serviceType: (parsed as any)?.serviceType ?? null,
          serviceMode: normalizeServiceMode((parsed as any)?.serviceMode),
          radiusKm: parsePositiveNumber((parsed as any)?.radiusKm, 20),
          location: (parsed as any)?.location ?? null,
          branchQuery: next,
        };
        AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(nextStored));
      });
    } catch {
      // ignore
    }
  }, []);

  const setCustomerOrganizationSlug = useCallback((slug: string | null) => {
    const next = slug && String(slug).trim().length > 0 ? String(slug).trim() : null;
    setCustomerOrganizationSlugState(next);
    try {
      if (next) AsyncStorage.setItem(CUSTOMER_ORG_SCOPE_KEY, next);
      else AsyncStorage.removeItem(CUSTOMER_ORG_SCOPE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const setCustomerServiceType = useCallback((serviceType: ServiceType | null) => {
    const next = serviceType || "RESTAURANT";
    setCustomerServiceTypeState(next);
    try {
      AsyncStorage.getItem(CUSTOMER_SCOPE_KEY).then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as StoredCustomerScope) : ({} as StoredCustomerScope);
        const nextStored: StoredCustomerScope = {
          serviceType: next,
          serviceMode: normalizeServiceMode((parsed as any)?.serviceMode),
          radiusKm: parsePositiveNumber((parsed as any)?.radiusKm, 20),
          location: (parsed as any)?.location ?? null,
          branchQuery: (parsed as any)?.branchQuery ?? null,
        };
        AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(nextStored));
      });
    } catch {
      // ignore
    }
  }, []);

  const setCustomerServiceMode = useCallback((mode: CustomerServiceMode) => {
    const next = normalizeServiceMode(mode);
    setCustomerServiceModeState(next);
    try {
      AsyncStorage.getItem(CUSTOMER_SCOPE_KEY).then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as StoredCustomerScope) : ({} as StoredCustomerScope);
        const nextStored: StoredCustomerScope = {
          serviceType: (parsed as any)?.serviceType ?? null,
          serviceMode: next,
          radiusKm: parsePositiveNumber((parsed as any)?.radiusKm, 20),
          location: (parsed as any)?.location ?? null,
          branchQuery: (parsed as any)?.branchQuery ?? null,
        };
        AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(nextStored));
      });
    } catch {
      // ignore
    }
  }, []);

  const setCustomerRadiusKm = useCallback((radiusKm: number) => {
    const next = parsePositiveNumber(radiusKm, 20);
    setCustomerRadiusKmState(next);
    try {
      AsyncStorage.getItem(CUSTOMER_SCOPE_KEY).then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as StoredCustomerScope) : ({} as StoredCustomerScope);
        const nextStored: StoredCustomerScope = {
          serviceType: (parsed as any)?.serviceType ?? null,
          serviceMode: normalizeServiceMode((parsed as any)?.serviceMode),
          radiusKm: next,
          location: (parsed as any)?.location ?? null,
          branchQuery: (parsed as any)?.branchQuery ?? null,
        };
        AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(nextStored));
      });
    } catch {
      // ignore
    }
  }, []);

  const setCustomerLocation = useCallback((location: CustomerScopeLocation | null) => {
    setCustomerLocationState(location);
    try {
      AsyncStorage.getItem(CUSTOMER_SCOPE_KEY).then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as StoredCustomerScope) : ({} as StoredCustomerScope);
        const nextStored: StoredCustomerScope = {
          serviceType: (parsed as any)?.serviceType ?? null,
          serviceMode: normalizeServiceMode((parsed as any)?.serviceMode),
          radiusKm: parsePositiveNumber((parsed as any)?.radiusKm, 20),
          location,
          branchQuery: (parsed as any)?.branchQuery ?? null,
        };
        AsyncStorage.setItem(CUSTOMER_SCOPE_KEY, JSON.stringify(nextStored));
      });
    } catch {
      // ignore
    }
  }, []);

  // Check if we're in modification mode or pre-order lock and lock branch accordingly
  useEffect(() => {
    const checkBranchLock = async () => {
      try {
        const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
        const modifyingBranchId = await AsyncStorage.getItem("modifyingReservationBranchId");
        const modifyingOrderBranchId = await AsyncStorage.getItem("modifyingOrderBranchId");
        const preOrderBranchLock = await AsyncStorage.getItem("preOrderBranchLock");
        
        // Priority: modification mode > pre-order lock
        const lockedBranchId = modifyingBranchId || modifyingOrderBranchId || preOrderBranchLock;
        
        // If locked, ensure branch is set to locked branch
        if (lockedBranchId) {
          let availableBranches = branches;
          if (!availableBranches || availableBranches.length === 0) {
            availableBranches = await refreshBranchesInternal();
          }

          // Find the branch in the branches list
          const lockedBranch = availableBranches.find((b) => b.id === lockedBranchId);
          if (lockedBranch && (!branch || branch.id !== lockedBranchId)) {
            const lockedSummary: BranchSummary = {
              id: lockedBranch.id,
              name: lockedBranch.name || null,
              distanceKm: null,
            };
            setBranchState(lockedSummary);
            setAvailabilityState({ available: true, branch: lockedSummary });
            previousBranchIdRef.current = lockedBranch.id;
          }
        }
      } catch (err) {
        console.error("BranchContext: error checking branch lock", err);
      }
    };
    
    checkBranchLock();
    
    // Check periodically in case of changes
    const interval = setInterval(checkBranchLock, 500);
    
    return () => {
      clearInterval(interval);
    };
  }, [branches, branch, refreshBranchesInternal]);

  // Clear cart when branch changes (but not on initial load or page refresh)
  useEffect(() => {
    const currentBranchId = branch?.id ?? null;
    const previousBranchId = previousBranchIdRef.current;

    // Skip clearing on initial mount/page refresh
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // Update the ref to track the initial branch
      if (currentBranchId !== null) {
        previousBranchIdRef.current = currentBranchId;
      }
      return;
    }

    // Only clear cart if branch actually changed (both exist and are different)
    if (
      previousBranchId !== null &&
      currentBranchId !== null &&
      currentBranchId !== previousBranchId
    ) {
      clearCart();
    }

    // Update the ref for next comparison
    if (currentBranchId !== null) {
      previousBranchIdRef.current = currentBranchId;
    }
  }, [branch?.id, clearCart]);

  const setBranch = useCallback(async (next: BranchSummary | null) => {
    // Check if we should skip auto-selection (from Favorites page)
    const skipAutoSelect = await AsyncStorage.getItem("skipAutoBranchSelect");
    if (skipAutoSelect === "true") {
      // Allow the branch to be set without checking locks
      // But DO persist it when coming from favorites to ensure it sticks
      setBranchState(next);
      setAvailabilityState(next ? { available: true, branch: next } : null);
      if (next?.id) {
        previousBranchIdRef.current = next.id;
        // Persist the branch when coming from favorites
        try {
          await AsyncStorage.setItem("bellami:selectedBranch", JSON.stringify({
            id: next.id,
            name: next.name,
            distanceKm: null
          }));
        } catch (e) {
          console.error("[BranchContext] Failed to persist branch:", e);
        }
      }
      // Clear the flag after first use to allow normal branch switching
      try {
        await AsyncStorage.removeItem("skipAutoBranchSelect");
      } catch (e) {
        console.error("[BranchContext] Failed to clear skipAutoBranchSelect flag:", e);
      }
      return;
    }

    // Prevent branch changes when in modification mode or pre-order lock
    try {
      const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
      const modifyingBranchId = await AsyncStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderBranchId = await AsyncStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = await AsyncStorage.getItem("preOrderBranchLock");
      
      // Priority: modification mode > pre-order lock
      const lockedBranchId = modifyingBranchId || modifyingOrderBranchId || preOrderBranchLock;
      
      if (lockedBranchId) {
        // If trying to change branch during lock, ignore the change
        if (next && next.id !== lockedBranchId) {
          console.warn("BranchContext: Cannot change branch - locked for reservation");
          return;
        }
        // Only allow setting the locked branch
        if (next && next.id === lockedBranchId) {
          setBranchState(next);
          setAvailabilityState(
            next
              ? { available: true, branch: next }
              : null
          );
          return; // Don't persist to AsyncStorage during lock
        }
      }
    } catch (err) {
      console.error("BranchContext: error checking branch lock", err);
    }

    // Normal flow: Allow branch changes
    try {
      if (next?.id) {
        const selected = branches.find((b) => b.id === next.id);
        const orgIdRaw = (selected as any)?.organizationId;
        const orgId = typeof orgIdRaw === "string" ? orgIdRaw.trim() : "";
        if (orgId) {
          await AsyncStorage.setItem(SELECTED_ORG_ID_KEY, orgId);
        }
      }
    } catch {
      // ignore
    }

    setBranchState(next);
    setAvailabilityState(next ? { available: true, branch: next } : null);

    try {
      if (next) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn("BranchContext: failed to persist branch", err);
    }
  }, [branches]);

  const setAvailability = useCallback((next: BranchAvailability | null) => {
    setAvailabilityState(next);
    if (next?.available) {
      setBranch(next.branch);
    }
  }, [setBranch]);

  const clearReservationLock = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        "modifyingReservationId",
        "modifyingReservationBranchId",
        "modifyingOrderId",
        "modifyingOrderBranchId",
        "preOrderBranchLock",
        "pendingReservation",
        "fromCheckout",
      ]);
    } catch (err) {
      console.warn("BranchContext: failed to clear reservation lock", err);
    }
  }, []);

  const clearBranch = useCallback(() => {
    setBranch(null);
    setAvailabilityState(null);
  }, [setBranch]);

  const visibleBranches = useMemo(() => {
    const list = [...branches];

    const userLat = customerLocation?.latitude;
    const userLon = customerLocation?.longitude;
    const hasUserLocation = Number.isFinite(userLat) && Number.isFinite(userLon);

    const getDistanceKm = (b: Branch) => {
      const fromApi = Number((b as any)?.distanceKm);
      if (Number.isFinite(fromApi)) return fromApi;
      if (!hasUserLocation) return Number.POSITIVE_INFINITY;
      const lat = Number((b as any)?.latitude);
      const lon = Number((b as any)?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Number.POSITIVE_INFINITY;
      return calculateDistance(userLat as number, userLon as number, lat, lon);
    };

    list.sort((a, b) => getDistanceKm(a) - getDistanceKm(b));

    // Filter by radius if we have location and radius set
    let filteredList = list;
    if (hasUserLocation && customerRadiusKm > 0) {
      filteredList = list.filter((b) => {
        // Always include forced branch regardless of radius
        if (forcedBranchId && b.id === forcedBranchId) {
          return true;
        }
        return getDistanceKm(b) <= customerRadiusKm;
      });
    }

    // Move selected branch to top
    if (branch?.id) {
      const idx = filteredList.findIndex((b) => b.id === branch.id);
      if (idx > 0) {
        const [selected] = filteredList.splice(idx, 1);
        filteredList.unshift(selected);
      }
    }

    return filteredList;
  }, [branch?.id, branches, customerLocation?.latitude, customerLocation?.longitude, customerRadiusKm, forcedBranchId]);

  const value = useMemo<BranchContextValue>(
    () => ({
      branch,
      availability,
      branches,
      visibleBranches,
      loadingBranches,
      setBranch,
      setAvailability,
      clearBranch,
      refreshBranches,
      selectNearestBranchByLocation,
      clearReservationLock,
      setForcedBranchId,

      customerServiceType,
      customerServiceMode,
      customerRadiusKm,
      customerLocation,
      setCustomerServiceType,
      setCustomerServiceMode,
      setCustomerRadiusKm,
      setCustomerLocation,
      customerBranchSearchQuery,
      setCustomerBranchSearchQuery,
      customerOrganizationSlug,
      setCustomerOrganizationSlug,
    }),
    [
      branch,
      availability,
      branches,
      visibleBranches,
      loadingBranches,
      setBranch,
      setAvailability,
      clearBranch,
      refreshBranches,
      selectNearestBranchByLocation,
      clearReservationLock,
      setForcedBranchId,
      customerServiceType,
      customerServiceMode,
      customerRadiusKm,
      customerLocation,
      setCustomerServiceType,
      setCustomerServiceMode,
      setCustomerRadiusKm,
      setCustomerLocation,
      customerBranchSearchQuery,
      setCustomerBranchSearchQuery,
      customerOrganizationSlug,
      setCustomerOrganizationSlug,
    ]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return ctx;
}

