import React, { useState, useEffect } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import { mdiPlus, mdiMagnify, mdiDotsVertical, mdiPencil, mdiDelete, mdiEye, mdiEyeOff, mdiChevronLeft, mdiChevronRight, mdiSilverwareForkKnife, mdiClose, mdiCurrencyUsd, mdiLoading, mdiRefresh, mdiSort, mdiPackageVariant, mdiClock } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import ImageUpload from "@/components/ui/image-upload";
import { TimePicker12Hour } from "@/components/ui/time-picker-12hour";
import {
  mealService,
  type Meal,
  type MealFormData,
  type MealBranchAvailability,
} from "@/services/mealService";
import { categoryService, type Category } from "@/services/categoryService";
import { addonService, type Addon } from "@/services/addonService";
import {
  declarationService,
  type Declaration,
} from "@/services/declarationService";
import {
  optionalIngredientService,
  type OptionalIngredient,
} from "@/services/optionalIngredientService";
import branchService, { type Branch } from "@/services/branchService";
import { useSettings } from "@/contexts/SettingsContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const MealManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { currency } = useSettings();
  const { t } = useTranslation();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();

  const canCreateMeal = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.CREATE },
    { resource: RESOURCES.MEALS, action: ACTIONS.CREATE },
  ]);
  const canUpdateMeal = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
    { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
  ]);
  const canDeleteMeal = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.DELETE },
    { resource: RESOURCES.MEALS, action: ACTIONS.DELETE },
  ]);
  const canToggleMeal = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.TOGGLE_ACTIVE },
    { resource: RESOURCES.MEALS, action: ACTIONS.TOGGLE_ACTIVE },
  ]);
  const canReorderCategoryMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

  const canViewMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.MEALS, action: ACTIONS.VIEW },
  ]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);
  const [openMealMenuId, setOpenMealMenuId] = useState<string | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<
    OptionalIngredient[]
  >([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categoryId || ""
  );
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "listOrder">(
    "listOrder"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (field: "name" | "createdAt" | "listOrder") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : field === "createdAt" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const dayLabel = (d: number): string => {
    if (d === 0) return "Sun";
    if (d === 1) return "Mon";
    if (d === 2) return "Tue";
    if (d === 3) return "Wed";
    if (d === 4) return "Thu";
    if (d === 5) return "Fri";
    if (d === 6) return "Sat";
    return String(d);
  };

  const pad2 = (n: number) => String(n).padStart(2, "0");

  const hhmmTo12h = (hhmm: string): string | undefined => {
    if (typeof hhmm !== "string") return undefined;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
    if (!m) return undefined;
    const hours24 = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${pad2(minutes)} ${period}`;
  };

  const time12hToHhmm = (time12h?: string): string => {
    if (!time12h) return "";
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time12h.trim());
    if (!m) return "";
    let hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    const period = m[3].toUpperCase();
    if (hours === 12) hours = 0;
    if (period === "PM") hours += 12;
    return `${pad2(hours)}:${pad2(minutes)}`;
  };

  const openAvailabilityModal = async (meal: Meal) => {
    try {
      setAvailabilityMeal(meal);
      setIsAvailabilityDialogOpen(true);

      const token = await getToken();

      // Ensure branches list is loaded
      if (!Array.isArray(branches) || branches.length === 0) {
        const branchesData = await branchService.getBranches(token || undefined);
        setBranches(branchesData || []);
      }

      setLoadingBranchAvailabilities(true);
      const cfg = await mealService.getMealBranchAvailability(meal.id, token || undefined);
      setBranchAvailabilities(Array.isArray(cfg) ? cfg : []);

      // Default selection
      const firstBranchId = (branches && branches[0]?.id) || cfg?.[0]?.branchId || "";
      const initialBranchId = firstBranchId || "";
      setSelectedAvailabilityBranchId(initialBranchId);

      const initialCfg = (Array.isArray(cfg) ? cfg : []).find((c) => c.branchId === initialBranchId);
      if (initialCfg) {
        setAvailabilityIsAllWeek(Boolean((initialCfg as any).isAvailableAllWeek));
        setAvailabilityWindows(
          Array.isArray((initialCfg as any).windows)
            ? (initialCfg as any).windows.map((w: any) => ({
                dayOfWeek: Number(w.dayOfWeek),
                startTime: String(w.startTime || ""),
                endTime: String(w.endTime || ""),
              }))
            : []
        );
      } else {
        setAvailabilityIsAllWeek(true);
        setAvailabilityWindows([]);
      }
    } catch (e) {
      console.error("Failed to open availability modal:", e);
      setBranchAvailabilities([]);
    } finally {
      setLoadingBranchAvailabilities(false);
    }
  };

  const onSelectAvailabilityBranch = (branchId: string) => {
    setSelectedAvailabilityBranchId(branchId);
    const cfg = branchAvailabilities.find((c) => c.branchId === branchId);
    if (cfg) {
      setAvailabilityIsAllWeek(Boolean((cfg as any).isAvailableAllWeek));
      setAvailabilityWindows(
        Array.isArray((cfg as any).windows)
          ? (cfg as any).windows.map((w: any) => ({
              dayOfWeek: Number(w.dayOfWeek),
              startTime: String(w.startTime || ""),
              endTime: String(w.endTime || ""),
            }))
          : []
      );
    } else {
      setAvailabilityIsAllWeek(true);
      setAvailabilityWindows([]);
    }
  };

  const addAvailabilityWindow = () => {
    setAvailabilityWindows((prev) => {
      const used = new Set(prev.map((w) => w.dayOfWeek));
      const nextDay = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 1;
      return [...prev, { dayOfWeek: nextDay, startTime: "09:00", endTime: "17:00" }];
    });
  };

  const updateAvailabilityWindow = (
    index: number,
    patch: Partial<{ dayOfWeek: number; startTime: string; endTime: string }>
  ) => {
    setAvailabilityWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...patch } : w))
    );
  };

  const removeAvailabilityWindow = (index: number) => {
    setAvailabilityWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const saveBranchAvailability = async () => {
    if (!availabilityMeal || !selectedAvailabilityBranchId) return;
    try {
      setSavingBranchAvailability(true);
      const token = await getToken();
      await mealService.upsertMealBranchAvailability(
        availabilityMeal.id,
        {
          branchId: selectedAvailabilityBranchId,
          isAvailableAllWeek: Boolean(availabilityIsAllWeek),
          windows: availabilityIsAllWeek ? [] : availabilityWindows,
        },
        token || undefined
      );

      const refreshed = await mealService.getMealBranchAvailability(availabilityMeal.id, token || undefined);
      setBranchAvailabilities(Array.isArray(refreshed) ? refreshed : []);

      setIsAvailabilityDialogOpen(false);
    } catch (e) {
      console.error("Failed to save branch availability:", e);
      alert(t("admin.menuManagement.branchAvailabilitySaveError", { defaultValue: "Failed to save availability" }));
    } finally {
      setSavingBranchAvailability(false);
    }
  };
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteBranchPriceDialogOpen, setIsDeleteBranchPriceDialogOpen] = useState(false);
  const [isCloseConfirmationOpen, setIsCloseConfirmationOpen] = useState(false);
  const [dialogToClose, setDialogToClose] = useState<"create" | "edit" | null>(null);
  const [sizeValidationError, setSizeValidationError] = useState<string | null>(null);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);
  const [mealToView, setMealToView] = useState<Meal | null>(null);
  const [branchPriceToDelete, setBranchPriceToDelete] = useState<{ mealId: string; branchId: string; branchName: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addonSearchTerm, setAddonSearchTerm] = useState("");
  const [showEditAddons, setShowEditAddons] = useState(false);
  const [filterAddonsByCategory, setFilterAddonsByCategory] = useState(false);
  const [declarationSearchTerm, setDeclarationSearchTerm] = useState("");
  const [showEditDeclarations, setShowEditDeclarations] = useState(false);
  const [optionalIngredientSearchTerm, setOptionalIngredientSearchTerm] =
    useState("");
  const [showEditOptionalIngredients, setShowEditOptionalIngredients] =
    useState(false);
  const [hasImagePreview, setHasImagePreview] = useState(false);
  const [basePriceInput, setBasePriceInput] = useState<string>("");
  const [sizePriceInputs, setSizePriceInputs] = useState<Record<number, string>>({});
  const [branchPrices, setBranchPrices] = useState<Array<{
    id: string;
    mealId: string;
    branchId: string;
    basePrice: string;
    taxPercentage: number | null;
    branch: {
      id: string;
      name: string;
      code: string | null;
    };
  }>>([]);
  const [loadingBranchPrices, setLoadingBranchPrices] = useState(false);
  const [editingBranchPrice, setEditingBranchPrice] = useState<{
    branchId: string;
    basePrice: string;
    taxPercentage: string;
  } | null>(null);

  const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
  const [availabilityMeal, setAvailabilityMeal] = useState<Meal | null>(null);
  const [branchAvailabilities, setBranchAvailabilities] = useState<MealBranchAvailability[]>([]);
  const [loadingBranchAvailabilities, setLoadingBranchAvailabilities] = useState(false);
  const [selectedAvailabilityBranchId, setSelectedAvailabilityBranchId] = useState<string>("");
  const [availabilityIsAllWeek, setAvailabilityIsAllWeek] = useState(true);
  const [availabilityWindows, setAvailabilityWindows] = useState<
    Array<{ dayOfWeek: number; startTime: string; endTime: string }>
  >([]);
  const [savingBranchAvailability, setSavingBranchAvailability] = useState(false);
  const [formData, setFormData] = useState<Omit<MealFormData, 'basePrice'> & { id?: string; basePrice: number | null }>({
    name: "",
    description: "",
    nameFa: "",
    descriptionFa: "",
    basePrice: null,
    taxPercentage: null,
    categoryId: "",
    image: undefined,
    sizes: [],
    addOnIds: [],
    declarationIds: [],
    optionalIngredientIds: [],
    excludedBranches: [],
    isFeatured: false,
    isDrink: false,
  });

  // Load data for non-search operations
  useEffect(() => {
    loadData();
  }, [currentPage, selectedCategory, selectedStatus, sortBy, sortOrder]);

  // Debounced search effect - only updates menu items
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadSearchResults();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Load optional ingredients when dialog opens (fallback)
  useEffect(() => {
    const loadOptionalIngredients = async () => {
      if (
        (isCreateDialogOpen || isEditDialogOpen) &&
        optionalIngredients.length === 0
      ) {
        try {
          const token = await getToken();
          const data =
            await optionalIngredientService.getAllOptionalIngredients(
              token || undefined
            );
          if (Array.isArray(data)) {
            setOptionalIngredients(data);
          }
        } catch (error) {
          console.error("Error loading optional ingredients:", error);
        }
      }
    };

    loadOptionalIngredients();
  }, [isCreateDialogOpen, isEditDialogOpen]);

  useEffect(() => {
    if (!categoryId) {
      navigate("/admin/menu", { replace: true });
      return;
    }
    setSelectedCategory(categoryId);
    setCurrentPage(1);
    setSortBy("listOrder");
    setSortOrder("asc");
  }, [categoryId, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const [
        mealsData,
        categoriesData,
        addonsData,
        declarationsData,
        optionalIngredientsData,
      ] = await Promise.all([
          mealService.getMeals(
            currentPage,
            9,
            searchTerm,
            sortBy,
            sortOrder,
            selectedCategory,
            token || undefined
          ),
          categoryService.getCategories(
            1,
            100,
            "",
            "createdAt",
            "desc",
            token || undefined
          ),
          addonService.getAddons(
            1,
            100,
            "",
            "createdAt",
            "desc",
            token || undefined
          ),
          declarationService.getAllDeclarations(undefined, token || undefined),
        optionalIngredientService.getAllOptionalIngredients(token || undefined),
        ]);

      // Filter by status if selected
      let filteredMeals = mealsData.meals;
      if (selectedStatus) {
        filteredMeals = mealsData.meals.filter((meal: Meal) => {
          if (selectedStatus === "ACTIVE") return meal.isActive;
          if (selectedStatus === "INACTIVE") return !meal.isActive;
          return true;
        });
      }
      setMeals(filteredMeals);
      setTotalPages(mealsData.pagination?.totalPages || 1);
      setTotalCount(mealsData.pagination?.totalCount || 0);
      // Expose only active categories in menu management UI
      setCategories(
        categoriesData.categories.filter((category: Category) => category.isActive)
      );
      setAddons(addonsData.addons);
      setDeclarations(declarationsData);
      setOptionalIngredients(
        Array.isArray(optionalIngredientsData) ? optionalIngredientsData : []
      );
    } catch (error) {
      console.error("Error loading data:", error);
      // Set empty array on error to prevent UI issues
      setOptionalIngredients([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSearchResults = async () => {
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      const mealsData = await mealService.getMeals(
        currentPage,
        9,
        searchTerm,
        sortBy,
        sortOrder,
        selectedCategory,
        token || undefined
      );

      // Filter by status if selected
      let filteredMeals = mealsData.meals;
      if (selectedStatus && selectedStatus !== "all") {
        filteredMeals = mealsData.meals.filter((meal: Meal) => {
          if (selectedStatus === "ACTIVE") return meal.isActive;
          if (selectedStatus === "INACTIVE") return !meal.isActive;
          return true;
        });
      }
      setMeals(filteredMeals);
      setTotalPages(mealsData.pagination?.totalPages || 1);
      setTotalCount(mealsData.pagination?.totalCount || 0);
    } catch (error) {
      console.error("Error loading search results:", error);
    } finally {
      setMenuItemsLoading(false);
    }
  };

  const parsePrice = (price: string | number): number => {
    if (typeof price === "number") return price;
    if (typeof price === "string") {
      const parsed = parseFloat(price);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const currentCategory = categories.find(
    (category) => category.id === selectedCategory
  );

  const visibleCategories = React.useMemo(() => {
    return categories.filter((category) => {
      const mealsCount = category._count?.meals ?? 0;
      const dealsCount = category._count?.deals ?? 0;
      const hasMeals = mealsCount > 0;
      const isEmpty = mealsCount === 0 && dealsCount === 0;

      if (showEmptyCategories) return isEmpty;
      return hasMeals;
    });
  }, [categories, showEmptyCategories]);

  // Event handlers
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleCategoryFilter = (categoryId: string) => {
    setCurrentPage(1);
    if (!categoryId) {
      navigate("/admin/menu");
      return;
    }
    setSelectedCategory(categoryId);
    navigate(`/admin/menu/${categoryId}`);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handleBackdropClick = (dialogType: "create" | "edit") => {
    setDialogToClose(dialogType);
    setIsCloseConfirmationOpen(true);
  };

  const handleConfirmClose = () => {
    if (dialogToClose === "create") {
      setIsCreateDialogOpen(false);
    } else if (dialogToClose === "edit") {
      setIsEditDialogOpen(false);
    }
    setIsCloseConfirmationOpen(false);
    setDialogToClose(null);
    // Reset form data
    setFormData({
      name: "",
      description: "",
      nameFa: "",
      descriptionFa: "",
      basePrice: null,
      taxPercentage: null,
      categoryId: "",
      image: undefined,
      sizes: [],
      addOnIds: [],
      declarationIds: [],
      optionalIngredientIds: [],
      isFeatured: false,
      isDrink: false,
    });
    setBasePriceInput("");
    setSizePriceInputs({});
    setAddonSearchTerm("");
    setDeclarationSearchTerm("");
    setOptionalIngredientSearchTerm("");
    setShowEditAddons(false);
    setFilterAddonsByCategory(false);
    setShowEditDeclarations(false);
    setShowEditOptionalIngredients(false);
  };

  const handleCancelClose = () => {
    setIsCloseConfirmationOpen(false);
    setDialogToClose(null);
  };

  const handleCreate = async () => {
    // Load branches when opening create dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    
    setFormData({
      name: "",
      description: "",
      nameFa: "",
      descriptionFa: "",
      basePrice: null,
      taxPercentage: null,
      categoryId: selectedCategory || "",
      image: undefined,
      sizes: [],
      addOnIds: [],
      declarationIds: [],
      optionalIngredientIds: [],
      excludedBranches: [],
      isFeatured: false,
      isDrink: false,
    });
    setBasePriceInput("");
    setSizePriceInputs({});
    setAddonSearchTerm("");
    setDeclarationSearchTerm("");
    setOptionalIngredientSearchTerm("");
    setShowEditAddons(false);
    setFilterAddonsByCategory(false);
    setShowEditDeclarations(false);
    setShowEditOptionalIngredients(false);
    setHasImagePreview(false);
    setIsCreateDialogOpen(true);
  };

  const formatNumberForInput = (num: number): string => {
    // Round to 10 decimal places to handle floating-point errors
    const rounded = Math.round(num * 10000000000) / 10000000000;
    // If exactly 0, return ""
    if (rounded === 0) return "";
    // Convert to string and remove trailing zeros and decimal point if not needed
    return rounded.toString().replace(/\.?0+$/, "");
  };

  const handleEdit = async (meal: Meal) => {
    // Load branches when opening edit dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    
    const basePrice = parsePrice(meal.basePrice);
    setFormData({
      id: meal.id,
      name: meal.name,
      description: meal.description || "",
      nameFa: (meal as any).nameFa || "",
      descriptionFa: (meal as any).descriptionFa || "",
      basePrice: basePrice,
      taxPercentage: meal.taxPercentage,
      categoryId: meal.categoryId,
      image: meal.image || undefined,
      sizes: meal.mealSizes.map((size) => ({
        id: size.id,
        name: size.name,
        sizeType: (size as any).sizeType || "M",
        price: parsePrice(size.price),
        taxPercentage: size.taxPercentage || null,
      })),
      addOnIds: meal.mealAddOns.map((addon) => addon.addOn.id),
      declarationIds:
        meal.mealDeclarations?.map((decl) => decl.declaration.id) || [],
      optionalIngredientIds:
        meal.mealOptionalIngredients?.map((ing) => ing.optionalIngredient.id) ||
        [],
      excludedBranches: meal.excludedBranches || [],
      isFeatured: meal.isFeatured || false,
      isDrink: Boolean((meal as any).isDrink),
    });
    setBasePriceInput(formatNumberForInput(basePrice));
    const sizeInputs: Record<number, string> = {};
    meal.mealSizes.forEach((size, index) => {
      sizeInputs[index] = formatNumberForInput(parsePrice(size.price));
    });
    setSizePriceInputs(sizeInputs);
    setAddonSearchTerm("");
    setDeclarationSearchTerm("");
    setOptionalIngredientSearchTerm("");
    setShowEditAddons(false);
    setFilterAddonsByCategory(false);
    setShowEditDeclarations(false);
    setShowEditOptionalIngredients(false);
    // Load branch prices
    loadBranchPrices(meal.id);
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (meal: Meal) => {
    if (!canViewMeals) return;
    setMealToView(meal);
    loadBranchPrices(meal.id);
    setIsDetailsDialogOpen(true);
  };

  // Load branch prices for a meal
  const loadBranchPrices = async (mealId: string) => {
    try {
      setLoadingBranchPrices(true);
      const token = await getToken();
      const prices = await mealService.getMealBranchPrices(mealId, token || undefined);
      setBranchPrices(prices);
    } catch (error) {
      console.error("Failed to load branch prices:", error);
      setBranchPrices([]);
    } finally {
      setLoadingBranchPrices(false);
    }
  };

  // Save branch price
  const handleSaveBranchPrice = async () => {
    if (!editingBranchPrice || !formData.id) return;
    
    try {
      const token = await getToken();
      const basePrice = parseFloat(editingBranchPrice.basePrice);
      if (isNaN(basePrice) || basePrice < 0) {
        alert("Please enter a valid price");
        return;
      }

      await mealService.upsertMealBranchPrice(
        formData.id,
        {
          branchId: editingBranchPrice.branchId,
          basePrice: basePrice,
          taxPercentage: editingBranchPrice.taxPercentage 
            ? parseFloat(editingBranchPrice.taxPercentage) 
            : null,
        },
        token || undefined
      );

      // Reload branch prices
      await loadBranchPrices(formData.id);
      setEditingBranchPrice(null);
    } catch (error) {
      console.error("Failed to save branch price:", error);
      alert("Failed to save branch price");
    }
  };

  // Delete branch price
  const handleDeleteBranchPrice = async () => {
    if (!branchPriceToDelete) return;

    try {
      const token = await getToken();
      await mealService.deleteMealBranchPrice(branchPriceToDelete.mealId, branchPriceToDelete.branchId, token || undefined);
      // Reload branch prices
      await loadBranchPrices(branchPriceToDelete.mealId);
      setIsDeleteBranchPriceDialogOpen(false);
      setBranchPriceToDelete(null);
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      alert("Failed to delete branch price");
    }
  };

  const handleDeleteBranchPriceClick = (branchId: string, branchName: string) => {
    if (!formData.id) return;
    setBranchPriceToDelete({ mealId: formData.id, branchId, branchName });
    setIsDeleteBranchPriceDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!mealToDelete) return;
    try {
      const token = await getToken();
      await mealService.deleteMeal(mealToDelete.id, token || undefined);
      await loadData();
      setIsDeleteDialogOpen(false);
      setMealToDelete(null);
    } catch (error) {
      console.error("Error deleting meal:", error);
    }
  };

  const handleDeleteClick = (meal: Meal) => {
    setMealToDelete(meal);
    setIsDeleteDialogOpen(true);
  };

  const handleToggleStatus = async (meal: Meal) => {
    try {
      const token = await getToken();
      await mealService.toggleMealStatus(meal.id, token || undefined);
      await loadData();
    } catch (error) {
      console.error("Error toggling meal status:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate base price - must be set (not null/undefined), matching desktop app behavior
    // Desktop app checks: formData.basePrice === null
    // Note: In frontend, basePrice is 0 when empty, but desktop app uses null
    // We allow 0 as valid price, but prevent null/undefined
    if (!formData.name || !formData.categoryId || formData.basePrice === null || formData.basePrice === undefined) {
      return;
    }

    // Validate that at least one size is required
    if (!formData.sizes || formData.sizes.length === 0) {
      setSizeValidationError(t("admin.menuManagement.sizeRequired", { defaultValue: "At least one meal size is required" }));
      return;
    } else {
      setSizeValidationError(null);
    }

    // Validate that all sizes have valid prices (not null/undefined, but 0 is allowed)
    if (formData.sizes && formData.sizes.length > 0) {
      const invalidSizes = formData.sizes.filter(
        (size) => size.price === null || size.price === undefined
      );
      if (invalidSizes.length > 0) {
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();
      const submitData = { ...formData, basePrice: formData.basePrice ?? 0 };
      if (formData.id) {
        await mealService.updateMeal(formData.id, submitData, token || undefined);
      } else {
        await mealService.createMeal(submitData, token || undefined);
      }
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error("Error saving meal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSize = () => {
    const newSizes = [
      ...(formData.sizes || []),
      { name: "", sizeType: "M" as const, price: 0, taxPercentage: null },
    ];
    const newIndex = newSizes.length - 1;
    setFormData({ ...formData, sizes: newSizes });
    setSizePriceInputs({ ...sizePriceInputs, [newIndex]: "0" });
    setSizeValidationError(null);
  };

  const removeSize = (index: number) => {
    const newSizes = formData.sizes?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, sizes: newSizes });
    // Clean up size price inputs - reindex remaining sizes
    const newSizePriceInputs: Record<number, string> = {};
    newSizes.forEach((_, i) => {
      const oldIndex = i < index ? i : i + 1;
      if (sizePriceInputs[oldIndex] !== undefined) {
        newSizePriceInputs[i] = sizePriceInputs[oldIndex];
      }
    });
    setSizePriceInputs(newSizePriceInputs);
  };

  const updateSize = (
    index: number,
    field: "name" | "sizeType" | "price" | "taxPercentage",
    value: string | number
  ) => {
    const newSizes = [...(formData.sizes || [])];
    newSizes[index] = { ...newSizes[index], [field]: value };
    setFormData({ ...formData, sizes: newSizes });
  };

  const toggleAddon = (addonId: string) => {
    const currentAddonIds = formData.addOnIds || [];
    const newAddonIds = currentAddonIds.includes(addonId)
      ? currentAddonIds.filter((id) => id !== addonId)
      : [...currentAddonIds, addonId];
    setFormData({ ...formData, addOnIds: newAddonIds });
  };

  // Select all addons that belong to the meal's category
  const selectAllCategoryAddons = () => {
    if (!formData.categoryId) return;
    
    // Find all addons that belong to the selected category
    const categoryAddonIds = addons
      .filter((addon) => {
        const addonCategoryIds = addon.addonCategories?.map(ac => ac.category.id) || [];
        return addonCategoryIds.includes(formData.categoryId);
      })
      .map((addon) => addon.id);
    
    // Merge with existing selected addons (avoid duplicates)
    const currentAddonIds = formData.addOnIds || [];
    const newAddonIds = [...new Set([...currentAddonIds, ...categoryAddonIds])];
    
    setFormData({ ...formData, addOnIds: newAddonIds });
  };

  const toggleDeclaration = (declarationId: string) => {
    const currentDeclarationIds = formData.declarationIds || [];
    const newDeclarationIds = currentDeclarationIds.includes(declarationId)
      ? currentDeclarationIds.filter((id) => id !== declarationId)
      : [...currentDeclarationIds, declarationId];
    setFormData({ ...formData, declarationIds: newDeclarationIds });
  };

  const toggleOptionalIngredient = (optionalIngredientId: string) => {
    const currentOptionalIngredientIds = formData.optionalIngredientIds || [];
    const newOptionalIngredientIds = currentOptionalIngredientIds.includes(
      optionalIngredientId
    )
      ? currentOptionalIngredientIds.filter((id) => id !== optionalIngredientId)
      : [...currentOptionalIngredientIds, optionalIngredientId];
    setFormData({
      ...formData,
      optionalIngredientIds: newOptionalIngredientIds,
    });
  };

  const toggleExcludedBranch = (branchId: string) => {
    const currentExcludedBranches = formData.excludedBranches || [];
    const newExcludedBranches = currentExcludedBranches.includes(branchId)
      ? currentExcludedBranches.filter((id) => id !== branchId)
      : [...currentExcludedBranches, branchId];
    setFormData({
      ...formData,
      excludedBranches: newExcludedBranches,
    });
  };

  const filteredAddons = addons.filter((addon) => {
    // First filter by search term
    const matchesSearch =
      addon.name.toLowerCase().includes(addonSearchTerm.toLowerCase()) ||
      addon.description?.toLowerCase().includes(addonSearchTerm.toLowerCase());

    // Filter by category if checkbox is checked and category is selected
    if (filterAddonsByCategory && formData.categoryId) {
      // Check if addon belongs to the selected category (many-to-many relationship)
      const addonCategoryIds = addon.addonCategories?.map(ac => ac.category.id) || [];
      const matchesCategory = addonCategoryIds.includes(formData.categoryId);
      if (!matchesCategory) return false;
    }

    // If checkbox is checked, only show selected addons
    if (showEditAddons) {
      return matchesSearch && formData.addOnIds?.includes(addon.id);
    }

    // If checkbox is unchecked, show all addons (normal behavior)
    return matchesSearch;
  });

  const filteredDeclarations = declarations.filter((declaration) => {
    const matchesSearch =
      declaration.name
        .toLowerCase()
        .includes(declarationSearchTerm.toLowerCase()) ||
      declaration.type
        ?.toLowerCase()
        .includes(declarationSearchTerm.toLowerCase()) ||
      declaration.description
        ?.toLowerCase()
        .includes(declarationSearchTerm.toLowerCase());

    // If checkbox is checked, only show selected declarations
    if (showEditDeclarations) {
      return matchesSearch && formData.declarationIds?.includes(declaration.id);
    }

    // If checkbox is unchecked, show all declarations (normal behavior)
    return matchesSearch;
  });

  const filteredOptionalIngredients = optionalIngredients.filter(
    (ingredient) => {
      const matchesSearch =
        ingredient.name
          .toLowerCase()
          .includes(optionalIngredientSearchTerm.toLowerCase()) ||
        ingredient.description
          ?.toLowerCase()
          .includes(optionalIngredientSearchTerm.toLowerCase());

      // If checkbox is checked, only show selected optional ingredients
      if (showEditOptionalIngredients) {
        return (
          matchesSearch &&
          formData.optionalIngredientIds?.includes(ingredient.id)
        );
      }

      // If checkbox is unchecked, show all optional ingredients (normal behavior)
      return matchesSearch;
    }
  );

  if (loading) {
    return (
      <div className="space-y-4 pb-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.menuManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.menuManagement.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.menuManagement.loading")}
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.menuManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSearch(e.target.value)
                  }
                  className="pl-9 bg-transparent text-foreground border-border"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select
                  value={selectedCategory || "all"}
                  onValueChange={(value: string) =>
                    handleCategoryFilter(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.menuManagement.allCategories")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.menuManagement.allCategories")}
                    </SelectItem>
                    {visibleCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedStatus || "all"}
                  onValueChange={(value: string) => handleStatusFilter(value)}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.menuManagement.allStatus")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.menuManagement.allStatus")}
                    </SelectItem>
                    <SelectItem value="ACTIVE">
                      {t("admin.menuManagement.active")}
                    </SelectItem>
                    <SelectItem value="INACTIVE">
                      {t("admin.menuManagement.inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.menuManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "name" ? "text-white" : ""}>
                    {t("admin.menuManagement.nameAZ")}
                  </span>
                  {sortBy === "name" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "createdAt" ? "text-white" : ""}>
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.menuManagement.newestFirst")
                        : t("admin.menuManagement.oldestFirst")
                      : t("admin.menuManagement.newestFirst")}
                  </span>
                  {sortBy === "createdAt" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.menuManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.menuManagement.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit px-0 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin/menu")}
          >
            <Icon path={mdiChevronLeft} size={0.67} className="mr-1" />
            {t("admin.menuManagement.backToCategories")}
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              {currentCategory?.name || t("admin.menuManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {currentCategory?.description ||
                t("admin.menuManagement.description")}
            </p>
          </div>
          {currentCategory && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t("admin.menuCategories.mealCount", {
                  count: currentCategory._count?.meals ?? 0,
                })}
              </span>
              <span>•</span>
              <span>
                {currentCategory.isActive
                  ? t("admin.menuCategories.statusActive")
                  : t("admin.menuCategories.statusInactive")}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedCategory && canReorderCategoryMeals && (
            <Button
              variant="outline"
              asChild
              className="border-border text-foreground hover:bg-muted"
            >
              <Link to={`/admin/menu/${selectedCategory}/order`}>
                {t("admin.menuManagement.reorderMeals")}
              </Link>
            </Button>
          )}
          {canCreateMeal && (
            <Button
              onClick={handleCreate}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.menuManagement.addMeal")}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.menuManagement.searchPlaceholder")}
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleSearch(e.target.value)
                }
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select
                value={selectedCategory || "all"}
                onValueChange={(value: string) =>
                  handleCategoryFilter(value === "all" ? "" : value)
                }
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.menuManagement.allCategories")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.menuManagement.allCategories")}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedStatus || "all"}
                onValueChange={(value: string) => handleStatusFilter(value)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.menuManagement.allStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.menuManagement.allStatus")}
                  </SelectItem>
                  <SelectItem value="ACTIVE">
                    {t("admin.menuManagement.active")}
                  </SelectItem>
                  <SelectItem value="INACTIVE">
                    {t("admin.menuManagement.inactive")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.menuManagement.sortBy")}:</span>
              <Button
                size="sm"
                onClick={() => handleSort("name")}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.menuManagement.nameAZ")}
                </span>
                {sortBy === "name" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSort("createdAt")}
                className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "createdAt" ? "text-white" : ""}>
                  {sortBy === "createdAt"
                    ? sortOrder === "desc"
                      ? t("admin.menuManagement.newestFirst")
                      : t("admin.menuManagement.oldestFirst")
                    : t("admin.menuManagement.newestFirst")}
                </span>
                {sortBy === "createdAt" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories Grid (when no category selected) or Meals Grid */}
      {!selectedCategory ? (
        <>
          <div className="flex items-center justify-end gap-2">
            <Switch
              id="show-empty-meal-categories"
              checked={showEmptyCategories}
              onCheckedChange={setShowEmptyCategories}
            />
            <label
              htmlFor="show-empty-meal-categories"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              {t("admin.menuCategories.showEmptyCategories")}
            </label>
          </div>
          <div className="flex flex-wrap justify-between p-3 gap-0" style={{ gap: 0 }}>
          {visibleCategories.map((category) => (
            <Card
              key={category.id}
              className="mb-4 rounded-2xl overflow-hidden border border-border bg-card hover:shadow-md transition-shadow cursor-pointer"
              style={{ width: '48%' }}
              onClick={() => handleCategoryFilter(category.id)}
            >
              {category.image ? (
                <div className="w-full h-36 overflow-hidden bg-muted">
                  <img
                    src={
                      isExternalImage(category.image)
                        ? category.image
                        : getOptimizedImageUrl(category.image)
                    }
                    alt={category.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(
                      e: React.SyntheticEvent<HTMLImageElement, Event>
                    ) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center">
                  <Icon path={mdiSilverwareForkKnife} size={1.33} className="text-muted-foreground" />
                </div>
              )}
              <CardContent className="p-3">
                <CardTitle className="text-base font-bold text-foreground mb-1.5 line-clamp-1">
                  {category.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-4">
                  {category.description ||
                    t("admin.menuCategories.noDescription")}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Icon path={mdiPackageVariant} size={0.50} className="text-pink-500" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {t("admin.menuCategories.mealCount", {
                        count: category._count?.meals ?? 0,
                      })}
                    </span>
                  </div>
                  <Icon path={mdiChevronRight} size={0.67} className="text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </>
      ) : (
        <div className="relative">
          {menuItemsLoading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-2 text-pink-500">
                <Icon path={mdiLoading} size={0.83} className="animate-spin" />
                <span className="text-sm font-medium">
                  {t("admin.menuManagement.searchingMeals")}
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {meals.map((meal) => (
            <Card
              key={meal.id}
              className="overflow-hidden border-border/60 bg-card/70 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="relative h-40">
                {meal.image ? (
                  <img
                    src={(() => {
                      const imgUrl = isExternalImage(meal.image)
                        ? meal.image
                        : getOptimizedImageUrl(meal.image);
                      return imgUrl;
                    })()}
                    alt={meal.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-linear-to-br from-muted to-muted/40" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-black/10" />

                <div className="absolute left-3 top-3 right-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
                        meal.isActive
                          ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                          : "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/30"
                      )}
                    >
                      {meal.isActive
                        ? t("admin.menuManagement.active")
                        : t("admin.menuManagement.inactive")}
                    </span>
                  </div>

                  <DropdownMenu
                    open={openMealMenuId === meal.id}
                    onOpenChange={(open) => {
                      setOpenMealMenuId(open ? meal.id : null);
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full bg-black/30 text-white hover:bg-black/40 touch-manipulation relative z-10 pointer-events-auto"
                        onPointerDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => {
                          setOpenMealMenuId((prev) =>
                            prev === meal.id ? null : meal.id
                          );
                        }}
                      >
                        <Icon path={mdiDotsVertical} size={0.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canViewMeals && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMealMenuId(null);
                            handleViewDetails(meal);
                          }}
                        >
                          <Icon path={mdiEye} size={0.67} className="mr-2" />
                          {t("admin.menuManagement.viewDetails", { defaultValue: "View Details" })}
                        </DropdownMenuItem>
                      )}
                      {canUpdateMeal && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMealMenuId(null);
                            handleEdit(meal);
                          }}
                        >
                          <Icon path={mdiPencil} size={0.67} className="mr-2" />
                          {t("admin.menuManagement.edit")}
                        </DropdownMenuItem>
                      )}

                      {canUpdateMeal && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMealMenuId(null);
                            openAvailabilityModal(meal);
                          }}
                        >
                          <Icon path={mdiClock} size={0.67} className="mr-2" />
                          {t("admin.menuManagement.branchAvailability", { defaultValue: "Availability per branch" })}
                        </DropdownMenuItem>
                      )}
                      {canToggleMeal && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMealMenuId(null);
                            handleToggleStatus(meal);
                          }}
                        >
                          {meal.isActive ? (
                            <>
                              <Icon path={mdiEyeOff} size={0.67} className="mr-2" />
                              {t("admin.menuManagement.deactivate")}
                            </>
                          ) : (
                            <>
                              <Icon path={mdiEye} size={0.67} className="mr-2" />
                              {t("admin.menuManagement.activate")}
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      {canDeleteMeal && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMealMenuId(null);
                            handleDeleteClick(meal);
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Icon path={mdiDelete} size={0.67} className="mr-2" />
                          {t("admin.menuManagement.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="absolute bottom-3 left-3 right-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-white leading-tight line-clamp-1">
                      {meal.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-white/85 flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {formatPrice(parsePrice(meal.basePrice), currency)}
                      </span>
                      <span className="text-white/70 line-clamp-1">{meal.category?.name}</span>
                    </div>
                  </div>
                </div>
              </div>

              <CardContent className="p-3">
                <div className="space-y-2">
                  {meal.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-5">
                      {meal.description}
                    </p>
                  )}

                  {meal.mealDeclarations && meal.mealDeclarations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {meal.mealDeclarations.map((mealDecl) => (
                        <span
                          key={mealDecl.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800"
                          title={
                            mealDecl.declaration.description ||
                            mealDecl.declaration.name
                          }
                        >
                          {mealDecl.declaration.icon && (
                            <span>{mealDecl.declaration.icon}</span>
                          )}
                          <span>{mealDecl.declaration.name}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {meal.mealSizes.length} {t("admin.menuManagement.sizes")}
                    </span>
                    <span>
                      {meal.mealAddOns.length} {t("admin.menuManagement.addons")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {meal._count.orderItems} {t("admin.menuManagement.orders")}
                    </span>
                    <span>{new Date(meal.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {selectedCategory && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.menuManagement.showingMeals", {
              count: meals.length,
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronLeft} size={0.67} />
            </Button>
            <span className="text-sm text-foreground font-medium px-3 py-1 bg-muted rounded-md">
              {t("admin.menuManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}

      {/* Create Meal Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            // This is called when close button is clicked
            setIsCreateDialogOpen(false);
            setFormData({
              name: "",
              description: "",
              nameFa: "",
              descriptionFa: "",
              basePrice: null,
              taxPercentage: null,
              categoryId: "",
              image: undefined,
              sizes: [],
              addOnIds: [],
              declarationIds: [],
              optionalIngredientIds: [],
              isFeatured: false,
              isDrink: false,
            });
            setBasePriceInput("");
            setSizePriceInputs({});
            setAddonSearchTerm("");
            setDeclarationSearchTerm("");
            setOptionalIngredientSearchTerm("");
            setShowEditAddons(false);
            setFilterAddonsByCategory(false);
            setShowEditDeclarations(false);
            setShowEditOptionalIngredients(false);
          }
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground"
          onInteractOutside={(e: Event) => {
            e.preventDefault();
            handleBackdropClick("create");
          }}
        >
        <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.createNewMeal")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 mt-6">
                <Label htmlFor="name" className="text-foreground font-medium">
                  {t("admin.menuManagement.mealName")}{" "}
                  <span className="text-red-500 dark:text-red-400">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("admin.menuManagement.enterMealName")}
                  required
                  className="text-foreground bg-card border-border"
                />
              </div>

              <div className="space-y-2 mt-6">
                <Label
                  htmlFor="basePrice"
                  className="text-foreground font-medium"
                >
                  {t("admin.menuManagement.basePrice")}{" "}
                  <span className="text-red-500 dark:text-red-400">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <div className="relative">
                  <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="basePrice"
                    type="text"
                    inputMode="decimal"
                    value={basePriceInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = e.target.value;
                      if (value === "") {
                        setBasePriceInput("");
                        setFormData({ ...formData, basePrice: null });
                        return;
                      }
                      // Only allow numbers and one decimal point
                      const validPattern = /^\d*\.?\d*$/;
                      if (validPattern.test(value)) {
                        // Ensure only one decimal point
                        const decimalCount = (value.match(/\./g) || []).length;
                        if (decimalCount <= 1) {
                          setBasePriceInput(value);
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            setFormData({ ...formData, basePrice: numValue });
                          } else if (value === "." || value.endsWith(".")) {
                            // Allow partial decimal input like "." or "12."
                            setFormData({ ...formData, basePrice: 0 });
                          }
                        }
                      }
                    }}
                    placeholder={t("admin.menuManagement.enterBasePrice")}
                    className="pl-10 text-foreground bg-card border-border"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="taxPercentage"
                className="text-foreground font-medium"
              >
                {t("admin.menuManagement.taxPercentage")}
              </Label>
              <NumberInput
                id="taxPercentage"
                value={formData.taxPercentage || 0}
                onChange={(value) =>
                  setFormData({ ...formData, taxPercentage: value || null })
                }
                allowDecimals={true}
                min={0}
                max={100}
                placeholder={t("admin.menuManagement.taxPercentagePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.menuManagement.taxPercentageHint")}
              </p>
            </div>

            {/* Featured Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={!!formData.isFeatured}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isFeatured: !!checked })
                }
                variant="pink"
              />
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.featured")}
              </Label>
            </div>

            {/* Drink Toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.isDrink", { defaultValue: "Drink" })}
              </Label>
              <Switch
                checked={!!(formData as any).isDrink}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isDrink: !!checked } as any)
                }
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="description"
                className="text-foreground font-medium"
              >
                {t("admin.menuManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.menuManagement.enterMealDescription")}
                rows={3}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            {/* Persian Fields Section */}
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("admin.mealManagement.persianSectionTitle")}</h3>
              <div className="space-y-2">
                <Label htmlFor="nameFa" className="text-foreground font-medium">
                  {t("admin.mealManagement.mealNameFa")}
                </Label>
                <Input
                  id="nameFa"
                  value={formData.nameFa || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, nameFa: e.target.value })
                  }
                  placeholder={t("admin.mealManagement.mealNameFaPlaceholder")}
                  dir="rtl"
                  className="text-foreground bg-card border-border"
                />
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="descriptionFa" className="text-foreground font-medium">
                  {t("admin.mealManagement.mealDescriptionFa")}
                </Label>
                <Textarea
                  id="descriptionFa"
                  value={formData.descriptionFa || ""}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setFormData({ ...formData, descriptionFa: e.target.value })
                  }
                  placeholder={t("admin.mealManagement.mealDescriptionFaPlaceholder")}
                  rows={3}
                  dir="rtl"
                  className="bg-transparent text-foreground border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-foreground font-medium">
                {t("admin.menuManagement.category")}{" "}
                <span className="text-red-500 dark:text-red-400">
                  {t("admin.menuManagement.required")}
                </span>
              </Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, categoryId: value })
                }
              >
                <SelectTrigger className="text-foreground bg-card border-border">
                  <SelectValue
                    placeholder={t("admin.menuManagement.selectCategory")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.mealImage")}
              </Label>
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                onPreviewChange={(hasPreview) => setHasImagePreview(hasPreview)}
                className="w-full h-32"
              />
            </div>

            <div
              className={`space-y-2 ${
                formData.image || hasImagePreview ? "mt-[140px]" : "mt-6"
              }`}
            >
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.mealSizes")}
                  <span className="text-red-500 dark:text-red-400 ml-1">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSize}
                  className="border-border bg-card hover:bg-muted hover:text-foreground text-foreground"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-1" />
                  {t("admin.menuManagement.addSize")}
                </Button>
              </div>
              {sizeValidationError && (
                <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                  {sizeValidationError}
                </p>
              )}
              <div className="space-y-2 mt-6">
                {formData.sizes?.map((size, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t(
                          "admin.menuManagement.sizeNamePlaceholder"
                        )}
                        value={size.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateSize(index, "name", e.target.value)
                        }
                        className="text-foreground bg-card border-border flex-1"
                      />
                      <Select
                        value={size.sizeType || "M"}
                        onValueChange={(value: "S" | "M" | "L" | "XL") =>
                          updateSize(index, "sizeType", value)
                        }
                      >
                        <SelectTrigger className="w-20 text-foreground bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="S">S</SelectItem>
                          <SelectItem value="M">M</SelectItem>
                          <SelectItem value="L">L</SelectItem>
                          <SelectItem value="XL">XL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSize(index)}
                        className="border-border bg-card hover:bg-muted hover:text-foreground text-foreground"
                      >
                        <Icon path={mdiClose} size={0.67} />
                      </Button>
                    </div>
                    <div className="relative w-full">
                      <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={t(
                          "admin.menuManagement.sizePricePlaceholder"
                        )}
                        value={sizePriceInputs[index] !== undefined ? sizePriceInputs[index] : (size.price !== null && size.price !== undefined ? size.price.toString() : "0")}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const value = e.target.value;
                          if (value === "") {
                            setSizePriceInputs({ ...sizePriceInputs, [index]: "" });
                            updateSize(index, "price", 0);
                            return;
                          }
                          // Only allow numbers and one decimal point
                          const validPattern = /^\d*\.?\d*$/;
                          if (validPattern.test(value)) {
                            // Ensure only one decimal point
                            const decimalCount = (value.match(/\./g) || []).length;
                            if (decimalCount <= 1) {
                              setSizePriceInputs({ ...sizePriceInputs, [index]: value });
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateSize(index, "price", numValue);
                              } else if (value === "." || value.endsWith(".")) {
                                // Allow partial decimal input like "." or "12."
                                updateSize(index, "price", 0);
                              }
                            }
                          }
                        }}
                          className="pl-10 w-full text-foreground bg-card border-border"
                        required
                      />
                    </div>
                    <div className="w-full">
                      <NumberInput
                        placeholder={t(
                          "admin.menuManagement.taxPercentPlaceholder"
                        )}
                        value={size.taxPercentage || 0}
                        onChange={(value) =>
                          updateSize(index, "taxPercentage", value ?? 0)
                        }
                        allowDecimals={true}
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={showEditAddons}
                    onCheckedChange={(checked) =>
                      setShowEditAddons(checked as boolean)
                    }
                    variant="pink"
                  />
                  <Label className="text-sm font-medium text-foreground">
                    {t("admin.menuManagement.availableAddons")}
                  </Label>
                </div>
                {formData.categoryId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllCategoryAddons}
                    className="border-border hover:bg-muted hover:text-foreground text-foreground text-xs"
                  >
                    {t("admin.menuManagement.selectAllCategoryAddons")}
                  </Button>
                )}
              </div>
              {formData.categoryId && (() => {
                const selectedCategory = categories.find(cat => cat.id === formData.categoryId);
                return selectedCategory ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                      checked={filterAddonsByCategory}
                      onCheckedChange={(checked) =>
                        setFilterAddonsByCategory(checked as boolean)
                      }
                      variant="pink"
                      disabled={!formData.categoryId}
                    />
                    <Label className="text-sm font-medium text-foreground">
                      {t("admin.menuManagement.showCategoryAddons", { categoryName: selectedCategory.name })}
                    </Label>
                  </div>
                ) : null;
              })()}
              <div className="space-y-2 mt-6">
                <Input
                  placeholder={t("admin.menuManagement.searchAddons")}
                  value={addonSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setAddonSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredAddons.map((addon) => (
                    <div
                      key={addon.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.addOnIds?.includes(addon.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleAddon(addon.id)}
                    >
                      <div className="flex items-center gap-2">
                        {addon.image && (
                          <img
                            src={
                              isExternalImage(addon.image)
                                ? addon.image
                                : getOptimizedImageUrl(addon.image)
                            }
                            alt={addon.name}
                            className="w-6 h-6 rounded object-cover"
                            loading="lazy"
                            onError={(
                              e: React.SyntheticEvent<HTMLImageElement, Event>
                            ) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {addon.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(parsePrice(addon.price || "0"), currency)} •{" "}
                            {addon.type}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.addOnIds?.includes(addon.id)
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.addOnIds?.includes(addon.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredAddons.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {addonSearchTerm
                        ? t("admin.menuManagement.noAddonsMatch")
                        : t("admin.menuManagement.noAddonsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedAddons")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.addonsSelected", {
                    count: formData.addOnIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={showEditDeclarations}
                  onCheckedChange={(checked) =>
                    setShowEditDeclarations(checked as boolean)
                  }
                  variant="pink"
                />
              <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.availableDeclarations")}
              </Label>
              </div>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder={t("admin.menuManagement.searchDeclarations")}
                  value={declarationSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDeclarationSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredDeclarations.map((declaration) => (
                    <div
                      key={declaration.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.declarationIds?.includes(declaration.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleDeclaration(declaration.id)}
                    >
                      <div className="flex items-center gap-2">
                        {declaration.icon && (
                          <span className="text-lg">{declaration.icon}</span>
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {declaration.name}
                          </p>
                          {declaration.type && (
                            <p className="text-xs text-muted-foreground">
                              {declaration.type}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.declarationIds?.includes(declaration.id)
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.declarationIds?.includes(declaration.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredDeclarations.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {declarationSearchTerm
                        ? t("admin.menuManagement.noDeclarationsMatch")
                        : t("admin.menuManagement.noDeclarationsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedDeclarations")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.declarationsSelected", {
                    count: formData.declarationIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={showEditOptionalIngredients}
                  onCheckedChange={(checked) =>
                    setShowEditOptionalIngredients(checked as boolean)
                  }
                  variant="pink"
                />
                <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.availableOptionalIngredients")}
                </Label>
              </div>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder={t("admin.menuManagement.searchOptionalIngredients")}
                  value={optionalIngredientSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setOptionalIngredientSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredOptionalIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.optionalIngredientIds?.includes(ingredient.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleOptionalIngredient(ingredient.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {ingredient.name}
                          </p>
                          {ingredient.description && (
                            <p className="text-xs text-muted-foreground">
                              {ingredient.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.optionalIngredientIds?.includes(
                            ingredient.id
                          )
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.optionalIngredientIds?.includes(
                          ingredient.id
                        ) && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </div>
                  ))}
                  {filteredOptionalIngredients.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {optionalIngredientSearchTerm
                        ? t("admin.menuManagement.noOptionalIngredientsMatch")
                        : t("admin.menuManagement.noOptionalIngredientsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedOptionalIngredients")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.optionalIngredientsSelected", {
                    count: formData.optionalIngredientIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.menuManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.menuManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.menuManagement.noBranchesAvailable")}
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer"
                      onClick={() => toggleExcludedBranch(branch.id)}
                    >
                      <div className="flex items-center space-x-2 flex-1">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                            formData.excludedBranches?.includes(branch.id)
                              ? "bg-pink-500 border-pink-500"
                              : "border-muted-foreground"
                          )}
                        >
                          {formData.excludedBranches?.includes(branch.id) && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span className="text-sm text-foreground">
                          {branch.name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex-1 text-sm text-foreground">
                  <p className="font-medium text-foreground">
                    {t("admin.menuManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.menuManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                onClick={() => setIsCreateDialogOpen(false)}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="bg-pink-500 hover:bg-pink-600 text-white"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t("admin.menuManagement.creating")
                  : t("admin.menuManagement.createMeal")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Meal Branch Availability Dialog */}
      <Dialog
        open={isAvailabilityDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsAvailabilityDialogOpen(open);
          if (!open) {
            setAvailabilityMeal(null);
            setSelectedAvailabilityBranchId("");
            setAvailabilityIsAllWeek(true);
            setAvailabilityWindows([]);
            setBranchAvailabilities([]);
            setSavingBranchAvailability(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.branchAvailability", { defaultValue: "Availability per branch" })}
            </DialogTitle>
          </DialogHeader>

          {!availabilityMeal ? null : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.mealName")}
                </Label>
                <Input
                  value={availabilityMeal.name}
                  disabled
                  className="text-foreground bg-card border-border opacity-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.branch", { defaultValue: "Branch" })}
                </Label>
                <Select
                  value={selectedAvailabilityBranchId}
                  onValueChange={(val) => onSelectAvailabilityBranch(val)}
                >
                  <SelectTrigger className="w-full bg-transparent">
                    <SelectValue placeholder={t("admin.menuManagement.selectBranch", { defaultValue: "Select branch" })} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name || b.code || b.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingBranchAvailabilities ? (
                <Input value="..." disabled className="text-foreground bg-card border-border opacity-100" />
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-foreground">
                        {t("admin.menuManagement.branchAvailabilityAllWeek")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.menuManagement.branchAvailabilityAllWeekHint")}
                      </div>
                    </div>
                    <Switch
                      checked={availabilityIsAllWeek}
                      onCheckedChange={(v) => setAvailabilityIsAllWeek(Boolean(v))}
                    />
                  </div>

                  {!availabilityIsAllWeek && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-foreground font-medium">
                          {t("admin.menuManagement.branchAvailabilityWindows")}
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          className="border border-border text-foreground hover:bg-muted/60"
                          onClick={addAvailabilityWindow}
                        >
                          <Icon path={mdiPlus} size={0.67} className="mr-2" />
                          {t("common.add", { defaultValue: "Add" })}
                        </Button>
                      </div>

                      {availabilityWindows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("admin.menuManagement.noWindows", { defaultValue: "No windows configured." })}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {availabilityWindows.map((w, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 rounded border border-border bg-muted/10"
                            >
                              {(() => {
                                const usedDays = new Set(
                                  availabilityWindows
                                    .filter((_, i) => i !== idx)
                                    .map((x) => x.dayOfWeek)
                                );
                                return (
                                  <Select
                                    value={String(w.dayOfWeek)}
                                    onValueChange={(val) =>
                                      updateAvailabilityWindow(idx, {
                                        dayOfWeek: Number(val),
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-full bg-transparent">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover">
                                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                                        <SelectItem
                                          key={d}
                                          value={String(d)}
                                          disabled={usedDays.has(d)}
                                        >
                                          {dayLabel(d)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}

                              <TimePicker12Hour
                                time={hhmmTo12h(w.startTime)}
                                onTimeChange={(val) => updateAvailabilityWindow(idx, { startTime: time12hToHhmm(val) })}
                                placeholder={t("admin.menuManagement.branchAvailabilityStart", { defaultValue: "Start" })}
                              />
                              <TimePicker12Hour
                                time={hhmmTo12h(w.endTime)}
                                onTimeChange={(val) => updateAvailabilityWindow(idx, { endTime: time12hToHhmm(val) })}
                                placeholder={t("admin.menuManagement.branchAvailabilityEnd", { defaultValue: "End" })}
                              />

                              <Button
                                type="button"
                                variant="outline"
                                className="border border-border text-foreground hover:bg-muted/60"
                                onClick={() => removeAvailabilityWindow(idx)}
                              >
                                {t("common.remove", { defaultValue: "Remove" })}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end space-x-2 pt-2">
                    <Button
                      type="button"
                      className="bg-transparent hover:bg-muted text-foreground border border-border"
                      onClick={() => setIsAvailabilityDialogOpen(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      type="button"
                      className="bg-pink-500 hover:bg-pink-600 text-white"
                      onClick={saveBranchAvailability}
                      disabled={!selectedAvailabilityBranchId || savingBranchAvailability}
                    >
                      {savingBranchAvailability ? (
                        <>
                          <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                          {t("common.saving")}
                        </>
                      ) : (
                        t("common.save")
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Meal Details Dialog (read-only) */}
      <Dialog
        open={isDetailsDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsDetailsDialogOpen(open);
          if (!open) {
            setMealToView(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.viewDetails", { defaultValue: "Meal Details" })}
            </DialogTitle>
          </DialogHeader>
          {mealToView && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 mt-6">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.basePrice")}
                  </Label>
                  <Input
                    value={formatPrice(parsePrice(mealToView.basePrice), currency)}
                    disabled
                    className="text-foreground bg-card border-border opacity-100"
                  />
                </div>
                <div className="space-y-2 mt-6">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.taxPercentage")}
                  </Label>
                  <Input
                    value={mealToView.taxPercentage != null ? String(mealToView.taxPercentage) : ""}
                    disabled
                    className="text-foreground bg-card border-border opacity-100"
                  />
                </div>
              </div>

              {loadingBranchPrices ? (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.branchSpecificPrices")}
                  </Label>
                  <Input value="..." disabled className="text-foreground bg-card border-border opacity-100" />
                </div>
              ) : Array.isArray(branchPrices) && branchPrices.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.branchSpecificPrices")}
                  </Label>
                  <div className="space-y-2">
                    {branchPrices
                      .slice()
                      .sort((a, b) => (a.branch?.name || "").localeCompare(b.branch?.name || ""))
                      .map((bp) => (
                        <div
                          key={bp.id || bp.branchId}
                          className="flex items-center justify-between p-2 rounded border border-border bg-muted/10"
                        >
                          <div className="text-sm text-foreground">{bp.branch?.name || "-"}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatPrice(parsePrice(bp.basePrice), currency)}
                            {" · "}
                            {bp.taxPercentage != null ? `${bp.taxPercentage}%` : "-"}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 mt-6">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.mealName")}
                  </Label>
                  <Input
                    value={mealToView.name}
                    disabled
                    className="text-foreground bg-card border-border opacity-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.category")}
                </Label>
                <Input
                  value={
                    categories.find((c) => c.id === mealToView.categoryId)?.name ||
                    mealToView.category?.name ||
                    ""
                  }
                  disabled
                  className="text-foreground bg-card border-border opacity-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.descriptionLabel")}
                </Label>
                <Textarea
                  value={mealToView.description || ""}
                  disabled
                  rows={3}
                  className="bg-transparent text-foreground border-border opacity-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.featured")}
                </Label>
                <Input
                  value={mealToView.isFeatured ? t("common.yes", { defaultValue: "Yes" }) : t("common.no", { defaultValue: "No" })}
                  disabled
                  className="text-foreground bg-card border-border opacity-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.type", { defaultValue: "Type" })}
                </Label>
                <Input
                  value={Boolean((mealToView as any).isDrink) ? t("admin.menuManagement.drink", { defaultValue: "Drink" }) : t("admin.menuManagement.food", { defaultValue: "Food" })}
                  disabled
                  className="text-foreground bg-card border-border opacity-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  {t("admin.menuManagement.status")}
                </Label>
                <Input
                  value={mealToView.isActive ? t("admin.menuManagement.active") : t("admin.menuManagement.inactive")}
                  disabled
                  className="text-foreground bg-card border-border opacity-100"
                />
              </div>

              {mealToView.image && (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.mealImage")}
                  </Label>
                  <div className="w-full h-40 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img
                      src={isExternalImage(mealToView.image) ? mealToView.image : getOptimizedImageUrl(mealToView.image)}
                      alt={mealToView.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                </div>
              )}

              {mealToView.mealSizes?.length ? (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.mealSizes")}
                  </Label>
                  <div className="space-y-2">
                    {mealToView.mealSizes.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-2 rounded border border-border bg-muted/10"
                      >
                        <div className="text-sm text-foreground">{s.name}</div>
                        <div className="text-sm text-pink-500 font-semibold">
                          {formatPrice(parsePrice(s.price), currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => {
                    setIsDetailsDialogOpen(false);
                    setMealToView(null);
                  }}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("common.close", { defaultValue: "Close" })}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Meal Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            // This is called when close button is clicked
            setIsEditDialogOpen(false);
            setFormData({
              name: "",
              description: "",
              basePrice: null,
              taxPercentage: null,
              categoryId: "",
              image: undefined,
              sizes: [],
              addOnIds: [],
              declarationIds: [],
              optionalIngredientIds: [],
              isFeatured: false,
              isDrink: false,
            });
            setBasePriceInput("");
            setSizePriceInputs({});
            setAddonSearchTerm("");
            setDeclarationSearchTerm("");
            setOptionalIngredientSearchTerm("");
            setShowEditAddons(false);
            setFilterAddonsByCategory(false);
            setShowEditDeclarations(false);
            setShowEditOptionalIngredients(false);
          }
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground"
          onInteractOutside={(e: Event) => {
            e.preventDefault();
            handleBackdropClick("edit");
          }}
        >
        <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.editMeal")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 mt-6">
                <Label
                  htmlFor="edit-name"
                  className="text-foreground font-medium"
                >
                  {t("admin.menuManagement.mealName")}{" "}
                  <span className="text-red-500 dark:text-red-400">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("admin.menuManagement.enterMealName")}
                  required
                  className="text-foreground bg-card border-border"
                />
              </div>

              <div className="space-y-2 mt-6">
                <Label
                  htmlFor="edit-basePrice"
                  className="text-foreground font-medium"
                >
                  {t("admin.menuManagement.basePrice")}{" "}
                  <span className="text-red-500 dark:text-red-400">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <div className="relative">
                  <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="edit-basePrice"
                    type="text"
                    inputMode="decimal"
                    value={basePriceInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = e.target.value;
                      if (value === "") {
                        setBasePriceInput("");
                        setFormData({ ...formData, basePrice: null });
                        return;
                      }
                      // Only allow numbers and one decimal point
                      const validPattern = /^\d*\.?\d*$/;
                      if (validPattern.test(value)) {
                        // Ensure only one decimal point
                        const decimalCount = (value.match(/\./g) || []).length;
                        if (decimalCount <= 1) {
                          setBasePriceInput(value);
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            setFormData({ ...formData, basePrice: numValue });
                          } else if (value === "." || value.endsWith(".")) {
                            // Allow partial decimal input like "." or "12."
                            setFormData({ ...formData, basePrice: 0 });
                          }
                        }
                      }
                    }}
                    placeholder={t("admin.menuManagement.enterBasePrice")}
                    className="pl-10 text-foreground bg-card border-border"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-taxPercentage"
                className="text-foreground font-medium"
              >
                {t("admin.menuManagement.taxPercentage")}
              </Label>
              <NumberInput
                id="edit-taxPercentage"
                value={formData.taxPercentage || 0}
                onChange={(value) =>
                  setFormData({ ...formData, taxPercentage: value || null })
                }
                allowDecimals={true}
                min={0}
                max={100}
                placeholder={t("admin.menuManagement.taxPercentagePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.menuManagement.taxPercentageHint")}
              </p>
            </div>

            {/* Featured Toggle (Edit) */}
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={!!formData.isFeatured}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isFeatured: !!checked })
                }
                variant="pink"
              />
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.featured")}
              </Label>
            </div>

            {/* Drink Toggle (Edit) */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.isDrink", { defaultValue: "Drink" })}
              </Label>
              <Switch
                checked={!!(formData as any).isDrink}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isDrink: !!checked } as any)
                }
              />
            </div>

            <div className="space-y-2 mt-6">
              <Label
                htmlFor="edit-description"
                className="text-foreground font-medium"
              >
                {t("admin.menuManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.menuManagement.enterMealDescription")}
                rows={3}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            {/* Persian Fields Section */}
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("admin.mealManagement.persianSectionTitle")}</h3>
              <div className="space-y-2">
                <Label htmlFor="edit-nameFa" className="text-foreground font-medium">
                  {t("admin.mealManagement.mealNameFa")}
                </Label>
                <Input
                  id="edit-nameFa"
                  value={formData.nameFa || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, nameFa: e.target.value })
                  }
                  placeholder={t("admin.mealManagement.mealNameFaPlaceholder")}
                  dir="rtl"
                  className="text-foreground bg-card border-border"
                />
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="edit-descriptionFa" className="text-foreground font-medium">
                  {t("admin.mealManagement.mealDescriptionFa")}
                </Label>
                <Textarea
                  id="edit-descriptionFa"
                  value={formData.descriptionFa || ""}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setFormData({ ...formData, descriptionFa: e.target.value })
                  }
                  placeholder={t("admin.mealManagement.mealDescriptionFaPlaceholder")}
                  rows={3}
                  dir="rtl"
                  className="bg-transparent text-foreground border-border"
                />
              </div>
            </div>

            <div className="space-y-2 mt-6">
              <Label
                htmlFor="edit-category"
                className="text-foreground font-medium"
              >
                {t("admin.menuManagement.category")}{" "}
                <span className="text-red-500 dark:text-red-400">
                  {t("admin.menuManagement.required")}
                </span>
              </Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, categoryId: value })
                }
              >
                <SelectTrigger className="text-foreground bg-card border-border">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 mb-40">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.menuManagement.mealImage")}
              </Label>
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                onPreviewChange={(hasPreview) => setHasImagePreview(hasPreview)}
                className="w-full h-32"
              />
            </div>

            <div
              className={`space-y-2 ${
                formData.image || hasImagePreview ? "mt-8" : "mt-6"
              }`}
            >
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.mealSizes")}
                  <span className="text-red-500 dark:text-red-400 ml-1">
                    {t("admin.menuManagement.required")}
                  </span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSize}
                  className="border-border bg-card hover:bg-muted hover:text-foreground text-foreground"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-1" />
                  {t("admin.menuManagement.addSize")}
                </Button>
              </div>
              {sizeValidationError && (
                <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                  {sizeValidationError}
                </p>
              )}
              <div className="space-y-2 mt-6">
                {formData.sizes?.map((size, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t(
                          "admin.menuManagement.sizeNamePlaceholder"
                        )}
                        value={size.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateSize(index, "name", e.target.value)
                        }
                        className="text-foreground bg-card border-border flex-1"
                      />
                      <Select
                        value={size.sizeType || "M"}
                        onValueChange={(value: "S" | "M" | "L" | "XL") =>
                          updateSize(index, "sizeType", value)
                        }
                      >
                        <SelectTrigger className="w-20 text-foreground bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="S">S</SelectItem>
                          <SelectItem value="M">M</SelectItem>
                          <SelectItem value="L">L</SelectItem>
                          <SelectItem value="XL">XL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSize(index)}
                        className="border-border bg-card hover:bg-muted hover:text-foreground text-foreground"
                      >
                        <Icon path={mdiClose} size={0.67} />
                      </Button>
                    </div>
                    <div className="relative w-full">
                      <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={t(
                          "admin.menuManagement.sizePricePlaceholder"
                        )}
                        value={sizePriceInputs[index] !== undefined ? sizePriceInputs[index] : (size.price !== null && size.price !== undefined ? size.price.toString() : "0")}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const value = e.target.value;
                          if (value === "") {
                            setSizePriceInputs({ ...sizePriceInputs, [index]: "" });
                            updateSize(index, "price", 0);
                            return;
                          }
                          // Only allow numbers and one decimal point
                          const validPattern = /^\d*\.?\d*$/;
                          if (validPattern.test(value)) {
                            // Ensure only one decimal point
                            const decimalCount = (value.match(/\./g) || []).length;
                            if (decimalCount <= 1) {
                              setSizePriceInputs({ ...sizePriceInputs, [index]: value });
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateSize(index, "price", numValue);
                              } else if (value === "." || value.endsWith(".")) {
                                // Allow partial decimal input like "." or "12."
                                updateSize(index, "price", 0);
                              }
                            }
                          }
                        }}
                          className="pl-10 w-full text-foreground bg-card border-border"
                      />
                    </div>
                    <div className="w-full">
                      <NumberInput
                        placeholder={t(
                          "admin.menuManagement.taxPercentPlaceholder"
                        )}
                        value={size.taxPercentage || 0}
                        onChange={(value) =>
                          updateSize(index, "taxPercentage", value ?? 0)
                        }
                        allowDecimals={true}
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={showEditAddons}
                    onCheckedChange={(checked) =>
                      setShowEditAddons(checked as boolean)
                    }
                    variant="pink"
                  />
                  <Label className="text-sm font-medium text-foreground">
                    {t("admin.menuManagement.availableAddons")}
                  </Label>
                </div>
                {formData.categoryId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllCategoryAddons}
                    className="border-border hover:bg-muted hover:text-foreground text-foreground text-xs"
                  >
                    {t("admin.menuManagement.selectAllCategoryAddons")}
                  </Button>
                )}
              </div>
              {formData.categoryId && (() => {
                const selectedCategory = categories.find(cat => cat.id === formData.categoryId);
                return selectedCategory ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                      checked={filterAddonsByCategory}
                      onCheckedChange={(checked) =>
                        setFilterAddonsByCategory(checked as boolean)
                      }
                      variant="pink"
                      disabled={!formData.categoryId}
                    />
                    <Label className="text-sm font-medium text-foreground">
                      {t("admin.menuManagement.showCategoryAddons", { categoryName: selectedCategory.name })}
                    </Label>
                  </div>
                ) : null;
              })()}
              <div className="space-y-2 mt-6">
                <Input
                  placeholder={t("admin.menuManagement.searchAddons")}
                  value={addonSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setAddonSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredAddons.map((addon) => (
                    <div
                      key={addon.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.addOnIds?.includes(addon.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleAddon(addon.id)}
                    >
                      <div className="flex items-center gap-2">
                        {addon.image && (
                          <img
                            src={
                              isExternalImage(addon.image)
                                ? addon.image
                                : getOptimizedImageUrl(addon.image)
                            }
                            alt={addon.name}
                            className="w-6 h-6 rounded object-cover"
                            loading="lazy"
                            onError={(
                              e: React.SyntheticEvent<HTMLImageElement, Event>
                            ) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {addon.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(parsePrice(addon.price || "0"), currency)} •{" "}
                            {addon.type}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.addOnIds?.includes(addon.id)
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.addOnIds?.includes(addon.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredAddons.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {addonSearchTerm
                        ? t("admin.menuManagement.noAddonsMatch")
                        : t("admin.menuManagement.noAddonsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedAddons")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.addonsSelected", {
                    count: formData.addOnIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={showEditDeclarations}
                  onCheckedChange={(checked) =>
                    setShowEditDeclarations(checked as boolean)
                  }
                  variant="pink"
                />
              <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.availableDeclarations")}
              </Label>
              </div>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder={t("admin.menuManagement.searchDeclarations")}
                  value={declarationSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDeclarationSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredDeclarations.map((declaration) => (
                    <div
                      key={declaration.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.declarationIds?.includes(declaration.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleDeclaration(declaration.id)}
                    >
                      <div className="flex items-center gap-2">
                        {declaration.icon && (
                          <span className="text-lg">{declaration.icon}</span>
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {declaration.name}
                          </p>
                          {declaration.type && (
                            <p className="text-xs text-muted-foreground">
                              {declaration.type}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.declarationIds?.includes(declaration.id)
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.declarationIds?.includes(declaration.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredDeclarations.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {declarationSearchTerm
                        ? t("admin.menuManagement.noDeclarationsMatch")
                        : t("admin.menuManagement.noDeclarationsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedDeclarations")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.declarationsSelected", {
                    count: formData.declarationIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={showEditOptionalIngredients}
                  onCheckedChange={(checked) =>
                    setShowEditOptionalIngredients(checked as boolean)
                  }
                  variant="pink"
                />
                <Label className="text-sm font-medium text-foreground">
                  {t("admin.menuManagement.availableOptionalIngredients")}
                </Label>
              </div>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder={t("admin.menuManagement.searchOptionalIngredients")}
                  value={optionalIngredientSearchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setOptionalIngredientSearchTerm(e.target.value)
                  }
                  className="text-xs text-foreground bg-card border-border"
                />
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredOptionalIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        formData.optionalIngredientIds?.includes(ingredient.id)
                          ? "bg-pink-100 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700"
                          : "bg-muted/50 hover:bg-muted border border-transparent"
                      )}
                      onClick={() => toggleOptionalIngredient(ingredient.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {ingredient.name}
                          </p>
                          {ingredient.description && (
                            <p className="text-xs text-muted-foreground">
                              {ingredient.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          formData.optionalIngredientIds?.includes(
                            ingredient.id
                          )
                            ? "bg-pink-500 border-pink-500"
                            : "border-muted-foreground"
                        )}
                      >
                        {formData.optionalIngredientIds?.includes(
                          ingredient.id
                        ) && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </div>
                  ))}
                  {filteredOptionalIngredients.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {optionalIngredientSearchTerm
                        ? t("admin.menuManagement.noOptionalIngredientsMatch")
                        : t("admin.menuManagement.noOptionalIngredientsAvailable")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex-1 text-sm text-foreground">
                <p className="font-medium text-foreground">
                  {t("admin.menuManagement.selectedOptionalIngredients")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.menuManagement.optionalIngredientsSelected", {
                    count: formData.optionalIngredientIds?.length || 0,
                  })}
                </p>
              </div>
            </div>

            {/* Branch-Specific Prices Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground font-medium">
                    {t("admin.menuManagement.branchPrices")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.menuManagement.branchPricesDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingBranchPrice({
                      branchId: "",
                      basePrice: formData.basePrice?.toString() || "",
                      taxPercentage: formData.taxPercentage?.toString() || "",
                    });
                  }}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-1" />
                  {t("admin.menuManagement.addBranchPrice")}
                </Button>
              </div>

              {loadingBranchPrices ? (
                <div className="text-center py-4">
                  <Icon path={mdiLoading} size={0.67} className="animate-spin mx-auto" />
                </div>
              ) : branchPrices.length === 0 ? (
                <div className="p-4 border border-border rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    {t("admin.menuManagement.noBranchPricesSet")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {branchPrices.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {bp.branch.name}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Price: {formatPrice(parseFloat(bp.basePrice), currency)}
                          </span>
                          {bp.taxPercentage !== null && (
                            <span className="text-xs text-muted-foreground">
                              Tax: {bp.taxPercentage}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingBranchPrice({
                              branchId: bp.branchId,
                              basePrice: bp.basePrice,
                              taxPercentage: bp.taxPercentage?.toString() || "",
                            });
                          }}
                          className="border-border"
                        >
                          <Icon path={mdiPencil} size={0.50} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-border text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteBranchPriceClick(bp.branchId, bp.branch.name)}
                        >
                          <Icon path={mdiDelete} size={0.50} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add/Edit Branch Price Dialog */}
              {editingBranchPrice && (
                <div className="mt-4 p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground font-medium">
                      {branchPrices.find(bp => bp.branchId === editingBranchPrice.branchId)
                        ? t("admin.menuManagement.editBranchPrice")
                        : t("admin.menuManagement.addBranchPrice")}
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingBranchPrice(null)}
                    >
                      <Icon path={mdiClose} size={0.67} />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">{t("admin.menuManagement.branch")}</Label>
                    <Select
                      value={editingBranchPrice.branchId}
                      onValueChange={(value) =>
                        setEditingBranchPrice({
                          ...editingBranchPrice,
                          branchId: value,
                        })
                      }
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue placeholder={t("admin.menuManagement.selectBranch")} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches
                          .filter(
                            (b) =>
                              !branchPrices.find(
                                (bp) =>
                                  bp.branchId === b.id &&
                                  bp.branchId !== editingBranchPrice.branchId
                              )
                          )
                          .map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">{t("admin.menuManagement.basePrice")}</Label>
                    <div className="relative">
                      <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingBranchPrice.basePrice}
                        onChange={(e) =>
                          setEditingBranchPrice({
                            ...editingBranchPrice,
                            basePrice: e.target.value,
                          })
                        }
                        placeholder="0.00"
                        className="pl-9 bg-card border-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">
                      {t("admin.menuManagement.taxPercentageOptional")}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editingBranchPrice.taxPercentage}
                      onChange={(e) =>
                        setEditingBranchPrice({
                          ...editingBranchPrice,
                          taxPercentage: e.target.value,
                        })
                      }
                      placeholder={t("admin.menuManagement.leaveEmptyForDefault")}
                      className="bg-card border-border"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingBranchPrice(null)}
                      className="border-border"
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveBranchPrice}
                      className="bg-pink-500 hover:bg-pink-600 text-white"
                    >
                      {t("admin.menuManagement.save")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.menuManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.menuManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.menuManagement.noBranchesAvailable")}
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer"
                      onClick={() => toggleExcludedBranch(branch.id)}
                    >
                      <div className="flex items-center space-x-2 flex-1">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                            formData.excludedBranches?.includes(branch.id)
                              ? "bg-pink-500 border-pink-500"
                              : "border-muted-foreground"
                          )}
                        >
                          {formData.excludedBranches?.includes(branch.id) && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span className="text-sm text-foreground">
                          {branch.name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex-1 text-sm text-foreground">
                  <p className="font-medium text-foreground">
                    {t("admin.menuManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.menuManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                onClick={() => setIsEditDialogOpen(false)}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="bg-pink-500 hover:bg-pink-600 text-white"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t("admin.menuManagement.updating")
                  : t("admin.menuManagement.update")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Meal Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.deleteMeal")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t(
                "admin.menuManagement.deleteMealDescription",
                { name: mealToDelete?.name || "" }
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setMealToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.menuManagement.deleteMealCancel")}
              </Button>
              <Button
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("admin.menuManagement.deleteMealConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Price Dialog */}
      <Dialog open={isDeleteBranchPriceDialogOpen} onOpenChange={setIsDeleteBranchPriceDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.menuManagement.deleteBranchPrice")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t("admin.menuManagement.deleteBranchPriceDescription", {
                branchName: branchPriceToDelete?.branchName || "",
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteBranchPriceDialogOpen(false);
                  setBranchPriceToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleDeleteBranchPrice}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("admin.menuManagement.delete")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <Dialog open={isCloseConfirmationOpen} onOpenChange={setIsCloseConfirmationOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-white">
              {t("admin.menuManagement.dialogCloseTitle", { defaultValue: "Unsaved Changes" })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("admin.menuManagement.dialogCloseMessage", { defaultValue: "Are you sure you want to close? All unsaved changes will be lost." })}
          </p>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              onClick={handleCancelClose}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmClose}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("common.confirm", { defaultValue: "Confirm" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MealManagement;
