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
import branchService, { type Branch, type ServiceType } from "@/services/branchService";
import { useCartStore } from "@/store/cartStore";
import { calculateDistance } from "@/utils/distanceCalculator";

export type BranchSummary = {
  id: string;
  name?: string | null;
  distanceKm?: number | null;
};

export type BranchSelectionSource = "AUTO_DEFAULT" | "AUTO_NEAREST" | "MANUAL";

export type CustomerServiceMode = "DELIVERY" | "PICKUP" | "RESERVATION";

export type BranchAvailability =
  | { available: true; branch: BranchSummary }
  | { available: false; message?: string };

type BranchContextValue = {
  branch: BranchSummary | null;
  branchSelectionSource: BranchSelectionSource;
  availability: BranchAvailability | null;
  branches: Branch[];
  visibleBranches: Branch[];
  loadingBranches: boolean;
  setBranch: (branch: BranchSummary | null, source?: BranchSelectionSource) => void;
  setAvailability: (availability: BranchAvailability | null) => void;
  clearBranch: () => void;
  refreshBranches: (overrideFilters?: {
    query?: string | null;
    serviceType?: ServiceType | null;
    serviceMode?: CustomerServiceMode | null;
    location?: { latitude: number; longitude: number; label?: string | null } | null;
    radiusKm?: number | null;
  }) => Promise<void>;
  clearReservationLock: () => void;
  customerServiceType: ServiceType | null;
  customerServiceMode: CustomerServiceMode;
  customerRadiusKm: number;
  customerLocation: { latitude: number; longitude: number; label?: string | null } | null;
  setCustomerServiceType: (serviceType: ServiceType | null) => void;
  setCustomerServiceMode: (mode: CustomerServiceMode) => void;
  setCustomerRadiusKm: (radiusKm: number) => void;
  setCustomerLocation: (location: { latitude: number; longitude: number; label?: string | null } | null) => void;
  customerBranchSearchQuery: string | null;
  setCustomerBranchSearchQuery: (query: string | null) => void;
  customerOrganizationSlug: string | null;
  setCustomerOrganizationSlug: (slug: string | null) => void;
};

const STORAGE_KEY = "bellami:selectedBranch";
const CUSTOMER_SCOPE_KEY = "bellami:customerScope";
const CUSTOMER_ORG_SCOPE_KEY = "bellami:customerOrgScope";

function getInitialCustomerOrganizationSlug(): string | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_ORG_SCOPE_KEY);
    const trimmed = raw ? String(raw).trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

type StoredCustomerScope = {
  serviceType: ServiceType | null;
  serviceMode?: CustomerServiceMode;
  radiusKm?: number;
  location: { latitude: number; longitude: number; label?: string | null } | null;
  branchQuery?: string | null;
};

