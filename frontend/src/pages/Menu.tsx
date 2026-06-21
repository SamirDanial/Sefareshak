import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  memo,
  useCallback,
} from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@mdi/react";
import { mdiRefresh, mdiTag, mdiCalendar } from "@mdi/js";
import { Link, useSearchParams } from "react-router-dom";
import { useCategories, useMeals } from "@/hooks/useApi";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/utils/currency";
import { useDealCategory } from "@/hooks/useApi";
import {
  declarationService,
  type Declaration,
} from "@/services/declarationService";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/utils/mealAvailability";

const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";

// Memoized Category Filter Component to prevent re-renders
const CategoryFilter = memo(
  ({
    categories,
    selectedCategoryId,
    onCategoryChange,
    filterScrollRef,
    categoryButtonRefs,
  }: {
    categories: any[];
    selectedCategoryId: string | null;
    onCategoryChange: (categoryId: string | null) => void;
    filterScrollRef: React.RefObject<HTMLDivElement | null>;
    categoryButtonRefs: React.MutableRefObject<{
      [key: string]: HTMLButtonElement | null;
    }>;
  }) => {
    const { t } = useTranslation();

    // Function to get translated category name
    const getCategoryName = (categoryName: string): string => {
      const translationKey = `categories.${categoryName
        .toLowerCase()
        .replace(/\s+/g, "")}`;
      const translated = t(translationKey, { defaultValue: categoryName });
      return translated !== translationKey ? translated : categoryName;
    };

    return (
      <div
        ref={filterScrollRef}
        className="flex gap-1 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ paddingTop: "2px", paddingBottom: "2px", paddingLeft: "16px", paddingRight: "16px" }}
      >
        {/* All Categories Button */}
        <button
          onClick={() => onCategoryChange(null)}
          className={`whitespace-nowrap transition-all duration-200 px-4 py-3 mr-1 min-h-[44px] flex items-center justify-center ${
            selectedCategoryId === null
              ? "text-pink-500 font-semibold"
              : "text-[#cccccc] font-medium"
          }`}
          style={{
            letterSpacing: selectedCategoryId === null ? "0.3px" : "0.2px",
          }}
        >
          {t("menu.allCategories")}
        </button>

        {/* Category Buttons */}
        {categories.map((category) => (
          <button
            key={category.id}
            ref={(el) => {
              categoryButtonRefs.current[category.id] = el as HTMLButtonElement;
            }}
            onClick={() =>
              onCategoryChange(
                selectedCategoryId === category.id ? null : category.id
              )
            }
            className={`whitespace-nowrap transition-all duration-200 px-4 py-3 mr-1 min-h-[44px] flex items-center justify-center ${
              selectedCategoryId === category.id
                ? "text-pink-500 font-semibold"
                : "text-[#cccccc] font-medium"
            }`}
            style={{
              letterSpacing: selectedCategoryId === category.id ? "0.3px" : "0.2px",
            }}
          >
            {getCategoryName(category.name)}
          </button>
        ))}
      </div>
    );
  }
);

CategoryFilter.displayName = "CategoryFilter";

// Memoize the filter component - it will only re-render when categories array reference changes
const MemoizedCategoryFilter = memo(CategoryFilter);

// Memoized Declaration Filter Component
const DeclarationFilter = memo(
  ({
    declarations,
    selectedDeclarations,
    onDeclarationToggle,
    filterScrollRef,
    declarationButtonRefs,
  }: {
    declarations: Declaration[];
    selectedDeclarations: Set<string>;
    onDeclarationToggle: (declarationId: string) => void;
    filterScrollRef: React.RefObject<HTMLDivElement | null>;
    declarationButtonRefs: React.MutableRefObject<{
      [key: string]: HTMLButtonElement | null;
    }>;
  }) => {
    const { t } = useTranslation();

    // Filter declarations that should be shown in filter
    const visibleDeclarations = declarations.filter(
      (declaration) => declaration.shownInFilter !== false
    );

    // Don't render anything if there are no visible declarations
    if (visibleDeclarations.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon path={mdiTag} size={0.67} />
          <span>{t("menu.filterByDeclaration")}</span>
        </div>
        <div
          ref={filterScrollRef}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-pink-500 scrollbar-track-transparent"
        >
          {visibleDeclarations.map((declaration) => {
            const isSelected = selectedDeclarations.has(declaration.id);
            return (
              <Button
                key={declaration.id}
                ref={(el) => {
                  declarationButtonRefs.current[declaration.id] = el;
                }}
                onClick={() => onDeclarationToggle(declaration.id)}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className={`whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30 hover:from-pink-400 hover:to-rose-400"
                    : "border-pink-300 dark:border-pink-700 text-foreground hover:bg-pink-50 dark:hover:bg-pink-950/30 hover:border-pink-400 dark:hover:border-pink-600"
                }`}
                title={declaration.description || declaration.name}
              >
                {declaration.icon && (
                  <span className="text-sm flex-shrink-0">
                    {declaration.icon}
                  </span>
                )}
                <span>{declaration.name}</span>
              </Button>
            );
          })}
        </div>
      </div>
    );
  }
);