function getInitialCustomerScope(): StoredCustomerScope {
  return { serviceType: "RESTAURANT", location: null, serviceMode: "DELIVERY", radiusKm: 20 };
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

// Helper to load branch selection from localStorage synchronously during initialization
function getInitialSelection(): { branch: BranchSummary | null; source: BranchSelectionSource } {
  return { branch: null, source: "AUTO_DEFAULT" };
}

export function BranchProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage SYNCHRONOUSLY to prevent race conditions
  const initialSelection = getInitialSelection();
  const initialCustomerScope = getInitialCustomerScope();
  const [branch, setBranchState] = useState<BranchSummary | null>(() => initialSelection.branch);
  const [branchSelectionSource, setBranchSelectionSource] = useState<BranchSelectionSource>(
    () => initialSelection.source
  );
  const [availability, setAvailabilityState] =
    useState<BranchAvailability | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerServiceType, setCustomerServiceTypeState] = useState<ServiceType | null>(() => {
    return initialCustomerScope.serviceType || "RESTAURANT";
  });
  const [customerServiceMode, setCustomerServiceModeState] = useState<CustomerServiceMode>(() => {
    return initialCustomerScope.serviceMode || "DELIVERY";
  });
  const [customerRadiusKm, setCustomerRadiusKmState] = useState<number>(() => {
    const raw = Number((initialCustomerScope as any)?.radiusKm);
    return !isNaN(raw) && raw > 0 ? raw : 20;
  });
  const [customerLocation, setCustomerLocationState] = useState<
    { latitude: number; longitude: number; label?: string | null } | null
  >(() => initialCustomerScope.location);
  const [customerBranchSearchQuery, setCustomerBranchSearchQueryState] = useState<string | null>(() => {
    const raw = (initialCustomerScope as any)?.branchQuery;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  });
  const [customerOrganizationSlug, setCustomerOrganizationSlugState] = useState<string | null>(() => {
    return getInitialCustomerOrganizationSlug();
  });

  const setCustomerBranchSearchQuery = useCallback((query: string | null) => {
    const next = query && String(query).trim().length > 0 ? String(query).trim() : null;
    setCustomerBranchSearchQueryState(next);
  }, []);

  const setCustomerOrganizationSlug = useCallback((slug: string | null) => {
    const next = slug && String(slug).trim().length > 0 ? String(slug).trim() : null;
    setCustomerOrganizationSlugState(next);
    try {
      if (next) localStorage.setItem(CUSTOMER_ORG_SCOPE_KEY, next);
      else localStorage.removeItem(CUSTOMER_ORG_SCOPE_KEY);
    } catch {
      // ignore
    }
  }, []);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const clearCart = useCartStore((state) => state.clearCart);
  const previousBranchIdRef = useRef<string | null>(initialSelection.branch?.id ?? null);
  const isInitialMountRef = useRef<boolean>(true);

  useEffect(() => {
    try {
      localStorage.removeItem(CUSTOMER_SCOPE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Fetch all branches
  const refreshBranches = useCallback(async (overrideFilters?: {
    query?: string | null;
    serviceType?: ServiceType | null;
    serviceMode?: CustomerServiceMode | null;
    location?: { latitude: number; longitude: number; label?: string | null } | null;
    radiusKm?: number | null;
  }) => {
    try {
      setLoadingBranches(true);
      const orgScoped = Boolean(customerOrganizationSlug);

      // Use override values if provided, otherwise fall back to state
      const effectiveQuery = overrideFilters?.query !== undefined
        ? overrideFilters.query
        : customerBranchSearchQuery;
      const effectiveServiceType = overrideFilters?.serviceType !== undefined
        ? overrideFilters.serviceType
        : customerServiceType;
      const effectiveServiceMode = overrideFilters?.serviceMode !== undefined
        ? overrideFilters.serviceMode
        : customerServiceMode;
      const effectiveLocation = overrideFilters?.location !== undefined
        ? overrideFilters.location
        : customerLocation;
      const effectiveRadiusKm = overrideFilters?.radiusKm !== undefined
        ? overrideFilters.radiusKm
        : customerRadiusKm;

      let latestQuery: string | null = orgScoped ? null : effectiveQuery;

      const hasLocation = Boolean(effectiveLocation);
      const shouldApplyRadius =
        !orgScoped &&
        hasLocation &&
        (effectiveServiceMode === "PICKUP" || effectiveServiceMode === "RESERVATION");

      const serviceModeForQuery: CustomerServiceMode | null = orgScoped ? null : effectiveServiceMode;

      const allBranches = await branchService.getBranches(undefined, {
        serviceType: orgScoped ? null : effectiveServiceType,
        serviceMode: serviceModeForQuery,
        radiusKm: shouldApplyRadius ? effectiveRadiusKm : null,
        latitude: hasLocation ? (effectiveLocation?.latitude ?? null) : null,
        longitude: hasLocation ? (effectiveLocation?.longitude ?? null) : null,
        query: latestQuery,
        organizationSlug: customerOrganizationSlug,
      });
      // Filter only active branches
      let activeBranches = allBranches.filter((b) => b.isActive !== false);

      // Sort by distance (nearest first) when we have a customer location.
      // Distance is computed from branch latitude/longitude.
      if (effectiveLocation) {
        const userLat = Number(effectiveLocation.latitude);
        const userLon = Number(effectiveLocation.longitude);

        const distanceKmOf = (b: any): number | null => {
          const lat = Number(b?.latitude);
          const lon = Number(b?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) return null;
          return calculateDistance(userLat, userLon, lat, lon);
        };

        activeBranches = [...activeBranches].sort((a: any, b: any) => {
          const da = distanceKmOf(a);
          const db = distanceKmOf(b);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });
      }

      // Ensure the currently selected branch is left-most (first).
      if (branch?.id) {
        const idx = activeBranches.findIndex((b) => b.id === branch.id);
        if (idx > 0) {
          const selected = activeBranches[idx];
          activeBranches = [selected, ...activeBranches.slice(0, idx), ...activeBranches.slice(idx + 1)];
        }
      }

      setBranches(activeBranches);

      // If current selected branch is not in the available set anymore (e.g., org scoped), clear it.
      if (branch?.id && !activeBranches.some((b) => b.id === branch.id)) {
        setBranchState(null);
        setAvailabilityState(null);
        setBranchSelectionSource("AUTO_DEFAULT");
        previousBranchIdRef.current = null;
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("BranchContext: failed to fetch branches", err);
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

  // Fetch branches on mount and when customer scope changes so backend can filter.
  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  // Auto-select a default branch when none is selected.
  // This prevents flows (e.g., scope -> home) from landing with no branch selected.
  useEffect(() => {
    if (branch?.id) return;
    if (loadingBranches) return;
    if (!branches || branches.length === 0) return;

    // Don't auto-select if branch changes are currently locked.
    try {
      const modifyingBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderBranchId = sessionStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = sessionStorage.getItem("preOrderBranchLock");
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      const skipAutoSelect = sessionStorage.getItem("skipAutoBranchSelect");

      if (preOrderBranchLock && !pendingReservation) {
        sessionStorage.removeItem("preOrderBranchLock");
      }

      const lockedBranchId = modifyingBranchId || modifyingOrderBranchId || preOrderBranchLock;
      if (lockedBranchId) return;

      // Skip auto-selection if explicitly requested (e.g., from Favorites page)
      if (skipAutoSelect === "true") {
        sessionStorage.removeItem("skipAutoBranchSelect");
        return;
      }
    } catch {
      // ignore
    }

    const first = branches[0];
    if (!first?.id) return;

    const source: BranchSelectionSource = customerLocation ? "AUTO_NEAREST" : "AUTO_DEFAULT";
    const next: BranchSummary = {
      id: first.id,
      name: first.name || null,
      distanceKm: null,
    };

    setBranchState(next);
    setBranchSelectionSource(source);
    setAvailabilityState({ available: true, branch: next });
    previousBranchIdRef.current = next.id;
  }, [branch?.id, branches, customerLocation, loadingBranches]);

  // Check if we're in modification mode or pre-order lock and lock branch accordingly
  useEffect(() => {
    const checkBranchLock = () => {
      const modifyingBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderBranchId = sessionStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = sessionStorage.getItem("preOrderBranchLock");
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      
      // If preOrderBranchLock exists but no pending reservation, clear the lock
      // This handles cases where the lock persisted but reservation was cleared
      if (preOrderBranchLock && !pendingReservation) {
        sessionStorage.removeItem("preOrderBranchLock");
        return;
      }
      
      // Priority: modification mode > pre-order lock
      const lockedBranchId = modifyingBranchId || modifyingOrderBranchId || preOrderBranchLock;
      
      // If locked, ensure branch is set to locked branch
      if (lockedBranchId && branches.length > 0) {
        // Find the branch in the branches list
        const lockedBranch = branches.find((b) => b.id === lockedBranchId);
        if (lockedBranch && (!branch || branch.id !== lockedBranchId)) {
          setBranchState({
            id: lockedBranch.id,
            name: lockedBranch.name || null,
            distanceKm: null,
          });
          previousBranchIdRef.current = lockedBranch.id;
        }
      }
    };
    
    checkBranchLock();
    
    // Listen for storage changes (when modification mode or pre-order lock is entered/exited)
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === "modifyingReservationId" ||
        e.key === "modifyingReservationBranchId" ||
        e.key === "modifyingOrderId" ||
        e.key === "modifyingOrderBranchId" ||
        e.key === "preOrderBranchLock"
      ) {
        checkBranchLock();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    
    // Also check periodically in case of same-tab changes (storage events don't fire in same tab)
    const interval = setInterval(checkBranchLock, 500);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [branches, branch]);

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

  const setBranch = useCallback((next: BranchSummary | null, source: BranchSelectionSource = "MANUAL") => {
    // Prevent branch changes when in modification mode or pre-order lock
    try {
      const modifyingBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderBranchId = sessionStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = sessionStorage.getItem("preOrderBranchLock");
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      
      // If preOrderBranchLock exists but no pending reservation, clear the lock
      if (preOrderBranchLock && !pendingReservation) {
        sessionStorage.removeItem("preOrderBranchLock");
        // Continue with normal branch change - don't return here
      } else {
        // Priority: modification mode > pre-order lock
        const lockedBranchId = modifyingBranchId || modifyingOrderBranchId || preOrderBranchLock;
        
        if (lockedBranchId) {
          // If trying to change branch during lock, ignore the change
          if (next && next.id !== lockedBranchId) {
            console.warn("BranchContext: Cannot change branch - locked");
            return;
          }
          // Only allow setting the locked branch
          if (next && next.id === lockedBranchId) {
            setBranchState(next);
            setBranches((prev) => {
              const idx = prev.findIndex((b) => b.id === next.id);
              if (idx <= 0) return prev;
              const selected = prev[idx];
              return [selected, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
            });
            setAvailabilityState(
              next
                ? { available: true, branch: next }
                : null
            );
            return; // Don't persist to localStorage during lock
          }
        }
      }
    } catch (err) {
      console.error("BranchContext: error checking branch lock", err);
    }
    
    // Normal flow: Allow branch changes
    setBranchState(next);
    setBranchSelectionSource(source);
    if (next?.id) {
      setBranches((prev) => {
        const idx = prev.findIndex((b) => b.id === next.id);
        if (idx <= 0) return prev;
        const selected = prev[idx];
        return [selected, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    }
    setAvailabilityState(
      next
        ? { available: true, branch: next }
        : null
    );
  }, []);

  const setAvailability = useCallback((next: BranchAvailability | null) => {
    setAvailabilityState(next);
    if (next?.available) {
      setBranch(next.branch);
    }
  }, [setBranch]);

  const clearBranch = useCallback(() => {
    setBranch(null);
    setAvailabilityState(null);
  }, [setBranch]);

  const clearReservationLock = useCallback(() => {
    try {
      sessionStorage.removeItem("preOrderBranchLock");
      sessionStorage.removeItem("pendingReservation");
      // Trigger a re-check of branch lock
      window.dispatchEvent(new StorageEvent("storage", { key: "preOrderBranchLock" }));
    } catch (err) {
      console.warn("BranchContext: failed to clear reservation lock", err);
    }
  }, []);

  const setCustomerServiceType = useCallback((serviceType: ServiceType | null) => {
    const nextServiceType: ServiceType = serviceType || "RESTAURANT";
    setCustomerServiceTypeState(nextServiceType);
  }, []);

  const setCustomerServiceMode = useCallback((mode: CustomerServiceMode) => {
    const nextMode: CustomerServiceMode =
      mode === "DELIVERY" || mode === "PICKUP" || mode === "RESERVATION" ? mode : "DELIVERY";
    setCustomerServiceModeState(nextMode);
  }, []);

  const setCustomerRadiusKm = useCallback((radiusKm: number) => {
    const n = Number(radiusKm);
    const nextRadius = !isNaN(n) && n > 0 ? n : 20;
    setCustomerRadiusKmState(nextRadius);
  }, []);

  const setCustomerLocation = useCallback(
    (location: { latitude: number; longitude: number; label?: string | null } | null) => {
      setCustomerLocationState(location);
    },
    []
  );

  const visibleBranches = useMemo(() => {
    const serviceType = customerServiceType;

    const normalizeServiceType = (raw: any): ServiceType | null => {
      if (!raw) return null;
      const val = String(raw).trim().toUpperCase();
      if (val === "RESTAURANT") return "RESTAURANT";
      if (val === "MEAT_SHOP" || val === "MEATSHOP" || val === "MEAT SHOP" || val === "MEAT-SHOP") {
        return "MEAT_SHOP";
      }
      if (val === "BAKERY") return "BAKERY";
      if (val === "FOOD_TRUCK" || val === "FOODTRUCK" || val === "FOOD TRUCK" || val === "FOOD-TRUCK") {
        return "FOOD_TRUCK";
      }
      return null;
    };

    const effectiveServiceTypeOf = (b: Branch): ServiceType | null => {
      const direct = normalizeServiceType((b as any)?.serviceType);
      if (direct) return direct;

      const fromOrg = normalizeServiceType((b as any)?.organization?.settings?.serviceType);
      // Backwards compatibility: before multi-service support existed, many branches/orgs
      // won't have serviceType set at all. Treat that as RESTAURANT.
      return fromOrg || "RESTAURANT";
    };

    const matchesService = (b: Branch) => {
      if (!serviceType) return true;
      return effectiveServiceTypeOf(b) === serviceType;
    };

    return branches.filter((b) => matchesService(b));
  }, [branches, customerServiceType]);

  const value = useMemo<BranchContextValue>(
    () => ({
      branch,
      branchSelectionSource,
      availability,
      branches,
      visibleBranches,
      loadingBranches,
      setBranch,
      setAvailability,
      clearBranch,
      refreshBranches,
      clearReservationLock,
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
      branchSelectionSource,
      availability,
      branches,
      visibleBranches,
      loadingBranches,
      setBranch,
      setAvailability,
      clearBranch,
      refreshBranches,
      clearReservationLock,
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