DeclarationFilter.displayName = "DeclarationFilter";

const MemoizedDeclarationFilter = memo(DeclarationFilter);

const MENU_SCROLL_KEY = "bellami:menuScroll";

export default function Menu() {
  const { t } = useTranslation();
  const { currency, settings } = useSettings();
  const { branch, branches } = useBranch();
  const [searchParams] = useSearchParams();
  const isPreOrderReservation = searchParams.get("reservation") === "pre-order";
  const isModifying = searchParams.get("modify") === "true";
  const requestedCategoryId = searchParams.get("categoryId");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [selectedDeclarations, setSelectedDeclarations] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [declarationsLoading, setDeclarationsLoading] = useState(true);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  const declarationFilterScrollRef = useRef<HTMLDivElement>(null);
  const categoryButtonRefs = useRef<{
    [key: string]: HTMLButtonElement | null;
  }>({});
  const declarationButtonRefs = useRef<{
    [key: string]: HTMLButtonElement | null;
  }>({});
  const savedScrollPosition = useRef<number | null>(null);
  const pendingFilterScrollRestore = useRef<number | null>(null);
  const isRestoringRef = useRef(false);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const restoreDataRef = useRef<{
    categoryId: string | null;
    filterScrollLeft: number;
    pageScrollY: number;
  } | null>(null);

  // Get reservation data from sessionStorage (load synchronously on initial render for pre-order)
  const [reservationData, setReservationData] = useState<any>(() => {
    if (isPreOrderReservation) {
      try {
        const stored = sessionStorage.getItem("pendingReservation");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            return parsed;
          } catch (e) {
            // Clear invalid data
            sessionStorage.removeItem("pendingReservation");
          }
        }
      } catch (e) {
        console.error("[Menu] Error accessing sessionStorage:", e);
      }
    }
    return null;
  });
  
  // Also update reservation data when isPreOrderReservation changes
  useEffect(() => {
    if (isPreOrderReservation) {
      try {
        const stored = sessionStorage.getItem("pendingReservation");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setReservationData(parsed);
          } catch (e) {
            console.error("[Menu] Error parsing reservation data:", e);
            // Clear invalid data
            sessionStorage.removeItem("pendingReservation");
          }
        }
      } catch (e) {
        console.error("[Menu] Error accessing sessionStorage:", e);
      }
    } else {
      setReservationData(null);
    }
  }, [isPreOrderReservation]);

  // Determine which branchId to use: reservation branchId for pre-order/modification, otherwise context branchId
  const effectiveBranchId = useMemo(() => {
    // If modifying, always use the reservation branch from session
    if (isModifying) {
      const modifyingBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      if (modifyingBranchId) {
        return modifyingBranchId;
      }
    }
    // Check for explicitly selected branch ID (e.g., from Favorites page)
    const selectedBranchId = sessionStorage.getItem("selectedBranchId");
    if (selectedBranchId) {
      // Don't clear it yet - we need it for the branch lookup
      return selectedBranchId;
    }
    // For pre-order reservations, use branchId from reservation data
    if (isPreOrderReservation && reservationData?.branchId) {
      return reservationData.branchId;
    }
    // Normal flow fallback
    return branch?.id;
  }, [isPreOrderReservation, isModifying, reservationData?.branchId, branch?.id]);

  // Check if we're coming from Favorites page via URL query parameter
  const fromFavorites = searchParams.get("fromFavorites") === "true";

  // Check for stored branch data from Favorites page (bypasses location filtering)
  // Only use stored data if coming from Favorites (has query parameter)
  const selectedBranch = useMemo(() => {
    // First check if we have stored branch data from Favorites page via sessionStorage
    // This bypasses location filtering completely
    if (fromFavorites) {
      try {
        const stored = sessionStorage.getItem("selectedBranchData");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.id) {
            return parsed;
          }
        }
      } catch (e) {
        console.error("[Menu] Failed to parse stored branch data:", e);
      }
    }
    // Otherwise, look up in branches array using effectiveBranchId
    if (!effectiveBranchId) return null;
    const found = branches.find((b) => b.id === effectiveBranchId);
    return found ?? null;
  }, [effectiveBranchId, branches, fromFavorites]);

  // Use stored branch ID for API calls if available, otherwise use effectiveBranchId
  const apiBranchId = useMemo(() => {
    if (fromFavorites) {
      try {
        const stored = sessionStorage.getItem("selectedBranchData");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.id) return parsed.id;
        }
      } catch (e) {
        console.error("[Menu] Failed to parse stored branch ID:", e);
      }
    }
    return effectiveBranchId;
  }, [effectiveBranchId, fromFavorites]);

  // Clear sessionStorage when not coming from Favorites
  useEffect(() => {
    if (!fromFavorites) {
      try {
        sessionStorage.removeItem("selectedBranchData");
        sessionStorage.removeItem("selectedBranchId");
        sessionStorage.removeItem("skipAutoBranchSelect");
      } catch (e) {
        console.error("[Menu] Failed to clear stored branch data:", e);
      }
    }
  }, [fromFavorites]);

  const { categories: allCategories, loading: categoriesLoading } = useCategories(true, apiBranchId);
  const { meals: allMeals, loading: mealsLoading, error: mealsError } = useMeals({
    branchId: apiBranchId,
  });

  const effectiveTimezone = useMemo(() => {
    return getEffectiveTimezone({
      branchTimezone: (selectedBranch as any)?.timezone ?? null,
      settingsTimezone: (settings as any)?.timezone ?? null,
    });
  }, [selectedBranch, settings]);

  // Default category on mount
  useEffect(() => {
    if (requestedCategoryId) {
      setSelectedCategoryId(requestedCategoryId);
      return;
    }
    setSelectedCategoryId(null);
  }, [requestedCategoryId]);

  // Scroll the requested category button into view after categories render.
  useEffect(() => {
    if (!requestedCategoryId || categoriesLoading) return;
    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 30;

    const tryScroll = () => {
      attempts += 1;
      const btn = categoryButtonRefs.current[requestedCategoryId];
      const container = filterScrollRef.current;

      if (btn && container) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        const currentLeft = container.scrollLeft;
        const btnLeftWithinContainer = btnRect.left - containerRect.left + currentLeft;
        const targetLeft =
          btnLeftWithinContainer - (containerRect.width / 2 - btnRect.width / 2);

        container.scrollTo({ left: targetLeft, behavior: "smooth" });
        return;
      }

      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(tryScroll);
      } else if (import.meta.env.DEV) {
        console.debug("[Menu] Could not auto-scroll category into view", {
          requestedCategoryId,
          hasContainer: !!filterScrollRef.current,
          hasButton: !!categoryButtonRefs.current[requestedCategoryId],
        });
      }
    };

    rafId = requestAnimationFrame(tryScroll);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [requestedCategoryId, categoriesLoading]);

  // Apply scroll restoration after categories load
  useEffect(() => {
    if (!shouldRestoreScroll || categoriesLoading) return;
    const restoreData = restoreDataRef.current;
    if (!restoreData) return;

    const apply = () => {
      // Restore category filter scroll position
      if (filterScrollRef.current && restoreData.filterScrollLeft > 0) {
        filterScrollRef.current.scrollLeft = restoreData.filterScrollLeft;
      }

      // Scroll the selected category button into view
      if (restoreData.categoryId && categoryButtonRefs.current[restoreData.categoryId]) {
        const btn = categoryButtonRefs.current[restoreData.categoryId];
        btn?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
      }

      // Restore page scroll position
      if (restoreData.pageScrollY > 0) {
        window.scrollTo(0, restoreData.pageScrollY);
      }

      setShouldRestoreScroll(false);
      restoreDataRef.current = null;
      isRestoringRef.current = false;
    };

    // Wait a frame for DOM to be ready
    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });
  }, [shouldRestoreScroll, categoriesLoading]);

  // Save Menu state on any click (for meals)
  useEffect(() => {
    const saveMenuState = () => {
      if (isRestoringRef.current) return;
      const filterScrollLeft = filterScrollRef.current?.scrollLeft ?? 0;
      const payload = {
        categoryId: selectedCategoryId,
        filterScrollLeft,
        pageScrollY: window.scrollY,
        ts: Date.now(),
      };
      try {
        localStorage.setItem(MENU_SCROLL_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    document.addEventListener("click", saveMenuState, true);
    return () => {
      document.removeEventListener("click", saveMenuState, true);
    };
  }, [selectedCategoryId]);

  // Filter categories based on selected branch and active status
  const categories = useMemo(() => {
    if (!effectiveBranchId) return allCategories.filter((cat) => cat.isActive);
    return allCategories.filter((category) => {
      if (!category.isActive) return false;
      const excludedBranches = (category as any).excludedBranches || [];
      return !excludedBranches.includes(effectiveBranchId);
    });
  }, [allCategories, effectiveBranchId]);

  // Filter categories to only show active ones - MUST be before any early returns
  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.isActive),
    [categories]
  );

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    return (
      activeCategories.find((c: any) => String(c.id) === String(selectedCategoryId)) || null
    );
  }, [activeCategories, selectedCategoryId]);

  const isDealCategory = Boolean(
    selectedCategoryId &&
      (selectedCategory as any)?._count?.deals !== undefined &&
      Number((selectedCategory as any)?._count?.deals || 0) > 0
  );

  const { deals: selectedDeals, loading: dealsLoading } = useDealCategory(
    isDealCategory ? selectedCategoryId || "" : "",
    effectiveBranchId
  );

  // Function to filter meals based on selected category, declarations, and search query
  const getFilteredMeals = useCallback(
    (
      meals: any[],
      categoryId: string | null,
      declarationIds: Set<string>,
      search: string
    ): any[] => {
      let filtered = meals;

      // Filter by category
      if (categoryId) {
        filtered = filtered.filter((meal) => meal.categoryId === categoryId);
      }

      // Filter by declarations (meals must have ALL selected declarations)
      if (declarationIds.size > 0) {
        filtered = filtered.filter((meal) => {
          if (!meal.mealDeclarations || meal.mealDeclarations.length === 0) {
            return false;
          }
          const mealDeclarationIds = new Set(
            meal.mealDeclarations.map(
              (md: any) => md.declaration?.id || md.declarationId
            )
          );
          // Check if meal has ALL of the selected declarations (AND logic)
          return Array.from(declarationIds).every((id) =>
            mealDeclarationIds.has(id)
          );
        });
      }

      // Filter by search query
      if (search.trim()) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(
          (meal) =>
            meal.name.toLowerCase().includes(searchLower) ||
            meal.description?.toLowerCase().includes(searchLower)
        );
      }

      const result = filtered.slice();

      if (categoryId) {
        result.sort((a, b) => {
          const orderA =
            typeof a.listOrder === "number" && a.listOrder > 0
              ? a.listOrder
              : Number.MAX_SAFE_INTEGER;
          const orderB =
            typeof b.listOrder === "number" && b.listOrder > 0
              ? b.listOrder
              : Number.MAX_SAFE_INTEGER;

          if (orderA === orderB) {
            return a.name.localeCompare(b.name);
          }
          return orderA - orderB;
        });
      }

      return result;
    },
    []
  );

  // Fetch all declarations
  useEffect(() => {
    const fetchDeclarations = async () => {
      try {
        setDeclarationsLoading(true);
        if (!effectiveBranchId) {
          setDeclarations([]);
          return;
        }
        const allDeclarations = await declarationService.getAllDeclarations(
          undefined,
          undefined,
          effectiveBranchId
        );
        setDeclarations(allDeclarations);
      } catch (err) {
        console.error("Error fetching declarations:", err);
        // Set empty array on error so filter doesn't show
        setDeclarations([]);
      } finally {
        setDeclarationsLoading(false);
      }
    };

    fetchDeclarations();
  }, [effectiveBranchId]);

  // Filter meals based on selected branch
  // Exclude meal if:
  // 1. Branch is in meal.excludedBranches, OR
  // 2. Branch is in meal.category.excludedBranches
  const meals = useMemo(() => {
    if (!effectiveBranchId) return allMeals;
    return allMeals.filter((meal) => {
      // Check if meal is excluded from this branch
      const mealExcludedBranches = (meal as any).excludedBranches || [];
      if (mealExcludedBranches.includes(effectiveBranchId)) {
        return false;
        }
      // Check if meal's category is excluded from this branch
      const categoryExcludedBranches = (meal.category as any)?.excludedBranches || [];
      if (categoryExcludedBranches.includes(effectiveBranchId)) {
        return false;
      }
      return true;
    });
  }, [allMeals, effectiveBranchId]);

  // Update filtered meals when category selection, declarations, search query, meals, or categories change
  const filteredMeals = useMemo(() => {
    return getFilteredMeals(
      meals,
      selectedCategoryId,
      selectedDeclarations,
      searchQuery
    );
  }, [
    meals,
    selectedCategoryId,
    selectedDeclarations,
    searchQuery,
    getFilteredMeals,
  ]);

  const filteredDeals = useMemo(() => {
    if (!isDealCategory) return [];
    const deals = Array.isArray(selectedDeals) ? selectedDeals : [];
    let filtered = deals;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d: any) =>
          String(d?.name || "").toLowerCase().includes(q) ||
          String(d?.description || "").toLowerCase().includes(q)
      );
    }

    const result = filtered.slice();
    result.sort((a: any, b: any) => {
      const orderA =
        typeof (a as any).listOrder === "number" && (a as any).listOrder > 0
          ? (a as any).listOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof (b as any).listOrder === "number" && (b as any).listOrder > 0
          ? (b as any).listOrder
          : Number.MAX_SAFE_INTEGER;
      if (orderA === orderB) return String(a?.name || "").localeCompare(String(b?.name || ""));
      return orderA - orderB;
    });
    return result;
  }, [isDealCategory, searchQuery, selectedDeals]);

  const loading = mealsLoading || categoriesLoading || declarationsLoading;

  // Preserve scroll position when updating category
  const handleCategoryChange = useCallback((categoryId: string | null) => {
    // Save current scroll position BEFORE state update
    if (filterScrollRef.current) {
      savedScrollPosition.current = filterScrollRef.current.scrollLeft;
      pendingFilterScrollRestore.current = filterScrollRef.current.scrollLeft;
    }
    setSelectedCategoryId(categoryId);
  }, []);

  // Restore the category strip scrollLeft right after a category selection re-render.
  // This is more reliable than relying on scrollLeft persistence, especially when the selected
  // category triggers different list rendering (deals vs meals) and focus/scroll behaviors.
  useLayoutEffect(() => {
    if (pendingFilterScrollRestore.current === null) return;
    if (!filterScrollRef.current) return;

    filterScrollRef.current.scrollLeft = pendingFilterScrollRestore.current;
    pendingFilterScrollRestore.current = null;
  }, [selectedCategoryId]);

  // Handle declaration toggle
  const handleDeclarationToggle = useCallback((declarationId: string) => {
    setSelectedDeclarations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(declarationId)) {
        newSet.delete(declarationId);
      } else {
        newSet.add(declarationId);
      }
      return newSet;
    });
  }, []);

  // Restore scroll position after render but before paint
  useLayoutEffect(() => {
    if (savedScrollPosition.current !== null && filterScrollRef.current) {
      filterScrollRef.current.scrollLeft = savedScrollPosition.current;
      savedScrollPosition.current = null; // Reset after restoring
    }
  });

  if (loading) {
    return (
      <section className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold text-pink-500">
            {t("menu.title")}
          </h2>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("menu.loading")}
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("menu.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("menu.loadingDescription")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (mealsError) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-pink-500">
          {t("menu.title")}
        </h2>
        <div className="text-center py-8">
          <p className="text-red-500">
            {t("menu.loadError")} {mealsError}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Pre-Order Reservation Banner */}
      {isPreOrderReservation && reservationData && (
        <Card className="border-pink-500/50 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 mb-4">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Icon path={mdiCalendar} size={0.83} className="text-pink-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-pink-900 dark:text-pink-100 mb-1">
                  Pre-Order Reservation
                </h3>
                <p className="text-sm text-pink-700 dark:text-pink-300">
                  Add items to your cart. Your order will be prepared and ready by{" "}
                  <strong>
                    {new Date(`${reservationData.date}T${reservationData.time}`).toLocaleString()}
                  </strong>
                  {" "}for {reservationData.numberOfGuests} guests.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Search Bar */}
      <div style={{ paddingLeft: "16px", paddingRight: "16px", paddingTop: "8px", paddingBottom: "2px" }}>
        <Input
          placeholder={t("menu.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-transparent"
          style={{ 
            backgroundColor: "#262626",
            borderRadius: "12px",
            paddingTop: "14px", 
            paddingBottom: "14px",
            paddingLeft: "16px",
            paddingRight: "16px",
            fontSize: "16px",
            color: "#fff",
            minHeight: "48px"
          }}
        />
      </div>

      {/* Category Filter */}
      {activeCategories.length > 0 && (
        <div style={{ paddingTop: "2px", paddingBottom: "2px" }}>
          <MemoizedCategoryFilter
            categories={activeCategories}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={handleCategoryChange}
            filterScrollRef={filterScrollRef}
            categoryButtonRefs={categoryButtonRefs}
          />
        </div>
      )}

      {/* Declaration Filter */}
      <MemoizedDeclarationFilter
        declarations={declarations}
        selectedDeclarations={selectedDeclarations}
        onDeclarationToggle={handleDeclarationToggle}
        filterScrollRef={declarationFilterScrollRef}
        declarationButtonRefs={declarationButtonRefs}
      />

      {/* Meals / Deals List */}
      {isDealCategory ? (
        dealsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Icon
                path={mdiRefresh}
                size={2.0}
                className="animate-spin text-pink-500 mx-auto mb-4"
              />
              <p className="text-sm text-muted-foreground">{t("menu.loading")}</p>
            </div>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery.trim() ? t("menu.noMealsMatchFilters") : t("home.noDealsInCategory")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedDeclarations(new Set());
              }}
              className="mt-4"
            >
              {t("menu.clearFilters")}
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: "2px", paddingLeft: "16px", paddingRight: "16px" }}>
            {filteredDeals.map((deal: any) => {
              const dealTotal = (() => {
                const components = Array.isArray(deal?.components) ? deal.components : [];
                return components.reduce((sum: number, c: any) => {
                  const v = c?.effectivePrice ?? c?.price;
                  const n = typeof v === "number" ? v : parseFloat(String(v || 0));
                  const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
                  const qty = Number.isFinite(q) && q > 0 ? q : 1;
                  return sum + (isNaN(n) ? 0 : n) * qty;
                }, 0);
              })();

              return (
                <div
                  key={deal.id}
                  style={{
                    backgroundColor: "#262626",
                    borderRadius: "12px",
                    marginBottom: "12px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "row",
                    minHeight: "160px",
                  }}
                >
                  <img
                    src={
                      deal.image
                        ? isExternalImage(deal.image)
                          ? deal.image
                          : getOptimizedImageUrl(deal.image)
                        : FALLBACK_IMG
                    }
                    alt={deal.name}
                    style={{
                      width: "160px",
                      height: "160px",
                      backgroundColor: "#333",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                      (e.currentTarget as HTMLImageElement).onerror = null;
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: "bold",
                          color: "#fff",
                          marginBottom: "4px",
                        }}
                      >
                        {deal.name}
                      </div>
                      {deal.description && (
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#999",
                            marginBottom: "8px",
                            lineHeight: "18px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {deal.description}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          color: "#ec4899",
                        }}
                      >
                        {formatPrice(dealTotal, currency)}
                      </div>
                      <Link to={`/deal/${encodeURIComponent(deal.id)}`}>
                        <button
                          style={{
                            backgroundColor: "#ec4899",
                            paddingLeft: "16px",
                            paddingRight: "16px",
                            paddingTop: "8px",
                            paddingBottom: "8px",
                            borderRadius: "20px",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              color: "#fff",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                          >
                            {t("home.feedMe")}
                          </span>
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredMeals.length === 0 && !loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {selectedCategoryId || selectedDeclarations.size > 0
              ? t("menu.noMealsMatchFilters")
              : t("menu.noMealsAvailable")}
          </p>
          {(selectedCategoryId || selectedDeclarations.size > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategoryId(null);
                setSelectedDeclarations(new Set());
              }}
              className="mt-4"
            >
              {t("menu.clearFilters")}
            </Button>
          )}
        </div>
      ) : selectedCategoryId === null ? (
        // Grid layout for "All Categories"
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" style={{ marginTop: "12px" }}>
          {filteredMeals.map((meal) => (
            <Link key={meal.id} to={`/meal/${meal.id}?from=menu&categoryId=${encodeURIComponent(selectedCategoryId || "")}`}>
              <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
                <CardContent className="p-0">
                  <div className="aspect-square">
                    {(() => {
                      const availability = getMealAvailabilityNow({
                        meal,
                        branchId: effectiveBranchId,
                        tz: effectiveTimezone,
                      });
                      const isAvailableNow = availability.isAvailableNow;
                      return (
                        <img
                          src={
                            meal.image
                              ? isExternalImage(meal.image)
                                ? meal.image
                                : getOptimizedImageUrl(meal.image)
                              : FALLBACK_IMG
                          }
                          alt={meal.name}
                          className="h-full w-full object-cover"
                          style={!isAvailableNow ? { filter: "grayscale(1)", opacity: 0.85 } : undefined}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                            (e.currentTarget as HTMLImageElement).onerror = null;
                          }}
                        />
                      );
                    })()}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="text-sm font-medium">{meal.name}</div>
                    <div className="text-base font-semibold">
                      {formatPrice(meal.effectiveBasePrice ?? parseFloat(meal.basePrice), currency)}
                    </div>
                    <Button
                      size="sm"
                      className="relative mt-1 w-full overflow-hidden rounded-lg bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 transition duration-300 hover:scale-[1.02] hover:shadow-rose-500/50 focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      {t("home.feedMe")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        // Horizontal card layout for specific categories (matching mobile app)
        <div style={{ marginTop: "2px", paddingLeft: "16px", paddingRight: "16px" }}>
          {filteredMeals.map((meal) => (
            <Link key={meal.id} to={`/meal/${meal.id}?from=menu&categoryId=${encodeURIComponent(selectedCategoryId || "")}`}>
              <div
                style={{
                  backgroundColor: "#262626",
                  borderRadius: "12px",
                  marginBottom: "12px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "row",
                  minHeight: "160px",
                  cursor: "pointer",
                }}
              >
              {(() => {
                const availability = getMealAvailabilityNow({
                  meal,
                  branchId: effectiveBranchId,
                  tz: effectiveTimezone,
                });
                const isAvailableNow = availability.isAvailableNow;

                return (
                  <img
                    src={
                      meal.image
                        ? isExternalImage(meal.image)
                          ? meal.image
                          : getOptimizedImageUrl(meal.image)
                        : FALLBACK_IMG
                    }
                    alt={meal.name}
                    style={{
                      width: "160px",
                      height: "160px",
                      backgroundColor: "#333",
                      objectFit: "cover",
                      filter: !isAvailableNow ? "grayscale(1)" : undefined,
                      opacity: !isAvailableNow ? 0.85 : undefined,
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                      (e.currentTarget as HTMLImageElement).onerror = null;
                    }}
                  />
                );
              })()}
              <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: "bold", color: "#fff", marginBottom: "4px" }}>
                    {meal.name}
                  </div>
                  {meal.description && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#999",
                        marginBottom: "8px",
                        lineHeight: "18px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {meal.description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#ec4899" }}>
                    {formatPrice(meal.effectiveBasePrice ?? parseFloat(meal.basePrice), currency)}
                  </div>
                  <button
                    style={{
                      backgroundColor: "#ec4899",
                      paddingLeft: "16px",
                      paddingRight: "16px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      borderRadius: "20px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: "#fff", fontSize: "14px", fontWeight: "bold" }}>
                      {t("home.feedMe")}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
